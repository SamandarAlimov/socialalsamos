package payments

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

var (
	ErrNilCaptureDatabase    = errors.New("payment capture SQL database is required")
	ErrPaymentIntentNotFound = errors.New("payment intent not found")
	ErrProviderEventConflict = errors.New("provider event id was reused with different content")
)

type SQLCaptureRepository struct {
	DB *sql.DB
}

func (r SQLCaptureRepository) WithinCaptureTransaction(ctx context.Context, fn func(CaptureTx) error) error {
	if r.DB == nil {
		return ErrNilCaptureDatabase
	}
	if fn == nil {
		return errors.New("payment capture transaction callback is required")
	}

	tx, err := r.DB.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return fmt.Errorf("begin payment capture transaction: %w", err)
	}
	postingTx, err := finance.NewSQLPostingTx(tx)
	if err != nil {
		_ = tx.Rollback()
		return err
	}
	store := sqlCaptureTx{tx: tx, postingTx: postingTx}
	if err := fn(store); err != nil {
		if rollbackErr := tx.Rollback(); rollbackErr != nil && !errors.Is(rollbackErr, sql.ErrTxDone) {
			return fmt.Errorf("payment capture failed: %v; rollback failed: %w", err, rollbackErr)
		}
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit payment capture transaction: %w", err)
	}
	return nil
}

type sqlCaptureTx struct {
	tx        *sql.Tx
	postingTx finance.PostingTx
}

func (s sqlCaptureTx) LoadIntentForUpdate(ctx context.Context, intentID string) (Intent, error) {
	var intent Intent
	var environment string
	var purpose string
	var currency string
	var state string
	err := s.tx.QueryRowContext(ctx, `
SELECT id::text, provider, environment::text, purpose::text, amount_minor, currency, state::text,
       COALESCE(provider_reference, '')
FROM payments.intents
WHERE id = $1
FOR UPDATE`, intentID).Scan(
		&intent.ID,
		&intent.Provider,
		&environment,
		&purpose,
		&intent.Amount.AmountMinor,
		&currency,
		&state,
		&intent.ProviderReference,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return Intent{}, ErrPaymentIntentNotFound
	}
	if err != nil {
		return Intent{}, fmt.Errorf("query payment intent: %w", err)
	}
	parsedCurrency, err := finance.ParseCurrency(currency)
	if err != nil {
		return Intent{}, fmt.Errorf("stored payment intent currency: %w", err)
	}
	intent.Environment = Environment(environment)
	intent.Purpose = Purpose(purpose)
	intent.Amount.Currency = parsedCurrency
	intent.State = IntentState(state)
	if err := intent.Validate(); err != nil {
		return Intent{}, fmt.Errorf("stored payment intent is invalid: %w", err)
	}
	return intent, nil
}

func (s sqlCaptureTx) ClaimProviderEvent(
	ctx context.Context,
	recordID string,
	event ProviderEvent,
	payloadHash []byte,
	receivedAt time.Time,
) (bool, error) {
	result, err := s.tx.ExecContext(ctx, `
INSERT INTO payments.provider_events (
    id, intent_id, provider, environment, provider_event_id, provider_reference,
    event_status, amount_minor, currency, received_at, payload_hash
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
ON CONFLICT (provider, environment, provider_event_id) DO NOTHING`,
		recordID,
		event.IntentID,
		event.Provider,
		string(event.Environment),
		event.EventID,
		event.ProviderReference,
		string(event.Status),
		event.Amount.AmountMinor,
		string(event.Amount.Currency),
		receivedAt.UTC(),
		payloadHash,
	)
	if err != nil {
		return false, fmt.Errorf("insert provider event: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("provider event rows affected: %w", err)
	}
	if rows == 1 {
		return false, nil
	}
	if rows != 0 {
		return false, fmt.Errorf("unexpected provider event row count: %d", rows)
	}

	var existingIntentID string
	var existingHash []byte
	err = s.tx.QueryRowContext(ctx, `
SELECT intent_id::text, payload_hash
FROM payments.provider_events
WHERE provider = $1 AND environment = $2 AND provider_event_id = $3
FOR UPDATE`, event.Provider, string(event.Environment), event.EventID).Scan(&existingIntentID, &existingHash)
	if err != nil {
		return false, fmt.Errorf("load existing provider event: %w", err)
	}
	if existingIntentID != event.IntentID || !bytes.Equal(existingHash, payloadHash) {
		return false, ErrProviderEventConflict
	}
	return true, nil
}

func (s sqlCaptureTx) FinancePostingTx() finance.PostingTx {
	return s.postingTx
}

func (s sqlCaptureTx) SaveCapturedIntent(ctx context.Context, intent Intent, updatedAt time.Time) error {
	if intent.State != StateCaptured {
		return fmt.Errorf("%w: persisted capture state must be captured", ErrInvalidTransition)
	}
	result, err := s.tx.ExecContext(ctx, `
UPDATE payments.intents
SET state = 'captured', provider_reference = $2, updated_at = $3
WHERE id = $1
  AND state IN ('pending', 'authorized', 'captured')
  AND (provider_reference IS NULL OR provider_reference = $2)`,
		intent.ID,
		intent.ProviderReference,
		updatedAt.UTC(),
	)
	if err != nil {
		return fmt.Errorf("update payment intent: %w", err)
	}
	rows, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("payment intent rows affected: %w", err)
	}
	if rows != 1 {
		return fmt.Errorf("%w: capture update expected one intent, got %d", ErrInvalidTransition, rows)
	}
	return nil
}

func (s sqlCaptureTx) EnqueueCaptured(ctx context.Context, outboxEventID string, intent Intent, event ProviderEvent, availableAt time.Time) error {
	_, err := s.tx.ExecContext(ctx, `
INSERT INTO platform.outbox_events (
    id, topic, aggregate_type, aggregate_id, idempotency_key, payload, available_at
) VALUES (
    $1,
    'payments.captured',
    'payment_intent',
    $2,
    $3,
    jsonb_build_object(
        'intent_id', $2,
        'provider', $4,
        'environment', $5,
        'provider_reference', $6,
        'amount_minor', $7,
        'currency', $8,
        'purpose', $9
    ),
    $10
)
ON CONFLICT (idempotency_key) DO NOTHING`,
		outboxEventID,
		intent.ID,
		"payments.captured:"+intent.ID,
		intent.Provider,
		string(intent.Environment),
		event.ProviderReference,
		event.Amount.AmountMinor,
		string(event.Amount.Currency),
		string(intent.Purpose),
		availableAt.UTC(),
	)
	if err != nil {
		return fmt.Errorf("insert payment captured outbox event: %w", err)
	}
	return nil
}
