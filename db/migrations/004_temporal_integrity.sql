-- A claim's date eligibility must be evaluated when it was submitted.
-- Evaluating against CURRENT_DATE would incorrectly mark a historically timely
-- claim as out of warranty once its coverage expires during later review.
CREATE OR REPLACE VIEW v_claim_overview AS
SELECT c.id,c.customer_id, u.full_name AS customer_name,c.issue_description,c.status,
 c.submitted_at,c.updated_at,rp.serial_number,pm.model_name,m.name AS manufacturer_name,
 w.start_date,w.end_date,w.is_void,
 (c.submitted_at::date BETWEEN w.start_date AND w.end_date AND NOT w.is_void) AS within_warranty_period,
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

-- Treat warranty end_date as inclusive. A 12-month warranty purchased on
-- 2026-03-10 is eligible through 2027-03-09, not a day longer.
CREATE OR REPLACE FUNCTION register_warranty(
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
 VALUES(new_product,p_policy,p_purchase_date,(p_purchase_date + make_interval(months => months))::date - 1)
 RETURNING id INTO new_warranty;
 RETURN new_warranty;
END $$;

-- Assignment is a single historical operation, not a mutable field. Allow
-- initial assignment only for a submitted claim, prevent reassignment/deletion
-- that would contradict recorded officer decisions and audit history.
CREATE FUNCTION enforce_assignment_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status claim_state;
BEGIN
 IF TG_OP <> 'INSERT' THEN
  RAISE EXCEPTION 'Claim assignment is immutable';
 END IF;
 SELECT status INTO v_status FROM warranty_claims WHERE id = NEW.claim_id FOR UPDATE;
 IF v_status IS DISTINCT FROM 'submitted' THEN
  RAISE EXCEPTION 'Only submitted claims may be assigned';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_enforce_assignment_integrity
 BEFORE INSERT OR UPDATE OR DELETE ON claim_assignments
 FOR EACH ROW EXECUTE FUNCTION enforce_assignment_integrity();
