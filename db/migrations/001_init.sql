-- CLAIMLENS: PostgreSQL relational schema + pgvector semantic retrieval.
-- SQL concepts: DDL, PK/FK, CHECK, UNIQUE, functional indexes, HNSW,
-- views, PL/pgSQL functions, triggers, ACID transactions, and audit logging.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TYPE account_role AS ENUM ('customer','officer');
CREATE TYPE claim_state AS ENUM ('submitted','in_review','approved','rejected');
CREATE TYPE rule_kind AS ENUM ('coverage','exclusion','condition');
CREATE TYPE verdict_kind AS ENUM ('approved','rejected');
CREATE TYPE repair_state AS ENUM ('open','in_progress','completed','cancelled');

CREATE TABLE app_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 full_name text NOT NULL CHECK(length(trim(full_name)) BETWEEN 2 AND 120),
 email text NOT NULL,
 password_hash text NOT NULL,
 role account_role NOT NULL DEFAULT 'customer',
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT email_form CHECK(email ~* '^[^ @]+@[^ @]+\.[^ @]+$')
);
CREATE UNIQUE INDEX users_unique_lower_email ON app_users (lower(email));

CREATE TABLE manufacturers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL UNIQUE CHECK(length(trim(name)) >= 2)
);
CREATE TABLE product_models (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 manufacturer_id uuid NOT NULL REFERENCES manufacturers(id) ON DELETE RESTRICT,
 model_name text NOT NULL,
 category text NOT NULL,
 default_warranty_months integer NOT NULL CHECK(default_warranty_months BETWEEN 1 AND 120),
 UNIQUE(manufacturer_id,model_name)
);
CREATE TABLE registered_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 customer_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 model_id uuid NOT NULL REFERENCES product_models(id) ON DELETE RESTRICT,
 serial_number text NOT NULL UNIQUE CHECK(length(trim(serial_number)) BETWEEN 5 AND 100),
 purchased_on date NOT NULL CHECK(purchased_on <= CURRENT_DATE),
 registered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX registered_products_customer_idx ON registered_products(customer_id);

CREATE TABLE warranty_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 manufacturer_id uuid NOT NULL REFERENCES manufacturers(id) ON DELETE RESTRICT,
 title text NOT NULL,
 version text NOT NULL,
 coverage_months integer NOT NULL CHECK(coverage_months BETWEEN 1 AND 120),
 effective_from date NOT NULL,
 UNIQUE(manufacturer_id,title,version)
);
CREATE TABLE policy_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 policy_id uuid NOT NULL REFERENCES warranty_policies(id) ON DELETE CASCADE,
 kind rule_kind NOT NULL,
 description text NOT NULL CHECK(length(trim(description)) >= 10),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX policy_rules_policy_idx ON policy_rules(policy_id);
CREATE TABLE warranties (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product_id uuid NOT NULL UNIQUE REFERENCES registered_products(id) ON DELETE RESTRICT,
 policy_id uuid NOT NULL REFERENCES warranty_policies(id) ON DELETE RESTRICT,
 start_date date NOT NULL,
 end_date date NOT NULL,
 is_void boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_date >= start_date)
);
CREATE INDEX warranties_policy_idx ON warranties(policy_id);

