package marketplace

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/installment"
)

var (
	ErrInvalidPriceSnapshot   = errors.New("invalid checkout price snapshot")
	ErrDeliveryQuoteRequired  = errors.New("delivery quote is required")
	ErrDeliveryQuoteExpired   = errors.New("delivery quote expired")
	ErrInvalidInstallmentMode = errors.New("invalid installment checkout")
)

type DeliveryQuote struct {
	ID             string
	DestinationKey string
	Method         string
	Fee            finance.Money
	ExpiresAt      time.Time
}

func (q DeliveryQuote) validate(currency finance.Currency, now time.Time) error {
	if strings.TrimSpace(q.ID) == "" {
		return fmt.Errorf("%w: delivery quote id is required", ErrInvalidPriceSnapshot)
	}
	if strings.TrimSpace(q.DestinationKey) == "" {
		return fmt.Errorf("%w: delivery destination is required", ErrInvalidPriceSnapshot)
	}
	if strings.TrimSpace(q.Method) == "" {
		return fmt.Errorf("%w: delivery method is required", ErrInvalidPriceSnapshot)
	}
	if err := nonNegativeMoney("delivery_fee", q.Fee, currency); err != nil {
		return err
	}
	if q.ExpiresAt.IsZero() || !q.ExpiresAt.After(now) {
		return ErrDeliveryQuoteExpired
	}
	return nil
}

type FeeComponent struct {
	Code   string
	Label  string
	Amount finance.Money
}

type PriceSnapshotInput struct {
	SnapshotID       string
	Currency         finance.Currency
	MerchandisePrice finance.Money
	RequiresDelivery bool
	DeliveryQuote    *DeliveryQuote
	Tax              finance.Money
	PlatformFee      finance.Money
	MandatoryFees    []FeeComponent
}

type PriceSnapshot struct {
	SnapshotID       string
	Currency         finance.Currency
	MerchandisePrice finance.Money
	RequiresDelivery bool
	DeliveryQuote    *DeliveryQuote
	Tax              finance.Money
	PlatformFee      finance.Money
	MandatoryFees    []FeeComponent
	Total            finance.Money
}

func BuildPriceSnapshot(input PriceSnapshotInput, now time.Time) (PriceSnapshot, error) {
	if strings.TrimSpace(input.SnapshotID) == "" {
		return PriceSnapshot{}, fmt.Errorf("%w: snapshot id is required", ErrInvalidPriceSnapshot)
	}
	if err := input.Currency.Validate(); err != nil {
		return PriceSnapshot{}, fmt.Errorf("%w: %v", ErrInvalidPriceSnapshot, err)
	}
	if err := nonNegativeMoney("merchandise_price", input.MerchandisePrice, input.Currency); err != nil {
		return PriceSnapshot{}, err
	}
	if input.MerchandisePrice.AmountMinor <= 0 {
		return PriceSnapshot{}, fmt.Errorf("%w: merchandise price must be positive", ErrInvalidPriceSnapshot)
	}
	if err := nonNegativeMoney("tax", input.Tax, input.Currency); err != nil {
		return PriceSnapshot{}, err
	}
	if err := nonNegativeMoney("platform_fee", input.PlatformFee, input.Currency); err != nil {
		return PriceSnapshot{}, err
	}

	if input.RequiresDelivery && input.DeliveryQuote == nil {
		return PriceSnapshot{}, ErrDeliveryQuoteRequired
	}
	if !input.RequiresDelivery && input.DeliveryQuote != nil {
		return PriceSnapshot{}, fmt.Errorf("%w: delivery quote provided for a non-delivery checkout", ErrInvalidPriceSnapshot)
	}

	deliveryFee := finance.Money{Currency: input.Currency}
	var quoteCopy *DeliveryQuote
	if input.DeliveryQuote != nil {
		if err := input.DeliveryQuote.validate(input.Currency, now); err != nil {
			return PriceSnapshot{}, err
		}
		copyValue := *input.DeliveryQuote
		quoteCopy = &copyValue
		deliveryFee = input.DeliveryQuote.Fee
	}

	fees := make([]FeeComponent, len(input.MandatoryFees))
	seenCodes := make(map[string]struct{}, len(input.MandatoryFees))
	for index, fee := range input.MandatoryFees {
		code := strings.TrimSpace(fee.Code)
		label := strings.TrimSpace(fee.Label)
		if code == "" || label == "" {
			return PriceSnapshot{}, fmt.Errorf("%w: mandatory fee %d requires code and label", ErrInvalidPriceSnapshot, index)
		}
		if _, exists := seenCodes[code]; exists {
			return PriceSnapshot{}, fmt.Errorf("%w: duplicate mandatory fee code %q", ErrInvalidPriceSnapshot, code)
		}
		seenCodes[code] = struct{}{}
		if err := nonNegativeMoney("mandatory_fee", fee.Amount, input.Currency); err != nil {
			return PriceSnapshot{}, err
		}
		fees[index] = FeeComponent{Code: code, Label: label, Amount: fee.Amount}
	}

	total := input.MerchandisePrice
	var err error
	for _, amount := range []finance.Money{deliveryFee, input.Tax, input.PlatformFee} {
		total, err = total.Add(amount)
		if err != nil {
			return PriceSnapshot{}, fmt.Errorf("%w: total overflow: %v", ErrInvalidPriceSnapshot, err)
		}
	}
	for _, fee := range fees {
		total, err = total.Add(fee.Amount)
		if err != nil {
			return PriceSnapshot{}, fmt.Errorf("%w: total overflow: %v", ErrInvalidPriceSnapshot, err)
		}
	}

	return PriceSnapshot{
		SnapshotID:       strings.TrimSpace(input.SnapshotID),
		Currency:         input.Currency,
		MerchandisePrice: input.MerchandisePrice,
		RequiresDelivery: input.RequiresDelivery,
		DeliveryQuote:    quoteCopy,
		Tax:              input.Tax,
		PlatformFee:      input.PlatformFee,
		MandatoryFees:    fees,
		Total:            total,
	}, nil
}

