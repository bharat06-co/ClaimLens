# CLAIMLENS — DBMS refactor (separate review copy)

**Source baseline:** `bharat06-co/ClaimLens`, audited `main` at `d01824ffa6dc946a65d232934e35e44ff6d9b82e` (24 October 2026). The six existing migrations, the audited 78-check production HTTP evidence and passing GitHub CI remain the comparison baseline. **Follow-up local validation is complete:** migration 007, smoke/integrity/API/semantic/concurrency checks, typecheck, optimized build and dependency audit passed in a separate Windows checkout and disposable PostgreSQL/pgvector database. See [the current strict results](DBMS_STRICT_COMPATIBILITY_RESULTS.md), [change log](../CHANGELOG_REFACTOR_REVIEW.md) and [requirements mapping](DBMS_REFACTOR_REQUIREMENTS.md). This does not authorize a merge or applying 007 to the owner's existing database.

## Scope and actual reduction

Adds `007_consolidate_integrity_guards.sql` to *your separate checkout*, leaving migrations 001–006 unchanged. There is no schema/table/column/index/view/data change. The migration changes how redundant database checks are organized. It targets the **active schema**:

| Metric | Before | Proposed after | Reduction |
|---|---:|---:|---:|
| Application tables | 16 | 16 | 0 |
| User-defined triggers | 21 | 18 | **3 (14.29%)** |
| Distinct trigger functions | 20 | 16 | **4 (20%)** |
| Stored warranty-registration function | 1 | 1 | 0 |
| Vector index, dimension and retrieval strategy | HNSW, 384 | unchanged | 0 |
| Historical migration files retained | 6 | 6 + 1 incremental | +1 |

**This is runtime structural simplification, not fewer total lines in Git history**: the new migration adds 121 lines because migrations must document changes. Preserving migration history is safer than editing old schema files.

## Five changes

1. **Assignment:** `enforce_assignment_integrity()` also checks that the assigned user is an active officer; retire `validate_officer_assignment()` and its trigger. Original messages and one-assignment rule retained.
2. **Decision compatibility retained:** keep the original `validate_deciding_officer()` BEFORE INSERT function/trigger and `apply_claim_decision()` AFTER INSERT function/trigger unchanged. This preserves the original officer error before CHECK constraints and even on conflicting `ON CONFLICT DO NOTHING` inserts. The earlier proposal to fold validation into AFTER INSERT was rejected; both old differences are reproduced and resolved in the strict review.
3. **Warranty:** `validate_warranty()` also prevents updates to historical warranty facts once claims exist; retire the standalone `preserve_claim_warranty()` trigger. Inclusive dates and policy/manufacturer validity stay in one function.
4. **Repairs:** `enforce_repair_integrity()` checks legal status transitions, timestamp changes and immutable repair identity as well as eligibility; retire `check_repair_transition()` trigger. Audit remains its own `AFTER UPDATE` trigger.
5. **Append-only history:** Decisions and audit events share `prevent_history_rewrite()` while keeping their distinct historical error messages. The two append-only triggers remain in place.

**Deliberately NOT refactored:** claim ownership, customer registration, document/chunk source protection, policy revisions, claim status state machine, vector scope validation, JSON/semantic handling, stored warranty registration, and request-level authorization. These protect separate invariants; folding them together would obscure viva explanations or introduce subtler behavior changes.

## Level 3 guideline compliance

- SQL + vector: PostgreSQL + pgvector unchanged; 384-dim vectors, HNSW and semantic retrieval unchanged.
- 16-table ER and relational schema unchanged: PK/FK/UNIQUE/CHECK relationships and normalization unchanged.
- Required DDL/DML and JOIN/GROUP BY/HAVING/subquery examples unchanged.
- At least four advanced SQL concepts remain: **transactions, triggers, stored functions, views, indexing**. Vector similarity search remains.
- Next.js app, two roles, backend APIs, authentication, input validation and data-integrity constraints unchanged.
- Documentation and public GitHub requirements remain; authentic two-member contributions, originality and viva explanations still require actual human evidence. This patch does not satisfy them automatically.

