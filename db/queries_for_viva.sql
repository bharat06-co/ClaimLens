-- CLAIMLENS: query demonstration. Run after migration + seed.
-- 1. JOIN across customer, product, warranty, claim and assigned officer.
SELECT id,customer_name,manufacturer_name,model_name,serial_number,
       status,within_warranty_period,assigned_officer
FROM v_claim_overview ORDER BY submitted_at DESC LIMIT 20;

-- 2. GROUP BY + HAVING + ORDER BY + aggregate functions.
SELECT m.name AS manufacturer, COUNT(c.id) AS claims_count,
       COUNT(c.id) FILTER (WHERE c.status='approved') AS approved_count
FROM manufacturers m JOIN product_models pm ON pm.manufacturer_id=m.id
JOIN registered_products rp ON rp.model_id=pm.id
JOIN warranties w ON w.product_id=rp.id
JOIN warranty_claims c ON c.warranty_id=w.id
GROUP BY m.name HAVING COUNT(c.id)>=1 ORDER BY claims_count DESC;

-- 3. Correlated subquery showing claim evidence count.
SELECT c.id, c.status,
 (SELECT COUNT(*) FROM claim_evidence ev WHERE ev.claim_id=c.id) AS evidence_count
FROM warranty_claims c ORDER BY c.submitted_at DESC;

-- 4. Views: dashboard by status.
SELECT * FROM v_claim_status_summary ORDER BY total DESC;

-- 5. GIN jsonb containment index example.
SELECT id,content FROM document_chunks
WHERE metadata @> '{"model":"all-MiniLM-L6-v2"}'::jsonb LIMIT 5;

-- 6. Cosine nearest neighbors. Replace :query_vector with an actual
-- 384-element pgvector literal created by the embedding model.
-- SELECT ch.content, 1-(ch.embedding <=> :query_vector::vector) AS similarity
-- FROM document_chunks ch JOIN policy_documents d ON d.id=ch.document_id
-- WHERE d.policy_id=:policy_uuid
-- ORDER BY ch.embedding <=> :query_vector::vector LIMIT 5;

-- 7. DDL exercise: demonstrates CREATE/ALTER/DROP without damaging real tables.
BEGIN;
CREATE TEMP TABLE ddl_demonstration (id integer PRIMARY KEY, description text);
ALTER TABLE ddl_demonstration ADD COLUMN created_on date DEFAULT CURRENT_DATE;
INSERT INTO ddl_demonstration (id,description) VALUES (1,'Temporary DDL exercise');
UPDATE ddl_demonstration SET description='Updated using DML' WHERE id=1;
DELETE FROM ddl_demonstration WHERE id=1;
DROP TABLE ddl_demonstration;
ROLLBACK;

-- 8. EXPLAIN demonstrates the index/retrieval plan. Replace the expression
-- with a real query vector and analyze according to database size.
-- EXPLAIN (ANALYZE,BUFFERS) SELECT id FROM document_chunks ORDER BY embedding <=> :query_vector::vector LIMIT 5;
