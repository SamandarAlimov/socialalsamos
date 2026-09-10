package wallet

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

var (
	ErrInvalidTransfer = errors.New("invalid wallet transfer")
	ErrSameAccount     = errors.New("wallet transfer accounts must be different")
)

type AccountRef struct {
	LedgerAccountID string
	Currency        finance.Currency
}

func (a AccountRef) Validate() error {
	if strings.TrimSpace(a.LedgerAccountID) == "" {
		return fmt.Errorf("%w: ledger account id is required", ErrInvalidTransfer)
	}
	if err := a.Currency.Validate(); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidTransfer, err)
	}
	return nil
}

type TransferCommand struct {
	TransferID     string
	IdempotencyKey string
	From           AccountRef
	To             AccountRef
	Amount         finance.Money
	OccurredAt     time.Time
}

func (c TransferCommand) Validate() error {
	if strings.TrimSpace(c.TransferID) == "" {
		return fmt.Errorf("%w: transfer id is required", ErrInvalidTransfer)
	}
	if strings.TrimSpace(c.IdempotencyKey) == "" {
		return fmt.Errorf("%w: idempotency key is required", ErrInvalidTransfer)
	}
	if err := c.From.Validate(); err != nil {
		return err
	}
	if err := c.To.Validate(); err != nil {
		return err
	}
	if c.From.LedgerAccountID == c.To.LedgerAccountID {
		return ErrSameAccount
	}
	if err := c.Amount.Validate(); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidTransfer, err)
	}
	if c.Amount.AmountMinor <= 0 {
		return fmt.Errorf("%w: amount must be positive", ErrInvalidTransfer)
	}
	if c.From.Currency != c.Amount.Currency || c.To.Currency != c.Amount.Currency {
		return fmt.Errorf("%w: all transfer currencies must match", ErrInvalidTransfer)
	}
	return nil
}

type TransferResult struct {
	JournalID string
	Duplicate bool
}
