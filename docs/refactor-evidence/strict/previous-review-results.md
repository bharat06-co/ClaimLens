# CLAIMLENS database refactor validation — 24 October 2026

## Verdict

**Suitable for adoption in the current audited application, with the direct-SQL compatibility caveat below.** All requested local regression gates passed in an isolated environment. No application or stored-data regression was reproduced. This is a review candidate, not a migration applied to the user's database, a main-branch update, or a guarantee of zero defects under all conditions.

The active-schema simplification is verified: **21 → 17 user triggers** (4 fewer, 19.05%) and **20 → 15 trigger functions** (5 fewer, 25%). It does not reduce the number of tables or historical migration files, and no performance improvement was established.

## Provenance and isolation

- GitHub main was checked at `d01824ffa6dc946a65d232934e35e44ff6d9b82e`. Its [baseline Actions run](https://github.com/bharat06-co/ClaimLens/actions/runs/40070829183) succeeded. That CI run is baseline evidence, not CI execution of this review branch.
- Actual supplied file: `ClaimLens_Refactor_Patch.zip`, SHA256 `8f7169f0f6ccd7bbcc6a97e92efb8c01f57e01bbeb51ecfc9a21e1fd379d2301`. Its README and review document identify the same baseline, despite the different ZIP name in the request.
- Separate local checkout: `CLAIMLENS_REFACTOR_REVIEW`; branch `codex/dbms-refactor-review`. No main checkout files were edited.
- Disposable container `claimlens-refactor-review-20261024`, localhost **55433**, tmpfs at `/var/lib/postgresql/data`. It never mounted `claimlens_claimlens_pgdata`, which belongs to the existing database at port 5432. All seeds, extra officers, test mutations and migration-fault databases were confined to the disposable container.
- PostgreSQL **17.11**, pgvector **0.8.7**, pgcrypto **1.3**; Node **24.22.0**, Next.js **15.5.28** on local Windows. Locked dependencies installed with `npm ci`. The public embedding model cache was copied; private `.env` and existing database contents were not copied or read for tests.
- The review uses dummy database/session/demo credentials. No database reset, existing schema alteration, existing password change, Docker volume removal, remote push or merge was performed.

## Exact structural comparison

These counts were measured immediately before and after applying 007 to the populated disposable baseline. The migration ledger table is excluded from application counts.

| Object | Before (001–006) | After (001–007) |
|---|---:|---:|
| Application tables | 16 | 16 |
| Table columns | 94 | 94 |
| Relational constraints | 66 | 66 |
| Indexes, including constraint indexes | 39 | 39 |
| Views | 3 | 3 |
| User-defined triggers | 21 | 17 |
| Trigger functions, both declared and bound | 20 | 15 |
| Stored warranty-registration function | 1 | 1 |
| Vector dimension | 384 | 384 |
| HNSW vector index | 1 | 1 |
| GIN metadata index | 1 | 1 |
| Applied migration files | 6 | 7 |
| Pre-migration disposable fixture rows | 84 | 84, byte-equivalent JSON row fingerprints |

All 16 per-table aggregate row hashes match across 007. The definitions of columns, constraints, indexes, views and `register_warranty` match exactly; combined SHA256 is `b898abc9ff186c91e4bb879e086f7eb99b731187587aabbcd61356c189c06bf0`. Later tests intentionally append additional synthetic fixtures, so their final row totals are not migration-change counts. The 84 preserved rows are disposable test fixtures, not a fresh audit of the user's original data.

Evidence: `baseline-snapshot.json`, `proposed-snapshot.json`, `data-and-baseline-comparison.json` in `refactor-evidence/`.

## Executed test comparison

Repeated runs are not added together as extra coverage. Each row below is its own suite, with a different meaning of a test/case.

| Gate | Latest main rerun in isolation | Refactor result |
|---|---|---|
| Unit/setup/static tests | 14/14 | **17/17**, including the 3 overlay static tests |
| Actual migration runner | 6 migrations applied | 007 applied; rerun skipped all 7 |
| Clean-schema migrations | 6/6 | **7/7**, rolled back; vector/HNSW/GIN retained |
| Original database smoke suite | Passed, rolled back | **Passed**, rolled back |
| Added audited integrity assertions | 38/38 | **38/38**, rolled back |
| Production HTTP suite with real semantic search | 78/78 | **78/78** on the final optimized production build |
| Additional second-officer/HTTP race assertions | Not part of old baseline suite | **19/19** |
| Independent guard/rollback/repair matrix | 41/41 | **41/41** |
| Coordinated SQL concurrency/transaction cases | 5/5 | **5/5** |
| Migration rollback/fault/concurrent-install cases | Not part of old baseline suite | **5/5** |
| Live consistency invariants | 10/10, zero violations | **10/10**, zero violations after HTTP/browser work |
| Viva SQL and vector query-plan checks | Passed | **Passed**, temporary DDL/DML rolled back; HNSW usable |
| TypeScript typecheck | Passed | **Passed** |
| Optimized production build | Passed | **Passed**; final app started and tested |
| Dependency audit | 0 vulnerabilities | **0 vulnerabilities** |

The historical October 22 audit had 11 unit/setup tests; audited GitHub main includes the three later CI-environment tests, hence 14 before the refactor. Its historical production evidence has 78 cases. All 78 case names match the isolated main and final candidate evidence exactly. HTTP coverage in this review is **78 existing + 19 new = 97 distinct assertions**.

The existing HTTP harness originally labeled any port other than 3002 as development. Both baseline/proposed servers here were actual `next start` production servers on 3004. The harness now accepts a validated `AUDIT_MODE=production`; final evidence uses that setting. Earlier files with `api-development` in their names are explicitly identified as production execution rather than being misrepresented as development coverage.

Evidence layout: `refactor-evidence/baseline/`, `proposed/`, `final/`, plus the independent JSON case lists beside them. Command metadata supplies exit codes/durations alongside captured output logs. Published logs only normalize trailing terminal whitespace; original captures remain in the separate local review lab. Existing files in `docs/audit-evidence/` remain historical.

## Independent behavioral findings

### Decision timing and error contract

The active-officer check moves from a separate `BEFORE INSERT` trigger into the existing non-deferred `AFTER INSERT` decision trigger. An exception aborts the entire statement: the decision row, claim status, generated repair and audit effects do not survive. Tests verified inactive/customer/wrong-assigned officers, a mixed valid/invalid multirow insert, a forced downstream audit failure, explicit transaction rollback and duplicate decisions. Approval/rejection and repair-generation order remain intact for valid application requests.

Two deliberate direct-SQL differences were reproduced:

| Direct SQL input | Baseline | Refactor |
|---|---|---|
| Customer officer ID plus too-short reason | `P0001`: active officer required | `23514`: reason CHECK constraint reports first |
| Existing claim decision plus customer officer ID and `ON CONFLICT(claim_id) DO NOTHING` | `P0001`: active officer required | 0 rows inserted; the AFTER trigger does not run |

Neither input inserts an invalid decision or changes claim/repair/audit rows. Current decision APIs validate inputs and lock/check the claim before ordinary INSERT, do not use this upsert form, and retain their tested 400/401/403/404/409 behavior. **This is not strict equivalence for all direct-SQL clients.** A client requiring the old pre-insert error contract must retain separate BEFORE officer validation (which reduces the trigger simplification) or be adapted/tested before adoption. Do not claim unchanged SQL error precedence.

### Repair, warranty and history guards

All 16 combinations of old/new repair state were exercised. Legal transitions update timestamps and append exactly one transition audit; no-op status writes preserve timestamps and do not add audits. Skipped stages, reversed or competing terminal transitions, deletion and changed repair identity are rejected. Warranty identity/product/policy/date/created-at facts remain immutable after a claim; harmless no-op updates and the intended void flag updates still work. Both append-only tables retain their distinct error messages for UPDATE/DELETE.

### Concurrency

Two actual PostgreSQL connections were coordinated using observed `pg_stat_activity` lock waits, rather than relying only on sleeps. Tests covered assignment contention, competing decisions, a waiting completion following repair start, competing terminal repair states and explicit approval rollback at READ COMMITTED. Real HTTP races separately checked duplicate serial registration, duplicate approval and competing terminal repair updates. Only one logical winner/repair/decision audit survives where required. Two simultaneous migration processes on a fresh disposable database applied each of seven files exactly once using the existing advisory lock; a subsequent runner skipped all seven.

This is representative concurrency coverage, not a stress or formal serializability proof. Cross-table races involving concurrent account deactivation or first-claim/policy edits were not exhaustively tested; the refactor retains the baseline's point-in-time active-role checks and existing locking design.

## Browser evidence

A populated synthetic customer account, Northstar N14 product (purchase 24 October 2026), evidence-bearing claim and officer workflow were exercised in the browser. Coverage displayed through **23 October 2028**. Customer registration/own-claim view, officer login, serial filtering, assignment, real retrieval of three policy passages, detailed approval, generated open repair, start and completion all succeeded. The repair select correctly changed from Start repair to Mark completed. Audit history showed submission, assignment, semantic search, decision and two repair transitions.

See `browser-workflow.json`, `browser-approved-completed.png` and `browser-repair-completed.png`. Browser rejection, cancellation, policy ingestion and second-officer denial were not separately repeated; they have API/DB coverage. A Playwright `getByLabel` lookup found that existing product labels are not associated HTML labels; the visible controls were successfully populated by their native selectors. This accessibility limitation exists in unchanged baseline components and was not fixed by this database refactor.

## Level 3 requirements and remaining limits

All five pages of the supplied requirements were reread. PostgreSQL plus pgvector (Option 2), ER/schema/dictionary, meaningful DML/queries, transactions, views, stored functions, triggers, indexing, vector similarity, Next.js/API integration, two roles and validation remain demonstrated. See `DBMS_REFACTOR_REQUIREMENTS.md` for the complete 17-item mapping.

Section-wide title uniqueness, approved two-member team, actual individual DB/application contributions, originality and viva understanding remain human/instructor requirements; this review cannot certify them. Existing report PDFs are historical. Current Markdown/evidence documents must accompany a presentation.

Not tested: applying to a copy of the user's private database or its actual data anomalies, backup/restore, crash/recovery during migration, other PostgreSQL versions, deployed HTTPS/proxies, high-volume load/soak tests, exhaustive browser/mobile/accessibility combinations, exhaustive cross-table races, or broad semantic relevance/legal correctness. No benchmark establishes speed or memory gains. Existing production-hardening limitations such as rate limiting/session revocation remain outside the refactor.

## Adoption procedure

Review the separate branch/commit and the SQL-error caveat. For the current application, the measured regression gates support adoption. Keep the user's existing database untouched until a backup and a separately authorized real migration are arranged; the requested review did not authorize that deployment. A local commit is sufficient for review and has not been pushed or merged. No remote CI pass is claimed for this candidate; only the audited baseline's CI and the local candidate results are verified.

The disposable test app/container are stopped at review completion. Follow `README_APPLY.md` to recreate the isolated environment and rerun the checks. Do not copy dummy test credentials into a real deployment.
