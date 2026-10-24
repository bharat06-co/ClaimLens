// Extra real HTTP role/race cases; no mock sessions and no existing officer edits.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync,writeFileSync } from 'node:fs';
import { Pool } from 'pg';
const url=new URL(process.env.DATABASE_URL || '');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55433');
const base=process.env.AUDIT_BASE_URL;
assert.equal(base,'http://127.0.0.1:3004');
const pool=new Pool({connectionString:url.href});
const tests=[];const pass=name=>{tests.push(name);console.log('PASS',name);};
const run=randomUUID();const email=`review.officer.${run}@example.test`;
const request=async(path,data,cookie='')=>{
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)});
  const body=await response.json();return {status:response.status,body,cookie:response.headers.get('set-cookie')?.split(';')[0] || ''};
};
const expect=async(name,path,data,status,cookie='')=>{
  const r=await request(path,data,cookie);assert.equal(r.status,status,`${name}: ${JSON.stringify(r.body)}`);pass(name);return r;
};
try {
  const customer=(await expect('seed customer authenticates','/api/auth/login',{email:'customer@claimlens.local',password:process.env.SEED_DEMO_PASSWORD},200)).cookie;
  const officer=(await expect('assigned officer authenticates','/api/auth/login',{email:'officer@claimlens.local',password:process.env.SEED_DEMO_PASSWORD},200)).cookie;
  const officer2=(await pool.query(`INSERT INTO app_users(full_name,email,password_hash,role)
    SELECT 'REVIEW second officer',$1,password_hash,'officer' FROM app_users WHERE email='officer@claimlens.local' RETURNING id`,[email])).rows[0].id;
  const other=(await expect('distinct second officer authenticates','/api/auth/login',{email,password:process.env.SEED_DEMO_PASSWORD},200)).cookie;
  const sample=(await pool.query(`SELECT model_id,policy_id FROM registered_products rp JOIN warranties w ON w.product_id=rp.id LIMIT 1`)).rows[0];
  const product={modelId:sample.model_id,policyId:sample.policy_id,serialNumber:`REVIEW-HTTP-${run}`,purchaseDate:new Date().toISOString().slice(0,10)};
  const products=await Promise.all([request('/api/products',product,customer),request('/api/products',product,customer)]);
  assert.deepEqual(products.map(r=>r.status).sort(),[201,409]);pass('duplicate concurrent product registration returns 201/409');
  const warranty=products.find(r=>r.status===201).body.warrantyId;
  const count=(await pool.query(`SELECT (SELECT count(*)::int FROM registered_products WHERE serial_number=$1) products,
    (SELECT count(*)::int FROM warranties w JOIN registered_products rp ON rp.id=w.product_id WHERE rp.serial_number=$1) warranties`,[product.serialNumber])).rows[0];
  assert.deepEqual(count,{products:1,warranties:1});pass('product race leaves one product and warranty without orphan');
  await expect('malformed decision identifier returns 400','/api/claims/not-a-uuid/decision',{verdict:'approved',reason:'REVIEW sufficiently long validation reason'},400,officer);
  await expect('malformed repair identifier returns 400','/api/repairs/not-a-uuid',{status:'in_progress'},400,officer);
  const submitted=await expect('race fixture claim submitted','/api/claims',{warrantyId:warranty,issue:'REVIEW ordinary internal keyboard manufacturing defect'},201,customer);
  const id=submitted.body.id;
  await expect('claim assigned to first officer',`/api/claims/${id}/assign`,{},200,officer);
  const decision={verdict:'approved',reason:'REVIEW ordinary manufacturing fault is covered by fictional policy'};
  await expect('different active officer cannot decide',`/api/claims/${id}/decision`,decision,403,other);
  const decisions=await Promise.all([request(`/api/claims/${id}/decision`,decision,officer),request(`/api/claims/${id}/decision`,decision,officer)]);
  assert.deepEqual(decisions.map(r=>r.status).sort(),[200,409]);pass('duplicate concurrent approval returns 200/409');
  const result=(await pool.query(`SELECT (SELECT count(*)::int FROM claim_decisions WHERE claim_id=$1) decisions,
    (SELECT count(*)::int FROM repair_orders WHERE claim_id=$1) repairs,
    (SELECT count(*)::int FROM audit_events WHERE entity_id=$1 AND event_type='claim_decision') audits`,[id])).rows[0];
  assert.deepEqual(result,{decisions:1,repairs:1,audits:1});pass('HTTP approval race creates exactly one decision/repair/audit');
  const repair=(await pool.query('SELECT id FROM repair_orders WHERE claim_id=$1',[id])).rows[0].id;
  await expect('different officer cannot change repair',`/api/repairs/${repair}`,{status:'in_progress'},403,other);
  await expect('customer cannot change approved repair',`/api/repairs/${repair}`,{status:'in_progress'},403,customer);
  await expect('assigned officer starts repair',`/api/repairs/${repair}`,{status:'in_progress'},200,officer);
  const terminal=await Promise.all([request(`/api/repairs/${repair}`,{status:'completed'},officer),request(`/api/repairs/${repair}`,{status:'cancelled'},officer)]);
  assert.deepEqual(terminal.map(r=>r.status).sort(),[200,400]);pass('competing terminal HTTP updates return 200/400');
  const history=(await pool.query(`SELECT details FROM audit_events WHERE entity_id=$1 AND event_type='repair_status_changed' ORDER BY id`,[id])).rows;
  assert.equal(history.length,2);assert.deepEqual(history[0].details,{from:'open',to:'in_progress'});
  assert.equal(history[1].details.from,'in_progress');assert.ok(['completed','cancelled'].includes(history[1].details.to));
  pass('competing repair writes preserve exactly two consistent audit transitions');
  await pool.query('UPDATE app_users SET is_active=false WHERE id=$1',[officer2]);
  await expect('deactivated second officer session cannot mutate',`/api/claims/${id}/decision`,decision,401,other);
  await expect('deactivated second officer cannot authenticate','/api/auth/login',{email,password:process.env.SEED_DEMO_PASSWORD},401);
  mkdirSync('docs/refactor-evidence',{recursive:true});
  writeFileSync(`docs/refactor-evidence/${process.env.REVIEW_STAGE}-api-extra.json`,JSON.stringify({passed:tests.length,tests,claimId:id,
    fixtures:'Synthetic rows retained in disposable tmpfs DB only'},null,2));
  console.log(`PASS ${tests.length} additional real HTTP assertions`);
}finally{await pool.end();}
