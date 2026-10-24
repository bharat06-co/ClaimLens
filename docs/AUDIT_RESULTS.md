# CLAIMLENS end-to-end audit

**Follow-up, 24 October 2026:** The first real GitHub Actions run exposed a CI-only configuration bug: the doctor required a `.env` file even when all settings were supplied through the environment. It is corrected locally, with **14/14 unit/setup regressions and TypeScript passing**. The original run's DB/build stages were skipped after the configuration failure. A successful remote rerun is **not yet verified**; the user will commit/push through GitHub Desktop. The results below are the original 22 October local audit, not a claim that GitHub CI passed. The original share ZIP predates this follow-up.

Executed **22 October 2026 (Asia/Calcutta)** on the user's Windows environment. This supersedes the ZIP's earlier unverified runtime status.

## Verdict and executed checks

The exercised customer, officer, semantic-retrieval and repair workflows pass after fixes. No known reproducible defect remains open in those exercised workflows. This is a bounded local audit, not a guarantee covering every possible input, browser or deployment.

| Executed check | Result | Evidence |
| --- | --- | --- |
| Unit and local setup tests | **11/11 passed** | `npm test`, including setup/doctor tests |
| Full TypeScript check | **Passed** | `npm run typecheck`; production build also validates types |
| Original transactional DB smoke suite | **Passed** | `npm run db:smoke`, all writes rolled back |
| Additional DB integrity assertions | **38/38 passed** | [database.json](audit-evidence/database.json) |
| Clean migration chain | **6/6 passed** | [migrations.json](audit-evidence/migrations.json); temporary schema rolled back; 16 tables, vector(384), HNSW and GIN confirmed |
| Migration rerun | **Passed** | Already-applied migrations skipped; no reset/reseed |
| Development HTTP integration | **73/73 passed** | [api-development.json](audit-evidence/api-development.json), earlier suite revision |
| Production HTTP integration | **78/78 passed** | [api-production.json](audit-evidence/api-production.json), expanded suite |
| Real model inference/retrieval | **Passed** | 384 dimensions; norm 1.0000001705689705; regenerated existing passage cosine 0.9999999999995868 |
| Optimized production build and server | **Passed** | `npm run build` exited 0; `next start` verified at http://127.0.0.1:3002 |
| Dependency audit | **0 vulnerabilities** | Original 8 (3 high, 5 moderate) resolved |
| Live-data consistency | **10/10 passed** | [queries-and-integrity.json](audit-evidence/queries-and-integrity.json); zero inconsistent rows |
| Original-data preservation | **Passed, with one approved correction** | All 32 original rows retained; only the expressly approved expiry field changed; every other original field unchanged |
| Environment preservation | **Passed** | Workspace `.env` byte-identical to the original; values never printed in evidence |

The last client-only rebuild addressed date-input state. Its affected production browser flow passed: invalid date blocks registration, valid date restores policies, model change retains the date, and registration succeeds. HTTP route code did not change after the 78-check production run.

## Requirements and preservation

Read all five pages of the supplied **DBMS Level 3 Project Requirements.pdf**, then README, report, verification notes, contributions, data dictionary, migrations and queries before runtime testing. Document instructions are reference material, not permission to reset or publish. See the [requirements matrix](REQUIREMENTS_AUDIT.md).

- Audited copy: `C:\Users\bhara\Documents\ChatGPT\DBMS\CLAIMLENS`. Original Downloads ZIP and checkout are unchanged.
- Reused the healthy existing `claimlens-db-1` PostgreSQL 17/pgvector container and original environment values. No replacement database, volume removal or reseed.
- Before mutations, saved a private SQL dump and original-row snapshot under ignored `audit-private/`. They contain sensitive database content and are excluded from public evidence.
- Applied additive migrations `005_audit_integrity.sql` and `006_warranty_validation.sql`; neither rewrites existing rows.
- Original demo warranty `DEMO-N14-1001` ended on **2028-02-15**, one day beyond its inclusive period. The user explicitly approved correcting it to **2028-02-14**. A guarded one-row transaction applied it and inserted `warranty_date_corrected`; the integrity trigger was re-enabled in the same transaction. The private baseline remains unchanged and its verifier explicitly checks this sole authorized difference.
- Browser/HTTP tests add clearly marked **AUDIT** customers, catalog entries, documents, products and claims. They are retained, not silently deleted. No original claim was assigned, decided, repaired or removed.
- Automatic approval rejected additional permanent officer accounts because they would expand privileged access. None were inserted. Officer tests used the existing demo officer and unchanged private password.
- No reset, original password change, GitHub publication or external deployment occurred.

