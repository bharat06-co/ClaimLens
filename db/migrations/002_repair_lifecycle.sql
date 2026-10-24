-- Repair life cycle is deliberately enforced in PostgreSQL, not only in the UI.
CREATE FUNCTION check_repair_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status = NEW.status THEN RETURN NEW; END IF;
 IF NOT (
  (OLD.status = 'open' AND NEW.status IN ('in_progress','cancelled')) OR
  (OLD.status = 'in_progress' AND NEW.status IN ('completed','cancelled'))
 ) THEN
  RAISE EXCEPTION 'Invalid repair order status transition: % to %',OLD.status,NEW.status;
 END IF;
 NEW.updated_at = now();
 RETURN NEW;
END $$;
CREATE TRIGGER trg_check_repair_transition BEFORE UPDATE OF status ON repair_orders
FOR EACH ROW EXECUTE FUNCTION check_repair_transition();

CREATE FUNCTION audit_repair_transition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_actor uuid;
BEGIN
 SELECT officer_id INTO v_actor FROM claim_assignments WHERE claim_id=NEW.claim_id;
 INSERT INTO audit_events(event_type,entity_id,actor_id,details)
 VALUES('repair_status_changed',NEW.claim_id,v_actor,
 jsonb_build_object('from',OLD.status,'to',NEW.status));
 RETURN NEW;
END $$;
CREATE TRIGGER trg_audit_repair_transition AFTER UPDATE OF status ON repair_orders
FOR EACH ROW WHEN (OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION audit_repair_transition();

CREATE VIEW v_claim_status_summary AS
SELECT status, COUNT(*)::int AS total,
 COUNT(*) FILTER (WHERE submitted_at >= now() - interval '30 days')::int AS submitted_last_30_days
FROM warranty_claims GROUP BY status;
