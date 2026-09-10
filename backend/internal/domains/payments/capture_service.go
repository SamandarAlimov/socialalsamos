package payments

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

var (
	ErrCaptureRepositoryRequired = errors.New("payment capture repository is required")
	ErrInvalidCaptureRequest      = errors.New("invalid payment capture request")
)

type CaptureRequest struct {
	ProviderEventRecordID          string
	OutboxEventID                  string
	Event                          ProviderEvent
	JournalID                      string
	ProviderClearingAccountID      string
	DestinationLiabilityAccountID  string
	OccurredAt                     time.Time
}

type CaptureResult struct {
	Intent    Intent
	JournalID string
	Duplicate bool
}

type CaptureTx interface {
	LoadIntentForUpdate(context.Context, string) (Intent, error)
	ClaimProviderEvent(context.Context, string, ProviderEvent, []byte, time.Time) (duplicate bool, err error)
	FinancePostingTx() finance.PostingTx
	SaveCapturedIntent(context.Context, Intent, time.Time) error
	EnqueueCaptured(context.Context, string, Intent, ProviderEvent, time.Time) error
}

type CaptureRepository interface {
	WithinCaptureTransaction(context.Context, func(CaptureTx) error) error
}

type CaptureProcessor struct {
	Repository CaptureRepository
	Poster     finance.Poster
	Now        func() time.Time
}

func (p CaptureProcessor) Capture(ctx context.Context, request CaptureRequest) (CaptureResult, error) {
	if p.Repository == nil {
		return CaptureResult{}, ErrCaptureRepositoryRequired
	}
	if err := validateCaptureRequest(request); err != nil {
		return CaptureResult{}, err
	}

	now := time.Now
	if p.Now != nil {
		now = p.Now
	}
	currentTime := now().UTC()

	var result CaptureResult
	err := p.Repository.WithinCaptureTransaction(ctx, func(tx CaptureTx) error {
		intent, err := tx.LoadIntentForUpdate(ctx, request.Event.IntentID)
		if err != nil {
			return fmt.Errorf("load payment intent: %w", err)
		}

		capturedIntent, posting, err := BuildCapturePosting(
			intent,
			request.Event,
			request.JournalID,
			request.ProviderClearingAccountID,
			request.DestinationLiabilityAccountID,
		)
		if err != nil {
			return err
		}
		if !request.OccurredAt.IsZero() {
			posting.OccurredAt = request.OccurredAt.UTC()
		} else {
			posting.OccurredAt = currentTime
		}

		eventDuplicate, err := tx.ClaimProviderEvent(
			ctx,
			request.ProviderEventRecordID,
			request.Event,
			posting.RequestHash,
			currentTime,
		)
		if err != nil {
			return fmt.Errorf("claim provider event: %w", err)
		}

		postingTx := tx.FinancePostingTx()
		if postingTx == nil {
			return finance.ErrPostingTransactionAbsent
		}
		posted, err := p.Poster.PostWithin(ctx, postingTx, posting)
		if err != nil {
			return fmt.Errorf("post payment capture: %w", err)
		}

		if err := tx.SaveCapturedIntent(ctx, capturedIntent, currentTime); err != nil {
			return fmt.Errorf("save captured payment intent: %w", err)
		}
		if err := tx.EnqueueCaptured(ctx, request.OutboxEventID, capturedIntent, request.Event, currentTime); err != nil {
			return fmt.Errorf("enqueue payment captured event: %w", err)
		}

		result = CaptureResult{
			Intent:    capturedIntent,
			JournalID: posted.JournalID,
			Duplicate: eventDuplicate || posted.Duplicate,
		}
		return nil
	})
	if err != nil {
		return CaptureResult{}, err
	}
	return result, nil
}

func validateCaptureRequest(request CaptureRequest) error {
	if strings.TrimSpace(request.ProviderEventRecordID) == "" {
		return fmt.Errorf("%w: provider event record id is required", ErrInvalidCaptureRequest)
	}
	if strings.TrimSpace(request.OutboxEventID) == "" {
		return fmt.Errorf("%w: outbox event id is required", ErrInvalidCaptureRequest)
	}
	if strings.TrimSpace(request.JournalID) == "" {
		return fmt.Errorf("%w: journal id is required", ErrInvalidCaptureRequest)
	}
	if strings.TrimSpace(request.ProviderClearingAccountID) == "" || strings.TrimSpace(request.DestinationLiabilityAccountID) == "" {
		return fmt.Errorf("%w: clearing and destination ledger accounts are required", ErrInvalidCaptureRequest)
	}
	if request.Event.Status != ProviderEventCaptured {
		return fmt.Errorf("%w: event must be captured", ErrInvalidCaptureRequest)
	}
	return nil
}
