GO ?= go
IMPLEMENTED_PACKAGES := ./cmd/api ./internal/platform/config ./internal/platform/http ./internal/domains/finance ./internal/domains/sharia

.PHONY: fmt test vet build ci

fmt:
	gofmt -w ./cmd/api ./internal/platform/config ./internal/platform/http ./internal/domains/finance ./internal/domains/sharia

test:
	$(GO) test $(IMPLEMENTED_PACKAGES)

vet:
	$(GO) vet $(IMPLEMENTED_PACKAGES)

build:
	mkdir -p bin
	$(GO) build -trimpath -o bin/alsamos-api ./cmd/api

ci: test vet build
