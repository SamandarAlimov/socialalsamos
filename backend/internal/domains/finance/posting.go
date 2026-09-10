package finance

import (
	"bytes"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrInvalidPostingCommand   = errors.New("invalid posting command")
	ErrIdempotencyConflict     = errors.New("idempotency key was already used for a different request")
	ErrIdempotencyInProgress   = errors.New("idempotent request is already in progress")
	ErrIdempotencyFailed       = errors.New("previous idempotent request failed")
	ErrPostingRepositoryAbsent = errors.New("posting repository is required")
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

type PostingCommand struct {
	Scope          string
	IdempotencyKey string
	RequestHash    []byte
	Journal        Journal
	OccurredAt     time.Time
}

type PostingResult struct {
	JournalID string
	Duplicate bool
}

type PostingTx interface {
	ClaimIdempotency(context.Context, IdempotencyRecord, time.Time) (record IdempotencyRecord, created bool, err error)
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
	if err := validatePostingCommand(command); err != nil {
		return PostingResult{}, err
	}

	now := time.Now
	if p.Now != nil {
		now = p.Now
	}
	occurredAt := command.OccurredAt
	if occurredAt.IsZero() {
		occurredAt = now().UTC()
	} else {
		occurredAt = occurredAt.UTC()
	}

	ttl := p.IdempotencyTTL
	if ttl <= 0 {
		ttl = 30 * 24 * time.Hour
	}
	expiresAt := now().UTC().Add(ttl)

	scope := strings.TrimSpace(command.Scope)
	key := strings.TrimSpace(command.IdempotencyKey)
	requested := IdempotencyRecord{
		Scope:       scope,
		Key:         key,
		RequestHash: append([]byte(nil), command.RequestHash...),
		State:       IdempotencyStarted,
	}

	result := PostingResult{}
	err := p.Repository.WithinTransaction(ctx, func(tx PostingTx) error {
		record, created, err := tx.ClaimIdempotency(ctx, requested, expiresAt)
		if err != nil {
			return fmt.Errorf("claim idempotency: %w", err)
		}
		if !created {
			if !bytes.Equal(record.RequestHash, requested.RequestHash) {
				return ErrIdempotencyConflict
			}
			switch record.State {
			case IdempotencyCompleted:
				if strings.TrimSpace(record.JournalID) == "" {
					return fmt.Errorf("%w: completed record has no journal id", ErrInvalidPostingCommand)
				}
				result = PostingResult{JournalID: record.JournalID, Duplicate: true}
				return nil
			case IdempotencyStarted:
				return ErrIdempotencyInProgress
			case IdempotencyFailed:
				return ErrIdempotencyFailed
			default:
				return fmt.Errorf("%w: unknown idempotency state %q", ErrInvalidPostingCommand, record.State)
			}
		}

		if err := tx.InsertJournal(ctx, command.Journal, scope, key, occurredAt); err != nil {
			return fmt.Errorf("insert journal: %w", err)
		}
		if err := tx.CompleteIdempotency(ctx, scope, key, command.Journal.ID); err != nil {
			return fmt.Errorf("complete idempotency: %w", err)
		}
		result = PostingResult{JournalID: command.Journal.ID}
		return nil
	})
	if err != nil {
		return PostingResult{}, err
	}
	return result, nil
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
	return nil
}
