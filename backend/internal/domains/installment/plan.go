package installment

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/sharia"
)

var ErrInvalidPlan = errors.New("invalid installment plan")

type Date struct {
	Year  int
	Month time.Month
	Day   int
}

func (d Date) Validate() error {
	if d.Year < 1 || d.Year > 9999 || d.Month < time.January || d.Month > time.December || d.Day < 1 {
		return fmt.Errorf("%w: invalid due date", ErrInvalidPlan)
	}
	if d.Day > daysInMonth(d.Year, d.Month) {
		return fmt.Errorf("%w: invalid due date", ErrInvalidPlan)
	}
	return nil
}

func (d Date) AddMonths(months int) Date {
	total := d.Year*12 + int(d.Month) - 1 + months
	year := total / 12
	month := time.Month(total%12 + 1)
	day := d.Day
	if maximum := daysInMonth(year, month); day > maximum {
		day = maximum
	}
	return Date{Year: year, Month: month, Day: day}
}

func (d Date) String() string {
	return fmt.Sprintf("%04d-%02d-%02d", d.Year, int(d.Month), d.Day)
}

func daysInMonth(year int, month time.Month) int {
	return time.Date(year, month+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

type PlanRequest struct {
	ContractID       string
	CashPrice        finance.Money
	AgreedSalePrice  finance.Money
	DownPayment      finance.Money
	InstallmentCount uint16
	FirstDueDate     Date
}

type ScheduleItem struct {
	Number  uint16
	DueDate Date
	Amount  finance.Money
}

type Plan struct {
	ContractID      string
	CashPrice       finance.Money
	AgreedSalePrice finance.Money
	DownPayment     finance.Money
	DeferredAmount  finance.Money
	Schedule        []ScheduleItem
}

func BuildPlan(request PlanRequest) (Plan, error) {
	if strings.TrimSpace(request.ContractID) == "" {
		return Plan{}, fmt.Errorf("%w: contract id is required", ErrInvalidPlan)
	}
	if err := request.FirstDueDate.Validate(); err != nil {
		return Plan{}, err
	}

	terms := sharia.DeferredSaleTerms{
		CashPrice:               request.CashPrice,
		AgreedSalePrice:         request.AgreedSalePrice,
		DownPayment:             request.DownPayment,
		InstallmentCount:        request.InstallmentCount,
		TimeBasedInterestBPS:    0,
		LatePaymentIncrementBPS: 0,
	}
	if err := terms.Validate(); err != nil {
		return Plan{}, fmt.Errorf("%w: %w", ErrInvalidPlan, err)
	}

	deferred, err := request.AgreedSalePrice.Sub(request.DownPayment)
	if err != nil {
		return Plan{}, fmt.Errorf("%w: deferred amount: %v", ErrInvalidPlan, err)
	}
	if deferred.AmountMinor < int64(request.InstallmentCount) {
		return Plan{}, fmt.Errorf("%w: installment count exceeds payable minor units", ErrInvalidPlan)
	}

	base := deferred.AmountMinor / int64(request.InstallmentCount)
	remainder := deferred.AmountMinor % int64(request.InstallmentCount)
	schedule := make([]ScheduleItem, request.InstallmentCount)
	for index := range schedule {
		amountMinor := base
		if int64(index) < remainder {
			amountMinor++
		}
		schedule[index] = ScheduleItem{
			Number:  uint16(index + 1),
			DueDate: request.FirstDueDate.AddMonths(index),
			Amount: finance.Money{
				AmountMinor: amountMinor,
				Currency:    deferred.Currency,
			},
		}
	}

	return Plan{
		ContractID:      request.ContractID,
		CashPrice:       request.CashPrice,
		AgreedSalePrice: request.AgreedSalePrice,
		DownPayment:     request.DownPayment,
		DeferredAmount:  deferred,
		Schedule:        schedule,
	}, nil
}
