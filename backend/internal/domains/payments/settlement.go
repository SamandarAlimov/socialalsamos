package payments

import (
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

var ErrInvalidSettlement = errors.New("invalid marketplace settlement")

type SettlementAllocation struct {
	Code      string
	AccountID string
	Amount    finance.Money
}

type SettlementRequest struct {
	SettlementID               string
	IdempotencyKey             string
	HeldFundsLiabilityAccountID string
	HeldAmount                 finance.Money
	Allocations                []SettlementAllocation
	OccurredAt                 time.Time
}

func BuildSettlementPosting(request SettlementRequest) (finance.PostingCommand, error) {
	settlementID := strings.TrimSpace(request.SettlementID)
	idempotencyKey := strings.TrimSpace(request.IdempotencyKey)
	heldAccountID := strings.TrimSpace(request.HeldFundsLiabilityAccountID)
	if settlementID == "" || idempotencyKey == "" || heldAccountID == "" {
		return finance.PostingCommand{}, fmt.Errorf("%w: settlement, idempotency and held account ids are required", ErrInvalidSettlement)
	}
	if err := request.HeldAmount.Validate(); err != nil || request.HeldAmount.AmountMinor <= 0 {
		return finance.PostingCommand{}, fmt.Errorf("%w: held amount must be positive", ErrInvalidSettlement)
	}
	if len(request.Allocations) == 0 {
		return finance.PostingCommand{}, fmt.Errorf("%w: at least one allocation is required", ErrInvalidSettlement)
	}

	allocations := append([]SettlementAllocation(nil), request.Allocations...)
	seenCodes := make(map[string]struct{}, len(allocations))
	seenAccounts := make(map[string]struct{}, len(allocations))
	for index := range allocations {
		allocations[index].Code = strings.TrimSpace(allocations[index].Code)
		allocations[index].AccountID = strings.TrimSpace(allocations[index].AccountID)
		if allocations[index].Code == "" || allocations[index].AccountID == "" {
			return finance.PostingCommand{}, fmt.Errorf("%w: allocation %d requires code and account id", ErrInvalidSettlement, index)
		}
		if allocations[index].AccountID == heldAccountID {
			return finance.PostingCommand{}, fmt.Errorf("%w: held account cannot also be a settlement destination", ErrInvalidSettlement)
		}
		if _, exists := seenCodes[allocations[index].Code]; exists {
			return finance.PostingCommand{}, fmt.Errorf("%w: duplicate allocation code %q", ErrInvalidSettlement, allocations[index].Code)
		}
		seenCodes[allocations[index].Code] = struct{}{}
		if _, exists := seenAccounts[allocations[index].AccountID]; exists {
			return finance.PostingCommand{}, fmt.Errorf("%w: duplicate destination account %q", ErrInvalidSettlement, allocations[index].AccountID)
		}
		seenAccounts[allocations[index].AccountID] = struct{}{}
		if err := allocations[index].Amount.Validate(); err != nil || allocations[index].Amount.AmountMinor <= 0 {
			return finance.PostingCommand{}, fmt.Errorf("%w: allocation %d amount must be positive", ErrInvalidSettlement, index)
		}
		if allocations[index].Amount.Currency != request.HeldAmount.Currency {
			return finance.PostingCommand{}, fmt.Errorf("%w: allocation %d currency mismatch", ErrInvalidSettlement, index)
		}
	}

	sort.Slice(allocations, func(i, j int) bool {
		if allocations[i].Code == allocations[j].Code {
			return allocations[i].AccountID < allocations[j].AccountID
		}
		return allocations[i].Code < allocations[j].Code
	})

	total := finance.Money{Currency: request.HeldAmount.Currency}
	var err error
	for _, allocation := range allocations {
		total, err = total.Add(allocation.Amount)
		if err != nil {
			return finance.PostingCommand{}, fmt.Errorf("%w: allocation total: %v", ErrInvalidSettlement, err)
		}
	}
	if total != request.HeldAmount {
		return finance.PostingCommand{}, fmt.Errorf("%w: allocations=%d held=%d", ErrInvalidSettlement, total.AmountMinor, request.HeldAmount.AmountMinor)
	}

	entries := make([]finance.Entry, 0, len(allocations)+1)
	entries = append(entries, finance.Entry{
		AccountID: heldAccountID,
		Side:      finance.Debit,
		Amount:    request.HeldAmount,
	})
	for _, allocation := range allocations {
		entries = append(entries, finance.Entry{
			AccountID: allocation.AccountID,
			Side:      finance.Credit,
			Amount:    allocation.Amount,
		})
	}

	journal := finance.Journal{
		ID:            settlementID,
		ReferenceType: "marketplace_settlement",
		ReferenceID:   settlementID,
		Entries:       entries,
	}
	if err := journal.Validate(); err != nil {
		return finance.PostingCommand{}, fmt.Errorf("%w: journal: %v", ErrInvalidSettlement, err)
	}

	type fingerprintAllocation struct {
		Code        string `json:"code"`
		AccountID   string `json:"account_id"`
		AmountMinor int64  `json:"amount_minor"`
	}
	type fingerprint struct {
		SettlementID string                  `json:"settlement_id"`
		HeldAccount  string                  `json:"held_account"`
		HeldMinor    int64                   `json:"held_minor"`
		Currency     string                  `json:"currency"`
		Allocations  []fingerprintAllocation `json:"allocations"`
	}
	fp := fingerprint{
		SettlementID: settlementID,
		HeldAccount:  heldAccountID,
		HeldMinor:    request.HeldAmount.AmountMinor,
		Currency:     string(request.HeldAmount.Currency),
		Allocations:  make([]fingerprintAllocation, len(allocations)),
	}
	for index, allocation := range allocations {
		fp.Allocations[index] = fingerprintAllocation{
			Code:        allocation.Code,
			AccountID:   allocation.AccountID,
			AmountMinor: allocation.Amount.AmountMinor,
		}
	}
	payload, err := json.Marshal(fp)
	if err != nil {
		return finance.PostingCommand{}, fmt.Errorf("%w: fingerprint: %v", ErrInvalidSettlement, err)
	}
	hash := sha256.Sum256(payload)

	return finance.PostingCommand{
		Scope:          "marketplace.settlement",
		IdempotencyKey: idempotencyKey,
		RequestHash:    hash[:],
		Journal:        journal,
		BalanceRequirements: []finance.BalanceRequirement{
			{
				AccountID:    heldAccountID,
				Currency:     request.HeldAmount.Currency,
				AtLeastMinor: request.HeldAmount.AmountMinor,
			},
		},
		OccurredAt: request.OccurredAt,
	}, nil
}