## Findings and fixes

The separate [CHANGELOG_AUDIT.md](../CHANGELOG_AUDIT.md) tracks modified files and reasons. [source-changes.patch](audit-evidence/source-changes.patch) compares modified original text files with the supplied ZIP; new migrations and audit scripts are also present in the tree.

| Finding | Before | Fixed behavior and validation |
| --- | --- | --- |
| DATE timezone conversion | 2026-10-01 displayed as 30 September in India | Keep SQL DATE as a string; unit and browser show 1 October and correct inclusive expiry |
| Malformed JSON | HTTP 500 | HTTP 400 in real requests |
| Malformed UUID URLs | 36 hyphens reached PostgreSQL and caused HTTP 500 | Claim and policy pages validate UUID and return 404 |
| Email normalization | Trimming happened after validation | Trim/case-normalize first; unit and real login pass |
| Cross-origin mutation protection | No explicit origin guard | Cross-origin POST returns 403; legitimate browser forms pass using actual Host authority |
| Repair creation/history | SQL accepted completed repairs for unapproved claims | Require approved recorded decision and initially open repair; forbid rebinding/deleting history |
| Historical reference edits | Purchase/owner/model/policy/source edits could invalidate history | DB guards preserve warranted product facts, referenced terms/manufacturer and retrieved sources |
| Inactive deciding officer | Decision DB path lacked independent active-role check | DB trigger rejects inactive/non-officer decisions |
| Decision error handling | Missing/unassigned/duplicate decisions became generic constraints | Locked API transaction gives explicit 404/409/403 while DB independently enforces assignment |
| Policy applicability | A 2024 purchase was accepted under a policy effective in 2025 | DB checks applicability and matching inclusive dates; UI filters eligible policies |
| Direct product role bypass | Function checked customer role; direct SQL did not | Product trigger requires active customer |
| Ingestion feedback | Same-page success unclear; text retained | Indexed-passage success notice and cleared inputs, browser verified |
| Repair selector state | After starting, next stage defaulted to Cancel repair | Select remounts on option change; Mark completed default verified |
| Date input state | Browser date entry could leave React state stale | Input and change events handled; invalid/valid/model-change/registration sequence passed in rebuilt production app |
| Silent 75-claim cutoff (source review) | Older rows absent from search and totals | Cutoff removed; ordinary lists pass; large-volume browser fixture not executed |
| Dependency vulnerabilities | 8 reported advisories | Transformers.js 4.3.1 and patched PostCSS/sharp resolution; npm audit zero |
| Cache configuration (source review) | HF_HOME documented but not applied | Explicit cache path and fp32 CPU inference; existing embedding space compatibility verified |
| Legacy expiry | Old original demo row overran by one day | Explicitly approved, audited one-row correction; all other original fields retained |

## Browser features actually exercised

Live in-app browser tests used development port 3001 and production port 3002. Forms were populated and submitted, not merely opened.

| Feature | Observed result |
| --- | --- |
| Registration and empty account | Weak password rejected; valid customer signs in automatically; empty dashboard and no-product claim prompt work |
| Product registration | Manufacturer/model change selects its policy; date/serial saved; calendar dates correct; duplicate serial visibly rejected |
| Effective-date form | 2024 date gives no eligible policy and disables submit; 2026 date restores policy, survives model change; N16 Studio registers successfully |
| Claims and evidence | Complete issue/evidence URL/note saved; another claim with optional evidence blank also saved |
| Authentication | Wrong officer password rejected; existing officer and customer logins work; sign-out returns to login; production browser cookie works |
| Queue | Serial search, submitted filter, empty-search state and case links work |
| Assignment | Case changes to in_review with officer and audit entry |
| Semantic retrieval | Real ranked passages and scores appear; production liquid-damage query's top passage contains the exclusion, at 70.2% similarity |
| Approval and repair | Reasoned approval generates open repair; browser advances open -> in_progress -> completed; terminal controls disappear |
| Rejection | Production browser chooses Reject claim and records substantive policy reason; no repair panel or decision button afterward |
| Policy ingestion | Pasted text indexes under isolated AUDIT policy; document count increases, chunk count and success notice appear, inputs clear |
| Duplicate document | Same text under another title is visibly rejected by checksum uniqueness |
| Customer outcomes | Customer sees approved and rejected cases and their own completed repair |
| Authorization | Other customer's claim shows 404; officer policy URL redirects customer; officer controls absent from customer page |

