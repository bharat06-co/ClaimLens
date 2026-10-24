# CLAIMLENS strict decision-insert compatibility review — 24 October 2026

## Result

**Both previously identified SQL incompatibilities are fixed. All full local regression suites pass.** Revised migration 007 retains the original `trg_validate_deciding_officer BEFORE INSERT` trigger and its `validate_deciding_officer()` function from migration 005. It also leaves the original `trg_apply_claim_decision AFTER INSERT` trigger and `apply_claim_decision()` function from migration 001 untouched. Their PostgreSQL definitions are exactly equal before and after the revision.

This supersedes the earlier candidate at local commit `23ec534`, whose 17-trigger/15-function result required a direct-SQL caveat. That candidate and its evidence remain available as historical records. The current result is **18 triggers and 16 trigger functions**. The user-requested strict decision-insert error behavior is restored; no universal proof for every possible SQL statement or future schema extension is claimed.

## Exact before/after counts

| Object | Audited main (001–006) | Earlier candidate | Corrected candidate |
|---|---:|---:|---:|
| Application tables | 16 | 16 | 16 |
| Table columns | 94 | 94 | 94 |
| Relational constraints | 66 | 66 | 66 |
| Indexes, including constraint indexes | 39 | 39 | 39 |
| Views | 3 | 3 | 3 |
| User-defined triggers | 21 | 17 | **18** |
| Trigger functions, declared and bound | 20 | 15 | **16** |
| Warranty-registration stored function | 1 | 1 | 1 |
| Vector dimension | 384 | 384 | 384 |
| HNSW / GIN indexes | 1 / 1 | 1 / 1 | 1 / 1 |
| Migration files | 6 | 7 | 7 |

The corrected runtime reduction is **3 triggers (14.29%) and 4 trigger functions (20%)**. No performance benefit was benchmarked. Retaining the original BEFORE validation intentionally gives up one trigger/function reduction from the first proposal.

All **27 seeded disposable rows** had identical per-table hashes immediately before and after corrected 007. The column/constraint/index/view/registration-function definitions are unchanged: SHA256 `b898abc9ff186c91e4bb879e086f7eb99b731187587aabbcd61356c189c06bf0`. The fresh seed is smaller than the earlier review's 84-row fixture set, which included extra HTTP/concurrency fixtures. These numbers describe separate disposable test runs, not the owner's private database. Later test fixtures intentionally increase the final row total.

## Reproduction and strict comparison

`scripts/review-sql-compatibility.mjs` creates a temporary schema in the disposable database, applies baseline migrations 001–006, prepares synthetic customers/officers/claims, and measures the baseline outcomes. It then runs the rejected earlier 007, measures the differences, rolls that change back, runs revised 007, and compares exact SQLSTATEs/messages/row counts. The schema and every fixture are rolled back at the end. It works before or after public-schema 007 has been applied.

The rejected SQL is retained solely as a hash-verified test fixture at `docs/refactor-evidence/strict/previous-migration-007.rejected.sql`. Its normalized SHA256 is `b26a9589325b2f855563057db4facb613f7d3ea584091878af637f774aa0198c`; do not deploy that fixture. Using it makes reproduction possible from a source ZIP without Git history.

| SQL case | Baseline | Rejected earlier 007 | Corrected 007 |
|---|---|---|---|
| Customer officer ID + short reason | `P0001`, active-officer error | `23514`, reason CHECK error | **Exact baseline error** |
| Customer officer ID + conflicting `ON CONFLICT DO NOTHING` | `P0001`, active-officer error | 0 inserted rows | **Exact baseline error** |
| Inactive officer + short reason | `P0001`, active-officer error | `23514`, reason CHECK error | **Exact baseline error** |
| Inactive officer + conflicting `ON CONFLICT DO NOTHING` | `P0001`, active-officer error | 0 inserted rows | **Exact baseline error** |
| Valid officer + short reason | `23514`, reason CHECK error | Same | **Same** |
| Valid officer + conflicting `ON CONFLICT DO NOTHING` | 0 inserted rows | Same | **Same** |

The exact restored message is `Decision requires an active officer`. There are **6 comparison cases across 3 versions (18 statement executions)**. All corrected results equal baseline results. Decision, claim, repair and audit rows remain unchanged after each rejected/no-op attempt. Both original INSERT trigger bindings and both decision function definitions match exactly. Append-only UPDATE/DELETE history still uses the intentionally shared guard function and retains its separately tested messages.

The first new comparison harness initially compared every trigger on `claim_decisions`, including the intentionally rebound append-only UPDATE/DELETE trigger. That overbroad catalog assertion failed. It was corrected to compare the two INSERT triggers and their functions; append-only behavior is verified independently by the guard suite. No production regression was hidden by that test correction. The initial harness failure is documented here; final results below refer to the corrected, passing checks.

## Full regression rerun

