package finance

import (
	"errors"
	"math"
	"testing"
)

func TestMoneyRejectsFloatLikeAndInvalidCurrencyByConstruction(t *testing.T) {
	if _, err := NewMoney(100, Currency("uzs")); err == nil {
		t.Fatal("expected lowercase currency to be rejected")
	}
	if _, err := NewMoney(-1, Currency("UZS")); !errors.Is(err, ErrNegativeAmount) {
		t.Fatalf("expected ErrNegativeAmount, got %v", err)
	}
}

func TestMoneyAddChecksCurrencyAndOverflow(t *testing.T) {
	uzs, _ := NewMoney(math.MaxInt64, Currency("UZS"))
	one, _ := NewMoney(1, Currency("UZS"))
	if _, err := uzs.Add(one); !errors.Is(err, ErrAmountOverflow) {
		t.Fatalf("expected overflow error, got %v", err)
	}
	usd, _ := NewMoney(1, Currency("USD"))
	if _, err := one.Add(usd); !errors.Is(err, ErrCurrencyMismatch) {
		t.Fatalf("expected currency mismatch, got %v", err)
	}
}