Browser repair cancellation was tested through API/DB rather than a separate browser cancellation submission. The repair completion-selector correction was verified in the browser. The 75-row cutoff fix was source-reviewed and ordinary lists checked; no 76+ row browser fixture was added.

### Real screenshots

[Customer claim form](audit-evidence/customer-claim-form.png), [duplicate product](audit-evidence/duplicate-product.png), [officer filter](audit-evidence/officer-filter.png), [semantic review](audit-evidence/semantic-review.png), [completed repair](audit-evidence/completed-repair.png), [policy indexing](audit-evidence/policy-indexed.png), [production rejection](audit-evidence/rejected-production.png), [customer outcomes](audit-evidence/customer-production.png), [invalid policy date](audit-evidence/policy-date-blocked.png).

## API and database detail

Production HTTP coverage includes role-escalation attempts, duplicate identities, normalization, password failures, HTTP-only/SameSite cookies, expired/tampered sessions, inactive login/session/write denial, anonymous/wrong-role mutations across all routes, ownership isolation, manufacturer mismatch, impossible/future/pre-policy dates, duplicate serials, void warranties, issue/evidence validation, evidence persistence, document ingestion/checksum conflicts, real/repeated policy-scoped retrieval, concurrent assignment with one winner, missing/unassigned/duplicate decisions, approval/rejection, automatic repairs, illegal skip/reopening, completion/cancellation and audit events.

DB suites add PK/FK/UNIQUE/CHECK behavior, vector dimensions and rank/score bounds, ownership/manufacturer enforcement, immutable claim facts/assignment/decision/audit, inactive officers, protected reference relationships, terminal repairs, historical submission-time eligibility and inclusive dates. Direct SQL fixtures and clean-schema migration tests roll back.

Executed `db/queries_for_viva.sql`: JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries, views, JSONB filters and safe temporary CREATE/ALTER/DROP + INSERT/UPDATE/DELETE. EXPLAIN ANALYZE/BUFFERS confirms usable HNSW indexing. The normal planner can choose a sequential scan on this small dataset; the separately recorded forced-index plan demonstrates index usability, not production throughput.

## Untested / outside scope

- A second distinct permanent officer was not provisioned. Competing assignment requests used the same existing officer. Customer/non-officer/inactive checks and assignment constraints passed; a two-different-officers browser session was not run.
- No exhaustive browser/OS/accessibility matrix, load/soak/fuzz run, model-download outage simulation, backup restore drill or external HTTPS/proxy deployment test.
- Only small relevant semantic examples measured, not a labeled retrieval benchmark or legal accuracy. Mentioned exclusions can rank highly even when negated in an issue description.
- Classroom scope lacks production rate limiting, persistent session revocation and monitoring. Logout clears the browser cookie; a previously copied stateless signed token is not revoked. Compose credentials are local demo defaults, not production secret management.
- Evidence means HTTP(S) links. File upload/storage, email verification, password reset, appeals and admin provisioning UI do not exist and are not reported passed.
- Team attribution, real Git history, instructor approval, title uniqueness and originality require human evidence. No names/history were fabricated and nothing was published.
- Original `PROJECT_REPORT.pdf` remains a **historical pre-audit printable snapshot**, not the current verdict. It was not regenerated. Use this report, current VERIFICATION.md and updated Markdown report.

## Safe reproduction

Use the existing `.env` and database. Do not reset or reseed during re-auditing. API audit runs add retained synthetic records.

```powershell
npm test
npm run typecheck
npm run db:smoke
npm run audit:db
npm run audit:migrations
node --import tsx scripts/audit-queries.ts
npm run audit:preservation
npm audit
# Stop this workspace's server before rebuilding its .next folder.
npm run build
npm run start -- --hostname 127.0.0.1 --port 3002
# Another terminal:
$env:AUDIT_BASE_URL='http://127.0.0.1:3002'
npm run audit:api
```

Do not rerun `apply-approved-correction.ts`: it is an already-applied one-time maintenance operation and aborts if the old row does not match. Keep `.env*`, `audit-private/`, caches, node_modules and .next out of shared packages.