CREATE TABLE warranty_claims (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 warranty_id uuid NOT NULL REFERENCES warranties(id) ON DELETE RESTRICT,
 customer_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 issue_description text NOT NULL CHECK(length(trim(issue_description)) BETWEEN 15 AND 3000),
 status claim_state NOT NULL DEFAULT 'submitted',
 submitted_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX claims_status_date_idx ON warranty_claims(status,submitted_at DESC);
CREATE INDEX claims_customer_date_idx ON warranty_claims(customer_id,submitted_at DESC);
CREATE TABLE claim_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 claim_id uuid NOT NULL REFERENCES warranty_claims(id) ON DELETE CASCADE,
 evidence_url text NOT NULL CHECK(evidence_url ~ '^https?://'),
 evidence_type text NOT NULL DEFAULT 'supporting_link',
 note text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE claim_assignments (
 claim_id uuid PRIMARY KEY REFERENCES warranty_claims(id) ON DELETE CASCADE,
 officer_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 assigned_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX assignments_officer_idx ON claim_assignments(officer_id);
CREATE TABLE claim_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 claim_id uuid NOT NULL UNIQUE REFERENCES warranty_claims(id) ON DELETE RESTRICT,
 officer_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 verdict verdict_kind NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 20 AND 3000),
 decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE repair_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 claim_id uuid NOT NULL UNIQUE REFERENCES warranty_claims(id) ON DELETE RESTRICT,
 service_center text,
 status repair_state NOT NULL DEFAULT 'open',
 notes text,
 opened_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 event_type text NOT NULL,
 entity_id uuid NOT NULL,
 actor_id uuid REFERENCES app_users(id) ON DELETE SET NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_event_entity_idx ON audit_events(entity_id,occurred_at DESC);

CREATE TABLE policy_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 policy_id uuid NOT NULL REFERENCES warranty_policies(id) ON DELETE CASCADE,
 title text NOT NULL,
 document_type text NOT NULL DEFAULT 'warranty_terms',
 original_text text NOT NULL CHECK(length(trim(original_text)) >= 50),
 sha256 text NOT NULL CHECK(length(sha256) = 64),
 uploaded_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(policy_id,sha256)
);
CREATE TABLE document_chunks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 document_id uuid NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
 chunk_number integer NOT NULL CHECK(chunk_number >= 0),
 content text NOT NULL CHECK(length(trim(content)) > 0),
 embedding vector(384) NOT NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(document_id,chunk_number)
);
CREATE INDEX chunks_document_idx ON document_chunks(document_id);
CREATE INDEX chunks_embedding_hnsw_idx ON document_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX chunks_metadata_gin_idx ON document_chunks USING gin (metadata);
CREATE TABLE semantic_matches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 claim_id uuid NOT NULL REFERENCES warranty_claims(id) ON DELETE CASCADE,
 chunk_id uuid NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
 similarity_score double precision NOT NULL CHECK(similarity_score BETWEEN 0 AND 1),
 result_rank integer NOT NULL CHECK(result_rank > 0),
 retrieved_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(claim_id,chunk_id), UNIQUE(claim_id,result_rank)
);
CREATE INDEX semantic_matches_claim_idx ON semantic_matches(claim_id,result_rank);

-- DB integrity: warranty policy must belong to the registered model's manufacturer.
CREATE FUNCTION validate_warranty() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_manufacturer uuid; policy_manufacturer uuid;
BEGIN
 SELECT pm.manufacturer_id INTO owner_manufacturer
 FROM registered_products rp JOIN product_models pm ON pm.id = rp.model_id
 WHERE rp.id = NEW.product_id;
 SELECT manufacturer_id INTO policy_manufacturer FROM warranty_policies WHERE id = NEW.policy_id;
 IF owner_manufacturer IS DISTINCT FROM policy_manufacturer THEN
  RAISE EXCEPTION 'Warranty policy manufacturer differs from the product manufacturer';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_warranty BEFORE INSERT OR UPDATE ON warranties
 FOR EACH ROW EXECUTE FUNCTION validate_warranty();

-- DB integrity: claim customer must own the product covered by its warranty.
CREATE FUNCTION validate_claim_ownership() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actual_owner uuid;
BEGIN
 SELECT rp.customer_id INTO actual_owner FROM warranties w
 JOIN registered_products rp ON rp.id = w.product_id WHERE w.id = NEW.warranty_id;
 IF actual_owner IS DISTINCT FROM NEW.customer_id THEN
  RAISE EXCEPTION 'Claim customer does not own the warranted product';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_claim_ownership BEFORE INSERT OR UPDATE OF warranty_id,customer_id ON warranty_claims
 FOR EACH ROW EXECUTE FUNCTION validate_claim_ownership();

-- Every assignment must designate an active officer.
CREATE FUNCTION validate_officer_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_users WHERE id = NEW.officer_id AND role = 'officer' AND is_active) THEN
  RAISE EXCEPTION 'Assigned user is not an active officer';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_officer_assignment BEFORE INSERT OR UPDATE ON claim_assignments
 FOR EACH ROW EXECUTE FUNCTION validate_officer_assignment();

