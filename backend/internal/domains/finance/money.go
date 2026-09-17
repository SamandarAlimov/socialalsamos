package finance

import (
	"errors"
	"fmt"
	"math"
	"strings"
)

var (
	ErrInvalidCurrency   = errors.New("invalid currency")
	ErrNegativeAmount    = errors.New("money amount cannot be negative")
	ErrCurrencyMismatch  = errors.New("currency mismatch")
	ErrAmountOverflow    = errors.New("money amount overflow")
	ErrInsufficientMoney = errors.New("result would be negative")
)

type Currency string

func ParseCurrency(value string) (Currency, error) {
	currency := Currency(strings.TrimSpace(value))
	if err := currency.Validate(); err != nil {
		return "", err
	}
	return currency, nil
}

func (c Currency) Validate() error {
	if len(c) != 3 {
		return fmt.Errorf("%w: must contain exactly three uppercase ASCII letters", ErrInvalidCurrency)
	}
	for _, char := range c {
		if char < 'A' || char > 'Z' {
			return fmt.Errorf("%w: %q", ErrInvalidCurrency, c)
		}
	}
	return nil
}

type Money struct {
	AmountMinor int64    `json:"amount_minor"`
	Currency    Currency `json:"currency"`
}

func NewMoney(amountMinor int64, currency Currency) (Money, error) {
	money := Money{AmountMinor: amountMinor, Currency: currency}
	if err := money.Validate(); err != nil {
		return Money{}, err
	}
	return money, nil
}

func (m Money) Validate() error {
	if err := m.Currency.Validate(); err != nil {
		return err
	}
	if m.AmountMinor < 0 {
		return ErrNegativeAmount
	}
	return nil
}

func (m Money) IsZero() bool { return m.AmountMinor == 0 }

func (m Money) Add(other Money) (Money, error) {
	if err := sameCurrency(m, other); err != nil {
		return Money{}, err
	}
	if m.AmountMinor > math.MaxInt64-other.AmountMinor {
		return Money{}, ErrAmountOverflow
	}
	return Money{AmountMinor: m.AmountMinor + other.AmountMinor, Currency: m.Currency}, nil
}

func (m Money) Sub(other Money) (Money, error) {
	if err := sameCurrency(m, other); err != nil {
		return Money{}, err
	}
	if other.AmountMinor > m.AmountMinor {
		return Money{}, ErrInsufficientMoney
	}
	return Money{AmountMinor: m.AmountMinor - other.AmountMinor, Currency: m.Currency}, nil
}

func sameCurrency(left, right Money) error {
	if err := left.Validate(); err != nil {
		return err
	}
	if err := right.Validate(); err != nil {
		return err
	}
	if left.Currency != right.Currency {
		return fmt.Errorf("%w: %s != %s", ErrCurrencyMismatch, left.Currency, right.Currency)
	}
	return nil
}
