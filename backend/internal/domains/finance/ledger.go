package finance

import (
	"errors"
	"fmt"
	"math"
	"strings"
)

var (
	ErrInvalidJournal  = errors.New("invalid journal")
	ErrUnbalanced      = errors.New("journal is not balanced")
	ErrMixedCurrencies = errors.New("journal contains mixed currencies")
)

type Side string

const (
	Debit  Side = "debit"
	Credit Side = "credit"
)

func (s Side) Opposite() (Side, error) {
	switch s {
	case Debit:
		return Credit, nil
	case Credit:
		return Debit, nil
	default:
		return "", fmt.Errorf("%w: invalid side %q", ErrInvalidJournal, s)
	}
}

type Entry struct {
	AccountID string `json:"account_id"`
	Side      Side   `json:"side"`
	Amount    Money  `json:"amount"`
}

type Journal struct {
	ID            string  `json:"id"`
	ReferenceType string  `json:"reference_type"`
	ReferenceID   string  `json:"reference_id"`
	Entries       []Entry `json:"entries"`
}

func (j Journal) Validate() error {
	if strings.TrimSpace(j.ID) == "" || strings.TrimSpace(j.ReferenceType) == "" || strings.TrimSpace(j.ReferenceID) == "" {
		return fmt.Errorf("%w: id and reference are required", ErrInvalidJournal)
	}
	if len(j.Entries) < 2 {
		return fmt.Errorf("%w: at least two entries are required", ErrInvalidJournal)
	}

	var currency Currency
	var debits int64
	var credits int64
	for i, entry := range j.Entries {
		if strings.TrimSpace(entry.AccountID) == "" {
			return fmt.Errorf("%w: entry %d account id is required", ErrInvalidJournal, i)
		}
		if entry.Side != Debit && entry.Side != Credit {
			return fmt.Errorf("%w: entry %d has invalid side", ErrInvalidJournal, i)
		}
		if err := entry.Amount.Validate(); err != nil {
			return fmt.Errorf("%w: entry %d: %v", ErrInvalidJournal, i, err)
		}
		if entry.Amount.AmountMinor <= 0 {
			return fmt.Errorf("%w: entry %d amount must be positive", ErrInvalidJournal, i)
		}
		if i == 0 {
			currency = entry.Amount.Currency
		} else if entry.Amount.Currency != currency {
			return ErrMixedCurrencies
		}

		var err error
		if entry.Side == Debit {
			debits, err = checkedAdd(debits, entry.Amount.AmountMinor)
		} else {
			credits, err = checkedAdd(credits, entry.Amount.AmountMinor)
		}
		if err != nil {
			return err
		}
	}
	if debits != credits {
		return fmt.Errorf("%w: debits=%d credits=%d", ErrUnbalanced, debits, credits)
	}
	return nil
}

func (j Journal) Reversal(newID string) (Journal, error) {
	if err := j.Validate(); err != nil {
		return Journal{}, err
	}
	if strings.TrimSpace(newID) == "" {
		return Journal{}, fmt.Errorf("%w: reversal id is required", ErrInvalidJournal)
	}
	entries := make([]Entry, len(j.Entries))
	for i, entry := range j.Entries {
		opposite, _ := entry.Side.Opposite()
		entries[i] = Entry{AccountID: entry.AccountID, Side: opposite, Amount: entry.Amount}
	}
	return Journal{ID: newID, ReferenceType: "reversal", ReferenceID: j.ID, Entries: entries}, nil
}

func checkedAdd(left, right int64) (int64, error) {
	if right > 0 && left > math.MaxInt64-right {
		return 0, ErrAmountOverflow
	}
	return left + right, nil
}
