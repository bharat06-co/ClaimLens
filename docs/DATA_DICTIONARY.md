# Relational schema, data dictionary and key constraints

**SQL engine:** PostgreSQL 17. **Vector extension:** pgvector. **Keys:** all core entities use UUID primary keys (`gen_random_uuid()`), while `audit_events` uses a bigint identity. Foreign keys are `NOT NULL` unless optional. [Visual ER diagram](er-diagram.png). For the complete SQL types and precision, `db/migrations/001_init.sql` through `006_warranty_validation.sql` are authoritative.

| Table | Primary key | Important attributes | Foreign keys | Constraints / purpose |
| --- | --- | --- | --- | --- |
| app_users | id | full_name, email, password_hash, role, is_active, created_at | — | Unique lowercase email, email format, role enum: customer/officer |
| manufacturers | id | name | — | Unique manufacturer name |
| product_models | id | model_name, category, default_warranty_months | manufacturer_id → manufacturers | Unique name per manufacturer, months 1–120 |
| registered_products | id | serial_number, purchased_on, registered_at | customer_id → app_users; model_id → product_models | Unique serial; purchase date not future |
| warranty_policies | id | title, version, coverage_months, effective_from | manufacturer_id → manufacturers | Unique manufacturer/title/version |
| policy_rules | id | kind, description | policy_id → warranty_policies | Kind: coverage, exclusion or condition |
| warranties | id | start_date, end_date, is_void | product_id → registered_products; policy_id → warranty_policies | One warranty per registered product; manufacturer must match; end >= start; end_date is inclusive |
| warranty_claims | id | issue_description, status, submitted_at, updated_at | warranty_id → warranties; customer_id → app_users | Ownership trigger; status enum: submitted, in_review, approved, rejected |
| claim_evidence | id | evidence_url, evidence_type, note | claim_id → warranty_claims | URL must begin http(s); optional evidence links |
| claim_assignments | claim_id | assigned_at | claim_id → warranty_claims; officer_id → app_users | One immutable assignment per claim; must assign an active officer while submitted |
| claim_decisions | id | verdict, reason, decided_at | claim_id → warranty_claims; officer_id → app_users | One decision per claim; must be assigned officer; writes status and repair atomically |
| repair_orders | id | status, service_center, notes, opened_at, updated_at | claim_id → warranty_claims | One repair per approved claim; controlled state transitions |
| audit_events | id | event_type, details jsonb, occurred_at | actor_id → app_users (optional) | Audit log for submissions, assignments, decisions, searches, repair stage updates |
| policy_documents | id | title, original_text, sha256, document_type | policy_id → warranty_policies; uploaded_by → app_users (optional) | Prevent duplicate policy text per policy |
| document_chunks | id | chunk_number, content, embedding vector(384), metadata jsonb | document_id → policy_documents | Unique document/chunk index; HNSW cosine index; GIN metadata index |
| semantic_matches | id | similarity_score, result_rank, retrieved_at | claim_id → warranty_claims; chunk_id → document_chunks | Rank and score for top matches; one result per rank/chunk per claim |

## Main cardinalities

- One manufacturer → many product models and many warranty policies.
- One customer → many registered products and claims.
- One product model → many registered products; one registered product → zero/one warranty.
- One warranty policy → many warranty records, policy rules and documents.
- One warranty → many claims; one claim → many evidence records, many semantic matches and zero/one assignment, decision and repair order.
- One document → many numbered chunks; one chunk → many semantic match records across claims.
- One officer → many assignments and decisions.

## Denormalization and justified design decisions

- `warranty_claims.customer_id` duplicates the owner reachable via warranty → product, enabling fast ownership filter; a DB trigger checks the relationship.
- `warranties.policy_id` explicitly snapshots the policy version governing a purchase. Policy versions should be immutable in a production system; here old versions are retained via the UNIQUE version field.
- `semantic_matches` persists a ranked *retrieval event summary* for reproducibility in the demo, but new retrieval replaces previous matches for a claim. A production-grade search history would use separate search-run IDs.
- `document_chunks.metadata` uses JSONB because chunk-specific data (model, title, offsets) may vary. `embedding` is stored in `vector(384)` and cosine-HNSW indexed.

