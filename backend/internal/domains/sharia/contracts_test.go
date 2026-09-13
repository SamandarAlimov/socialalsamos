package sharia

import (
	"errors"
	"testing"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

func money(amount int64) finance.Money {
	value, err := finance.NewMoney(amount, finance.Currency("UZS"))
	if err != nil {
		panic(err)
	}
	return value
}

func TestDeferredSaleAllowsFixedHigherDeferredPrice(t *testing.T) {
	terms := DeferredSaleTerms{
		CashPrice: money(12_000_000), AgreedSalePrice: money(12_600_000),
		DownPayment: money(4_800_000), InstallmentCount: 6,
	}
	if err := terms.Validate(); err != nil {
		t.Fatalf("valid deferred sale rejected: %v", err)
	}
}

func TestDeferredSaleRejectsInterestAndLateIncrement(t *testing.T) {
	base := DeferredSaleTerms{CashPrice: money(1000), AgreedSalePrice: money(1200), DownPayment: money(200), InstallmentCount: 3}
	withInterest := base
	withInterest.TimeBasedInterestBPS = 100
	if err := withInterest.Validate(); !errors.Is(err, ErrContractViolation) {
		t.Fatalf("expected sharia violation, got %v", err)
	}
	withLateFee := base
	withLateFee.LatePaymentIncrementBPS = 100
	if err := withLateFee.Validate(); !errors.Is(err, ErrContractViolation) {
		t.Fatalf("expected sharia violation, got %v", err)
	}
}

func TestMudarabahRejectsManagerCapitalGuaranteeAndFixedProfit(t *testing.T) {
	base := MudarabahTerms{Capital: money(100_000_000), RabbAlMalProfitShareBPS: 7000, MudaribProfitShareBPS: 3000}
	if err := base.Validate(); err != nil {
		t.Fatalf("valid mudarabah rejected: %v", err)
	}
	guaranteed := base
	guaranteed.MudaribGuaranteesCapital = true
	if err := guaranteed.Validate(); !errors.Is(err, ErrContractViolation) {
		t.Fatalf("expected capital guarantee violation, got %v", err)
	}
	fixed := base
	fixed.FixedProfitMinor = 1
	if err := fixed.Validate(); !errors.Is(err, ErrContractViolation) {
		t.Fatalf("expected fixed profit violation, got %v", err)
	}
}

func TestMusharakahRequiresProfitSharesToTotalOneHundredPercent(t *testing.T) {
	terms := MusharakahTerms{Partners: []MusharakahPartner{
		{PartnerID: "founder", Capital: money(40_000_000), ProfitShareBPS: 4500},
		{PartnerID: "investors", Capital: money(60_000_000), ProfitShareBPS: 5500},
	}}
	if err := terms.Validate(); err != nil {
		t.Fatalf("valid musharakah rejected: %v", err)
	}
	terms.Partners[1].ProfitShareBPS = 5000
	if err := terms.Validate(); !errors.Is(err, ErrContractViolation) {
		t.Fatalf("expected profit share violation, got %v", err)
	}
}
