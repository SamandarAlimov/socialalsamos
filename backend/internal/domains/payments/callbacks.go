package payments

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

type ProviderEventStatus string

const (
	ProviderEventAuthorized ProviderEventStatus = "authorized"
	ProviderEventCaptured   ProviderEventStatus = "captured"
	ProviderEventFailed     ProviderEventStatus = "failed"
	ProviderEventCancelled  ProviderEventStatus = "cancelled"
	ProviderEventRefunded   ProviderEventStatus = "refunded"
)

type ProviderEvent struct {
	EventID              string
	IntentID             string
	Provider             string
	Environment          Environment
	ProviderReference    string
	Status               ProviderEventStatus
	Amount               finance.Money
}

func (e ProviderEvent) ValidateAgainst(intent Intent) error {
	if err := intent.Validate(); err != nil {
		return err
	}
	if strings.TrimSpace(e.EventID) == "" || strings.TrimSpace(e.IntentID) == "" {
		return fmt.Errorf("%w: event id and intent id are required", ErrProviderEvent)
	}
	if e.IntentID != intent.ID {
		return fmt.Errorf("%w: intent id mismatch", ErrProviderEvent)
	}
	if strings.TrimSpace(e.Provider) != intent.Provider {
		return fmt.Errorf("%w: provider mismatch", ErrProviderEvent)
	}
	if e.Environment != intent.Environment {
		return fmt.Errorf("%w: intent=%s event=%s", ErrProviderEnvironment, intent.Environment, e.Environment)
	}
	if strings.TrimSpace(e.ProviderReference) == "" {
		return fmt.Errorf("%w: provider reference is required", ErrProviderEvent)
	}
	if intent.ProviderReference != "" && e.ProviderReference != intent.ProviderReference {
		return fmt.Errorf("%w: provider reference mismatch", ErrProviderEvent)
	}
	if err := e.Amount.Validate(); err != nil {
		return fmt.Errorf("%w: amount: %v", ErrProviderEvent, err)
	}
	if e.Amount != intent.Amount {
		return fmt.Errorf("%w: amount or currency mismatch", ErrProviderEvent)
	}
	switch e.Status {
	case ProviderEventAuthorized, ProviderEventCaptured, ProviderEventFailed, ProviderEventCancelled, ProviderEventRefunded:
		return nil
	default:
		return fmt.Errorf("%w: unsupported status %q", ErrProviderEvent, e.Status)
	}
}

func ApplyProviderEvent(intent Intent, event ProviderEvent) (Intent, error) {
	if err := event.ValidateAgainst(intent); err != nil {
		return Intent{}, err
	}
	if intent.ProviderReference == "" {
		intent.ProviderReference = event.ProviderReference
	}

	var next IntentState
	switch event.Status {
	case ProviderEventAuthorized:
		next = StateAuthorized
	case ProviderEventCaptured:
		next = StateCaptured
	case ProviderEventFailed:
		next = StateFailed
	case ProviderEventCancelled:
		next = StateCancelled
	case ProviderEventRefunded:
		next = StateRefunded
	default:
		return Intent{}, fmt.Errorf("%w: unsupported status %q", ErrProviderEvent, event.Status)
	}
	return Transition(intent, next)
}

type captureFingerprint struct {
	EventID           string `json:"event_id"`
	IntentID          string `json:"intent_id"`
	Provider          string `json:"provider"`
	Environment       string `json:"environment"`
	ProviderReference string `json:"provider_reference"`
	Purpose           string `json:"purpose"`
	AmountMinor       int64  `json:"amount_minor"`
	Currency          string `json:"currency"`
}

func BuildCapturePosting(
	intent Intent,
	event ProviderEvent,
	journalID string,
	providerClearingAccountID string,
	destinationLiabilityAccountID string,
) (Intent, finance.PostingCommand, error) {
	journalID = strings.TrimSpace(journalID)
	providerClearingAccountID = strings.TrimSpace(providerClearingAccountID)
	destinationLiabilityAccountID = strings.TrimSpace(destinationLiabilityAccountID)
	if journalID == "" || providerClearingAccountID == "" || destinationLiabilityAccountID == "" {
		return Intent{}, finance.PostingCommand{}, fmt.Errorf("%w: journal and ledger account ids are required", ErrProviderEvent)
	}
	if providerClearingAccountID == destinationLiabilityAccountID {
		return Intent{}, finance.PostingCommand{}, fmt.Errorf("%w: clearing and destination accounts must differ", ErrProviderEvent)
	}
	if event.Status != ProviderEventCaptured {
		return Intent{}, finance.PostingCommand{}, fmt.Errorf("%w: capture posting requires captured event", ErrProviderEvent)
	}

	capturedIntent, err := ApplyProviderEvent(intent, event)
	if err != nil {
		return Intent{}, finance.PostingCommand{}, err
	}

	payload, err := json.Marshal(captureFingerprint{
		EventID:           event.EventID,
		IntentID:          intent.ID,
		Provider:          intent.Provider,
		Environment:       string(intent.Environment),
		ProviderReference: event.ProviderReference,
		Purpose:           string(intent.Purpose),
		AmountMinor:       event.Amount.AmountMinor,
		Currency:          string(event.Amount.Currency),
	})
	if err != nil {
		return Intent{}, finance.PostingCommand{}, fmt.Errorf("%w: hash payload: %v", ErrProviderEvent, err)
	}
	hash := sha256.Sum256(payload)

	journal := finance.Journal{
		ID:            journalID,
		ReferenceType: "payment_capture",
		ReferenceID:   intent.ID,
		Entries: []finance.Entry{
			{
				AccountID: providerClearingAccountID,
				Side:      finance.Debit,
				Amount:    event.Amount,
			},
			{
				AccountID: destinationLiabilityAccountID,
				Side:      finance.Credit,
				Amount:    event.Amount,
			},
		},
	}
	if err := journal.Validate(); err != nil {
		return Intent{}, finance.PostingCommand{}, fmt.Errorf("%w: capture journal: %v", ErrProviderEvent, err)
	}

	return capturedIntent, finance.PostingCommand{
		Scope:          "payments.capture",
		IdempotencyKey: strings.Join([]string{intent.Provider, string(intent.Environment), event.EventID}, ":"),
		RequestHash:    hash[:],
		Journal:        journal,
	}, nil
}
