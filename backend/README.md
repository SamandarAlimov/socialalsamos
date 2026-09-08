# Backend scaffold

Status: structure only; implementation has not started.

This directory implements the file layout planned in [backend.md](../backend.md) for `SamandarAlimov/socialalsamos`. Empty source, configuration, SQL, fixture and test files are intentional placeholders. They are not working endpoints, valid deployment configurations or passing tests. In particular, `go.mod` and `go.sum` are reserved files; no Go version or dependencies have been selected yet.

See [STRUCTURE.md](STRUCTURE.md) for the complete file tree and [scaffold-manifest.json](scaffold-manifest.json) for the exact inventory. The manifest is the completeness boundary for this scaffolding step; implementation may require additional files later.

No production connections, migrations, deployments, package installation or frontend edits are part of this scaffold. Existing Supabase paths remain authoritative.

## Implementation order

1. Inventory and baseline contracts.
2. Platform foundation and authentication.
3. Social/account and messaging parity.
4. Calls, live and media.
5. Commercial and ecosystem domains.
6. Integration, security, load and migration verification.
7. Controlled client integration and separately reviewed cutover.

Each domain owns its handlers, service, repository, models, validation, authorization and events. Domain-specific files reserve the named feature boundaries. Domain tests live under that domain; cross-domain scenarios live in `tests/`. SQL statements belong in `db/queries/<domain>/`. Do not implement arbitrary cross-domain table writes in handlers.
