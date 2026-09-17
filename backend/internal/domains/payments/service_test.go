package payments

import (
	"errors"
	"testing"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

func paymentMoney(amount int64) finance.Money {
	return finance.Money{AmountMinor: amount, Currency: "UZS"}
}

func pendingIntent(t *testing.T) Intent {
	t.Helper()
	intent, err := NewIntent(NewIntentInput{
		ID:          "payment-intent-1",
		Provider:    "payme",
		Environment: EnvironmentSandbox,
		Purpose:     PurposeWalletTopup,
		Amount:      paymentMoney(250_000),
	})
	if err != nil {
		t.Fatalf("NewIntent returned error: %v", err)
	}
	intent, err = Transition(intent, StatePending)
	if err != nil {
		t.Fatalf("Transition returned error: %v", err)
	}
	return intent
}

func capturedEvent() ProviderEvent {
	return ProviderEvent{
		EventID:           "provider-event-1",
		IntentID:          "payment-intent-1",
		Provider:          "payme",
		Environment:       EnvironmentSandbox,
		ProviderReference: "payme-tx-100",
		Status:            ProviderEventCaptured,
		Amount:            paymentMoney(250_000),
	}
}

func TestNewIntentStartsCreatedAndRejectsNonPositiveAmount(t *testing.T) {
	intent, err := NewIntent(NewIntentInput{
		ID:          "payment-intent-new",
		Provider:    "payme",
		Environment: EnvironmentLive,
		Purpose:     PurposeOrderPayment,
		Amount:      paymentMoney(1_000),
	})
	if err != nil {
		t.Fatalf("NewIntent returned error: %v", err)
	}
	if intent.State != StateCreated {
		t.Fatalf("new intent must start created, got %s", intent.State)
	}

	_, err = NewIntent(NewIntentInput{
		ID:          "payment-intent-zero",
		Provider:    "payme",
		Environment: EnvironmentLive,
		Purpose:     PurposeOrderPayment,
		Amount:      paymentMoney(0),
	})
	if !errors.Is(err, ErrInvalidIntent) {
		t.Fatalf("expected ErrInvalidIntent, got %v", err)
	}
}

func TestTransitionRejectsBackwardMovementAfterCapture(t *testing.T) {
	intent := pendingIntent(t)
	var err error
	intent, err = Transition(intent, StateCaptured)
	if err != nil {
		t.Fatalf("capture transition failed: %v", err)
	}
	_, err = Transition(intent, StatePending)
	if !errors.Is(err, ErrInvalidTransition) {
		t.Fatalf("expected ErrInvalidTransition, got %v", err)
	}
}

func TestProviderEventCannotCrossSandboxAndLive(t *testing.T) {
	intent := pendingIntent(t)
	event := capturedEvent()
	event.Environment = EnvironmentLive

	_, err := ApplyProviderEvent(intent, event)
	if !errors.Is(err, ErrProviderEnvironment) {
		t.Fatalf("expected ErrProviderEnvironment, got %v", err)
	}
}

func TestProviderEventMustMatchIntentAmountExactly(t *testing.T) {
	intent := pendingIntent(t)
	event := capturedEvent()
	event.Amount.AmountMinor++

	_, err := ApplyProviderEvent(intent, event)
	if !errors.Is(err, ErrProviderEvent) {
		t.Fatalf("expected ErrProviderEvent, got %v", err)
	}
}

func TestBuildCapturePostingCreatesIncomingDoubleEntryJournal(t *testing.T) {
	intent := pendingIntent(t)
	event := capturedEvent()

	captured, posting, err := BuildCapturePosting(
		intent,
		event,
		"22222222-2222-2222-2222-222222222222",
		"33333333-3333-3333-3333-333333333333",
		"44444444-4444-4444-4444-444444444444",
	)
	if err != nil {
		t.Fatalf("BuildCapturePosting returned error: %v", err)
	}
	if captured.State != StateCaptured || captured.ProviderReference != "payme-tx-100" {
		t.Fatalf("unexpected captured intent: %+v", captured)
	}
	if posting.Scope != "payments.capture" || posting.IdempotencyKey != "payme:sandbox:provider-event-1" {
		t.Fatalf("unexpected posting identity: %+v", posting)
	}
	if len(posting.RequestHash) != 32 {
		t.Fatalf("capture hash must be SHA-256")
	}
	if err := posting.Journal.Validate(); err != nil {
		t.Fatalf("capture journal must be balanced: %v", err)
	}
	if len(posting.Journal.Entries) != 2 {
		t.Fatalf("expected two capture entries")
	}
	if posting.Journal.Entries[0].Side != finance.Debit || posting.Journal.Entries[1].Side != finance.Credit {
		t.Fatalf("incoming provider capture must debit clearing asset and credit destination liability")
	}
}

func TestBuildCapturePostingRejectsNonCapturedEvent(t *testing.T) {
	intent := pendingIntent(t)
	event := capturedEvent()
	event.Status = ProviderEventAuthorized

	_, _, err := BuildCapturePosting(intent, event, "journal", "clearing", "destination")
	if !errors.Is(err, ErrProviderEvent) {
		t.Fatalf("expected ErrProviderEvent, got %v", err)
	}
}
