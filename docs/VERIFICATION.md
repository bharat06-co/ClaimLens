# Verification status — 22 October 2026

## Follow-up: CI configuration fix, 24 October 2026

The initial GitHub Actions run failed at **Apply SQL migrations**: the configuration doctor demanded `.env` despite the workflow supplying the required environment variables. Unit tests and TypeScript passed in that run; later DB/build stages were skipped. The doctor now accepts environment-only configuration, keeps validation/TCP checks, and preserves file/environment precedence. Local regression suite: **14/14 passed**; TypeScript passed. The new tests include an environment-only setup without creating `.env`, rejection of invalid supplied settings, and supplied settings overriding file defaults. **A successful GitHub Actions rerun remains unverified until the user pushes this correction.**

The older share ZIP is the 22 October snapshot and does not contain this follow-up fix. Current corrected files are in the working folder and prepared for the GitHub Desktop checkout. See `CHANGELOG_AUDIT.md` for the change record.

## Original audit evidence, 22 October 2026

These are **executed local Windows audit results**, superseding the ZIP's authoring-only/pending notes. Full detail: [AUDIT_RESULTS.md](AUDIT_RESULTS.md).

- **11/11** unit/setup tests, full TypeScript check and optimized production build passed.
- Original PostgreSQL/pgvector smoke suite and **38/38** added integrity checks passed; writes rolled back.
- **6/6** migrations passed in a clean temporary schema, rolled back afterward. 16 tables, vector(384), HNSW and GIN verified; reruns skip applied migrations.
- **73/73** development HTTP checks and **78/78** expanded production HTTP checks passed; JSON evidence records their distinct revisions.
- Real MiniLM inference and policy retrieval passed; upgraded runtime compatible with existing vectors.
- Browser exercised populated registration/product/claim/decision/policy forms, both roles, filtering, assignment, semantic search, approval, production rejection, repair completion, errors, ownership and corrected policy-date filtering.
- All **10 live-data invariants** passed. Viva DDL/DML/query examples and HNSW query plans executed.
- Dependency audit reports **zero vulnerabilities** after updates.
- All **32 original rows** retained. One expiry field corrected only after explicit owner approval and audited; every other original field unchanged. `.env` is byte-identical to original.
- No reset/reseed, original claim mutation, extra permanent privileged account, password change or publishing. Marked AUDIT records retained.

Production verified at `http://127.0.0.1:3002`. Fixes live in `Documents/ChatGPT/DBMS/CLAIMLENS`; original Downloads source/ZIP unchanged.

## Explicit limits

No second distinct officer browser flow, large-volume/load/soak run, exhaustive browser/accessibility matrix, restore drill or external deployment verification claimed. Cancellation passed API/DB checks, not separate browser submission. No broad semantic/legal accuracy guarantee. Production rate limiting/revocation/monitoring remain outside classroom scope. GitHub/team/instructor/originality evidence requires people.

The original `PROJECT_REPORT.pdf` was not regenerated and remains historical. Use the current Markdown reports and [real evidence](audit-evidence/) for the audit verdict.
