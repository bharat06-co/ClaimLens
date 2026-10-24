# Audit change log

Audit started 22 October 2026 (Asia/Calcutta).

## Workspace and preservation

- Extracted the supplied ZIP into `Documents/ChatGPT/DBMS/CLAIMLENS`; the original ZIP and Downloads checkout are unchanged.
- Confirmed application/database/script/test sources match the existing Downloads checkout.
- Reused its `.env` privately without changing any values, and copied its dependency lock file for reproducibility. Secrets are excluded from reports and version control.
- Found the existing healthy `claimlens-db-1` PostgreSQL 17 / pgvector container. No reset, volume removal, reseed, or publishing is authorized or performed.
- Read the README, report, verification notes, contributions, data dictionary, migrations, and all five pages of the supplied DBMS Level 3 requirements PDF.

## Code changes

| Change | Reproduction / reason | Verification |
| --- | --- | --- |
| `lib/db.ts`: keep PostgreSQL DATE as a string | Browser displayed 30 September for a purchase on 1 October in local India time | Parser regression + browser now shows 1 October 2026 / 30 September 2028 |
| `lib/http.ts`: malformed JSON returns 400 | Truncated JSON produced HTTP 500 | Reproduction now returns 400 |
| Claim/policy pages validate UUIDs with Zod | 36 hyphens bypassed regex and caused PostgreSQL error / HTTP 500 | Both now return 404 |
| Normalize email before validating | Leading/trailing spaces rejected valid login addresses | Unit and real HTTP login pass |
| Same-origin mutation middleware | API had no origin check for cookie-authenticated writes | Cross-origin HTTP requests return 403; browser form regression corrected for Next's localhost normalization |
| `005_audit_integrity.sql` | SQL accepted completed repairs on unapproved claims and rewrites of purchase facts | Additive migration applied; final expanded suite passes 38 rollback-protected integrity assertions |
| Preserve source document/policy/model relationships and active deciding officer | Related-row edits could invalidate historic ownership, coverage or retrieved evidence | Negative SQL regressions pass |
| Decision route uses row lock and explicit authorization/state errors | Missing/unassigned/duplicate decisions previously became generic constraint errors | Real HTTP tests verify 404/409; DB still enforces assigned officer |
| Remove dashboard's silent 75-claim cutoff | Source query excluded older claims from search and totals | Source includes all role-visible rows; normal lists verified; 76+ row browser/load fixture explicitly untested |
| Form success feedback and reset | Same-page document ingestion had no success feedback and retained stale submitted text | Browser verifies success notice, increased document/chunk counts, cleared inputs and duplicate-text rejection |
| Remount select fields when workflow options change | Browser repair transition retained old state and defaulted to Cancel repair after starting | Browser verifies Mark completed default and successful completion |
| Upgrade Transformers.js to 4.3.1; override patched PostCSS/sharp | npm identified 8 vulnerabilities (3 high, 5 moderate) | Install reports zero; real embeddings match existing vectors with cosine >0.999999 |
| Explicit fp32 CPU embedding/cache configuration | Keep the same embedding space and honor documented HF_HOME | 384 dimensions, unit norm, relevant real policy result verified |
| Add original-row snapshot, defect probes, DB/API/embedding/migration/query/source audit scripts and evidence | Reproducible verification and preservation proof | 78 production HTTP checks pass; all 32 original rows retained, sole approved correction checked explicitly |
| Smoke test uses a separate historical warranty | Old test temporarily edited an existing warranty; new guard intentionally rejects that | Original smoke suite still passes, all writes rolled back |
| `006_warranty_validation.sql` and effective-date policy filtering | Transactional reproduction accepted a 2024 purchase under a policy effective in 2025 | Database now enforces policy applicability, matching inclusive dates and active customer role; browser/API regressions added |
| One original demo expiry corrected after explicit approval | Legacy DEMO-N14-1001 ended on 15 February 2028 instead of 14 February | Guarded one-row transaction applied after approval; audit event retained; all other original fields verified unchanged |
| Date input listens to input and change events | Production browser date entry did not update React state, so switching model cleared the entered date and applicability choices stayed stale | Rebuilt production browser verifies blocking invalid date, restoring valid policies, retaining date across model change and saving N16 Studio registration |
| Default npm test includes local setup tests; added audit commands and lock file | Original npm test omitted the separate setup suite | Final default suite 11/11; repeatable audit scripts documented |
| Broaden ignore rules for private environment variants and audit backups | Prevent accidental inclusion of private audit data | Actual working .env and private snapshots/backups excluded from Git status |
| README, report, dictionary, verification, requirements matrix and audit evidence | Package had pending/unexecuted runtime claims | Markdown docs now reflect actual results and explicit untested areas; original PDF retained and labeled historical |
| `next-env.d.ts` generated by Next.js | Successful build adds the framework's route type reference | Generated file retained; typecheck and build pass |

