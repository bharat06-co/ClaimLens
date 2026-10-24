import 'dotenv/config';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

/** Execute real database assertions and rollback all test writes. No demo data is modified. */
async function main(){
 const db=new Pool({connectionString:process.env.DATABASE_URL});
 const client=await db.connect();
 try {
  const schema=await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename IN ('warranty_claims','document_chunks','semantic_matches','audit_events','repair_orders')`);
  assert.equal(schema.rowCount,5,'Required tables missing');
  const roles=await client.query(`SELECT role::text, COUNT(*) AS n FROM app_users GROUP BY role HAVING COUNT(*)>=1`);
  assert.equal(roles.rowCount,2,'A customer and an officer must be seeded');
  const embedding=await client.query(`SELECT vector_dims(embedding)::int AS dims,
    (embedding <=> embedding)::float8 AS self_distance FROM document_chunks LIMIT 1`);
  assert.equal(embedding.rows[0]?.dims,384,'Must have stored 384-dimensional embeddings');
  assert.ok(embedding.rows[0]?.self_distance < 0.00001,'Cosine distance to self must be zero');
  const sample=await client.query(`SELECT w.id AS warranty_id,rp.customer_id,
    (SELECT id FROM app_users WHERE role='officer' LIMIT 1) AS officer_id
    FROM warranties w JOIN registered_products rp ON rp.id=w.product_id LIMIT 1`);
  assert.ok(sample.rowCount,'Demo requires a registered warranty');
  const {warranty_id,customer_id,officer_id}=sample.rows[0];
  const policyReference=await client.query<{model_id:string;policy_id:string;coverage_months:number}>(
    `SELECT rp.model_id,w.policy_id,p.coverage_months FROM warranties w
     JOIN registered_products rp ON rp.id=w.product_id
     JOIN warranty_policies p ON p.id=w.policy_id WHERE w.id=$1`,[warranty_id]);
  const policySample=policyReference.rows[0];

  await client.query('BEGIN');
  try {
   // The stored registration function must generate the inclusive end date.
   const registered=await client.query<{id:string}>(
     `SELECT register_warranty($1,$2,$3,CURRENT_DATE,$4) AS id`,
     [customer_id,policySample.model_id,`SMOKE-${Date.now()}-${Math.random().toString(16).slice(2)}`,policySample.policy_id]);
   const temporal=await client.query<{valid:boolean}>(
     `SELECT end_date=((start_date + make_interval(months => $2::int))::date - 1) AS valid
      FROM warranties WHERE id=$1`,[registered.rows[0].id,policySample.coverage_months]);
   assert.equal(temporal.rows[0].valid,true,'Warranty end dates must be inclusive and not overrun by one day');

   // Negative test: database ownership trigger must reject a foreign claimant.
   await client.query('SAVEPOINT ownership_negative');
   try {
    await client.query(`INSERT INTO warranty_claims(warranty_id,customer_id,issue_description)
      VALUES($1,$2,'Invalid claim from a person who does not own this product')`,[warranty_id,officer_id]);
    assert.fail('Ownership trigger failed');
   }catch(e){
    assert.match(String(e),/Claim customer does not own/);
   }
   await client.query('ROLLBACK TO SAVEPOINT ownership_negative');
   await client.query('RELEASE SAVEPOINT ownership_negative');

   // Negative test: no direct bypass of the claim's submitted -> review transition.
   await client.query('SAVEPOINT unassigned_transition');
   try {
    const unassigned = await client.query<{id:string}>(`INSERT INTO warranty_claims
      (warranty_id,customer_id,issue_description)
      VALUES($1,$2,'Temporary sample demonstrating direct status update protection') RETURNING id`,
      [warranty_id,customer_id]);
    await client.query(`UPDATE warranty_claims SET status='in_review' WHERE id=$1`,[unassigned.rows[0].id]);
    assert.fail('Unassigned review transition was incorrectly accepted');
   } catch(e) {assert.match(String(e),/Claim must be assigned before entering review/);}
   await client.query('ROLLBACK TO SAVEPOINT unassigned_transition');
   await client.query('RELEASE SAVEPOINT unassigned_transition');

   // Positive test: claim audit, officer assignment, decision and repair creation.
   const inserted=await client.query<{id:string}>(`INSERT INTO warranty_claims
     (warranty_id,customer_id,issue_description)
     VALUES($1,$2,'Demonstration sample: internal display suddenly went blank during normal use') RETURNING id`,
     [warranty_id,customer_id]);
   const claimId=inserted.rows[0].id;
   // Verify a historically timely submission stays eligible after later expiry.
   const historicPolicy=await client.query<{id:string}>(`INSERT INTO warranty_policies
    (manufacturer_id,title,version,coverage_months,effective_from)
    SELECT manufacturer_id,$2,'smoke',1,CURRENT_DATE-365 FROM warranty_policies WHERE id=$1 RETURNING id`,
    [policySample.policy_id,`SMOKE historical ${Date.now()}`]);
   const historicWarranty=await client.query<{id:string}>(
    `SELECT register_warranty($1,$2,$3,CURRENT_DATE-40,$4) AS id`,
    [customer_id,policySample.model_id,`SMOKE-HIST-${Date.now()}`,historicPolicy.rows[0].id]);
   const historical=await client.query<{id:string}>(`INSERT INTO warranty_claims
    (warranty_id,customer_id,issue_description,submitted_at)
    VALUES($1,$2,'Historical synthetic issue: intermittent faults during covered operation',
       CURRENT_DATE - INTERVAL '20 days') RETURNING id`,[historicWarranty.rows[0].id,customer_id]);
   const historicalView=await client.query<{within_warranty_period:boolean}>(
      `SELECT within_warranty_period FROM v_claim_overview WHERE id=$1`,[historical.rows[0].id]);
   assert.equal(historicalView.rows[0].within_warranty_period,true,
     'Coverage must be evaluated at claim submission, not at later review');
   const initialAudit=await client.query(`SELECT 1 FROM audit_events
     WHERE entity_id=$1 AND event_type='claim_submitted'`,[claimId]);
   assert.equal(initialAudit.rowCount,1,'Claim submission trigger must produce audit');
   await client.query(`INSERT INTO claim_assignments(claim_id,officer_id) VALUES($1,$2)`,[claimId,officer_id]);
   await client.query(`UPDATE warranty_claims SET status='in_review' WHERE id=$1`,[claimId]);
   await client.query('SAVEPOINT rewrite_assignment');
   try {
    await client.query(`UPDATE claim_assignments SET officer_id=$2 WHERE claim_id=$1`,[claimId,officer_id]);
    assert.fail('Historical assignment was incorrectly mutable');
   } catch(e) {assert.match(String(e),/Claim assignment is immutable/);}
   await client.query('ROLLBACK TO SAVEPOINT rewrite_assignment');
   await client.query('RELEASE SAVEPOINT rewrite_assignment');
   await client.query('SAVEPOINT premature_decision');
   try {
    await client.query(`UPDATE warranty_claims SET status='approved' WHERE id=$1`,[claimId]);
    assert.fail('Approved status without a recorded decision was accepted');
   } catch(e) {assert.match(String(e),/Final claim status requires a matching recorded decision/);}
   await client.query('ROLLBACK TO SAVEPOINT premature_decision');
   await client.query('RELEASE SAVEPOINT premature_decision');

   // A match must never cite another manufacturer's unrelated policy.
   const unrelated = await client.query<{id:string}>(`SELECT ch.id FROM document_chunks ch
     JOIN policy_documents d ON d.id=ch.document_id JOIN warranties w ON w.id=$1
     WHERE d.policy_id<>w.policy_id LIMIT 1`,[warranty_id]);
   assert.ok(unrelated.rowCount,'Seed must include at least two distinct policies to test scope');
   await client.query('SAVEPOINT wrong_policy_match');
   try {
    await client.query(`INSERT INTO semantic_matches(claim_id,chunk_id,similarity_score,result_rank)
       VALUES($1,$2,0.5,1)`,[claimId,unrelated.rows[0].id]);
    assert.fail('Unrelated policy chunk was incorrectly accepted');
   } catch(e) {assert.match(String(e),/Semantic match must reference a chunk from the claim policy/);}
   await client.query('ROLLBACK TO SAVEPOINT wrong_policy_match');
   await client.query('RELEASE SAVEPOINT wrong_policy_match');

   await client.query(`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason)
     VALUES($1,$2,'approved','This synthetic test case is approved to verify the stored database workflow.')`,
     [claimId,officer_id]);
   const decision=await client.query(`SELECT status FROM warranty_claims WHERE id=$1`,[claimId]);
   assert.equal(decision.rows[0].status,'approved','Decision trigger must transition claim');
   // Rewriting a terminal state or its immutable decision must fail even in SQL.
   await client.query('SAVEPOINT reopen_final_claim');
   try {
    await client.query(`UPDATE warranty_claims SET status='in_review' WHERE id=$1`,[claimId]);
    assert.fail('Reopening a final claim was incorrectly accepted');
   } catch(e) {assert.match(String(e),/Invalid claim status transition/);}
   await client.query('ROLLBACK TO SAVEPOINT reopen_final_claim');
   await client.query('RELEASE SAVEPOINT reopen_final_claim');
   await client.query('SAVEPOINT mutate_decision');
   try {
    await client.query(`UPDATE claim_decisions SET reason='A silently changed reason that must be rejected' WHERE claim_id=$1`,[claimId]);
    assert.fail('Mutation of a final decision was incorrectly accepted');
   } catch(e) {assert.match(String(e),/Final claim decisions are immutable/);}
   await client.query('ROLLBACK TO SAVEPOINT mutate_decision');
   await client.query('RELEASE SAVEPOINT mutate_decision');

   const repair=await client.query<{id:string;status:string}>(`SELECT id,status FROM repair_orders WHERE claim_id=$1`,[claimId]);
   assert.equal(repair.rows[0].status,'open','Approval must create repair order');
   await client.query(`UPDATE repair_orders SET status='in_progress' WHERE id=$1`,[repair.rows[0].id]);
   await client.query(`UPDATE repair_orders SET status='completed' WHERE id=$1`,[repair.rows[0].id]);
   const audit=await client.query(`SELECT event_type FROM audit_events WHERE entity_id=$1`,[claimId]);
   assert.ok(audit.rows.some(x=>x.event_type==='claim_decision'),'Decision must be audited');
   assert.equal(audit.rows.filter(x=>x.event_type==='repair_status_changed').length,2,
     'Repair stage updates must be audited');
   await client.query('SAVEPOINT invalid_transition');
   try {
    await client.query(`UPDATE repair_orders SET status='open' WHERE id=$1`,[repair.rows[0].id]);
    assert.fail('Backwards transition must be rejected');
   }catch(e){assert.match(String(e),/Invalid repair order status transition/);}
   await client.query('ROLLBACK TO SAVEPOINT invalid_transition');
   await client.query('RELEASE SAVEPOINT invalid_transition');
   await client.query('SAVEPOINT mutate_audit');
   try {
    await client.query(`DELETE FROM audit_events WHERE entity_id=$1`,[claimId]);
    assert.fail('Deleting audit history was incorrectly accepted');
   } catch(e) {assert.match(String(e),/Audit events are immutable/);}
   await client.query('ROLLBACK TO SAVEPOINT mutate_audit');
   await client.query('RELEASE SAVEPOINT mutate_audit');
   console.log('PASS: schema, roles, vector dimensions, submission-time coverage, inclusive date,');
   console.log('      immutable officer assignments, ownership and status constraints,');
   console.log('      immutable decisions/audit, approval triggers and repair lifecycle.');
  }finally{await client.query('ROLLBACK');}
  console.log('PASS: test writes rolled back; seeded records were not modified.');
 } finally {client.release();await db.end();}
}
main().catch(e=>{console.error('Database smoke check failed:',e);process.exitCode=1;});
