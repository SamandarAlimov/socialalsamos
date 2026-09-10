package marketplace

import (
	"errors"
	"testing"
	"time"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/installment"
)

func money(amount int64) finance.Money {
	return finance.Money{AmountMinor: amount, Currency: "UZS"}
}

func validSnapshotInput(now time.Time) PriceSnapshotInput {
	return PriceSnapshotInput{
		SnapshotID:       "checkout-snapshot-1",
		Currency:         "UZS",
		MerchandisePrice: money(12_600_000),
		RequiresDelivery: true,
		DeliveryQuote: &DeliveryQuote{
			ID:             "delivery-quote-1",
			DestinationKey: "UZ-TK-YUNUSOBOD-zone-3",
			Method:         "courier",
			Fee:            money(120_000),
			ExpiresAt:      now.Add(15 * time.Minute),
		},
		Tax:         money(80_000),
		PlatformFee: money(30_000),
		MandatoryFees: []FeeComponent{
			{Code: "packing", Label: "Qadoqlash", Amount: money(20_000)},
		},
	}
}

func TestBuildPriceSnapshotDisclosesAndSumsEveryMandatoryComponent(t *testing.T) {
	now := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	snapshot, err := BuildPriceSnapshot(validSnapshotInput(now), now)
	if err != nil {
		t.Fatalf("BuildPriceSnapshot returned error: %v", err)
	}
	if snapshot.Total.AmountMinor != 12_850_000 {
		t.Fatalf("unexpected total: %d", snapshot.Total.AmountMinor)
	}
	if snapshot.DeliveryQuote == nil || snapshot.DeliveryQuote.DestinationKey != "UZ-TK-YUNUSOBOD-zone-3" {
		t.Fatalf("delivery quote must be frozen into snapshot: %+v", snapshot.DeliveryQuote)
	}
	if len(snapshot.MandatoryFees) != 1 || snapshot.MandatoryFees[0].Label != "Qadoqlash" {
		t.Fatalf("mandatory fees were not preserved: %+v", snapshot.MandatoryFees)
	}
}

func TestBuildPriceSnapshotRejectsExpiredDeliveryQuote(t *testing.T) {
	now := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	input := validSnapshotInput(now)
	input.DeliveryQuote.ExpiresAt = now

	_, err := BuildPriceSnapshot(input, now)
	if !errors.Is(err, ErrDeliveryQuoteExpired) {
		t.Fatalf("expected ErrDeliveryQuoteExpired, got %v", err)
	}
}

func TestBuildPriceSnapshotRequiresQuoteForPhysicalDelivery(t *testing.T) {
	now := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	input := validSnapshotInput(now)
	input.DeliveryQuote = nil

	_, err := BuildPriceSnapshot(input, now)
	if !errors.Is(err, ErrDeliveryQuoteRequired) {
		t.Fatalf("expected ErrDeliveryQuoteRequired, got %v", err)
	}
}

func TestPriceSnapshotDetectsTamperedTotal(t *testing.T) {
	now := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	snapshot, err := BuildPriceSnapshot(validSnapshotInput(now), now)
	if err != nil {
		t.Fatalf("BuildPriceSnapshot returned error: %v", err)
	}
	snapshot.Total.AmountMinor++

	if err := snapshot.Validate(now); !errors.Is(err, ErrInvalidPriceSnapshot) {
		t.Fatalf("expected tampered total rejection, got %v", err)
	}
}

func TestBuildPriceSnapshotRejectsDuplicateFeeCodes(t *testing.T) {
	now := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	input := validSnapshotInput(now)
	input.MandatoryFees = append(input.MandatoryFees,
		FeeComponent{Code: "packing", Label: "Ikkinchi qadoqlash", Amount: money(1)},
	)

	_, err := BuildPriceSnapshot(input, now)
	if !errors.Is(err, ErrInvalidPriceSnapshot) {
		t.Fatalf("expected duplicate fee rejection, got %v", err)
	}
}

func TestAttachInstallmentKeepsNonMerchandiseCostsUpfront(t *testing.T) {
	now := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	snapshot, err := BuildPriceSnapshot(validSnapshotInput(now), now)
	if err != nil {
		t.Fatalf("BuildPriceSnapshot returned error: %v", err)
	}

	checkout, err := AttachInstallment(snapshot, InstallmentSelection{
		ContractID:       "installment-contract-1",
		CashPrice:        money(12_000_000),
		DownPayment:      money(4_800_000),
		InstallmentCount: 6,
		FirstDueDate:     installment.Date{Year: 2026, Month: time.October, Day: 15},
	}, now)
	if err != nil {
		t.Fatalf("AttachInstallment returned error: %v", err)
	}
	if checkout.DeferredAmount.AmountMinor != 7_800_000 {
		t.Fatalf("unexpected deferred amount: %d", checkout.DeferredAmount.AmountMinor)
	}
	if checkout.DueNow.AmountMinor != 5_050_000 {
		t.Fatalf("due now must include down payment plus disclosed non-merchandise costs, got %d", checkout.DueNow.AmountMinor)
	}
	if len(checkout.Plan.Schedule) != 6 {
		t.Fatalf("expected six installments, got %d", len(checkout.Plan.Schedule))
	}
}

func TestAttachInstallmentRejectsQuoteThatExpiredBeforeAcceptance(t *testing.T) {
	now := time.Date(2026, 9, 10, 10, 0, 0, 0, time.UTC)
	snapshot, err := BuildPriceSnapshot(validSnapshotInput(now), now)
	if err != nil {
		t.Fatalf("BuildPriceSnapshot returned error: %v", err)
	}

	_, err = AttachInstallment(snapshot, InstallmentSelection{
		ContractID:       "installment-contract-expired",
		CashPrice:        money(12_000_000),
		DownPayment:      money(1_000_000),
		InstallmentCount: 6,
		FirstDueDate:     installment.Date{Year: 2026, Month: time.October, Day: 15},
	}, now.Add(16*time.Minute))
	if !errors.Is(err, ErrInvalidInstallmentMode) {
		t.Fatalf("expected installment checkout rejection, got %v", err)
	}
}
