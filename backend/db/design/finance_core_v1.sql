-- DESIGN ONLY — DO NOT APPLY TO PRODUCTION OR THE CURRENT SUPABASE DATABASE.
-- This file deliberately ends with ROLLBACK. It records the intended target invariants
-- for review before a real migration is created after deployed-schema reconciliation.

BEGIN;

CREATE SCHEMA finance;
CREATE SCHEMA sharia;
CREATE SCHEMA platform;

CREATE TYPE finance.account_class AS ENUM ('asset', 'liability', 'equity', 'revenue', 'expense');
CREATE TYPE finance.entry_side AS ENUM ('debit', 'credit');

CREATE TABLE finance.ledger_accounts (
    id uuid PRIMARY KEY,
    code text NOT NULL UNIQUE,
    account_class finance.account_class NOT NULL,
    currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    owner_type text,
    owner_id text,
    allow_negative boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((owner_type IS NULL) = (owner_id IS NULL))
);

CREATE TABLE finance.ledger_transactions (
    id uuid PRIMARY KEY,
    idempotency_scope text NOT NULL,
    idempotency_key text NOT NULL,
    reference_type text NOT NULL,
    reference_id text NOT NULL,
    currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    reverses_transaction_id uuid UNIQUE REFERENCES finance.ledger_transactions(id),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    occurred_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (idempotency_scope, idempotency_key),
    CHECK (reverses_transaction_id IS NULL OR reverses_transaction_id <> id)
);

CREATE TABLE finance.ledger_entries (
    transaction_id uuid NOT NULL REFERENCES finance.ledger_transactions(id),
    sequence_no smallint NOT NULL CHECK (sequence_no > 0),
    account_id uuid NOT NULL REFERENCES finance.ledger_accounts(id),
    side finance.entry_side NOT NULL,
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (transaction_id, sequence_no)
);

CREATE INDEX ledger_entries_account_created_idx
    ON finance.ledger_entries (account_id, created_at, transaction_id);

CREATE TABLE finance.idempotency_records (
    scope text NOT NULL,
    key text NOT NULL,
    request_hash bytea NOT NULL,
    state text NOT NULL CHECK (state IN ('started', 'completed', 'failed')),
    response_status integer,
    response_body jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (scope, key),
    CHECK (expires_at > created_at)
);

CREATE TYPE sharia.contract_type AS ENUM (
    'spot_sale',
    'deferred_sale',
    'murabahah',
    'mudarabah',
    'musharakah',
    'wakalah_investment'
);

CREATE TABLE sharia.contracts (
    id uuid PRIMARY KEY,
    contract_type sharia.contract_type NOT NULL,
    policy_version text NOT NULL,
    state text NOT NULL CHECK (state IN ('draft', 'review', 'approved', 'active', 'completed', 'cancelled')),
    terms jsonb NOT NULL CHECK (jsonb_typeof(terms) = 'object'),
    approved_by text,
    approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((approved_by IS NULL) = (approved_at IS NULL))
);

CREATE TABLE platform.outbox_events (
    id uuid PRIMARY KEY,
    topic text NOT NULL,
    aggregate_type text NOT NULL,
    aggregate_id text NOT NULL,
    idempotency_key text NOT NULL UNIQUE,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'leased', 'delivered', 'dead_letter')),
    available_at timestamptz NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    lease_owner text,
    lease_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz,
    CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL))
);

CREATE OR REPLACE FUNCTION finance.reject_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'posted ledger history is immutable; create a reversal transaction instead';
END;
$$;

CREATE TRIGGER ledger_transactions_immutable
BEFORE UPDATE OR DELETE ON finance.ledger_transactions
FOR EACH ROW EXECUTE FUNCTION finance.reject_ledger_mutation();

CREATE TRIGGER ledger_entries_immutable
BEFORE UPDATE OR DELETE ON finance.ledger_entries
FOR EACH ROW EXECUTE FUNCTION finance.reject_ledger_mutation();

CREATE OR REPLACE FUNCTION finance.assert_transaction_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    tx_id uuid;
    tx_currency char(3);
    entry_count bigint;
    account_count bigint;
    debit_total numeric;
    credit_total numeric;
BEGIN
    IF TG_TABLE_NAME = 'ledger_transactions' THEN
        tx_id := NEW.id;
    ELSE
        tx_id := NEW.transaction_id;
    END IF;

    SELECT
        t.currency,
        count(e.transaction_id),
        count(DISTINCT e.account_id),
        COALESCE(sum(e.amount_minor) FILTER (WHERE e.side = 'debit'), 0),
        COALESCE(sum(e.amount_minor) FILTER (WHERE e.side = 'credit'), 0)
    INTO tx_currency, entry_count, account_count, debit_total, credit_total
    FROM finance.ledger_transactions t
    LEFT JOIN finance.ledger_entries e ON e.transaction_id = t.id
    WHERE t.id = tx_id
    GROUP BY t.currency;

    IF tx_currency IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'ledger transaction does not exist';
    END IF;
    IF entry_count < 2 OR account_count < 2 THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger transaction requires at least two entries across two accounts';
    END IF;
    IF debit_total <> credit_total THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger transaction is not balanced';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM finance.ledger_entries e
        JOIN finance.ledger_accounts a ON a.id = e.account_id
        WHERE e.transaction_id = tx_id
          AND (e.currency <> tx_currency OR a.currency <> tx_currency)
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'ledger transaction contains a currency mismatch';
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ledger_transaction_balance_guard
AFTER INSERT ON finance.ledger_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION finance.assert_transaction_balanced();

CREATE CONSTRAINT TRIGGER ledger_entry_balance_guard
AFTER INSERT ON finance.ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION finance.assert_transaction_balanced();

-- Real migrations are created only after the target database baseline is reconciled.
ROLLBACK;
