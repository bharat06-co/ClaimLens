-- Enforce the claim state machine in PostgreSQL as well as in the API.
-- Otherwise a direct UPDATE could mark a submitted claim as approved without
-- either assigning a claim officer or inserting a traceable decision.
CREATE FUNCTION enforce_claim_state_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN
  IF NEW.status <> 'submitted' THEN
   RAISE EXCEPTION 'New claims must begin in submitted state';
  END IF;
  RETURN NEW;
 END IF;

 -- Identity and issue description are historical claim facts, not editable
 -- after submission. An officer decision is instead recorded in a new row.
 IF NEW.warranty_id IS DISTINCT FROM OLD.warranty_id OR
    NEW.customer_id IS DISTINCT FROM OLD.customer_id OR
    NEW.issue_description IS DISTINCT FROM OLD.issue_description OR
    NEW.submitted_at IS DISTINCT FROM OLD.submitted_at THEN
  RAISE EXCEPTION 'Submitted claim facts cannot be rewritten';
 END IF;

 IF NEW.status = OLD.status THEN RETURN NEW; END IF;
 IF OLD.status = 'submitted' AND NEW.status = 'in_review' THEN
  IF NOT EXISTS (SELECT 1 FROM claim_assignments a WHERE a.claim_id = NEW.id) THEN
   RAISE EXCEPTION 'Claim must be assigned before entering review';
  END IF;
 ELSIF OLD.status = 'in_review' AND NEW.status IN ('approved','rejected') THEN
  IF NOT EXISTS (
   SELECT 1 FROM claim_decisions d
   JOIN claim_assignments a ON a.claim_id = d.claim_id
   WHERE d.claim_id = NEW.id AND d.officer_id = a.officer_id
     AND d.verdict::text = NEW.status::text
  ) THEN
   RAISE EXCEPTION 'Final claim status requires a matching recorded decision';
  END IF;
 ELSE
  RAISE EXCEPTION 'Invalid claim status transition: % to %', OLD.status,NEW.status;
 END IF;
 NEW.updated_at = now();
 RETURN NEW;
END $$;

CREATE TRIGGER trg_enforce_claim_state_transition
 BEFORE INSERT OR UPDATE ON warranty_claims
 FOR EACH ROW EXECUTE FUNCTION enforce_claim_state_transition();

-- Decisions are append-only. A correction must be handled through a separately
-- designed appeal/review process, not silently by editing decision history.
CREATE FUNCTION prevent_final_decision_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Final claim decisions are immutable';
END $$;
CREATE TRIGGER trg_prevent_final_decision_rewrite
 BEFORE UPDATE OR DELETE ON claim_decisions
 FOR EACH ROW EXECUTE FUNCTION prevent_final_decision_rewrite();

-- Audit records are append-only so routine application operations cannot
-- replace history after the fact.
CREATE FUNCTION prevent_audit_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Audit events are immutable';
END $$;
CREATE TRIGGER trg_prevent_audit_rewrite
 BEFORE UPDATE OR DELETE ON audit_events
 FOR EACH ROW EXECUTE FUNCTION prevent_audit_rewrite();

-- Semantic evidence must come from the SAME policy that governs the claim.
-- This prevents a vector match from an unrelated manufacturer/policy being
-- stored as apparent supporting evidence, even by a direct SQL INSERT.
CREATE FUNCTION validate_semantic_match_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM warranty_claims c
  JOIN warranties w ON w.id = c.warranty_id
  JOIN policy_documents d ON d.policy_id = w.policy_id
  JOIN document_chunks ch ON ch.document_id = d.id
  WHERE c.id = NEW.claim_id AND ch.id = NEW.chunk_id
 ) THEN
  RAISE EXCEPTION 'Semantic match must reference a chunk from the claim policy';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_semantic_match_scope
 BEFORE INSERT OR UPDATE OF claim_id,chunk_id ON semantic_matches
 FOR EACH ROW EXECUTE FUNCTION validate_semantic_match_scope();
