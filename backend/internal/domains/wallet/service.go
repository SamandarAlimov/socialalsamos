package wallet

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"

	"github.com/SamandarAlimov/socialalsamos/backend/internal/domains/finance"
)

var ErrPostingServiceRequired = errors.New("wallet posting service is required")

type PostingService interface {
	Post(context.Context, finance.PostingCommand) (finance.PostingResult, error)
}

type Service struct {
	Poster PostingService
}

func (s Service) Transfer(ctx context.Context, command TransferCommand) (TransferResult, error) {
	if s.Poster == nil {
		return TransferResult{}, ErrPostingServiceRequired
	}
	if err := command.Validate(); err != nil {
		return TransferResult{}, err
	}

	requestHash, err := transferRequestHash(command)
	if err != nil {
		return TransferResult{}, fmt.Errorf("hash wallet transfer request: %w", err)
	}

	journal := finance.Journal{
		ID:            command.TransferID,
		ReferenceType: "wallet_transfer",
		ReferenceID:   command.TransferID,
		Entries: []finance.Entry{
			{
				AccountID: command.From.LedgerAccountID,
				Side:      finance.Debit,
				Amount:    command.Amount,
			},
			{
				AccountID: command.To.LedgerAccountID,
				Side:      finance.Credit,
				Amount:    command.Amount,
			},
		},
	}

	posted, err := s.Poster.Post(ctx, finance.PostingCommand{
		Scope:          "wallet.transfer",
		IdempotencyKey: command.IdempotencyKey,
		RequestHash:    requestHash,
		Journal:        journal,
		BalanceRequirements: []finance.BalanceRequirement{
			{
				AccountID:    command.From.LedgerAccountID,
				Currency:     command.Amount.Currency,
				AtLeastMinor: command.Amount.AmountMinor,
			},
		},
		OccurredAt: command.OccurredAt,
	})
	if err != nil {
		return TransferResult{}, err
	}
	return TransferResult{JournalID: posted.JournalID, Duplicate: posted.Duplicate}, nil
}

type transferFingerprint struct {
	TransferID    string `json:"transfer_id"`
	FromAccountID string `json:"from_account_id"`
	ToAccountID   string `json:"to_account_id"`
	AmountMinor   int64  `json:"amount_minor"`
	Currency      string `json:"currency"`
}

func transferRequestHash(command TransferCommand) ([]byte, error) {
	payload, err := json.Marshal(transferFingerprint{
		TransferID:    command.TransferID,
		FromAccountID: command.From.LedgerAccountID,
		ToAccountID:   command.To.LedgerAccountID,
		AmountMinor:   command.Amount.AmountMinor,
		Currency:      string(command.Amount.Currency),
	})
	if err != nil {
		return nil, err
	}
	hash := sha256.Sum256(payload)
	return hash[:], nil
}
