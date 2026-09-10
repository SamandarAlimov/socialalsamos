package payments

import (
	"fmt"
	"strings"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

type NewIntentInput struct {
	ID          string
	Provider    string
	Environment Environment
	Purpose     Purpose
	Amount      finance.Money
}

func NewIntent(input NewIntentInput) (Intent, error) {
	intent := Intent{
		ID:          strings.TrimSpace(input.ID),
		Provider:    strings.TrimSpace(input.Provider),
		Environment: input.Environment,
		Purpose:     input.Purpose,
		Amount:      input.Amount,
		State:       StateCreated,
	}
	if err := intent.Validate(); err != nil {
		return Intent{}, err
	}
	return intent, nil
}

func BindProviderReference(intent Intent, reference string) (Intent, error) {
	if err := intent.Validate(); err != nil {
		return Intent{}, err
	}
	reference = strings.TrimSpace(reference)
	if reference == "" {
		return Intent{}, fmt.Errorf("%w: provider reference is required", ErrInvalidIntent)
	}
	if intent.ProviderReference != "" && intent.ProviderReference != reference {
		return Intent{}, fmt.Errorf("%w: provider reference already bound", ErrInvalidIntent)
	}
	intent.ProviderReference = reference
	return intent, nil
}

func Transition(intent Intent, next IntentState) (Intent, error) {
	if err := intent.Validate(); err != nil {
		return Intent{}, err
	}
	if err := next.Validate(); err != nil {
		return Intent{}, err
	}
	if intent.State == next {
		return intent, nil
	}
	if !canTransition(intent.State, next) {
		return Intent{}, fmt.Errorf("%w: %s -> %s", ErrInvalidTransition, intent.State, next)
	}
	intent.State = next
	return intent, nil
}

func canTransition(current, next IntentState) bool {
	switch current {
	case StateCreated:
		return next == StatePending || next == StateCancelled
	case StatePending:
		return next == StateAuthorized || next == StateCaptured || next == StateFailed || next == StateCancelled
	case StateAuthorized:
		return next == StateCaptured || next == StateFailed || next == StateCancelled
	case StateCaptured:
		return next == StateRefunded
	case StateFailed, StateCancelled, StateRefunded:
		return false
	default:
		return false
	}
}
