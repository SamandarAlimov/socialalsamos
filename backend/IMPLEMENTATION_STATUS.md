# Implementation status

- Structure: scaffold remains the reserved target layout.
- Toolchain: Go selected; `go.mod` targets Go 1.27 with toolchain 1.27.1.
- API foundation: implemented for isolated health/readiness and graceful lifecycle only.
- Finance core: money and double-entry journal invariants implemented and unit-tested.
- Sharia guards: initial deferred-sale, Mudarabah, Musharakah and Wakalah investment validators implemented; product structures still require qualified Sharia/legal approval before production use.
- Database/schema import: not performed.
- Target migrations: not created because the deployed schema and both migration streams have not yet been reconciled.
- Finance SQL: design-only rollback script added for review; it is not a production migration.
- Existing Supabase/frontend integration: unchanged and still authoritative.
- Production connections/deployments: not performed.

Verification for this implementation slice: the implemented Go packages were formatted, unit-tested and built locally with syntax compatible with the available local Go toolchain. GitHub CI pins the selected Go toolchain for branch/PR verification.

File existence is not feature completeness. Do not mark payment, wallet, installment or investment production-ready until database, provider, authorization, idempotency, reconciliation and migration acceptance tests pass.
