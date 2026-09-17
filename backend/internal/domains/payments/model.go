package payments

import (
	"errors"
	"fmt"
	"strings"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

var (
	ErrInvalidIntent       = errors.New("invalid payment intent")
	ErrInvalidTransition   = errors.New("invalid payment state transition")
	ErrProviderEvent       = errors.New("invalid provider event")
	ErrProviderEnvironment = errors.New("provider environment mismatch")
)

type Environment string

const (
	EnvironmentSandbox Environment = "sandbox"
	EnvironmentLive    Environment = "live"
)

func (e Environment) Validate() error {
	switch e {
	case EnvironmentSandbox, EnvironmentLive:
		return nil
	default:
		return fmt.Errorf("%w: unsupported environment %q", ErrInvalidIntent, e)
	}
}

type Purpose string

const (
	PurposeWalletTopup            Purpose = "wallet_topup"
	PurposeOrderPayment           Purpose = "order_payment"
	PurposeInstallmentPayment     Purpose = "installment_payment"
	PurposeInvestmentSubscription Purpose = "investment_subscription"
)

func (p Purpose) Validate() error {
	switch p {
	case PurposeWalletTopup, PurposeOrderPayment, PurposeInstallmentPayment, PurposeInvestmentSubscription:
		return nil
	default:
		return fmt.Errorf("%w: unsupported purpose %q", ErrInvalidIntent, p)
	}
}

type IntentState string

const (
	StateCreated    IntentState = "created"
	StatePending    IntentState = "pending"
	StateAuthorized IntentState = "authorized"
	StateCaptured   IntentState = "captured"
	StateFailed     IntentState = "failed"
	StateCancelled  IntentState = "cancelled"
	StateRefunded   IntentState = "refunded"
)

func (s IntentState) Validate() error {
	switch s {
	case StateCreated, StatePending, StateAuthorized, StateCaptured, StateFailed, StateCancelled, StateRefunded:
		return nil
	default:
		return fmt.Errorf("%w: unsupported state %q", ErrInvalidIntent, s)
	}
}

type Intent struct {
	ID                string
	Provider          string
	Environment       Environment
	Purpose           Purpose
	Amount            finance.Money
	State             IntentState
	ProviderReference string
}

func (i Intent) Validate() error {
	if strings.TrimSpace(i.ID) == "" {
		return fmt.Errorf("%w: id is required", ErrInvalidIntent)
	}
	if strings.TrimSpace(i.Provider) == "" {
		return fmt.Errorf("%w: provider is required", ErrInvalidIntent)
	}
	if err := i.Environment.Validate(); err != nil {
		return err
	}
	if err := i.Purpose.Validate(); err != nil {
		return err
	}
	if err := i.Amount.Validate(); err != nil {
		return fmt.Errorf("%w: amount: %v", ErrInvalidIntent, err)
	}
	if i.Amount.AmountMinor <= 0 {
		return fmt.Errorf("%w: amount must be positive", ErrInvalidIntent)
	}
	if err := i.State.Validate(); err != nil {
		return err
	}
	return nil
}
