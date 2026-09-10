package payments

import (
	"errors"
	"testing"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

func TestBuildSettlementPostingBalancesHeldFundsToAllocations(t *testing.T) {
	posting, err := BuildSettlementPosting(SettlementRequest{
		SettlementID:               "settlement-1",
		IdempotencyKey:             "order-1:settle-v1",
		HeldFundsLiabilityAccountID: "held-account",
		HeldAmount:                 paymentMoney(500_000),
		Allocations: []SettlementAllocation{
			{Code: "seller", AccountID: "seller-payable", Amount: paymentMoney(450_000)},
			{Code: "platform_fee", AccountID: "platform-revenue", Amount: paymentMoney(30_000)},
			{Code: "delivery", AccountID: "delivery-payable", Amount: paymentMoney(20_000)},
		},
	})
	if err != nil {
		t.Fatalf("BuildSettlementPosting returned error: %v", err)
	}
	if posting.Scope != "marketplace.settlement" {
		t.Fatalf("unexpected scope: %s", posting.Scope)
	}
	if err := posting.Journal.Validate(); err != nil {
		t.Fatalf("settlement journal must balance: %v", err)
	}
	if len(posting.Journal.Entries) != 4 {
		t.Fatalf("expected held debit plus three credits, got %d", len(posting.Journal.Entries))
	}
	if posting.Journal.Entries[0].AccountID != "held-account" || posting.Journal.Entries[0].Side != finance.Debit {
		t.Fatalf("first entry must release held liability: %+v", posting.Journal.Entries[0])
	}
	for _, entry := range posting.Journal.Entries[1:] {
		if entry.Side != finance.Credit {
			t.Fatalf("settlement destinations must be credited: %+v", entry)
		}
	}
	if len(posting.BalanceRequirements) != 1 || posting.BalanceRequirements[0].AtLeastMinor != 500_000 {
		t.Fatalf("held funds must be guarded against over-settlement: %+v", posting.BalanceRequirements)
	}
}

func TestBuildSettlementPostingRejectsAllocationMismatch(t *testing.T) {
	_, err := BuildSettlementPosting(SettlementRequest{
		SettlementID:               "settlement-mismatch",
		IdempotencyKey:             "order-2:settle-v1",
		HeldFundsLiabilityAccountID: "held-account",
		HeldAmount:                 paymentMoney(500_000),
		Allocations: []SettlementAllocation{
			{Code: "seller", AccountID: "seller-payable", Amount: paymentMoney(470_000)},
			{Code: "platform_fee", AccountID: "platform-revenue", Amount: paymentMoney(20_000)},
		},
	})
	if !errors.Is(err, ErrInvalidSettlement) {
		t.Fatalf("expected ErrInvalidSettlement, got %v", err)
	}
}

func TestBuildSettlementPostingCanonicalizesAllocationOrder(t *testing.T) {
	first, err := BuildSettlementPosting(SettlementRequest{
		SettlementID:               "settlement-order",
		IdempotencyKey:             "order-3:settle-v1",
		HeldFundsLiabilityAccountID: "held-account",
		HeldAmount:                 paymentMoney(100),
		Allocations: []SettlementAllocation{
			{Code: "seller", AccountID: "seller-payable", Amount: paymentMoney(90)},
			{Code: "platform", AccountID: "platform-revenue", Amount: paymentMoney(10)},
		},
	})
	if err != nil {
		t.Fatalf("first posting error: %v", err)
	}
	second, err := BuildSettlementPosting(SettlementRequest{
		SettlementID:               "settlement-order",
		IdempotencyKey:             "order-3:settle-v1",
		HeldFundsLiabilityAccountID: "held-account",
		HeldAmount:                 paymentMoney(100),
		Allocations: []SettlementAllocation{
			{Code: "platform", AccountID: "platform-revenue", Amount: paymentMoney(10)},
			{Code: "seller", AccountID: "seller-payable", Amount: paymentMoney(90)},
		},
	})
	if err != nil {
		t.Fatalf("second posting error: %v", err)
	}
	if string(first.RequestHash) != string(second.RequestHash) {
		t.Fatal("allocation order must not change idempotency fingerprint")
	}
}

func TestBuildSettlementPostingRejectsDuplicateDestinationAccount(t *testing.T) {
	_, err := BuildSettlementPosting(SettlementRequest{
		SettlementID:               "settlement-duplicate",
		IdempotencyKey:             "order-4:settle-v1",
		HeldFundsLiabilityAccountID: "held-account",
		HeldAmount:                 paymentMoney(100),
		Allocations: []SettlementAllocation{
			{Code: "seller", AccountID: "same-account", Amount: paymentMoney(90)},
			{Code: "fee", AccountID: "same-account", Amount: paymentMoney(10)},
		},
	})
	if !errors.Is(err, ErrInvalidSettlement) {
		t.Fatalf("expected ErrInvalidSettlement, got %v", err)
	}
}
