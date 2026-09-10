package payments

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

type fakeCaptureRepository struct {
	tx    *fakeCaptureTx
	calls int
	err   error
}

func (r *fakeCaptureRepository) WithinCaptureTransaction(ctx context.Context, fn func(CaptureTx) error) error {
	r.calls++
	if r.err != nil {
		return r.err
	}
	return fn(r.tx)
}

type fakeCaptureTx struct {
	intent         Intent
	loadErr        error
	eventDuplicate bool
	claimErr       error
	postingTx      finance.PostingTx
	savedIntent    Intent
	saveCalls      int
	saveErr        error
	enqueueCalls   int
	enqueueErr     error
}

func (f *fakeCaptureTx) LoadIntentForUpdate(context.Context, string) (Intent, error) {
	return f.intent, f.loadErr
}

func (f *fakeCaptureTx) ClaimProviderEvent(context.Context, string, ProviderEvent, []byte, time.Time) (bool, error) {
	return f.eventDuplicate, f.claimErr
}

func (f *fakeCaptureTx) FinancePostingTx() finance.PostingTx {
	return f.postingTx
}

func (f *fakeCaptureTx) SaveCapturedIntent(_ context.Context, intent Intent, _ time.Time) error {
	f.saveCalls++
	f.savedIntent = intent
	return f.saveErr
}

func (f *fakeCaptureTx) EnqueueCaptured(context.Context, string, Intent, ProviderEvent, time.Time) error {
	f.enqueueCalls++
	return f.enqueueErr
}

type fakeFinancePostingTx struct {
	duplicate     bool
	insertErr     error
	insertCalls   int
	completeCalls int
	locked        []string
}

func (f *fakeFinancePostingTx) ClaimIdempotency(_ context.Context, requested finance.IdempotencyRecord, _ time.Time) (finance.IdempotencyRecord, bool, error) {
	if f.duplicate {
		requested.State = finance.IdempotencyCompleted
		requested.JournalID = "existing-capture-journal"
		return requested, false, nil
	}
	return requested, true, nil
}

func (f *fakeFinancePostingTx) LockAccounts(_ context.Context, ids []string) error {
	f.locked = append([]string(nil), ids...)
	return nil
}

func (f *fakeFinancePostingTx) Balance(context.Context, string, finance.Currency) (int64, error) {
	return 0, nil
}

func (f *fakeFinancePostingTx) InsertJournal(context.Context, finance.Journal, string, string, time.Time) error {
	f.insertCalls++
	return f.insertErr
}

func (f *fakeFinancePostingTx) CompleteIdempotency(context.Context, string, string, string) error {
	f.completeCalls++
	return nil
}

func captureRequest() CaptureRequest {
	return CaptureRequest{
		ProviderEventRecordID:         "55555555-5555-5555-5555-555555555555",
		OutboxEventID:                 "66666666-6666-6666-6666-666666666666",
		Event:                         capturedEvent(),
		JournalID:                     "77777777-7777-7777-7777-777777777777",
		ProviderClearingAccountID:     "88888888-8888-8888-8888-888888888888",
		DestinationLiabilityAccountID: "99999999-9999-9999-9999-999999999999",
	}
}

func TestCaptureProcessorCommitsIntentLedgerAndOutboxThroughOneTransaction(t *testing.T) {
	postingTx := &fakeFinancePostingTx{}
	tx := &fakeCaptureTx{intent: pendingIntent(t), postingTx: postingTx}
	repo := &fakeCaptureRepository{tx: tx}
	processor := CaptureProcessor{
		Repository: repo,
		Poster:     finance.Poster{},
		Now: func() time.Time {
			return time.Date(2026, 9, 10, 10, 30, 0, 0, time.UTC)
		},
	}

	result, err := processor.Capture(context.Background(), captureRequest())
	if err != nil {
		t.Fatalf("Capture returned error: %v", err)
	}
	if result.Intent.State != StateCaptured || result.JournalID != captureRequest().JournalID || result.Duplicate {
		t.Fatalf("unexpected capture result: %+v", result)
	}
	if repo.calls != 1 || postingTx.insertCalls != 1 || postingTx.completeCalls != 1 {
		t.Fatalf("unexpected transaction calls: repo=%d insert=%d complete=%d", repo.calls, postingTx.insertCalls, postingTx.completeCalls)
	}
	if tx.saveCalls != 1 || tx.enqueueCalls != 1 || tx.savedIntent.State != StateCaptured {
		t.Fatalf("intent and outbox must be written after ledger posting: save=%d enqueue=%d state=%s", tx.saveCalls, tx.enqueueCalls, tx.savedIntent.State)
	}
}

func TestCaptureProcessorDoesNotPersistIntentOrOutboxWhenLedgerFails(t *testing.T) {
	postingTx := &fakeFinancePostingTx{insertErr: errors.New("ledger unavailable")}
	tx := &fakeCaptureTx{intent: pendingIntent(t), postingTx: postingTx}
	processor := CaptureProcessor{Repository: &fakeCaptureRepository{tx: tx}, Poster: finance.Poster{}}

	_, err := processor.Capture(context.Background(), captureRequest())
	if err == nil {
		t.Fatal("expected capture failure")
	}
	if tx.saveCalls != 0 || tx.enqueueCalls != 0 {
		t.Fatalf("intent/outbox must not be written after ledger failure: save=%d enqueue=%d", tx.saveCalls, tx.enqueueCalls)
	}
}

func TestCaptureProcessorTreatsExactProviderAndLedgerReplayAsDuplicate(t *testing.T) {
	postingTx := &fakeFinancePostingTx{duplicate: true}
	tx := &fakeCaptureTx{
		intent:         func() Intent { i := pendingIntent(t); i.State = StateCaptured; i.ProviderReference = capturedEvent().ProviderReference; return i }(),
		eventDuplicate: true,
		postingTx:      postingTx,
	}
	processor := CaptureProcessor{Repository: &fakeCaptureRepository{tx: tx}, Poster: finance.Poster{}}

	result, err := processor.Capture(context.Background(), captureRequest())
	if err != nil {
		t.Fatalf("duplicate Capture returned error: %v", err)
	}
	if !result.Duplicate || result.JournalID != "existing-capture-journal" {
		t.Fatalf("unexpected duplicate result: %+v", result)
	}
	if postingTx.insertCalls != 0 || postingTx.completeCalls != 0 {
		t.Fatal("duplicate capture must not create another ledger journal")
	}
}

func TestCaptureProcessorRejectsNonCaptureBeforeOpeningTransaction(t *testing.T) {
	tx := &fakeCaptureTx{intent: pendingIntent(t), postingTx: &fakeFinancePostingTx{}}
	repo := &fakeCaptureRepository{tx: tx}
	request := captureRequest()
	request.Event.Status = ProviderEventAuthorized
	processor := CaptureProcessor{Repository: repo, Poster: finance.Poster{}}

	_, err := processor.Capture(context.Background(), request)
	if !errors.Is(err, ErrInvalidCaptureRequest) {
		t.Fatalf("expected ErrInvalidCaptureRequest, got %v", err)
	}
	if repo.calls != 0 {
		t.Fatal("invalid event must be rejected before opening a database transaction")
	}
}
