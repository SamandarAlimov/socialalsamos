package installment

import (
	"errors"
	"testing"
	"time"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/sharia"
)

func uzs(amount int64) finance.Money {
	return finance.Money{AmountMinor: amount, Currency: "UZS"}
}

func TestBuildPlanUsesBuyerSelectedDownPaymentAndClosesExactly(t *testing.T) {
	plan, err := BuildPlan(PlanRequest{
		ContractID:       "installment-1",
		CashPrice:        uzs(12_000_000),
		AgreedSalePrice:  uzs(12_600_000),
		DownPayment:      uzs(4_800_000),
		InstallmentCount: 6,
		FirstDueDate:     Date{Year: 2026, Month: time.October, Day: 15},
	})
	if err != nil {
		t.Fatalf("BuildPlan returned error: %v", err)
	}
	if plan.DeferredAmount.AmountMinor != 7_800_000 {
		t.Fatalf("unexpected deferred amount: %d", plan.DeferredAmount.AmountMinor)
	}
	if len(plan.Schedule) != 6 {
		t.Fatalf("expected six installments, got %d", len(plan.Schedule))
	}
	var total int64
	for index, item := range plan.Schedule {
		if item.Number != uint16(index+1) {
			t.Fatalf("unexpected sequence number: %d", item.Number)
		}
		if item.Amount.AmountMinor <= 0 {
			t.Fatal("every scheduled installment must be positive")
		}
		total += item.Amount.AmountMinor
	}
	if total != plan.DeferredAmount.AmountMinor {
		t.Fatalf("schedule does not close exactly: schedule=%d deferred=%d", total, plan.DeferredAmount.AmountMinor)
	}
}

func TestBuildPlanDistributesMinorUnitRemainderDeterministically(t *testing.T) {
	plan, err := BuildPlan(PlanRequest{
		ContractID:       "installment-remainder",
		CashPrice:        uzs(100),
		AgreedSalePrice:  uzs(100),
		DownPayment:      uzs(0),
		InstallmentCount: 3,
		FirstDueDate:     Date{Year: 2026, Month: time.September, Day: 30},
	})
	if err != nil {
		t.Fatalf("BuildPlan returned error: %v", err)
	}
	want := []int64{34, 33, 33}
	for i, item := range plan.Schedule {
		if item.Amount.AmountMinor != want[i] {
			t.Fatalf("installment %d: got %d want %d", i+1, item.Amount.AmountMinor, want[i])
		}
	}
}

func TestDateAddMonthsClampsEndOfMonth(t *testing.T) {
	start := Date{Year: 2027, Month: time.January, Day: 31}
	if got := start.AddMonths(1); got != (Date{Year: 2027, Month: time.February, Day: 28}) {
		t.Fatalf("unexpected February date: %+v", got)
	}
	leap := Date{Year: 2028, Month: time.January, Day: 31}
	if got := leap.AddMonths(1); got != (Date{Year: 2028, Month: time.February, Day: 29}) {
		t.Fatalf("unexpected leap-year February date: %+v", got)
	}
}

func TestBuildPlanRejectsFullDownPayment(t *testing.T) {
	_, err := BuildPlan(PlanRequest{
		ContractID:       "installment-full-down",
		CashPrice:        uzs(1000),
		AgreedSalePrice:  uzs(1100),
		DownPayment:      uzs(1100),
		InstallmentCount: 3,
		FirstDueDate:     Date{Year: 2026, Month: time.October, Day: 1},
	})
	if !errors.Is(err, sharia.ErrContractViolation) {
		t.Fatalf("expected Sharia contract violation, got %v", err)
	}
}

func TestBuildPlanRejectsMixedCurrencies(t *testing.T) {
	_, err := BuildPlan(PlanRequest{
		ContractID:       "installment-currency",
		CashPrice:        uzs(1000),
		AgreedSalePrice:  finance.Money{AmountMinor: 1100, Currency: "USD"},
		DownPayment:      uzs(100),
		InstallmentCount: 3,
		FirstDueDate:     Date{Year: 2026, Month: time.October, Day: 1},
	})
	if !errors.Is(err, sharia.ErrContractViolation) {
		t.Fatalf("expected Sharia contract violation, got %v", err)
	}
}

func TestBuildPlanAllowsZeroDownPaymentWhenSellerPlanAllowsIt(t *testing.T) {
	plan, err := BuildPlan(PlanRequest{
		ContractID:       "installment-zero-down",
		CashPrice:        uzs(900),
		AgreedSalePrice:  uzs(900),
		DownPayment:      uzs(0),
		InstallmentCount: 3,
		FirstDueDate:     Date{Year: 2026, Month: time.October, Day: 1},
	})
	if err != nil {
		t.Fatalf("zero down payment should be valid: %v", err)
	}
	if plan.DeferredAmount.AmountMinor != 900 {
		t.Fatalf("unexpected deferred amount: %d", plan.DeferredAmount.AmountMinor)
	}
}
