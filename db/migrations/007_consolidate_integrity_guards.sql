-- CLAIMLENS DBMS refactor — REVIEW COPY ONLY.
-- Builds on the audited migrations 001–006 without changing any table, column,
-- index, view, API query, stored warranty-registration function or existing row.
-- Reuses the same PostgreSQL-side invariants with fewer runtime trigger routines.
-- The migration runner wraps this file in one transaction.

-- 1. A claim assignment has one database guard, not two separate guards.
--    Same immutable-assignment and active-officer checks/error messages.
CREATE OR REPLACE FUNCTION enforce_assignment_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_status claim_state;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  RAISE EXCEPTION 'Claim assignment is immutable';
 END IF;
 SELECT status INTO v_status FROM warranty_claims WHERE id = NEW.claim_id FOR UPDATE;
 IF v_status IS DISTINCT FROM 'submitted' THEN
  RAISE EXCEPTION 'Only submitted claims may be assigned';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM app_users WHERE id=NEW.officer_id AND role='officer' AND is_active) THEN
  RAISE EXCEPTION 'Assigned user is not an active officer';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER trg_validate_officer_assignment ON claim_assignments;
DROP FUNCTION validate_officer_assignment();

-- 2. Preserve BOTH original decision functions and trigger bindings unchanged.
--    trg_validate_deciding_officer remains BEFORE INSERT, so authorization
--    precedes CHECK/UNIQUE handling and runs even with ON CONFLICT DO NOTHING.
--    trg_apply_claim_decision remains AFTER INSERT for atomic workflow effects.
--    Do not replace either function or drop the BEFORE trigger in this migration.

-- 3. Warranty date/manufacturer validation now also protects referenced
--    warranty facts. The former pre-update preservation guard is folded in.
CREATE OR REPLACE FUNCTION validate_warranty() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE owner_manufacturer uuid; policy_manufacturer uuid; purchase date;
        effective date; months integer;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF (NEW.id,NEW.product_id,NEW.policy_id,NEW.start_date,NEW.end_date,NEW.created_at)
     IS DISTINCT FROM
     (OLD.id,OLD.product_id,OLD.policy_id,OLD.start_date,OLD.end_date,OLD.created_at)
     AND EXISTS(SELECT 1 FROM warranty_claims WHERE warranty_id=OLD.id) THEN
   RAISE EXCEPTION 'Claim warranty facts are immutable';
  END IF;
 END IF;
 SELECT pm.manufacturer_id,rp.purchased_on INTO owner_manufacturer,purchase
 FROM registered_products rp JOIN product_models pm ON pm.id=rp.model_id WHERE rp.id=NEW.product_id;
 SELECT manufacturer_id,effective_from,coverage_months INTO policy_manufacturer,effective,months
 FROM warranty_policies WHERE id=NEW.policy_id;
 IF owner_manufacturer IS DISTINCT FROM policy_manufacturer THEN
  RAISE EXCEPTION 'Warranty policy manufacturer differs from the product manufacturer';
 END IF;
 IF purchase<effective THEN RAISE EXCEPTION 'Policy was not effective on the purchase date'; END IF;
 IF NEW.start_date IS DISTINCT FROM purchase
    OR NEW.end_date IS DISTINCT FROM ((purchase+make_interval(months=>months))::date-1) THEN
  RAISE EXCEPTION 'Warranty dates must match the purchase and inclusive policy coverage';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER trg_preserve_claim_warranty ON warranties;
DROP FUNCTION preserve_claim_warranty();

-- 4. Repair lifecycle and historical integrity now share the existing
--    integrity trigger. The AFTER UPDATE audit trigger remains independent.
CREATE OR REPLACE FUNCTION enforce_repair_integrity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Repair orders must be retained; cancel instead';
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status <> 'open' OR NOT EXISTS (
   SELECT 1 FROM warranty_claims c JOIN claim_decisions d ON d.claim_id=c.id
   WHERE c.id=NEW.claim_id AND c.status='approved' AND d.verdict='approved'
  ) THEN
   RAISE EXCEPTION 'A repair must start open for an approved, decided claim';
  END IF;
 ELSE
  IF OLD.status IS DISTINCT FROM NEW.status THEN
   IF NOT (
    (OLD.status='open' AND NEW.status IN ('in_progress','cancelled')) OR
    (OLD.status='in_progress' AND NEW.status IN ('completed','cancelled'))
   ) THEN
    RAISE EXCEPTION 'Invalid repair order status transition: % to %',OLD.status,NEW.status;
   END IF;
   NEW.updated_at=now();
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.claim_id IS DISTINCT FROM OLD.claim_id
     OR NEW.opened_at IS DISTINCT FROM OLD.opened_at THEN
   RAISE EXCEPTION 'Repair order identity and claim are immutable';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER trg_check_repair_transition ON repair_orders;
DROP FUNCTION check_repair_transition();

-- 5. Both append-only tables share the same trigger function. Each table
--    still raises its original, distinct error message on UPDATE or DELETE.
CREATE FUNCTION prevent_history_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='claim_decisions' THEN
  RAISE EXCEPTION 'Final claim decisions are immutable';
 ELSIF TG_TABLE_NAME='audit_events' THEN
  RAISE EXCEPTION 'Audit events are immutable';
 END IF;
 RAISE EXCEPTION 'History table mutation is not permitted';
END $$;
DROP TRIGGER trg_prevent_final_decision_rewrite ON claim_decisions;
DROP TRIGGER trg_prevent_audit_rewrite ON audit_events;
CREATE TRIGGER trg_prevent_final_decision_rewrite
 BEFORE UPDATE OR DELETE ON claim_decisions
 FOR EACH ROW EXECUTE FUNCTION prevent_history_rewrite();
CREATE TRIGGER trg_prevent_audit_rewrite
 BEFORE UPDATE OR DELETE ON audit_events
 FOR EACH ROW EXECUTE FUNCTION prevent_history_rewrite();
DROP FUNCTION prevent_final_decision_rewrite();
DROP FUNCTION prevent_audit_rewrite();
