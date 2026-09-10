package finance

import (
	"errors"
	"testing"
)

func TestJournalRequiresDoubleEntryBalance(t *testing.T) {
	amount, _ := NewMoney(125000, Currency("UZS"))
	journal := Journal{
		ID: "txn-1", ReferenceType: "wallet_topup", ReferenceID: "topup-1",
		Entries: []Entry{
			{AccountID: "provider-clearing", Side: Debit, Amount: amount},
			{AccountID: "user-wallet", Side: Credit, Amount: amount},
		},
	}
	if err := journal.Validate(); err != nil {
		t.Fatalf("valid journal rejected: %v", err)
	}
}

func TestJournalRejectsUnbalancedAndMixedCurrency(t *testing.T) {
	uzs100, _ := NewMoney(100, Currency("UZS"))
	uzs99, _ := NewMoney(99, Currency("UZS"))
	journal := Journal{ID: "t", ReferenceType: "test", ReferenceID: "1", Entries: []Entry{
		{AccountID: "a", Side: Debit, Amount: uzs100},
		{AccountID: "b", Side: Credit, Amount: uzs99},
	}}
	if err := journal.Validate(); !errors.Is(err, ErrUnbalanced) {
		t.Fatalf("expected ErrUnbalanced, got %v", err)
	}

	usd100, _ := NewMoney(100, Currency("USD"))
	journal.Entries[1].Amount = usd100
	if err := journal.Validate(); !errors.Is(err, ErrMixedCurrencies) {
		t.Fatalf("expected ErrMixedCurrencies, got %v", err)
	}
}

func TestJournalReversalOpposesEveryEntry(t *testing.T) {
	amount, _ := NewMoney(500, Currency("UZS"))
	original := Journal{ID: "original", ReferenceType: "payment", ReferenceID: "p1", Entries: []Entry{
		{AccountID: "buyer", Side: Debit, Amount: amount},
		{AccountID: "held", Side: Credit, Amount: amount},
	}}
	reversal, err := original.Reversal("reverse-1")
	if err != nil {
		t.Fatal(err)
	}
	if reversal.Entries[0].Side != Credit || reversal.Entries[1].Side != Debit {
		t.Fatalf("unexpected reversal sides: %+v", reversal.Entries)
	}
	if err := reversal.Validate(); err != nil {
		t.Fatalf("reversal should remain balanced: %v", err)
	}
}
