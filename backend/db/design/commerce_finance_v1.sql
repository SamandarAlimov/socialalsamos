-- DESIGN ONLY — DO NOT APPLY TO PRODUCTION OR THE CURRENT SUPABASE DATABASE.
-- Companion to finance_core_v1.sql. This models target commerce/payment/installment/investment
-- invariants after live-schema reconciliation. It deliberately ends with ROLLBACK.

BEGIN;

CREATE SCHEMA IF NOT EXISTS payments;
CREATE SCHEMA IF NOT EXISTS commerce;
CREATE SCHEMA IF NOT EXISTS installment;
CREATE SCHEMA IF NOT EXISTS investment;

CREATE TYPE payments.environment AS ENUM ('sandbox', 'live');
CREATE TYPE payments.purpose AS ENUM (
    'wallet_topup',
    'order_payment',
    'installment_payment',
    'investment_subscription'
);
CREATE TYPE payments.intent_state AS ENUM (
    'created',
    'pending',
    'authorized',
    'captured',
    'failed',
    'cancelled',
    'refunded'
);

CREATE TABLE payments.intents (
    id uuid PRIMARY KEY,
    provider text NOT NULL CHECK (btrim(provider) <> ''),
    environment payments.environment NOT NULL,
    purpose payments.purpose NOT NULL,
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    state payments.intent_state NOT NULL DEFAULT 'created',
    provider_reference text,
    subject_type text NOT NULL CHECK (btrim(subject_type) <> ''),
    subject_id text NOT NULL CHECK (btrim(subject_id) <> ''),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, environment, provider_reference)
);

CREATE TABLE payments.provider_events (
    id uuid PRIMARY KEY,
    intent_id uuid NOT NULL REFERENCES payments.intents(id),
    provider text NOT NULL CHECK (btrim(provider) <> ''),
    environment payments.environment NOT NULL,
    provider_event_id text NOT NULL CHECK (btrim(provider_event_id) <> ''),
    provider_reference text NOT NULL CHECK (btrim(provider_reference) <> ''),
    event_status text NOT NULL CHECK (event_status IN ('authorized', 'captured', 'failed', 'cancelled', 'refunded')),
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    received_at timestamptz NOT NULL DEFAULT now(),
    payload_hash bytea NOT NULL,
    UNIQUE (provider, environment, provider_event_id)
);

CREATE INDEX provider_events_intent_received_idx
    ON payments.provider_events (intent_id, received_at);

CREATE TABLE commerce.delivery_quotes (
    id uuid PRIMARY KEY,
    seller_id uuid NOT NULL,
    destination_key text NOT NULL CHECK (btrim(destination_key) <> ''),
    method text NOT NULL CHECK (btrim(method) <> ''),
    fee_minor bigint NOT NULL CHECK (fee_minor >= 0),
    currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    quote_version bigint NOT NULL CHECK (quote_version > 0),
    quoted_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    CHECK (expires_at > quoted_at)
);

CREATE TABLE commerce.checkout_price_snapshots (
    id uuid PRIMARY KEY,
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    merchandise_minor bigint NOT NULL CHECK (merchandise_minor > 0),
    delivery_minor bigint NOT NULL DEFAULT 0 CHECK (delivery_minor >= 0),
    tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
    platform_fee_minor bigint NOT NULL DEFAULT 0 CHECK (platform_fee_minor >= 0),
    mandatory_fee_total_minor bigint NOT NULL DEFAULT 0 CHECK (mandatory_fee_total_minor >= 0),
    total_minor bigint GENERATED ALWAYS AS (
        merchandise_minor + delivery_minor + tax_minor + platform_fee_minor + mandatory_fee_total_minor
    ) STORED,
    requires_delivery boolean NOT NULL,
    delivery_quote_id uuid REFERENCES commerce.delivery_quotes(id),
    delivery_destination_key text,
    delivery_method text,
    quote_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    locked_at timestamptz,
    CHECK (
        (requires_delivery AND delivery_quote_id IS NOT NULL AND delivery_destination_key IS NOT NULL AND delivery_method IS NOT NULL AND quote_expires_at IS NOT NULL)
        OR
        (NOT requires_delivery AND delivery_quote_id IS NULL AND delivery_destination_key IS NULL AND delivery_method IS NULL AND quote_expires_at IS NULL AND delivery_minor = 0)
    )
);

CREATE TABLE commerce.checkout_fee_components (
    snapshot_id uuid NOT NULL REFERENCES commerce.checkout_price_snapshots(id),
    code text NOT NULL CHECK (btrim(code) <> ''),
    label text NOT NULL CHECK (btrim(label) <> ''),
    amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
    currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    PRIMARY KEY (snapshot_id, code)
);

CREATE FUNCTION commerce.reject_locked_snapshot_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.locked_at IS NOT NULL THEN
        RAISE EXCEPTION 'locked checkout price snapshot is immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER checkout_snapshot_immutable_after_lock
BEFORE UPDATE OR DELETE ON commerce.checkout_price_snapshots
FOR EACH ROW EXECUTE FUNCTION commerce.reject_locked_snapshot_mutation();

CREATE FUNCTION commerce.reject_locked_fee_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_snapshot_id uuid;
    parent_locked timestamptz;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_snapshot_id := OLD.snapshot_id;
    ELSE
        target_snapshot_id := NEW.snapshot_id;
    END IF;

    SELECT locked_at INTO parent_locked
    FROM commerce.checkout_price_snapshots
    WHERE id = target_snapshot_id;

    IF parent_locked IS NOT NULL THEN
        RAISE EXCEPTION 'fees of a locked checkout price snapshot are immutable';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER checkout_fee_immutable_after_lock
