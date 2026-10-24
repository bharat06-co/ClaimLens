# Refactor review change log — 24 October 2026

## Strict decision-insert compatibility follow-up

- Revised unadopted migration 007 to leave the original `validate_deciding_officer()` BEFORE INSERT trigger/function and `apply_claim_decision()` AFTER INSERT trigger/function unchanged. Removed their proposed consolidation. Final runtime counts: **18 triggers / 16 trigger functions**, versus audited baseline 21/20 and the first proposal's 17/15.
- Reproduced both earlier differences using baseline 001–006, hash-verified rejected 007 and corrected 007 in a temporary schema. Six cases/18 executions verify customer/inactive/valid officers, CHECK error precedence and conflicting `ON CONFLICT DO NOTHING`. Corrected SQLSTATEs/messages/row counts exactly match baseline, with no workflow effects.
- Added `scripts/review-sql-compatibility.mjs`; retained rejected SQL as an explicitly historical test fixture so replay works without Git history. The original overlay SHA is provenance only; corrected migration 007 intentionally differs.
- Added a static trigger-preservation test (18 total unit/static tests), strengthened the runtime verifier for BEFORE timing/18 triggers/16 functions, and expanded guard assertions from 41 to 47 with strict error checks and valid-officer controls. Added optional `REVIEW_EVIDENCE_DIR` routing to the independent tools so prior evidence is preserved.
- Reran smoke, 38 integrity, 47 guard, 6 strict comparison, 5 SQL concurrency, 5 migration-safety, 7 clean-migration and 97 production HTTP assertions, ten invariants/viva queries, typecheck/build and dependency audit. All passed; zero vulnerabilities. All 27 fresh seed rows and relational definitions were preserved across migration 007.
- Rechecked all 17 guideline sections. Technical features retained; human team/contribution/originality/viva conditions remain pending. New current report: `docs/DBMS_STRICT_COMPATIBILITY_RESULTS.md`; raw/current evidence under `docs/refactor-evidence/strict/`. Earlier evidence is historical; no new manual browser run is claimed.
- Used only fresh tmpfs container `claimlens-strict-review-20261024`, port 55433; stopped review app/removed disposable container afterward. Existing database/volume/secrets and main untouched. No push or merge.

## Initial review (historical)

Base: audited GitHub main `d01824ffa6dc946a65d232934e35e44ff6d9b82e`.
Review branch: `codex/dbms-refactor-review`, in a separate checkout.

1. Read the supplied overlay's README/review and all five pages of the Level 3 requirements. The supplied ZIP is named `ClaimLens_Refactor_Patch.zip`; it contains the expected six-file overlay. Preserved the original overlay separately in the local review lab.
2. Added migration 007 and its three static tests. Migrations 001–006 and application code, tables, columns, indexes, views and registration function are unchanged. Migration 007 remains byte-identical to the supplied overlay: SHA256 `b26a9589325b2f855563057db4facb613f7d3ea584091878af637f774aa0198c`.
3. Strengthened `scripts/verify-dbms-refactor.ts` to verify actual trigger row count, all 15 trigger functions, 384-dimensional vectors and HNSW/GIN indexes in addition to the supplied binding/retirement checks.
4. Added independent integration tools: `review-dbms-snapshot.mjs` (read-only schema/data fingerprints), `review-dbms-behavior.mjs` (41 rollback cases), `review-dbms-concurrency.mjs` (5 coordinated transaction cases), `review-api-concurrency.mjs` (19 actual HTTP authorization/race assertions) and `review-migration-safety.mjs` (5 migration/fault/concurrent-install cases). These tools refuse database ports other than the disposable review port 55433; HTTP extension tests require localhost:3004.
5. Corrected an existing audit harness reporting defect in `scripts/api-audit.ts`: accept validated `AUDIT_MODE=production` instead of inferring production only from port 3002. Final real production HTTP run on 3004 passed 78/78. No API handler or application behavior changed.
6. Added this separate change log, final results/requirements mapping, reviewed setup notes, input provenance and new evidence under `docs/refactor-evidence/`. Preserved the original October 22/24 evidence under `docs/audit-evidence/`; new runs do not replace the historical baseline in the commit.
7. Used a separately named pgvector/PostgreSQL 17 tmpfs container on 127.0.0.1:55433. No real environment file or database data was copied. Tests use dummy configuration and fictional fixtures. The existing database, volume, private credentials and main checkout were not targets of any test or migration.

No reproducible application/data-integrity regression was found in the executed comparison, so no runtime SQL fix was necessary. The intentional BEFORE-to-AFTER decision error differences are recorded in `docs/DBMS_REFACTOR_RESULTS.md`; they are not claimed to preserve every direct-SQL error contract. The pre-existing product form's HTML labels also do not resolve through Playwright `getByLabel`; interaction through the visible native controls succeeded. Accessibility remediation is outside this database refactor.

See the results document for passed tests, untested cases and adoption conditions. A local review commit is prepared only after all requested checks pass; nothing is pushed or merged.
