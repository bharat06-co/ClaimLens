# CLAIMLENS
**Warranty claim operations with policy-aware semantic retrieval**

A DBMS Level 3 experiential learning project. Customers register purchased products and submit warranty claims. Officers claim cases, inspect warranty eligibility at claim-submission time, retrieve semantically relevant policy clauses, document their decision, and advance approved repairs. PostgreSQL enforces key business rules; pgvector makes policy documents searchable without a second operational database. **No AI model makes the final decision.**

**Local audit, 22 October 2026:** See [actual audit results](docs/AUDIT_RESULTS.md), [separate change log](CHANGELOG_AUDIT.md), and [runtime evidence](docs/audit-evidence/). The audited working copy is in `Documents/ChatGPT/DBMS/CLAIMLENS`; the original Downloads package is unchanged. Existing records were retained, with one explicitly approved legacy expiry correction. Audit test records are marked `AUDIT` and retained. Never run a database reset or reseed as an audit step.

![Logical ER diagram](docs/er-diagram.png)

## Stack

- **Next.js 15 / React 19**: customer and officer interfaces, server-rendered pages and API routes.
- **PostgreSQL 17**: structured relational database, integrity constraints, triggers, functions, views, indexes and transactions.
- **pgvector**: 384-dimensional policy embeddings, HNSW cosine-distance index, scoped nearest-neighbor retrieval.
- **Transformers.js 4**, local `onnx-community/all-MiniLM-L6-v2-ONNX` model: 384-dimensional normalized fp32 CPU embeddings. First run needs a network connection to download model files into `HF_HOME`; later runs can reuse cached files. The upgraded runtime was checked against existing stored vectors.
- **Node.js 22+**, Docker with Docker Compose (recommended), TypeScript.

### Setup and run

Prerequisites: Node.js 22+, npm, Docker Engine with Compose. The Docker PostgreSQL port is bound only to `127.0.0.1` for local development.

```bash
npm install
npm run setup:local
# This creates .env with a random session secret and prints a unique demo password.
# If .env already exists, setup will never overwrite it.
npm run doctor
# Docker compose plugin syntax; older installations may use docker-compose:
docker compose up -d db
npm run db:migrate
npm run db:seed
npm run db:smoke
npm test
npm run typecheck
npm run build
npm run dev
```

Open **http://localhost:3000**. Demo accounts after seeding:

| Account | Email | Role | Password |
| --- | --- | --- | --- |
| Customer | `customer@claimlens.local` | Customer | `SEED_DEMO_PASSWORD` in your local `.env` |
| Officer | `officer@claimlens.local` | Officer | same local value |

**Never commit `.env`, model-cache, or real customer data.** Seeding inserts *fictional* manufacturers, policies, a registered laptop and a liquid-spill claim. Warranty expiry is an inclusive date computed as purchase date + coverage months - one day. These are illustrative terms, not real legal documents. Passwords are salted with `scrypt`, and signed HTTP-only session cookies are used. Public sign-up creates customer accounts only; officer credentials are provisioned through seed data.

If port 5432 is in use, adjust the Compose binding and `DATABASE_URL`. For existing PostgreSQL installations, install and enable the `vector` extension and run the migrations. Model downloads can take time depending on network and machine. The project must not be represented as verified end-to-end until the commands above pass on a machine with dependencies and PostgreSQL.

### Windows setup and troubleshooting

PowerShell in the extracted `CLAIMLENS` folder:

```powershell
npm install
npm run setup:local
docker compose up -d db
npm run doctor
npm run db:migrate
npm run db:seed
npm run db:smoke
npm run dev
```

If `npm run doctor` shows DATABASE_URL failure, edit `.env` to match `compose.yaml`; for the bundled Docker service the URL is `postgresql://claimlens:claimlens_local@127.0.0.1:5432/claimlens`. If it shows the database TCP port is unavailable, start Docker Desktop. The app cannot connect to the PostgreSQL instance running on another computer: each user must run their own database locally or configure a reachable server. The `.env` file is deliberately excluded from the ZIP and Git repository because it contains secrets. If registration shows a server error, inspect the `npm run dev` terminal and run `npm run doctor`.

### End-to-end demonstration

1. Start PostgreSQL, run migrations and seed; explain all six SQL migrations, including `003_claim_state_integrity.sql` and `004_temporal_integrity.sql`.
2. Sign in as **customer**. Open dashboard, inspect the pre-registered fictional laptop, or register another fictional product; create a claim and add an optional evidence URL.
3. Sign out and sign in as **officer**. Filter the claim queue by status or search by serial number.
4. Open a `submitted` claim; choose **Assign to me**. Confirm `submitted -> in_review` and the assignment audit record.
5. Click **Run semantic search** and inspect ranked passages from the linked policy; explain that cosine similarity is not an approval probability.
6. Record an **approved** or **rejected** decision with a substantive explanation. Confirm the claim state and the audit entry. If approved, the database trigger automatically creates an `open` repair order; progress it through `in_progress -> completed`.
7. View an officer policy page and ingest additional policy text; show document chunk count and embedding model/metadata.
8. Run `npm run db:smoke` and `db/queries_for_viva.sql` using a SQL client to demonstrate PK/FK/constraints, JOIN, HAVING, grouping, subqueries, indexing, views and triggers. All smoke-test mutations are rolled back.

