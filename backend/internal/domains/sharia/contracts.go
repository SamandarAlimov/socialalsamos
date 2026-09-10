package sharia

import (
	"errors"
	"fmt"
	"strings"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

var ErrContractViolation = errors.New("SHARIA_CONTRACT_VIOLATION")

const basisPointsFull uint32 = 10_000

type DeferredSaleTerms struct {
	CashPrice               finance.Money
	AgreedSalePrice         finance.Money
	DownPayment             finance.Money
	InstallmentCount        uint16
	TimeBasedInterestBPS    uint32
	LatePaymentIncrementBPS uint32
}

func (t DeferredSaleTerms) Validate() error {
	if err := positiveMoney("cash_price", t.CashPrice); err != nil {
		return err
	}
	if err := positiveMoney("agreed_sale_price", t.AgreedSalePrice); err != nil {
		return err
	}
	if err := t.DownPayment.Validate(); err != nil {
		return violation("down_payment", err.Error())
	}
	if t.CashPrice.Currency != t.AgreedSalePrice.Currency || t.DownPayment.Currency != t.AgreedSalePrice.Currency {
		return violation("currency", "cash price, agreed price and down payment must use the same currency")
	}
	if t.DownPayment.AmountMinor >= t.AgreedSalePrice.AmountMinor {
		return violation("down_payment", "deferred sale requires an outstanding deferred amount")
	}
	if t.InstallmentCount == 0 {
		return violation("installment_count", "at least one installment is required")
	}
	if t.TimeBasedInterestBPS != 0 {
		return violation("time_based_interest_bps", "interest tied to time is not allowed")
	}
	if t.LatePaymentIncrementBPS != 0 {
		return violation("late_payment_increment_bps", "debt may not increase merely because payment is late")
	}
	return nil
}

type MudarabahTerms struct {
	Capital                 finance.Money
	RabbAlMalProfitShareBPS  uint32
	MudaribProfitShareBPS    uint32
	MudaribGuaranteesCapital bool
	FixedProfitMinor         int64
}

func (t MudarabahTerms) Validate() error {
	if err := positiveMoney("capital", t.Capital); err != nil {
		return err
	}
	if t.RabbAlMalProfitShareBPS > basisPointsFull || t.MudaribProfitShareBPS > basisPointsFull ||
		t.RabbAlMalProfitShareBPS+t.MudaribProfitShareBPS != basisPointsFull {
		return violation("profit_share", "mudarabah profit shares must total 10000 basis points")
	}
	if t.MudaribGuaranteesCapital {
		return violation("capital_guarantee", "mudarib may not unconditionally guarantee investment capital")
	}
	if t.FixedProfitMinor != 0 {
		return violation("fixed_profit_minor", "mudarabah profit must be a share of actual profit, not a fixed amount")
	}
	return nil
}

type MusharakahPartner struct {
	PartnerID      string
	Capital        finance.Money
	ProfitShareBPS uint32
}

type MusharakahTerms struct {
	Partners                      []MusharakahPartner
	PartnerGuaranteesOtherCapital bool
	FixedProfitMinor              int64
}

func (t MusharakahTerms) Validate() error {
	if len(t.Partners) < 2 {
		return violation("partners", "musharakah requires at least two partners")
	}
	var currency finance.Currency
	var profitTotal uint32
	for i, partner := range t.Partners {
		if strings.TrimSpace(partner.PartnerID) == "" {
			return violation("partner_id", fmt.Sprintf("partner %d id is required", i))
		}
		if err := positiveMoney("capital", partner.Capital); err != nil {
			return err
		}
		if i == 0 {
			currency = partner.Capital.Currency
		} else if partner.Capital.Currency != currency {
			return violation("currency", "all musharakah capital must use the same currency")
		}
		if partner.ProfitShareBPS > basisPointsFull-profitTotal {
			return violation("profit_share", "musharakah profit shares exceed 10000 basis points")
		}
		profitTotal += partner.ProfitShareBPS
	}
	if profitTotal != basisPointsFull {
		return violation("profit_share", "musharakah profit shares must total 10000 basis points")
	}
	if t.PartnerGuaranteesOtherCapital {
		return violation("capital_guarantee", "a partner may not unconditionally guarantee another partner's capital")
	}
	if t.FixedProfitMinor != 0 {
		return violation("fixed_profit_minor", "musharakah profit may not be a guaranteed fixed amount")
	}
	return nil
}

type WakalahInvestmentTerms struct {
	InvestmentCapital        finance.Money
	AgencyFee                finance.Money
	AgentGuaranteesCapital   bool
	FixedInvestorReturnMinor int64
}

func (t WakalahInvestmentTerms) Validate() error {
	if err := positiveMoney("investment_capital", t.InvestmentCapital); err != nil {
		return err
	}
	if err := t.AgencyFee.Validate(); err != nil {
		return violation("agency_fee", err.Error())
	}
	if t.AgencyFee.Currency != t.InvestmentCapital.Currency {
		return violation("currency", "agency fee and investment capital must use the same currency")
	}
	if t.AgentGuaranteesCapital {
		return violation("capital_guarantee", "investment agent may not unconditionally guarantee capital")
	}
	if t.FixedInvestorReturnMinor != 0 {
		return violation("fixed_investor_return_minor", "investment return may not be guaranteed as a fixed amount")
	}
	return nil
}

func positiveMoney(field string, money finance.Money) error {
	if err := money.Validate(); err != nil {
		return violation(field, err.Error())
	}
	if money.AmountMinor <= 0 {
		return violation(field, "amount must be positive")
	}
	return nil
}

func violation(field, message string) error {
	return fmt.Errorf("%w: %s: %s", ErrContractViolation, field, message)
}
