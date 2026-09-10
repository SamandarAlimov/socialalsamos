package finance

import (
	"context"
	"crypto/sha256"
	"errors"
	"testing"
	"time"
)

type fakePostingRepository struct {
	tx       *fakePostingTx
	err      error
	calls    int
}

func (f *fakePostingRepository) WithinTransaction(ctx context.Context, fn func(PostingTx) error) error {
	f.calls++
	if f.err != nil {
		return f.err
	}
	return fn(f.tx)
}

type fakePostingTx struct {
	record          IdempotencyRecord
	created         bool
	claimErr        error
	insertErr       error
	completeErr     error
	insertCalls     int
	completeCalls   int
	insertedJournal Journal
}

func (f *fakePostingTx) ClaimIdempotency(context.Context, IdempotencyRecord, time.Time) (IdempotencyRecord, bool, error) {
	return f.record, f.created, f.claimErr
}

func (f *fakePostingTx) InsertJournal(_ context.Context, journal Journal, _, _ string, _ time.Time) error {
	f.insertCalls++
	f.insertedJournal = journal
	return f.insertErr
}

func (f *fakePostingTx) CompleteIdempotency(context.Context, string, string, string) error {
	f.completeCalls++
	return f.completeErr
}

func testPostingCommand() PostingCommand {
	hash := sha256.Sum256([]byte(`{"amount_minor":1000,"currency":"UZS"}`))
	return PostingCommand{
		Scope:          "wallet.transfer",
		IdempotencyKey: "idem-1",
		RequestHash:    hash[:],
		Journal: Journal{
			ID:            "journal-1",
			ReferenceType: "wallet_transfer",
			ReferenceID:   "transfer-1",
			Entries: []Entry{
				{AccountID: "payer", Side: Debit, Amount: Money{AmountMinor: 1000, Currency: "UZS"}},
				{AccountID: "payee", Side: Credit, Amount: Money{AmountMinor: 1000, Currency: "UZS"}},
			},
		},
	}
}

func TestPosterPostsJournalExactlyOnce(t *testing.T) {
	tx := &fakePostingTx{created: true}
	repo := &fakePostingRepository{tx: tx}
	poster := Poster{Repository: repo, Now: func() time.Time { return time.Date(2026, 9, 10, 9, 0, 0, 0, time.UTC) }}

	result, err := poster.Post(context.Background(), testPostingCommand())
	if err != nil {
		t.Fatalf("Post returned error: %v", err)
	}
	if result.JournalID != "journal-1" || result.Duplicate {
		t.Fatalf("unexpected result: %+v", result)
	}
	if tx.insertCalls != 1 || tx.completeCalls != 1 {
		t.Fatalf("expected one insert and completion, got insert=%d complete=%d", tx.insertCalls, tx.completeCalls)
	}
}

func TestPosterReturnsCompletedDuplicateWithoutSecondInsert(t *testing.T) {
	command := testPostingCommand()
	tx := &fakePostingTx{
		created: false,
		record: IdempotencyRecord{
			Scope: command.Scope, Key: command.IdempotencyKey, RequestHash: append([]byte(nil), command.RequestHash...),
			State: IdempotencyCompleted, JournalID: "journal-existing",
		},
	}
	repo := &fakePostingRepository{tx: tx}

	result, err := (Poster{Repository: repo}).Post(context.Background(), command)
	if err != nil {
		t.Fatalf("Post returned error: %v", err)
	}
	if !result.Duplicate || result.JournalID != "journal-existing" {
		t.Fatalf("unexpected duplicate result: %+v", result)
	}
	if tx.insertCalls != 0 || tx.completeCalls != 0 {
		t.Fatalf("duplicate request must not mutate journal")
	}
}

func TestPosterRejectsIdempotencyKeyReuseWithDifferentPayload(t *testing.T) {
	command := testPostingCommand()
	otherHash := sha256.Sum256([]byte("different request"))
	tx := &fakePostingTx{
		created: false,
		record: IdempotencyRecord{Scope: command.Scope, Key: command.IdempotencyKey, RequestHash: otherHash[:], State: IdempotencyCompleted, JournalID: "journal-existing"},
	}

	_, err := (Poster{Repository: &fakePostingRepository{tx: tx}}).Post(context.Background(), command)
	if !errors.Is(err, ErrIdempotencyConflict) {
		t.Fatalf("expected ErrIdempotencyConflict, got %v", err)
	}
	if tx.insertCalls != 0 {
		t.Fatalf("conflicting request must not insert journal")
	}
}

func TestPosterRejectsInvalidJournalBeforeRepository(t *testing.T) {
	command := testPostingCommand()
	command.Journal.Entries[1].Amount.AmountMinor = 999
	repo := &fakePostingRepository{tx: &fakePostingTx{created: true}}

	_, err := (Poster{Repository: repo}).Post(context.Background(), command)
	if !errors.Is(err, ErrInvalidPostingCommand) {
		t.Fatalf("expected ErrInvalidPostingCommand, got %v", err)
	}
	if repo.calls != 0 {
		t.Fatalf("invalid command must fail before opening a repository transaction")
	}
}

func TestPosterRejectsInProgressDuplicate(t *testing.T) {
	command := testPostingCommand()
	tx := &fakePostingTx{
		created: false,
		record: IdempotencyRecord{Scope: command.Scope, Key: command.IdempotencyKey, RequestHash: append([]byte(nil), command.RequestHash...), State: IdempotencyStarted},
	}

	_, err := (Poster{Repository: &fakePostingRepository{tx: tx}}).Post(context.Background(), command)
	if !errors.Is(err, ErrIdempotencyInProgress) {
		t.Fatalf("expected ErrIdempotencyInProgress, got %v", err)
	}
}