| Gate | Corrected result |
|---|---|
| Unit/setup/static tests | **18/18**, including a new original-trigger preservation regression |
| Actual upgrade | Corrected 007 applied after baseline 001–006 |
| Clean-schema migration checks | **7/7**, rolled back; vector(384), HNSW and GIN checked |
| Migration rerun | All 7 skipped as already applied |
| Original database smoke suite | **Passed**, rolled back |
| Audited integrity assertions | **38/38**, rolled back |
| Independent guard/rollback/repair-transition cases | **47/47** on both baseline and revised schema; was 41 in the first review |
| Strict SQL comparison | **6/6 cases match baseline**, both old differences reproduced |
| Coordinated SQL concurrency/transaction cases | **5/5** |
| Migration rollback/fault/concurrent fresh-install cases | **5/5** |
| Existing production HTTP suite with real semantic inference | **78/78** |
| Extra second-officer/HTTP race assertions | **19/19** |
| Post-HTTP database consistency invariants | **10/10**, zero violations |
| Viva DDL/DML/JOIN/group/HAVING/subquery/index-plan checks | **Passed** |
| TypeScript | **Passed** |
| Optimized production build | **Passed**; rebuilt app started and HTTP-tested |
| Dependency audit | **0 vulnerabilities** |

Repeated executions are not counted as extra coverage. HTTP coverage remains **97 distinct assertions**. Unit count is now 18 (audited main had 14; first review had 17). The new 47-case guard suite enforces both original SQL errors instead of merely recording differences and includes valid-officer controls. SQL concurrency tests coordinate real lock waits at READ COMMITTED; HTTP races test duplicate serials/approvals and competing terminal repair updates. The full semantic suite uses actual MiniLM vectors and pgvector, policy isolation, ingestion, retrieval replacement, approval, rejection, repair completion/cancellation and audit history.

Evidence is isolated under `docs/refactor-evidence/strict/`: command logs/metadata in `baseline/` and `final/`, structural/data snapshots, per-case guard/concurrency results, `direct-sql-comparison.json`, `migration-safety.json`, final HTTP/query outputs and cleanup confirmation. Earlier review evidence outside `strict/` remains historical. Published logs only normalize trailing terminal whitespace; raw captures are in the separate local review lab.

## All 17 Level 3 guideline sections

The owner's five-page requirements PDF was reread. [The updated full matrix](DBMS_REFACTOR_REQUIREMENTS.md) covers every numbered section:

1. Meaningful problem and beyond-CRUD design retained; section-wide title uniqueness unverified.
2. Approved two-member team and both members' DB/application contributions require human evidence.
3. SQL + vector Option 2 demonstrated by PostgreSQL/pgvector and real retrieval.
4. ER/schema/dictionary, keys, relationships, constraints and vector model retained; exact structural comparison passed.
5. DDL/constraints/indexes/views demonstrated by clean migrations and safe query exercises.
6. INSERT/UPDATE/DELETE/SELECT and meaningful relational queries executed.
7. Transactions, views, functions, triggers and indexing still demonstrate at least four SQL concepts; vector similarity demonstrated.
8. Embedding/chunk/metadata/cosine/policy-scope explanation and bounded runtime checks retained.
9. Rebuilt Next.js app and role-specific SSR/HTTP paths verified. Prior populated browser evidence is retained; a separate manual browser sequence was **not repeated in this strict follow-up**.
10. Backend integration and environment configuration verified using dummy test settings; no private credentials copied.
11. Customer/officer authentication, ownership, distinct second-officer denial and inactive-account handling passed.
12. Database integrity and original decision-insert error precedence verified by the suites above.
13. Current results, separate change log, requirements mapping and evidence supplied; original report PDF remains historical and team details need completion.
14. Audited public repository/main verified; review stays local. Individual team contribution history remains a human requirement.
15. Software demonstration evidence is available; each student's own viva explanation remains unverified.
16. Originality is not established by passing tests; provenance/instructor review required.
17. The workflow remains beyond CRUD and justifies relational consistency plus semantic policy retrieval.

Technical capabilities remain demonstrated. Testing cannot certify pending academic/human requirements, so this is not a claim that all 17 sections are unconditionally satisfied.

## Isolation, adoption and limits

GitHub main remains `d01824ffa6dc946a65d232934e35e44ff6d9b82e`; the separate review branch remains `codex/dbms-refactor-review`. Tests ran against a fresh container `claimlens-strict-review-20261024` at **127.0.0.1:55433**, using tmpfs only. PostgreSQL 17.11/pgvector 0.8.7, Node 24.22.0 and Next.js 15.5.28 were used. The built production app listened at 127.0.0.1:3004. The existing private database at 5432 and its Docker volume were never targets of a test, migration, seed or reset. No real environment file was copied. Application source, dependencies and migrations 001–006 remain unchanged.

The full local gates support adopting the corrected candidate for the tested application and restored decision-insert SQL contract. This is a revision to the **unadopted** 007; do not overwrite a migration already applied in a persistent environment. The prior 007 ran only in a disposed review database. Any real adoption/migration still needs the owner's separate authorization and normal backup/review process. Nothing is pushed, merged or applied to main/private data here.

Not tested in this follow-up: manual browser actions, deployment HTTPS/proxies, private-data migration/restore, crash recovery, load/soak/other PostgreSQL versions, exhaustive cross-table races, broad semantic/legal accuracy or exhaustive mobile/accessibility behavior. Prior screenshots remain evidence of the earlier candidate, not newly executed GUI tests. No universal SQL equivalence or performance proof is claimed beyond the stated definitions/cases and regression coverage.

The review app was stopped and only the verified disposable tmpfs container was removed after testing. The owner was informed Docker Desktop may be closed. Logs/results remain available after cleanup.