## How to verify safely on Windows (never touch the existing DB)

**Use a separate local checkout/copy of audited `main`.** Unzip this overlay there, not into the only working checkout. The patch's static test refuses altered pre-audit SQL migration files. Do **not** reseed, reset, or apply this migration to the user's existing Docker volume for trial runs.

In PowerShell from the **separate copy**:

```powershell
# Generate fresh disposable settings for each run. Do not save or commit them.
$reviewDbPassword = [guid]::NewGuid().ToString('N')
$env:SESSION_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$env:SEED_DEMO_PASSWORD = 'ReviewA7' + [guid]::NewGuid().ToString('N')
$env:DATABASE_URL = "postgresql://claimlens:${reviewDbPassword}@127.0.0.1:55433/claimlens"

# Start a separate, throwaway database at port 55433 using temporary storage.
docker run --name claimlens-refactor-test -d -p 127.0.0.1:55433:5432 `
  --mount type=tmpfs,destination=/var/lib/postgresql/data,tmpfs-size=536870912 `
  -e POSTGRES_USER=claimlens -e "POSTGRES_PASSWORD=$reviewDbPassword" `
  -e POSTGRES_DB=claimlens pgvector/pgvector:pg17

npm ci
npm test
npm run doctor
npm run db:migrate
npm run db:seed
npx tsx scripts/verify-dbms-refactor.ts
npm run db:smoke
npm run audit:db
npm run audit:migrations
npm run typecheck
npm run build
npm audit
```

`docker run` may initially take a short time to report PostgreSQL ready. If `npm run doctor` reports the port unavailable, check `docker logs claimlens-refactor-test` and retry after it becomes healthy. The environment variables above are freshly generated for the disposable database only; if your copied folder has `.env`, the exported variables should override it. Pass the same in-memory values to the app/test terminals; do not publish or save generated credentials in the repository.

For **live HTTP regression**, start the app from this isolated copy in a new terminal with the **same three environment variables**:

```powershell
npm run start -- --hostname 127.0.0.1 --port 3004
```

In another terminal, export the same values and run:

```powershell
$env:AUDIT_BASE_URL='http://127.0.0.1:3004'
$env:AUDIT_MODE='production'
npm run audit:api
```

Then stop the test server and remove **only** this named throwaway container:

```powershell
docker rm -f claimlens-refactor-test
```

**Acceptance rule:** keep the refactor only if the new structural test, all existing unit tests, DB smoke and integrity tests, clean-schema migrations, API suite, build and npm audit pass. The original local audit passed 78 production HTTP checks, but that number cannot be transferred automatically to a modified schema. Check evidence differences and manually demonstrate customer → officer → semantic search → decision → repair in the browser.

## Original artifact verification, superseded by the local follow-up

- The baseline was fetched from GitHub; migration hashes 001–004 matched the mounted original version; 005/006 match the hashes published in the original share manifest.
- The new SQL was inspected for preserving decision repair/audit sequence, original guard error strings and repair transitions.
- Static JavaScript tests and package checks were run in the assistant sandbox, **not** PostgreSQL integration, semantic retrieval or UI tests.
- Container has no PostgreSQL/pgvector server and cannot reach your Windows Docker instance. Thus full compatibility is *proposed, not yet demonstrated*.

**Viva consequence:** fewer distinct trigger routines to learn (20% reduction). The DBMS subject matter remains medium-to-hard: it still covers database transactions, state transitions, triggers, indexes, constraints and pgvector. This is not a verified 20% reduction in the difficulty of your viva.

The original statements above describe the overlay author's environment, not the completed local validation. The original input files are preserved in the separate local review lab. The final evidence demonstrates runtime reduction while retaining application behavior for the executed tests. The strict follow-up preserves original decision INSERT definitions and resolves both direct-SQL differences from the rejected candidate. See the current results and `strict/direct-sql-comparison.json` evidence.