### Source navigation

```text
app/                     Next.js pages and backend API route handlers
components/              Reusable forms, filters and widgets
lib/                     PostgreSQL, role/session security, validation and embedding code
db/migrations/           Relational schema, triggers, constraints, vector index
 db/queries_for_viva.sql SQL examples, including safe CREATE/ALTER/DROP exercise
scripts/                 Migration, seed and transactional database verification
tests/                   Unit tests
docs/                    Architecture, relational schema, report, ER diagram, test plan
```

### Main data model

`app_users` (customer/officer) -> `registered_products` -> `warranties` -> `warranty_claims` -> `claim_decisions`/`repair_orders`. Manufacturer models point to warranty policies; policy documents split into `document_chunks` with pgvector embeddings; `semantic_matches` captures the claim-to-passage ranked results. See [ER diagram source](docs/ER_DIAGRAM.dot), [data dictionary](docs/DATA_DICTIONARY.md), and [system report](docs/PROJECT_REPORT.md). See [verification status](docs/VERIFICATION.md) for what has and has not been run.

### Database and vector model rationale

- **Relational**: Claim ownership, reference integrity, unique product serials, single assigned officer and single final decision require strong transactions, foreign keys, uniqueness and auditable state changes.
- **Vector**: Manufacturer policies are text-heavy. Lexical keyword search often misses semantically similar wording. The same PostgreSQL server stores vector(384) embeddings through pgvector; matching is restricted to the warranty's actual policy using a SQL JOIN.
- **Ingestion**: Text is split into 115-word chunks with 25-word overlap; each chunk is embedded locally, then document and chunks are inserted atomically. SHA-256 guards against duplicate text within a policy.
- **Retrieval**: Claim text is embedded using the same model. PostgreSQL orders candidate chunks by cosine distance (`<=>`); top five are saved with similarity score, rank and timestamp. Matched passages support officer review, not automatic legal judgments.

### Automated CI checks

`.github/workflows/verify.yml` defines GitHub Actions checks for Node.js unit tests,
TypeScript type checking, all PostgreSQL/pgvector migrations, seed ingestion,
transactional database tests and a Next.js production build. It requires internet
access for npm and the first ONNX model download and runs only after the repository
is pushed to GitHub. No CI passing status is claimed for the local source package.

### Security / project limitations

- Credentials are read from env vars, never stored in the repository. SQL writes are parameterized, validated with Zod, and privileged operations require officer role; customer claim pages enforce ownership.
- Evidence is provided as an HTTPS/HTTP **link** in this version, not uploaded file storage. Verify third-party files before opening; do not enter sensitive production information into a classroom demo.
- Officer accounts and catalog/policies are provisioned by the seed script rather than a public admin UI.
- Warranty coverage is modeled by dates and policy rules. Real decisions require human investigation, local law and real manufacturer terms. Demo policy text is fictional.
- Semantic matches are additionally verified against the exact policy attached to the claim at the database level. A local classroom deployment is the target; use HTTPS, rate limiting, persistent session revocation, monitoring, and separate least-privilege DB roles before production use. Same-origin mutation checks are included in the audited application.
- Demo seed invokes the local embedding model which may download model assets on first invocation. Docker/npm/model/network setup cannot be skipped.

### Level 3 guideline checklist

| Requirement | Evidence |
| --- | --- |
| Unique real-world problem, non-CRUD | Warranty review + semantic policy evidence + repair workflow |
| SQL + vector database | PostgreSQL + pgvector, `document_chunks.embedding vector(384)` |
| ER diagram and relational schema | `docs/er-diagram.png`, `docs/ER_DIAGRAM.dot`, `docs/DATA_DICTIONARY.md` |
| PK, FK, CHECK, UNIQUE, DDL | `db/migrations/*.sql` |
| INSERT, UPDATE, DELETE, SELECT | API routes, `db/queries_for_viva.sql` |
| JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries | `v_claim_overview`, `v_claim_status_summary`, `queries_for_viva.sql` |
| Four advanced SQL concepts | ACID transactions, stored functions, triggers, views, indexes (five), including database-enforced claim/repair state machines and immutable assignment records |
| One advanced vector concept | HNSW index + cosine nearest-neighbor retrieval |
| Next.js web interface and backend API | `app/`, `app/api/` |
| Backend auth, >=2 roles | `app_users.role`, `lib/auth.ts`, `lib/security.ts` |
| DB validation and integrity | CHECK/FK/UNIQUE + ownership/manufacturer/officer/decision triggers |
| Report, tests, public repo | `docs/PROJECT_REPORT.md`, `tests/`, `scripts/db-smoke.ts`; **public repository must be published by team** |
| Individual contributions | Two members should each maintain commits spanning UI and database; see `docs/CONTRIBUTIONS.md` |

## Repository publishing

Only after explicit owner authorization, create a **public** GitHub repository under your own/team account and push the project. No public repository has been created by this source package.

```bash
git init
git add .
git commit -m "Initial CLAIMLENS relational and vector application"
git branch -M main
git remote add origin https://github.com/<YOUR_USERNAME>/claimlens.git
git push -u origin main
```

The team must replace the placeholder URL, preserve real individual commit histories, and append actual application screenshots/test outcomes to the report. Do not invent demonstration results or contributor histories.
