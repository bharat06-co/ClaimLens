# CLAIMLENS DBMS Refactor — Validated Review Copy

**Local review completed 24 October 2026.** Start with [current strict results and limitations](docs/DBMS_STRICT_COMPATIBILITY_RESULTS.md), the [separate change log](CHANGELOG_REFACTOR_REVIEW.md) and [Level 3 mapping](docs/DBMS_REFACTOR_REQUIREMENTS.md). This branch has not been merged, pushed or applied to the owner's existing database. Source baseline remains audited main `d01824ffa6dc946a65d232934e35e44ff6d9b82e`.

Validated strict counts: 16 tables retained; 21 to 18 triggers; 20 to 16 trigger functions. Unit/static 18/18; integrity 38/38; production HTTP 78/78 plus 19 extra assertions; guard cases 47/47; strict SQL comparisons 6/6; SQL concurrency 5/5; migration safety 5/5; clean migrations 7/7; smoke/typecheck/build passed; dependency audit zero vulnerabilities. Both original decision INSERT trigger definitions and SQL error outcomes are preserved.

To reproduce, follow the disposable setup in `docs/DBMS_REFACTOR_REVIEW.md` with fresh per-run environment settings and port **55433**. Install locked dependencies with `npm ci`. After the original checks, also run:

```powershell
$env:REVIEW_STAGE='final'
$env:REVIEW_EVIDENCE_DIR='docs/refactor-evidence/strict'
$env:AUDIT_BASE_URL='http://127.0.0.1:3004'
$env:AUDIT_MODE='production'
node scripts/review-sql-compatibility.mjs
node scripts/review-dbms-behavior.mjs
node scripts/review-dbms-concurrency.mjs
node scripts/review-migration-safety.mjs
node scripts/review-dbms-snapshot.mjs
# With the production app running on localhost:3004:
node scripts/review-api-concurrency.mjs
```

The extra tools refuse the usual database port 5432. The SQL/HTTP race tools retain fictional fixtures only in the throwaway database. The migration-safety tool also creates a separate temporary database inside the throwaway container. Dispose of that named container when finished; do not remove an existing project volume.

This corrected unadopted migration replaces the rejected 007 only in the separate review branch. If any persistent environment already applied the earlier 007, do not silently overwrite its migration history; use a separately reviewed corrective migration.

The original overlay instructions below describe the input artifact, whose SQL differs intentionally from this strict revision. `REVIEW_MANIFEST.json` records original provenance and final review status; the original manifest is retained with the evidence.

## Original overlay description

This is a **patch overlay**, not a complete repository checkout. Based on audited `main` commit `d01824f` from https://github.com/bharat06-co/ClaimLens.

Extract the `db/`, `scripts/`, `tests/`, and `docs/` directories into a **separate copy** of the audited repository. No original files need to be replaced. The new files are:

- `db/migrations/007_consolidate_integrity_guards.sql` — actual database runtime refactor
- `scripts/verify-dbms-refactor.ts` — read-only schema checks after migration
- `tests/dbms-refactor.test.mjs` — baseline hash and static regression assertions
- `docs/DBMS_REFACTOR_REVIEW.md` — rationale, guideline compliance and test sequence

**Do not run this against your current classroom/demo database until the full tests pass in a disposable copy.** Existing migrations 001–006 and the original data are left unchanged. The GitHub `main` branch has not been modified.

See `docs/DBMS_REFACTOR_REVIEW.md` for isolated Docker setup and acceptance criteria.
