package wallet

import (
	"context"
	"errors"
	"testing"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

type fakePoster struct {
	command finance.PostingCommand
	result  finance.PostingResult
	err     error
	calls   int
}

func (f *fakePoster) Post(_ context.Context, command finance.PostingCommand) (finance.PostingResult, error) {
	f.calls++
	f.command = command
	return f.result, f.err
}

func validTransferCommand() TransferCommand {
	return TransferCommand{
		TransferID:     "11111111-1111-1111-1111-111111111111",
		IdempotencyKey: "wallet-transfer-1",
		From: AccountRef{
			LedgerAccountID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
			Currency:        "UZS",
		},
		To: AccountRef{
			LedgerAccountID: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
			Currency:        "UZS",
		},
		Amount: finance.Money{AmountMinor: 125_000, Currency: "UZS"},
	}
}

func TestTransferBuildsBalancedLiabilityJournalAndBalanceGuard(t *testing.T) {
	poster := &fakePoster{result: finance.PostingResult{JournalID: "journal-1"}}
	service := Service{Poster: poster}

	result, err := service.Transfer(context.Background(), validTransferCommand())
	if err != nil {
		t.Fatalf("Transfer returned error: %v", err)
	}
	if result.JournalID != "journal-1" || result.Duplicate {
		t.Fatalf("unexpected transfer result: %+v", result)
	}
	if poster.calls != 1 {
		t.Fatalf("expected one posting call, got %d", poster.calls)
	}
	posted := poster.command
	if posted.Scope != "wallet.transfer" || posted.IdempotencyKey != "wallet-transfer-1" {
		t.Fatalf("unexpected posting identity: %+v", posted)
	}
	if len(posted.RequestHash) != 32 {
		t.Fatalf("request hash must be SHA-256, got %d bytes", len(posted.RequestHash))
	}
	if err := posted.Journal.Validate(); err != nil {
		t.Fatalf("wallet journal must be balanced: %v", err)
	}
	if len(posted.Journal.Entries) != 2 {
		t.Fatalf("expected two ledger entries, got %d", len(posted.Journal.Entries))
	}
	if posted.Journal.Entries[0].Side != finance.Debit || posted.Journal.Entries[1].Side != finance.Credit {
		t.Fatalf("wallet liability movement must debit sender and credit receiver")
	}
	if len(posted.BalanceRequirements) != 1 {
		t.Fatalf("expected sender balance guard")
	}
	requirement := posted.BalanceRequirements[0]
	if requirement.AccountID != validTransferCommand().From.LedgerAccountID || requirement.AtLeastMinor != 125_000 || requirement.Currency != "UZS" {
		t.Fatalf("unexpected balance guard: %+v", requirement)
	}
}

func TestTransferPropagatesDuplicateResult(t *testing.T) {
	poster := &fakePoster{result: finance.PostingResult{JournalID: "existing", Duplicate: true}}
	service := Service{Poster: poster}

	result, err := service.Transfer(context.Background(), validTransferCommand())
	if err != nil {
		t.Fatalf("Transfer returned error: %v", err)
	}
	if !result.Duplicate || result.JournalID != "existing" {
		t.Fatalf("unexpected duplicate result: %+v", result)
	}
}

func TestTransferRejectsCurrencyMismatchBeforePosting(t *testing.T) {
	poster := &fakePoster{}
	service := Service{Poster: poster}
	command := validTransferCommand()
	command.To.Currency = "USD"

	_, err := service.Transfer(context.Background(), command)
	if !errors.Is(err, ErrInvalidTransfer) {
		t.Fatalf("expected ErrInvalidTransfer, got %v", err)
	}
	if poster.calls != 0 {
		t.Fatal("invalid transfer must not reach finance poster")
	}
}

func TestTransferRejectsSameLedgerAccount(t *testing.T) {
	poster := &fakePoster{}
	service := Service{Poster: poster}
	command := validTransferCommand()
	command.To.LedgerAccountID = command.From.LedgerAccountID

	_, err := service.Transfer(context.Background(), command)
	if !errors.Is(err, ErrSameAccount) {
		t.Fatalf("expected ErrSameAccount, got %v", err)
	}
	if poster.calls != 0 {
		t.Fatal("same-account transfer must not reach finance poster")
	}
}
