-- Additive guards: no existing records are rewritten or deleted.
CREATE FUNCTION enforce_repair_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Repair orders must be retained; cancel instead'; END IF;
 IF TG_OP = 'INSERT' THEN
  IF NEW.status <> 'open' OR NOT EXISTS (
   SELECT 1 FROM warranty_claims c JOIN claim_decisions d ON d.claim_id=c.id
   WHERE c.id=NEW.claim_id AND c.status='approved' AND d.verdict='approved'
  ) THEN RAISE EXCEPTION 'A repair must start open for an approved, decided claim'; END IF;
 ELSIF NEW.id IS DISTINCT FROM OLD.id OR NEW.claim_id IS DISTINCT FROM OLD.claim_id
    OR NEW.opened_at IS DISTINCT FROM OLD.opened_at THEN
  RAISE EXCEPTION 'Repair order identity and claim are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_enforce_repair_integrity BEFORE INSERT OR UPDATE OR DELETE ON repair_orders
 FOR EACH ROW EXECUTE FUNCTION enforce_repair_integrity();

CREATE FUNCTION preserve_registered_product() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.customer_id,NEW.model_id,NEW.serial_number,NEW.purchased_on,NEW.registered_at)
    IS DISTINCT FROM
    (OLD.id,OLD.customer_id,OLD.model_id,OLD.serial_number,OLD.purchased_on,OLD.registered_at)
    AND EXISTS(SELECT 1 FROM warranties WHERE product_id=OLD.id) THEN
  RAISE EXCEPTION 'Warranted product facts are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_preserve_registered_product BEFORE UPDATE ON registered_products
 FOR EACH ROW EXECUTE FUNCTION preserve_registered_product();

CREATE FUNCTION preserve_claim_warranty() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.product_id,NEW.policy_id,NEW.start_date,NEW.end_date,NEW.created_at)
    IS DISTINCT FROM
    (OLD.id,OLD.product_id,OLD.policy_id,OLD.start_date,OLD.end_date,OLD.created_at)
    AND EXISTS(SELECT 1 FROM warranty_claims WHERE warranty_id=OLD.id) THEN
  RAISE EXCEPTION 'Claim warranty facts are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_preserve_claim_warranty BEFORE UPDATE ON warranties
 FOR EACH ROW EXECUTE FUNCTION preserve_claim_warranty();

CREATE FUNCTION preserve_model_manufacturer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.manufacturer_id IS DISTINCT FROM OLD.manufacturer_id
    AND EXISTS(SELECT 1 FROM registered_products WHERE model_id=OLD.id) THEN
  RAISE EXCEPTION 'Registered model manufacturer is immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_preserve_model_manufacturer BEFORE UPDATE ON product_models
 FOR EACH ROW EXECUTE FUNCTION preserve_model_manufacturer();

CREATE FUNCTION preserve_policy_terms() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.manufacturer_id,NEW.coverage_months,NEW.effective_from,NEW.version)
    IS DISTINCT FROM (OLD.manufacturer_id,OLD.coverage_months,OLD.effective_from,OLD.version)
    AND (EXISTS(SELECT 1 FROM warranties WHERE policy_id=OLD.id)
      OR EXISTS(SELECT 1 FROM policy_documents WHERE policy_id=OLD.id)) THEN
  RAISE EXCEPTION 'Referenced policy terms are immutable; create a new version';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_preserve_policy_terms BEFORE UPDATE ON warranty_policies
 FOR EACH ROW EXECUTE FUNCTION preserve_policy_terms();

CREATE FUNCTION preserve_semantic_source() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='policy_documents' THEN
  IF (NEW.policy_id,NEW.original_text,NEW.sha256) IS DISTINCT FROM (OLD.policy_id,OLD.original_text,OLD.sha256)
     AND EXISTS(SELECT 1 FROM document_chunks WHERE document_id=OLD.id) THEN
   RAISE EXCEPTION 'Indexed policy document source is immutable';
  END IF;
 ELSE
  IF (NEW.document_id,NEW.chunk_number,NEW.content,NEW.embedding::text,NEW.metadata)
     IS DISTINCT FROM (OLD.document_id,OLD.chunk_number,OLD.content,OLD.embedding::text,OLD.metadata)
     AND EXISTS(SELECT 1 FROM semantic_matches WHERE chunk_id=OLD.id) THEN
   RAISE EXCEPTION 'Retrieved policy passage is immutable';
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_preserve_policy_document BEFORE UPDATE ON policy_documents
 FOR EACH ROW EXECUTE FUNCTION preserve_semantic_source();
CREATE TRIGGER trg_preserve_retrieved_chunk BEFORE UPDATE ON document_chunks
 FOR EACH ROW EXECUTE FUNCTION preserve_semantic_source();

CREATE FUNCTION validate_deciding_officer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_users WHERE id=NEW.officer_id AND role='officer' AND is_active) THEN
  RAISE EXCEPTION 'Decision requires an active officer';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_deciding_officer BEFORE INSERT ON claim_decisions
 FOR EACH ROW EXECUTE FUNCTION validate_deciding_officer();
