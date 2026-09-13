package finance

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

var (
	ErrInvalidPostingCommand    = errors.New("invalid posting command")
	ErrIdempotencyConflict      = errors.New("idempotency key was already used for a different request")
	ErrIdempotencyInProgress    = errors.New("idempotent request is already in progress")
	ErrIdempotencyFailed        = errors.New("previous idempotent request failed")
	ErrPostingRepositoryAbsent  = errors.New("posting repository is required")
	ErrPostingTransactionAbsent = errors.New("posting transaction is required")
	ErrInsufficientFunds        = errors.New("insufficient funds")
)

type IdempotencyState string

const (
	IdempotencyStarted   IdempotencyState = "started"
	IdempotencyCompleted IdempotencyState = "completed"
	IdempotencyFailed    IdempotencyState = "failed"
)

type IdempotencyRecord struct {
	Scope       string
	Key         string
	RequestHash []byte
	State       IdempotencyState
	JournalID   string
}

type BalanceRequirement struct {
	AccountID    string
	Currency     Currency
	AtLeastMinor int64
}

type PostingCommand struct {
	Scope               string
	IdempotencyKey      string
	RequestHash         []byte
	Journal             Journal
	BalanceRequirements []BalanceRequirement
	OccurredAt          time.Time
}

type PostingResult struct {
	JournalID string
	Duplicate bool
}

type PostingTx interface {
	ClaimIdempotency(context.Context, IdempotencyRecord, time.Time) (record IdempotencyRecord, created bool, err error)
	LockAccounts(context.Context, []string) error
	Balance(context.Context, string, Currency) (int64, error)
	InsertJournal(context.Context, Journal, string, string, time.Time) error
	CompleteIdempotency(context.Context, string, string, string) error
}

type PostingRepository interface {
	WithinTransaction(context.Context, func(PostingTx) error) error
}

type Poster struct {
	Repository     PostingRepository
	IdempotencyTTL time.Duration
	Now            func() time.Time
}

func (p Poster) Post(ctx context.Context, command PostingCommand) (PostingResult, error) {
	if p.Repository == nil {
		return PostingResult{}, ErrPostingRepositoryAbsent
	}

	var result PostingResult
	err := p.Repository.WithinTransaction(ctx, func(tx PostingTx) error {
		var err error
		result, err = p.PostWithin(ctx, tx, command)
		return err
	})
	if err != nil {
		return PostingResult{}, err
	}
	return result, nil
}

// PostWithin applies the same validation, idempotency, locking and balance rules as Post,
// but uses a transaction owned by a higher-level domain. It exists so payment state,
// provider events, ledger entries and outbox records can commit or roll back together.
func (p Poster) PostWithin(ctx context.Context, tx PostingTx, command PostingCommand) (PostingResult, error) {
	if tx == nil {
		return PostingResult{}, ErrPostingTransactionAbsent
	}
	if err := validatePostingCommand(command); err != nil {
		return PostingResult{}, err
	}

	now := time.Now
	if p.Now != nil {
		now = p.Now
	}
	currentTime := now().UTC()
	occurredAt := command.OccurredAt
	if occurredAt.IsZero() {
		occurredAt = currentTime
	} else {
		occurredAt = occurredAt.UTC()
	}

	ttl := p.IdempotencyTTL
	if ttl <= 0 {
		ttl = 30 * 24 * time.Hour
	}
	expiresAt := currentTime.Add(ttl)

	scope := strings.TrimSpace(command.Scope)
	key := strings.TrimSpace(command.IdempotencyKey)
	requested := IdempotencyRecord{
		Scope:       scope,
		Key:         key,
		RequestHash: append([]byte(nil), command.RequestHash...),
		State:       IdempotencyStarted,
	}

	record, created, err := tx.ClaimIdempotency(ctx, requested, expiresAt)
	if err != nil {
		return PostingResult{}, fmt.Errorf("claim idempotency: %w", err)
	}
	if !created {
		if !bytes.Equal(record.RequestHash, requested.RequestHash) {
			return PostingResult{}, ErrIdempotencyConflict
		}
		switch record.State {
		case IdempotencyCompleted:
			if strings.TrimSpace(record.JournalID) == "" {
				return PostingResult{}, fmt.Errorf("%w: completed record has no journal id", ErrInvalidPostingCommand)
			}
			return PostingResult{JournalID: record.JournalID, Duplicate: true}, nil
		case IdempotencyStarted:
			return PostingResult{}, ErrIdempotencyInProgress
		case IdempotencyFailed:
			return PostingResult{}, ErrIdempotencyFailed
		default:
			return PostingResult{}, fmt.Errorf("%w: unknown idempotency state %q", ErrInvalidPostingCommand, record.State)
		}
	}

	accountIDs := postingAccountIDs(command)
	if err := tx.LockAccounts(ctx, accountIDs); err != nil {
		return PostingResult{}, fmt.Errorf("lock ledger accounts: %w", err)
	}
	for _, requirement := range command.BalanceRequirements {
		balance, err := tx.Balance(ctx, requirement.AccountID, requirement.Currency)
		if err != nil {
			return PostingResult{}, fmt.Errorf("read balance for %s: %w", requirement.AccountID, err)
		}
		if balance < requirement.AtLeastMinor {
			return PostingResult{}, fmt.Errorf("%w: account=%s available=%d required=%d", ErrInsufficientFunds, requirement.AccountID, balance, requirement.AtLeastMinor)
		}
	}

	if err := tx.InsertJournal(ctx, command.Journal, scope, key, occurredAt); err != nil {
		return PostingResult{}, fmt.Errorf("insert journal: %w", err)
	}
	if err := tx.CompleteIdempotency(ctx, scope, key, command.Journal.ID); err != nil {
		return PostingResult{}, fmt.Errorf("complete idempotency: %w", err)
	}
	return PostingResult{JournalID: command.Journal.ID}, nil
}

func validatePostingCommand(command PostingCommand) error {
	if strings.TrimSpace(command.Scope) == "" {
		return fmt.Errorf("%w: scope is required", ErrInvalidPostingCommand)
	}
	if strings.TrimSpace(command.IdempotencyKey) == "" {
		return fmt.Errorf("%w: idempotency key is required", ErrInvalidPostingCommand)
	}
	if len(command.RequestHash) != sha256.Size {
		return fmt.Errorf("%w: request hash must be SHA-256", ErrInvalidPostingCommand)
	}
	if err := command.Journal.Validate(); err != nil {
		return fmt.Errorf("%w: %v", ErrInvalidPostingCommand, err)
	}
	for i, requirement := range command.BalanceRequirements {
		if strings.TrimSpace(requirement.AccountID) == "" {
			return fmt.Errorf("%w: balance requirement %d account id is required", ErrInvalidPostingCommand, i)
		}
		if err := requirement.Currency.Validate(); err != nil {
			return fmt.Errorf("%w: balance requirement %d: %v", ErrInvalidPostingCommand, i, err)
		}
		if requirement.AtLeastMinor < 0 {
			return fmt.Errorf("%w: balance requirement %d minimum cannot be negative", ErrInvalidPostingCommand, i)
		}
	}
	return nil
}

func postingAccountIDs(command PostingCommand) []string {
	unique := make(map[string]struct{}, len(command.Journal.Entries)+len(command.BalanceRequirements))
	for _, entry := range command.Journal.Entries {
		unique[entry.AccountID] = struct{}{}
	}
	for _, requirement := range command.BalanceRequirements {
		unique[requirement.AccountID] = struct{}{}
	}
	ids := make([]string, 0, len(unique))
	for id := range unique {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
