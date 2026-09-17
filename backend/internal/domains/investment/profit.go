package investment

import (
	"errors"
	"fmt"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/sharia"
)

var ErrInvalidProfitAllocation = errors.New("invalid investment profit allocation")

type MudarabahProfitAllocation struct {
	RabbAlMal finance.Money
	Mudarib   finance.Money
}

func AllocateMudarabahProfit(terms sharia.MudarabahTerms, actualProfit finance.Money) (MudarabahProfitAllocation, error) {
	if err := terms.Validate(); err != nil {
		return MudarabahProfitAllocation{}, fmt.Errorf("%w: %w", ErrInvalidProfitAllocation, err)
	}
	if err := actualProfit.Validate(); err != nil {
		return MudarabahProfitAllocation{}, fmt.Errorf("%w: profit: %v", ErrInvalidProfitAllocation, err)
	}
	if actualProfit.Currency != terms.Capital.Currency {
		return MudarabahProfitAllocation{}, fmt.Errorf("%w: profit currency must match capital currency", ErrInvalidProfitAllocation)
	}

	rabbAlMalMinor := proportionalMinor(actualProfit.AmountMinor, terms.RabbAlMalProfitShareBPS)
	mudaribMinor := actualProfit.AmountMinor - rabbAlMalMinor
	return MudarabahProfitAllocation{
		RabbAlMal: finance.Money{AmountMinor: rabbAlMalMinor, Currency: actualProfit.Currency},
		Mudarib:   finance.Money{AmountMinor: mudaribMinor, Currency: actualProfit.Currency},
	}, nil
}

func proportionalMinor(amount int64, basisPoints uint32) int64 {
	const denominator int64 = 10_000
	whole := amount / denominator
	remainder := amount % denominator
	return whole*int64(basisPoints) + (remainder*int64(basisPoints))/denominator
}
