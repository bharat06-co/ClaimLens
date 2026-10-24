-- REVIEW ONLY: do not execute without the owner's explicit permission.
-- Corrects the single pre-audit demo warranty issued under the older expiry
-- calculation. No records are deleted and the existing claim is unaffected.
BEGIN;
SET LOCAL lock_timeout='5s';
LOCK TABLE warranties IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE warranties DISABLE TRIGGER trg_preserve_claim_warranty;
DO $$
DECLARE changed integer;
BEGIN
 UPDATE warranties SET end_date='2028-02-14'
 WHERE id='0c87ea1e-bfe0-48c0-9b29-ca66706dd0f2'
   AND start_date='2026-02-15' AND end_date='2028-02-15';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed<>1 THEN RAISE EXCEPTION 'Expected exactly one unchanged legacy warranty; aborting'; END IF;
 INSERT INTO audit_events(event_type,entity_id,details)
 VALUES('warranty_date_corrected','0c87ea1e-bfe0-48c0-9b29-ca66706dd0f2',
  '{"old_end_date":"2028-02-15","new_end_date":"2028-02-14","reason":"Owner-approved correction of pre-audit inclusive-expiry defect"}');
END $$;
ALTER TABLE warranties ENABLE TRIGGER trg_preserve_claim_warranty;
COMMIT;