## Indexes and query access patterns

- Functional UNIQUE `lower(email)` for identity.
- `registered_products_customer_idx`, `claims_customer_date_idx` for owner-specific listings.
- `claims_status_date_idx` for officer case queues.
- `chunks_embedding_hnsw_idx` for approximate nearest-neighbor search using cosine distance.
- `chunks_metadata_gin_idx` for JSONB metadata predicate evaluation.
- `semantic_matches_claim_idx` for rank-ordered claim evidence display.
- `audit_event_entity_idx` for case history.

## Advanced SQL features mapped to demonstrations

1. **Transactions:** product + warranty registration through a stored function; claim + evidence submission via backend transaction; policy + chunks ingestion; smoke tests verify rollback.
2. **Triggers:** manufacturer match, claim ownership, officer role, decision-to-status+repair, repair transitions, audit events.
3. **Stored functions / PL/pgSQL:** `register_warranty`, `validate_warranty`, `validate_claim_ownership`, `apply_claim_decision`, others.
4. **Views:** `v_claim_overview`, `v_policy_inventory`, `v_claim_status_summary`.
5. **Indexing:** compound B-tree, functional unique, GIN JSONB, HNSW vector.
6. **Vector similarity:** normalized MiniLM embeddings, pgvector `<=>` cosine distance, top-k rank with policy-level filtering.

## Integrity limitations

Eligibility is computed using the claim submission date in `v_claim_overview`, not the date on which an officer happens to review it. The registered warranty end date is inclusive (`purchase date + coverage months - 1 day`). Customer ownership and manufacturer matching are enforced when claims/warranties are written. A production implementation would also restrict privileged direct SQL access, apply formal versioning and handle ownership transfers explicitly.

## Lifecycle integrity (migration 003)

`trg_enforce_claim_state_transition` prevents direct SQL updates from bypassing
assignment and recorded decisions: `submitted → in_review` needs a claim
assignment, and `in_review → approved/rejected` needs a corresponding decision
by the assigned officer. No other status transitions are accepted. The initial
claim identity, original issue and submission timestamp cannot be silently
rewritten. Final decisions and audit events are append-only through BEFORE
UPDATE/DELETE triggers. The same migration validates that a stored semantic match belongs to the precise warranty policy of its claim, prohibiting cross-policy evidence leakage. These constraints are exercised by negative SQL tests
in `scripts/db-smoke.ts` using savepoints and an enclosing rollback.


## Temporal and officer assignment integrity (migration 004)

`v_claim_overview.within_warranty_period` compares the claim submission date with the warranty start/end dates, rather than checking the current date (which would change historic eligibility over time). `register_warranty` calculates the inclusive coverage end date. `trg_enforce_assignment_integrity` permits the first officer assignment only while a claim is `submitted` and forbids subsequent updates or deletes to preserve review history. Tests are included in the transactional `db:smoke` script and passed in the local PostgreSQL audit on 22 October 2026.


## Audit integrity additions (005 and 006)

Migration 005 preserves warranted product facts, claim warranty facts, referenced manufacturer/policy/source relationships, and retrieved passage content. It requires an active deciding officer, an approved recorded decision and initially open repair, and protects repair identity/history.

Migration 006 enforces policy effective dates, warranty start/purchase agreement, inclusive end dates and active-customer product registration even for direct SQL. The 38 added rollback checks, original smoke suite and ten live consistency queries passed. See [AUDIT_RESULTS.md](AUDIT_RESULTS.md) for evidence and limits.

One original demo expiry was corrected only after explicit owner approval; all other original fields are unchanged. The correction has its own audit entry and private pre-audit baseline.
