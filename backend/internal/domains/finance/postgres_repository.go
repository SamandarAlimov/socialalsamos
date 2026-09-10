package finance

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrNilSQLDatabase       = errors.New("finance SQL database is required")
	ErrLedgerAccountMissing = errors.New("ledger account not found")
)

type SQLPostingRepository struct {
	DB *sql.DB
}

func NewSQLPostingTx(tx *sql.Tx) (PostingTx, error) {
	if tx == nil {
		return nil, ErrPostingTransactionAbsent
	}
	return sqlPostingTx{tx: tx}, nil
}

func (r SQLPostingRepository) WithinTransaction(ctx context.Context, fn func(PostingTx) error) error {
	if r.DB == nil {
		return ErrNilSQLDatabase
	}
	if fn == nil {
		return errors.New("finance transaction callback is required")
	}

	tx, err := r.DB.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return fmt.Errorf("begin finance transaction: %w", err)
	}
	store, err := NewSQLPostingTx(tx)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	if err := fn(store); err != nil {
		if rollbackErr := tx.Rollback(); rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) {
			return fmt.Errorf("finance transaction failed: %v; rollback failed: %w", err, rollbackErr)
		}
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit finance transaction: %w", err)
	}
	return nil
}

type sqlPostingTx struct {
	tx *sql.Tx
}

func (s sqlPostingTx) ClaimIdempotency(ctx context.Context, requested IdempotencyRecord, expiresAt time.Time) (IdempotencyRecord, bool, error) {
	result, err := s.tx.ExecContext(ctx, `
INSERT INTO finance.idempotency_records (scope, key, request_hash, state, expires_at)
VALUES ($1, $2, $3, 'started', $4)
ON CONFLICT (scope, key) DO NOTHING`, requested.Scope, requested.Key, requested.RequestHash, expiresAt.UTC())
	if err != nil {
		return IdempotencyRecord{}, false, fmt.Errorf("insert idempotency record: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return IdempotencyRecord{}, false, fmt.Errorf("idempotency rows affected: %w", err)
	}
	if rows == 1 {
		return requested, true, nil
	}
	if rows != 0 {
		return IdempotencyRecord{}, false, fmt.Errorf("unexpected idempotency insert row count: %d", rows)
	}

	var record IdempotencyRecord
	var state string
	err = s.tx.QueryRowContext(ctx, `
SELECT scope, key, request_hash, state, COALESCE(response_body->>'journal_id', '')
FROM finance.idempotency_records
WHERE scope = $1 AND key = $2
FOR UPDATE`, requested.Scope, requested.Key).Scan(
		&record.Scope,
		&record.Key,
		&record.RequestHash,
		&state,
		&record.JournalID,
	)
	if err != nil {
		return IdempotencyRecord{}, false, fmt.Errorf("lock idempotency record: %w", err)
	}
	record.State = IdempotencyState(state)
	return record, false, nil
}

func (s sqlPostingTx) LockAccounts(ctx context.Context, accountIDs []string) error {
	for _, accountID := range accountIDs {
		var lockedID string
		err := s.tx.QueryRowContext(ctx, `
SELECT id::text
FROM finance.ledger_accounts
WHERE id = $1
FOR UPDATE`, accountID).Scan(&lockedID)
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("%w: %s", ErrLedgerAccountMissing, accountID)
		}
		if err != nil {
			return fmt.Errorf("lock ledger account %s: %w", accountID, err)
		}
	}
	return nil
}

func (s sqlPostingTx) Balance(ctx context.Context, accountID string, currency Currency) (int64, error) {
	var accountClass string
	var accountCurrency string
	err := s.tx.QueryRowContext(ctx, `
SELECT account_class::text, currency
FROM finance.ledger_accounts
WHERE id = $1`, accountID).Scan(&accountClass, &accountCurrency)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, fmt.Errorf("%w: %s", ErrLedgerAccountMissing, accountID)
	}
	if err != nil {
		return 0, fmt.Errorf("read ledger account %s: %w", accountID, err)
	}
	if accountCurrency != string(currency) {
		return 0, fmt.Errorf("%w: account=%s ledger=%s requested=%s", ErrCurrencyMismatch, accountID, accountCurrency, currency)
	}

	normalSide := Credit
	switch strings.ToLower(accountClass) {
	case "asset", "expense":
		normalSide = Debit
	case "liability", "equity", "revenue":
		normalSide = Credit
	default:
		return 0, fmt.Errorf("unknown account class %q for %s", accountClass, accountID)
	}

	var balance int64
	err = s.tx.QueryRowContext(ctx, `
SELECT COALESCE(SUM(CASE WHEN side::text = $2 THEN amount_minor ELSE -amount_minor END), 0)::bigint
FROM finance.ledger_entries
WHERE account_id = $1 AND currency = $3`, accountID, string(normalSide), string(currency)).Scan(&balance)
	if err != nil {
		return 0, fmt.Errorf("calculate balance for %s: %w", accountID, err)
	}
	return balance, nil
}

func (s sqlPostingTx) InsertJournal(ctx context.Context, journal Journal, scope, key string, occurredAt time.Time) error {
	if err := journal.Validate(); err != nil {
		return err
	}
	currency := journal.Entries[0].Amount.Currency
	_, err := s.tx.ExecContext(ctx, `
INSERT INTO finance.ledger_transactions (
    id, idempotency_scope, idempotency_key, reference_type, reference_id, currency, occurred_at
) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
		journal.ID,
		scope,
		key,
		journal.ReferenceType,
		journal.ReferenceID,
		string(currency),
		occurredAt.UTC(),
	)
	if err != nil {
		return fmt.Errorf("insert ledger transaction: %w", err)
	}

	for index, entry := range journal.Entries {
		_, err := s.tx.ExecContext(ctx, `
INSERT INTO finance.ledger_entries (
    transaction_id, sequence_no, account_id, side, amount_minor, currency
) VALUES ($1, $2, $3, $4, $5, $6)`,
			journal.ID,
			index+1,
			entry.AccountID,
			string(entry.Side),
			entry.Amount.AmountMinor,
			string(entry.Amount.Currency),
		)
		if err != nil {
			return fmt.Errorf("insert ledger entry %d: %w", index+1, err)
		}
	}
	return nil
}

func (s sqlPostingTx) CompleteIdempotency(ctx context.Context, scope, key, journalID string) error {
	result, err := s.tx.ExecContext(ctx, `
UPDATE finance.idempotency_records
SET state = 'completed',
    response_status = 201,
    response_body = jsonb_build_object('journal_id', $3)
WHERE scope = $1 AND key = $2 AND state = 'started'`, scope, key, journalID)
	if err != nil {
		return fmt.Errorf("complete idempotency record: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("completion rows affected: %w", err)
	}
	if rows != 1 {
		return fmt.Errorf("complete idempotency record: expected one row, got %d", rows)
	}
	return nil
}
