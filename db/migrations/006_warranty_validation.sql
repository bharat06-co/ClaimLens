-- Validate policy applicability and the calendar facts even for direct SQL.
-- Does not rewrite existing rows.
CREATE OR REPLACE FUNCTION validate_warranty() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_manufacturer uuid; policy_manufacturer uuid; purchase date;
        effective date; months integer;
BEGIN
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

CREATE FUNCTION validate_registered_customer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM app_users WHERE id=NEW.customer_id AND role='customer' AND is_active) THEN
  RAISE EXCEPTION 'Registered product requires an active customer';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_registered_customer BEFORE INSERT OR UPDATE OF customer_id ON registered_products
 FOR EACH ROW EXECUTE FUNCTION validate_registered_customer();