func (s PriceSnapshot) Validate(now time.Time) error {
	rebuilt, err := BuildPriceSnapshot(PriceSnapshotInput{
		SnapshotID:       s.SnapshotID,
		Currency:         s.Currency,
		MerchandisePrice: s.MerchandisePrice,
		RequiresDelivery: s.RequiresDelivery,
		DeliveryQuote:    s.DeliveryQuote,
		Tax:              s.Tax,
		PlatformFee:      s.PlatformFee,
		MandatoryFees:    s.MandatoryFees,
	}, now)
	if err != nil {
		return err
	}
	if rebuilt.Total != s.Total {
		return fmt.Errorf("%w: total does not match disclosed components", ErrInvalidPriceSnapshot)
	}
	return nil
}

func (s PriceSnapshot) NonMerchandiseTotal() (finance.Money, error) {
	if err := s.Total.Validate(); err != nil {
		return finance.Money{}, err
	}
	return s.Total.Sub(s.MerchandisePrice)
}

type InstallmentSelection struct {
	ContractID       string
	CashPrice        finance.Money
	DownPayment      finance.Money
	InstallmentCount uint16
	FirstDueDate     installment.Date
}

type InstallmentCheckout struct {
	Snapshot       PriceSnapshot
	Plan           installment.Plan
	DueNow         finance.Money
	DeferredAmount finance.Money
}

func AttachInstallment(snapshot PriceSnapshot, selection InstallmentSelection, now time.Time) (InstallmentCheckout, error) {
	if err := snapshot.Validate(now); err != nil {
		return InstallmentCheckout{}, fmt.Errorf("%w: %v", ErrInvalidInstallmentMode, err)
	}

	plan, err := installment.BuildPlan(installment.PlanRequest{
		ContractID:       selection.ContractID,
		CashPrice:        selection.CashPrice,
		AgreedSalePrice:  snapshot.MerchandisePrice,
		DownPayment:      selection.DownPayment,
		InstallmentCount: selection.InstallmentCount,
		FirstDueDate:     selection.FirstDueDate,
	})
	if err != nil {
		return InstallmentCheckout{}, fmt.Errorf("%w: %v", ErrInvalidInstallmentMode, err)
	}

	upfrontCosts, err := snapshot.NonMerchandiseTotal()
	if err != nil {
		return InstallmentCheckout{}, fmt.Errorf("%w: calculate upfront costs: %v", ErrInvalidInstallmentMode, err)
	}
	dueNow, err := upfrontCosts.Add(plan.DownPayment)
	if err != nil {
		return InstallmentCheckout{}, fmt.Errorf("%w: calculate amount due now: %v", ErrInvalidInstallmentMode, err)
	}

	return InstallmentCheckout{
		Snapshot:       snapshot,
		Plan:           plan,
		DueNow:         dueNow,
		DeferredAmount: plan.DeferredAmount,
	}, nil
}

func nonNegativeMoney(field string, money finance.Money, currency finance.Currency) error {
	if err := money.Validate(); err != nil {
		return fmt.Errorf("%w: %s: %v", ErrInvalidPriceSnapshot, field, err)
	}
	if money.Currency != currency {
		return fmt.Errorf("%w: %s currency must be %s", ErrInvalidPriceSnapshot, field, currency)
	}
	return nil
}