## Final verification

- 11 unit/setup tests, 38 extended DB checks, original DB smoke suite, six clean-schema migrations, ten live consistency queries, TypeScript and optimized production build passed.
- 73 development HTTP checks and 78 expanded production HTTP checks passed. The last client-only date fix was rebuilt and its invalid/valid/model-change/save sequence retested in the production browser.
- Dependency audit: zero vulnerabilities. Public source/evidence scanned for original session/demo secrets: none found. Markdown evidence links resolve.
- All 32 original rows retained; exactly one approved expiry field correction; all other original fields unchanged. Workspace environment is byte-identical to the original.
- Production app left running on `127.0.0.1:3002`; audited code lives in this workspace, not the unchanged Downloads checkout.
- Explicit untested scopes and academic evidence gaps are in `docs/AUDIT_RESULTS.md` and `docs/REQUIREMENTS_AUDIT.md`.

## Access and data decisions

- Saved a private pre-audit SQL backup and original-row JSON snapshot under ignored `audit-private/`.
- Automatic approval rejected persistent additional officer accounts; no accounts were inserted. Browser/API tests use the existing demo officer and its original private password.
- Browser/API tests add clearly marked synthetic customer, product, policy, claim and repair records and retain them. No real claim is assigned or decided.
- No database reset, original data cleanup, reseed, publication, or original password change occurred.

## Share package — 22 October 2026

- Added `SHARE_WITH_GPT.md` with report navigation, setup/privacy notes and a suggested review message.
- Added `scripts/package-share.py` to package source, the lock file, this change log, audit reports, tests and real evidence. It excludes secrets, private database backups/snapshots, dependencies, caches, build output and Git internals.
- Created `CLAIMLENS_AUDITED_SHARE_2026-10-22.zip` in the parent DBMS workspace with a SHA-256 file manifest; packaging verifies archive CRCs, file hashes and absence of original unique session/demo secrets. No application or database changes are part of packaging.

## CI environment correction — 24 October 2026

- Confirmed the first GitHub Actions run failed at **Apply SQL migrations** because `scripts/doctor.mjs` required a physical `.env` file. The workflow already supplies DATABASE_URL, SESSION_SECRET and SEED_DEMO_PASSWORD as environment variables. Unit tests and TypeScript passed before that failure; seeding, DB assertions and build were skipped, not failed or passed.
- Updated the doctor to load `.env` when present and accept complete supplied environment configuration when the file is absent. Existing validation and TCP checks still run. Missing or invalid configuration is still rejected. No real `.env` should be uploaded to GitHub.
- Added three regression tests: environment-only CI works without creating a file; invalid environment configuration fails; supplied values override `.env` defaults without modifying the file.
- Isolated existing setup/missing-file tests from inherited CI configuration, so the workflow's environment cannot accidentally hide a missing-config regression.
- Local verification: **14/14 unit/setup tests passed**, including temporary TCP fixture tests outside the restrictive network sandbox; full TypeScript check passed. The two initial sandbox runs could not connect to the local test listener; the unrestricted rerun passed. This is not a claim of a passing GitHub Actions rerun.
- Prepared the corrected files for the user's GitHub Desktop checkout. No commit, push, workflow rerun, database reset, reseed or secret-file upload was performed by the agent.
- An optional live migration-runner check was blocked by automatic approval review because it could change the existing database schema. It was not executed. Configuration behavior is verified by the local regressions; end-to-end CI migration/seeding/build results must come from a new workflow run against its disposable service database after the user pushes.
