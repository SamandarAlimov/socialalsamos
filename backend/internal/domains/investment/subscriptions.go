package investment

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

var ErrInvalidSubscription = errors.New("invalid investment subscription")

type SubscriptionRequest struct {
	SubscriptionID                    string
	IdempotencyKey                    string
	Offering                          ApprovedOffering
	InvestorWalletLiabilityAccountID  string
	InvestmentCustodyLiabilityAccountID string
	Amount                            finance.Money
	OccurredAt                        time.Time
}

func BuildSubscriptionPosting(request SubscriptionRequest) (finance.PostingCommand, error) {
	subscriptionID := strings.TrimSpace(request.SubscriptionID)
	idempotencyKey := strings.TrimSpace(request.IdempotencyKey)
	walletAccountID := strings.TrimSpace(request.InvestorWalletLiabilityAccountID)
	custodyAccountID := strings.TrimSpace(request.InvestmentCustodyLiabilityAccountID)
	if subscriptionID == "" || idempotencyKey == "" || walletAccountID == "" || custodyAccountID == "" {
		return finance.PostingCommand{}, fmt.Errorf("%w: subscription, idempotency and account ids are required", ErrInvalidSubscription)
	}
	if walletAccountID == custodyAccountID {
		return finance.PostingCommand{}, fmt.Errorf("%w: wallet and investment custody accounts must differ", ErrInvalidSubscription)
	}
	if request.Offering.id == "" || request.Offering.shariaApprovalID == "" {
		return finance.PostingCommand{}, fmt.Errorf("%w: offering must be created through an approved offering constructor", ErrInvalidSubscription)
	}
	if err := request.Amount.Validate(); err != nil || request.Amount.AmountMinor <= 0 {
		return finance.PostingCommand{}, fmt.Errorf("%w: amount must be positive", ErrInvalidSubscription)
	}
	if request.Amount.Currency != request.Offering.currency {
		return finance.PostingCommand{}, fmt.Errorf("%w: subscription currency must match offering currency", ErrInvalidSubscription)
	}

	type fingerprint struct {
		SubscriptionID string `json:"subscription_id"`
		OfferingID     string `json:"offering_id"`
		ApprovalID     string `json:"approval_id"`
		Structure      string `json:"structure"`
		WalletAccount  string `json:"wallet_account"`
		CustodyAccount string `json:"custody_account"`
		AmountMinor    int64  `json:"amount_minor"`
		Currency       string `json:"currency"`
	}
	payload, err := json.Marshal(fingerprint{
		SubscriptionID: subscriptionID,
		OfferingID:     request.Offering.id,
		ApprovalID:     request.Offering.shariaApprovalID,
		Structure:      string(request.Offering.structure),
		WalletAccount:  walletAccountID,
		CustodyAccount: custodyAccountID,
		AmountMinor:    request.Amount.AmountMinor,
		Currency:       string(request.Amount.Currency),
	})
	if err != nil {
		return finance.PostingCommand{}, fmt.Errorf("%w: fingerprint: %v", ErrInvalidSubscription, err)
	}
	hash := sha256.Sum256(payload)

	journal := finance.Journal{
		ID:            subscriptionID,
		ReferenceType: "investment_subscription",
		ReferenceID:   subscriptionID,
		Entries: []finance.Entry{
			{
				AccountID: walletAccountID,
				Side:      finance.Debit,
				Amount:    request.Amount,
			},
			{
				AccountID: custodyAccountID,
				Side:      finance.Credit,
				Amount:    request.Amount,
			},
		},
	}
	if err := journal.Validate(); err != nil {
		return finance.PostingCommand{}, fmt.Errorf("%w: journal: %v", ErrInvalidSubscription, err)
	}

	return finance.PostingCommand{
		Scope:          "investment.subscribe",
		IdempotencyKey: idempotencyKey,
		RequestHash:    hash[:],
		Journal:        journal,
		BalanceRequirements: []finance.BalanceRequirement{
			{
				AccountID:    walletAccountID,
				Currency:     request.Amount.Currency,
				AtLeastMinor: request.Amount.AmountMinor,
			},
		},
		OccurredAt: request.OccurredAt,
	}, nil
}