-- DB-owned decision workflow: assignment, status transition and repair order are atomic.
CREATE FUNCTION apply_claim_decision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE assigned_officer uuid; claim_status claim_state;
BEGIN
 SELECT officer_id INTO assigned_officer FROM claim_assignments WHERE claim_id = NEW.claim_id;
 SELECT status INTO claim_status FROM warranty_claims WHERE id = NEW.claim_id FOR UPDATE;
 IF assigned_officer IS DISTINCT FROM NEW.officer_id OR claim_status <> 'in_review' THEN
  RAISE EXCEPTION 'Only the assigned officer may decide an in-review claim';
 END IF;
 UPDATE warranty_claims SET status = NEW.verdict::text::claim_state,updated_at = now() WHERE id = NEW.claim_id;
 IF NEW.verdict = 'approved' THEN
  INSERT INTO repair_orders(claim_id,notes) VALUES (NEW.claim_id,'Created automatically following approval');
 END IF;
 INSERT INTO audit_events(event_type,entity_id,actor_id,details)
 VALUES('claim_decision',NEW.claim_id,NEW.officer_id,
   jsonb_build_object('verdict',NEW.verdict,'reason',NEW.reason));
 RETURN NEW;
END $$;
CREATE TRIGGER trg_apply_claim_decision AFTER INSERT ON claim_decisions
 FOR EACH ROW EXECUTE FUNCTION apply_claim_decision();

CREATE FUNCTION audit_new_claim() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO audit_events(event_type,entity_id,actor_id,details)
 VALUES('claim_submitted',NEW.id,NEW.customer_id,jsonb_build_object('warranty_id',NEW.warranty_id));
 RETURN NEW;
END $$;
CREATE TRIGGER trg_audit_new_claim AFTER INSERT ON warranty_claims
 FOR EACH ROW EXECUTE FUNCTION audit_new_claim();

-- Demonstrates JOIN, derived state, aggregates in a single officer/customer projection.
CREATE VIEW v_claim_overview AS
SELECT c.id,c.customer_id, u.full_name AS customer_name,c.issue_description,c.status,
 c.submitted_at,c.updated_at,rp.serial_number,pm.model_name,m.name AS manufacturer_name,
 w.start_date,w.end_date,w.is_void,
 (CURRENT_DATE BETWEEN w.start_date AND w.end_date AND NOT w.is_void) AS within_warranty_period,
 ca.officer_id, off.full_name AS assigned_officer,
 d.verdict,d.reason AS decision_reason,
 (SELECT count(*) FROM claim_evidence ev WHERE ev.claim_id=c.id) AS evidence_count
FROM warranty_claims c
JOIN app_users u ON u.id=c.customer_id
JOIN warranties w ON w.id=c.warranty_id
JOIN registered_products rp ON rp.id=w.product_id
JOIN product_models pm ON pm.id=rp.model_id
JOIN manufacturers m ON m.id=pm.manufacturer_id
LEFT JOIN claim_assignments ca ON ca.claim_id=c.id
LEFT JOIN app_users off ON off.id=ca.officer_id
LEFT JOIN claim_decisions d ON d.claim_id=c.id;

CREATE VIEW v_policy_inventory AS
SELECT p.id,p.title,p.version,m.name AS manufacturer_name,
 COUNT(DISTINCT doc.id)::int AS document_count,
 COUNT(ch.id)::int AS chunk_count
FROM warranty_policies p
JOIN manufacturers m ON m.id=p.manufacturer_id
LEFT JOIN policy_documents doc ON doc.policy_id=p.id
LEFT JOIN document_chunks ch ON ch.document_id=doc.id
GROUP BY p.id,p.title,p.version,m.name;

-- A queryable SQL stored function demonstrating ownership/eligibility safeguards.
CREATE FUNCTION register_warranty(
 p_customer uuid,p_model uuid,p_serial text,p_purchase_date date,p_policy uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE new_product uuid; new_warranty uuid; months integer;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM app_users WHERE id=p_customer AND role='customer' AND is_active) THEN
  RAISE EXCEPTION 'Valid customer required';
 END IF;
 IF p_purchase_date > CURRENT_DATE THEN RAISE EXCEPTION 'Purchase date cannot be in the future'; END IF;
 SELECT coverage_months INTO months FROM warranty_policies WHERE id=p_policy;
 IF months IS NULL THEN RAISE EXCEPTION 'Policy not found'; END IF;
 INSERT INTO registered_products(customer_id,model_id,serial_number,purchased_on)
 VALUES(p_customer,p_model,trim(p_serial),p_purchase_date) RETURNING id INTO new_product;
 INSERT INTO warranties(product_id,policy_id,start_date,end_date)
 VALUES(new_product,p_policy,p_purchase_date,(p_purchase_date + make_interval(months => months))::date)
 RETURNING id INTO new_warranty;
 RETURN new_warranty;
END $$;
COMMIT;