BEFORE UPDATE OR DELETE ON commerce.checkout_fee_components
FOR EACH ROW EXECUTE FUNCTION commerce.reject_locked_fee_mutation();

CREATE TYPE installment.contract_state AS ENUM ('draft', 'active', 'completed', 'cancelled');

CREATE TABLE installment.contracts (
    id uuid PRIMARY KEY,
    checkout_snapshot_id uuid NOT NULL UNIQUE REFERENCES commerce.checkout_price_snapshots(id),
    buyer_id uuid NOT NULL,
    seller_id uuid NOT NULL,
    currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    cash_price_minor bigint NOT NULL CHECK (cash_price_minor > 0),
    agreed_sale_price_minor bigint NOT NULL CHECK (agreed_sale_price_minor > 0),
    down_payment_minor bigint NOT NULL CHECK (down_payment_minor >= 0),
    deferred_minor bigint GENERATED ALWAYS AS (agreed_sale_price_minor - down_payment_minor) STORED,
    installment_count integer NOT NULL CHECK (installment_count > 0),
    state installment.contract_state NOT NULL DEFAULT 'draft',
    sharia_contract_id uuid NOT NULL REFERENCES sharia.contracts(id),
    accepted_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (down_payment_minor < agreed_sale_price_minor),
    CHECK (
        (state = 'draft' AND accepted_at IS NULL AND cancelled_at IS NULL)
        OR (state = 'cancelled' AND cancelled_at IS NOT NULL)
        OR (state IN ('active', 'completed') AND accepted_at IS NOT NULL AND cancelled_at IS NULL)
    )
);

CREATE TABLE installment.schedule (
    contract_id uuid NOT NULL REFERENCES installment.contracts(id),
    sequence_no integer NOT NULL CHECK (sequence_no > 0),
    due_date date NOT NULL,
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    paid_minor bigint NOT NULL DEFAULT 0 CHECK (paid_minor >= 0 AND paid_minor <= amount_minor),
    status text NOT NULL DEFAULT 'due' CHECK (status IN ('due', 'paid', 'cancelled')),
    PRIMARY KEY (contract_id, sequence_no)
);

CREATE FUNCTION installment.validate_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    schedule_count integer;
    schedule_total bigint;
BEGIN
    IF NEW.state = 'active' AND OLD.state = 'draft' THEN
        SELECT count(*), COALESCE(sum(amount_minor), 0)
        INTO schedule_count, schedule_total
        FROM installment.schedule
        WHERE contract_id = NEW.id AND status <> 'cancelled';

        IF schedule_count <> NEW.installment_count THEN
            RAISE EXCEPTION 'installment schedule count does not match contract';
        END IF;
        IF schedule_total <> NEW.deferred_minor THEN
            RAISE EXCEPTION 'installment schedule total does not match deferred sale amount';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER installment_contract_activation_guard
BEFORE UPDATE OF state ON installment.contracts
FOR EACH ROW EXECUTE FUNCTION installment.validate_activation();

CREATE TYPE investment.structure AS ENUM ('mudarabah', 'musharakah');
CREATE TYPE investment.offering_state AS ENUM ('draft', 'approved', 'open', 'funded', 'active', 'distribution', 'closed', 'cancelled');

CREATE TABLE investment.offerings (
    id uuid PRIMARY KEY,
    structure investment.structure NOT NULL,
    currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    target_capital_minor bigint NOT NULL CHECK (target_capital_minor > 0),
    sharia_contract_id uuid NOT NULL REFERENCES sharia.contracts(id),
    sharia_approval_reference text NOT NULL CHECK (btrim(sharia_approval_reference) <> ''),
    approved_terms jsonb NOT NULL CHECK (jsonb_typeof(approved_terms) = 'object'),
    state investment.offering_state NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(),
    approved_at timestamptz,
    cancelled_at timestamptz,
    CHECK (
        (state = 'draft' AND approved_at IS NULL AND cancelled_at IS NULL)
        OR (state = 'cancelled' AND cancelled_at IS NOT NULL)
        OR (state NOT IN ('draft', 'cancelled') AND approved_at IS NOT NULL AND cancelled_at IS NULL)
    )
);

CREATE TABLE investment.subscriptions (
    id uuid PRIMARY KEY,
    offering_id uuid NOT NULL REFERENCES investment.offerings(id),
    investor_id uuid NOT NULL,
    amount_minor bigint NOT NULL CHECK (amount_minor > 0),
    currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    ledger_transaction_id uuid NOT NULL UNIQUE REFERENCES finance.ledger_transactions(id),
    state text NOT NULL CHECK (state IN ('committed', 'active', 'exited', 'cancelled')),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX investment_subscriptions_investor_idx
    ON investment.subscriptions (investor_id, offering_id, created_at);

CREATE TABLE investment.distributions (
    id uuid PRIMARY KEY,
    offering_id uuid NOT NULL REFERENCES investment.offerings(id),
    source_result_type text NOT NULL CHECK (source_result_type IN ('profit', 'capital_return', 'loss_adjustment')),
    gross_result_minor bigint NOT NULL CHECK (gross_result_minor >= 0),
    currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    allocation_terms_snapshot jsonb NOT NULL CHECK (jsonb_typeof(allocation_terms_snapshot) = 'object'),
    ledger_transaction_id uuid UNIQUE REFERENCES finance.ledger_transactions(id),
    declared_at timestamptz NOT NULL DEFAULT now()
);

-- No interest-rate, APY, late-interest, compound-interest, credit-limit or negative-wallet
-- primitive exists in these target tables. Deferred-sale debt is fixed by the accepted contract.

ROLLBACK;
