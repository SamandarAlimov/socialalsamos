package finance

import (
	"context"
	"crypto/sha256"
	"errors"
	"reflect"
	"testing"
	"time"
)

func (f *fakePostingTx) LockAccounts(context.Context, []string) error { return nil }
func (f *fakePostingTx) Balance(context.Context, string, Currency) (int64, error) {
	return 0, nil
}

type balancePostingRepository struct {
	tx *balancePostingTx
}

func (r *balancePostingRepository) WithinTransaction(ctx context.Context, fn func(PostingTx) error) error {
	return fn(r.tx)
}

type balancePostingTx struct {
	record       IdempotencyRecord
	created      bool
	balance      int64
	balanceErr   error
	locked       []string
	insertCalls  int
	completeCalls int
}

func (f *balancePostingTx) ClaimIdempotency(context.Context, IdempotencyRecord, time.Time) (IdempotencyRecord, bool, error) {
	return f.record, f.created, nil
}

func (f *balancePostingTx) LockAccounts(_ context.Context, ids []string) error {
	f.locked = append([]string(nil), ids...)
	return nil
}

func (f *balancePostingTx) Balance(context.Context, string, Currency) (int64, error) {
	return f.balance, f.balanceErr
}

func (f *balancePostingTx) InsertJournal(context.Context, Journal, string, string, time.Time) error {
	f.insertCalls++
	return nil
}

func (f *balancePostingTx) CompleteIdempotency(context.Context, string, string, string) error {
	f.completeCalls++
	return nil
}

func postingWithBalanceRequirement(required int64) PostingCommand {
	hash := sha256.Sum256([]byte("wallet-transfer-1"))
	return PostingCommand{
		Scope:          "wallet.transfer",
		IdempotencyKey: "idem-balance-1",
		RequestHash:    hash[:],
		Journal: Journal{
			ID:            "journal-balance-1",
			ReferenceType: "wallet_transfer",
			ReferenceID:   "transfer-balance-1",
			Entries: []Entry{
				{AccountID: "account-b", Side: Debit, Amount: Money{AmountMinor: 500, Currency: "UZS"}},
				{AccountID: "account-a", Side: Credit, Amount: Money{AmountMinor: 500, Currency: "UZS"}},
			},
		},
		BalanceRequirements: []BalanceRequirement{
			{AccountID: "account-b", Currency: "UZS", AtLeastMinor: required},
		},
	}
}

func TestPosterLocksAccountsInStableOrderAndChecksBalance(t *testing.T) {
	tx := &balancePostingTx{created: true, balance: 500}
	poster := Poster{Repository: &balancePostingRepository{tx: tx}}

	result, err := poster.Post(context.Background(), postingWithBalanceRequirement(500))
	if err != nil {
		t.Fatalf("Post returned error: %v", err)
	}
	if result.JournalID != "journal-balance-1" {
		t.Fatalf("unexpected result: %+v", result)
	}
	if !reflect.DeepEqual(tx.locked, []string{"account-a", "account-b"}) {
		t.Fatalf("accounts were not locked in stable order: %#v", tx.locked)
	}
	if tx.insertCalls != 1 || tx.completeCalls != 1 {
		t.Fatalf("expected one insert and completion, got insert=%d complete=%d", tx.insertCalls, tx.completeCalls)
	}
}

func TestPosterRejectsInsufficientFundsBeforeJournalInsert(t *testing.T) {
	tx := &balancePostingTx{created: true, balance: 499}
	poster := Poster{Repository: &balancePostingRepository{tx: tx}}

	_, err := poster.Post(context.Background(), postingWithBalanceRequirement(500))
	if !errors.Is(err, ErrInsufficientFunds) {
		t.Fatalf("expected ErrInsufficientFunds, got %v", err)
	}
	if tx.insertCalls != 0 || tx.completeCalls != 0 {
		t.Fatalf("journal must not be persisted on insufficient funds")
	}
}

func TestPosterPropagatesBalanceReadFailure(t *testing.T) {
	tx := &balancePostingTx{created: true, balanceErr: errors.New("database unavailable")}
	poster := Poster{Repository: &balancePostingRepository{tx: tx}}

	_, err := poster.Post(context.Background(), postingWithBalanceRequirement(500))
	if err == nil {
		t.Fatal("expected balance read failure")
	}
	if tx.insertCalls != 0 {
		t.Fatal("journal must not be inserted after balance read failure")
	}
}
