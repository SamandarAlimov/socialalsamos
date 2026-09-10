# Alsamos backend

Status: **implementation started on the isolated target backend**.

The existing production application still uses its current Supabase paths. Nothing in this directory is connected to production until migration, parity, security and reconciliation gates are completed.

## Implemented foundation

- Go API process with graceful shutdown.
- Strict environment/address validation.
- `/healthz` and fail-closed `/readyz` HTTP endpoints.
- Request IDs, security headers, panic recovery and request body limits.
- Integer-minor-unit money type; financial code does not use floating point for money.
- Double-entry journal validation and reversal construction.
- Initial Sharia contract guards for deferred sale, Mudarabah, Musharakah and Wakalah investment structures.
- Unit tests for the implemented packages.
- Finance database design SQL kept outside executable migrations until the deployed Supabase schema and both migration streams are reconciled.

## Build boundary

The historical scaffold intentionally contains many empty `.go` placeholders for future domains. An empty Go source file is not compilable, so `go test ./...` is not yet the acceptance command for the whole scaffold. `make ci` deliberately tests and builds only packages that have crossed from placeholder to implementation.

As each domain is implemented, it is added to `IMPLEMENTED_PACKAGES`; once all Go placeholders are converted or removed, CI will switch to `go test ./...` and `go vet ./...`.

## Commands

```bash
cd backend
make test
make vet
make build
```

See [STRUCTURE.md](STRUCTURE.md) for the reserved backend tree and [../backend.md](../backend.md) for the migration/parity blueprint.
