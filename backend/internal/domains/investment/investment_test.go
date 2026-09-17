package investment

import (
	"errors"
	"testing"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/sharia"
)

func investMoney(amount int64) finance.Money {
	return finance.Money{AmountMinor: amount, Currency: "UZS"}
}

func mudarabahTerms() sharia.MudarabahTerms {
	return sharia.MudarabahTerms{
		Capital:                investMoney(100_000_000),
		RabbAlMalProfitShareBPS: 7_000,
		MudaribProfitShareBPS:   3_000,
	}
}

func wakalahTerms(capital int64) sharia.WakalahInvestmentTerms {
	return sharia.WakalahInvestmentTerms{
		InvestmentCapital: investMoney(capital),
		AgencyFee:         investMoney(1_000_000),
	}
}

func TestApproveMudarabahOfferingRequiresValidWakalahAndUnderlyingAqd(t *testing.T) {
	offering, err := ApproveMudarabahOffering(
		"offering-1",
		"sharia-approval-1",
		wakalahTerms(100_000_000),
		mudarabahTerms(),
	)
	if err != nil {
		t.Fatalf("ApproveMudarabahOffering returned error: %v", err)
	}
	if offering.ID() != "offering-1" || offering.Structure() != StructureMudarabah || offering.Currency() != "UZS" {
		t.Fatalf("unexpected offering: %+v", offering)
	}
}

func TestApproveMudarabahOfferingRejectsGuaranteedFixedReturn(t *testing.T) {
	terms := mudarabahTerms()
	terms.FixedProfitMinor = 15_000_000

	_, err := ApproveMudarabahOffering(
		"offering-fixed",
		"sharia-approval-fixed",
		wakalahTerms(100_000_000),
		terms,
	)
	if !errors.Is(err, sharia.ErrContractViolation) {
		t.Fatalf("expected Sharia contract violation, got %v", err)
	}
}

func TestApproveMusharakahOfferingRequiresAgencyCapitalToMatchInvestorPoolPartner(t *testing.T) {
	terms := sharia.MusharakahTerms{
		Partners: []sharia.MusharakahPartner{
			{PartnerID: "investor-pool", Capital: investMoney(60_000_000), ProfitShareBPS: 6_000},
			{PartnerID: "founder", Capital: investMoney(40_000_000), ProfitShareBPS: 4_000},
		},
	}
	offering, err := ApproveMusharakahOffering(
		"offering-musharakah",
		"sharia-approval-musharakah",
		"investor-pool",
		wakalahTerms(60_000_000),
		terms,
	)
	if err != nil {
		t.Fatalf("ApproveMusharakahOffering returned error: %v", err)
	}
	if offering.Structure() != StructureMusharakah {
		t.Fatalf("unexpected structure: %s", offering.Structure())
	}

	_, err = ApproveMusharakahOffering(
		"offering-mismatch",
		"sharia-approval-mismatch",
		"investor-pool",
		wakalahTerms(50_000_000),
		terms,
	)
	if !errors.Is(err, ErrInvalidOffering) {
		t.Fatalf("expected ErrInvalidOffering for mismatched pool capital, got %v", err)
	}
}

func TestBuildSubscriptionPostingMovesSpendableWalletFundsIntoInvestmentCustody(t *testing.T) {
	offering, err := ApproveMudarabahOffering(
		"offering-subscribe",
		"sharia-approval-subscribe",
		wakalahTerms(100_000_000),
		mudarabahTerms(),
	)
	if err != nil {
		t.Fatalf("approve offering: %v", err)
	}

	posting, err := BuildSubscriptionPosting(SubscriptionRequest{
		SubscriptionID:                     "subscription-1",
		IdempotencyKey:                     "subscription-idem-1",
		Offering:                           offering,
		InvestorWalletLiabilityAccountID:   "wallet-liability",
		InvestmentCustodyLiabilityAccountID: "investment-custody-liability",
		Amount:                             investMoney(10_000_000),
	})
	if err != nil {
		t.Fatalf("BuildSubscriptionPosting returned error: %v", err)
	}
	if posting.Scope != "investment.subscribe" || len(posting.RequestHash) != 32 {
		t.Fatalf("unexpected posting identity: %+v", posting)
	}
	if err := posting.Journal.Validate(); err != nil {
		t.Fatalf("subscription journal must be balanced: %v", err)
	}
	if posting.Journal.Entries[0].Side != finance.Debit || posting.Journal.Entries[1].Side != finance.Credit {
		t.Fatal("subscription must debit spendable wallet liability and credit investment custody liability")
	}
	if len(posting.BalanceRequirements) != 1 || posting.BalanceRequirements[0].AtLeastMinor != 10_000_000 {
		t.Fatalf("wallet funds must be guarded before investment subscription: %+v", posting.BalanceRequirements)
	}
}

func TestBuildSubscriptionPostingRejectsZeroValueUnapprovedOffering(t *testing.T) {
	_, err := BuildSubscriptionPosting(SubscriptionRequest{
		SubscriptionID:                     "subscription-unapproved",
		IdempotencyKey:                     "subscription-idem-unapproved",
		InvestorWalletLiabilityAccountID:   "wallet-liability",
		InvestmentCustodyLiabilityAccountID: "investment-custody-liability",
		Amount:                             investMoney(1_000_000),
	})
	if !errors.Is(err, ErrInvalidSubscription) {
		t.Fatalf("expected ErrInvalidSubscription, got %v", err)
	}
}

func TestAllocateMudarabahProfitUsesActualProfitAndAgreedRatio(t *testing.T) {
	allocation, err := AllocateMudarabahProfit(mudarabahTerms(), investMoney(20_000_000))
	if err != nil {
		t.Fatalf("AllocateMudarabahProfit returned error: %v", err)
	}
	if allocation.RabbAlMal.AmountMinor != 14_000_000 || allocation.Mudarib.AmountMinor != 6_000_000 {
		t.Fatalf("unexpected allocation: %+v", allocation)
	}
}

func TestAllocateMudarabahProfitClosesMinorUnitRoundingExactly(t *testing.T) {
	allocation, err := AllocateMudarabahProfit(mudarabahTerms(), investMoney(101))
	if err != nil {
		t.Fatalf("AllocateMudarabahProfit returned error: %v", err)
	}
	if allocation.RabbAlMal.AmountMinor+allocation.Mudarib.AmountMinor != 101 {
		t.Fatalf("profit allocation must close exactly: %+v", allocation)
	}
}
