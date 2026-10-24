// Integration tests of consolidated guards. All test writes roll back.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Pool } from 'pg';
const evidence=process.env.REVIEW_EVIDENCE_DIR || 'docs/refactor-evidence';

const url = new URL(process.env.DATABASE_URL || '');
assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55433');
const pool = new Pool({ connectionString: url.href });
const db = await pool.connect();
const tests = [], observations = [];
const pass = name => { tests.push(name); console.log('PASS', name); };
const stage = process.env.REVIEW_STAGE;
assert.ok(['baseline', 'proposed', 'final'].includes(stage));
try {
  await db.query('BEGIN');
  await db.query("SET LOCAL statement_timeout='10s'");
  const sample = (await db.query(`SELECT rp.customer_id,rp.model_id,w.policy_id,
    (SELECT id FROM app_users WHERE role='officer' AND is_active LIMIT 1) officer_id
    FROM registered_products rp JOIN warranties w ON w.product_id=rp.id LIMIT 1`)).rows[0];
  const officer2 = (await db.query(`INSERT INTO app_users(full_name,email,password_hash,role)
    VALUES('REVIEW second officer',$1,'unused','officer') RETURNING id`, [`review.${randomUUID()}@example.test`])).rows[0].id;
  const warranty = (await db.query('SELECT register_warranty($1,$2,$3,CURRENT_DATE,$4) id',
    [sample.customer_id,sample.model_id,`REVIEW-${randomUUID()}`,sample.policy_id])).rows[0].id;
  const claim = async (review = true) => {
    const id = (await db.query(`INSERT INTO warranty_claims(warranty_id,customer_id,issue_description)
      VALUES($1,$2,'REVIEW synthetic internal manufacturing failure') RETURNING id`, [warranty,sample.customer_id])).rows[0].id;
    if (review) {
      await db.query('INSERT INTO claim_assignments(claim_id,officer_id) VALUES($1,$2)',[id,sample.officer_id]);
      await db.query("UPDATE warranty_claims SET status='in_review' WHERE id=$1",[id]);
    }
    return id;
  };
  const decide = (id,officer=sample.officer_id,verdict='approved') => db.query(`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason)
    VALUES($1,$2,$3,'REVIEW sufficiently detailed synthetic decision reason')`,[id,officer,verdict]);
  const state = async id => (await db.query(`SELECT c.status,
    (SELECT count(*)::int FROM claim_decisions WHERE claim_id=c.id) decisions,
    (SELECT count(*)::int FROM repair_orders WHERE claim_id=c.id) repairs,
    (SELECT count(*)::int FROM audit_events WHERE entity_id=c.id AND event_type='claim_decision') audits
    FROM warranty_claims c WHERE c.id=$1`,[id])).rows[0];
  const reject = async (name, operation, pattern, code='P0001') => {
    await db.query('SAVEPOINT negative');
    let error;
    try { await operation(); } catch (e) { error=e; }
    await db.query('ROLLBACK TO SAVEPOINT negative'); await db.query('RELEASE SAVEPOINT negative');
    assert.ok(error, `${name}: operation unexpectedly succeeded`);
    assert.match(error.message,pattern,name); assert.equal(error.code,code,name); pass(name);
  };
  const inReview = await claim();
  await reject('active unassigned officer cannot decide',()=>decide(inReview,officer2),/assigned officer/);
  await reject('customer cannot decide',()=>decide(inReview,sample.customer_id),/active officer/);
  await db.query('SAVEPOINT inactive');
  await db.query('UPDATE app_users SET is_active=false WHERE id=$1',[sample.officer_id]);
  await reject('inactive officer cannot decide',()=>decide(inReview),/active officer/);
  assert.deepEqual(await state(inReview),{status:'in_review',decisions:0,repairs:0,audits:0});
  pass('inactive decision leaves no row, status, repair or audit effect');
  await db.query('ROLLBACK TO SAVEPOINT inactive');
  await reject('submitted unassigned claim cannot be decided',async()=>decide(await claim(false)),/assigned officer/);

  // A failure at the last audit write must roll back earlier decision/repair/status effects.
  await db.query(`CREATE FUNCTION pg_temp.review_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.event_type='claim_decision' THEN RAISE EXCEPTION 'REVIEW forced downstream audit failure'; END IF; RETURN NEW; END $$`);
  await db.query(`CREATE TRIGGER review_reject_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION pg_temp.review_reject_audit()`);
  await reject('downstream audit failure aborts the decision statement',()=>decide(inReview),/forced downstream/);
  assert.deepEqual(await state(inReview),{status:'in_review',decisions:0,repairs:0,audits:0});
  pass('downstream failure rolls back inserted decision, repair and claim transition');
  await db.query('DROP TRIGGER review_reject_audit ON audit_events');

  const multiGood=await claim(), multiBad=await claim();
  await reject('one invalid row aborts a multirow decision insert',()=>db.query(`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason)
    VALUES($1,$3,'approved','REVIEW first valid row in multirow statement'),($2,$4,'approved','REVIEW invalid officer in multirow statement')`,
    [multiGood,multiBad,sample.officer_id,sample.customer_id]),/active officer/);
  for(const id of [multiGood,multiBad]) assert.deepEqual(await state(id),{status:'in_review',decisions:0,repairs:0,audits:0});
  pass('failed multirow insert leaves neither row or trigger side effects');

  await decide(inReview);
  assert.deepEqual(await state(inReview),{status:'approved',decisions:1,repairs:1,audits:1});
  pass('approval produces exactly one decision, repair and decision audit');
  const rejected=await claim(); await decide(rejected,sample.officer_id,'rejected');
  assert.deepEqual(await state(rejected),{status:'rejected',decisions:1,repairs:0,audits:1});
  pass('rejection produces decision and audit without a repair');
  await reject('duplicate approval cannot create a second repair',()=>decide(inReview),/unique constraint/,'23505');
  for(const operation of ['UPDATE','DELETE']) {
    await reject(`decisions append-only on ${operation}`,()=>db.query(operation==='UPDATE'?
      "UPDATE claim_decisions SET reason='REVIEW rewritten history must be rejected' WHERE claim_id=$1":
      'DELETE FROM claim_decisions WHERE claim_id=$1',[inReview]),/Final claim decisions are immutable/);
    await reject(`audits append-only on ${operation}`,()=>db.query(operation==='UPDATE'?
      "UPDATE audit_events SET details='{}' WHERE entity_id=$1":'DELETE FROM audit_events WHERE entity_id=$1',[inReview]),/Audit events are immutable/);
  }
  for(const field of ['id','product_id','policy_id','start_date','end_date','created_at']) {
    const expressions={id:'gen_random_uuid()',product_id:'gen_random_uuid()',policy_id:'gen_random_uuid()',
      start_date:"start_date-1",end_date:"end_date+1",created_at:"created_at-interval '1 day'"};
    await reject(`claimed warranty preserves ${field}`,()=>db.query(`UPDATE warranties SET ${field}=${expressions[field]} WHERE id=$1`,[warranty]),/Claim warranty facts are immutable/);
  }
  await db.query('UPDATE warranties SET end_date=end_date WHERE id=$1',[warranty]); pass('claimed warranty permits no-op factual update');
  await db.query('UPDATE warranties SET is_void=true WHERE id=$1',[warranty]);
  await db.query('UPDATE warranties SET is_void=false WHERE id=$1',[warranty]); pass('warranty void flag remains editable');
  const allowed={open:['open','in_progress','cancelled'],in_progress:['in_progress','completed','cancelled'],completed:['completed'],cancelled:['cancelled']};
  for(const from of Object.keys(allowed)) for(const to of Object.keys(allowed)) {
    await db.query('SAVEPOINT matrix');
    const id=await claim(); await decide(id);
    if(['in_progress','completed'].includes(from)) await db.query("UPDATE repair_orders SET status='in_progress' WHERE claim_id=$1",[id]);
    if(['completed','cancelled'].includes(from)) await db.query('UPDATE repair_orders SET status=$2 WHERE claim_id=$1',[id,from]);
    await db.query("UPDATE repair_orders SET updated_at=now()-interval '1 day' WHERE claim_id=$1",[id]);
    const before=(await db.query(`SELECT status,updated_at::text,(SELECT count(*)::int FROM audit_events WHERE entity_id=$1 AND event_type='repair_status_changed') audits
      FROM repair_orders WHERE claim_id=$1`,[id])).rows[0];
    if(allowed[from].includes(to)) {
      await db.query('UPDATE repair_orders SET status=$2 WHERE claim_id=$1',[id,to]);
      const after=(await db.query(`SELECT status,updated_at::text,updated_at=now() AS stamped,
        (SELECT count(*)::int FROM audit_events WHERE entity_id=$1 AND event_type='repair_status_changed') audits
        FROM repair_orders WHERE claim_id=$1`,[id])).rows[0];
      assert.equal(after.status,to); assert.equal(after.audits,before.audits+(from===to?0:1));
      if(from===to) assert.equal(after.updated_at,before.updated_at); else assert.equal(after.stamped,true);
      pass(`repair ${from} -> ${to}: state, timestamp and audit`);
    } else await reject(`repair ${from} -> ${to}: prohibited`,()=>db.query('UPDATE repair_orders SET status=$2 WHERE claim_id=$1',[id,to]),/Invalid repair order status transition/);
    await db.query('ROLLBACK TO SAVEPOINT matrix'); await db.query('RELEASE SAVEPOINT matrix');
  }
  await reject('repair cannot change identity together with a valid transition',()=>db.query(`UPDATE repair_orders SET status='in_progress',id=gen_random_uuid() WHERE claim_id=$1`,[inReview]),/identity and claim are immutable/);

  // Strict compatibility: both formerly divergent SQL statements must fail
  // with the exact original BEFORE-trigger SQLSTATE and message.
  for(const variant of ['invalid-officer-and-short-reason','invalid-officer-and-duplicate-do-nothing']) {
    await db.query('SAVEPOINT precedence');
    let outcome;
    try {
      const result = variant==='invalid-officer-and-short-reason'
        ? await db.query(`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason) VALUES($1,$2,'approved','short')`,[multiBad,sample.customer_id])
        : await db.query(`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason) VALUES($1,$2,'approved','REVIEW conflicting inactive decision attempt') ON CONFLICT(claim_id) DO NOTHING`,[inReview,sample.customer_id]);
      outcome={rows:result.rowCount};
    } catch(e) { outcome={code:e.code,message:e.message}; }
    await db.query('ROLLBACK TO SAVEPOINT precedence'); await db.query('RELEASE SAVEPOINT precedence');
    observations.push({variant,...outcome});
    assert.deepEqual(outcome,{code:'P0001',message:'Decision requires an active officer'});
    pass(`${variant}: original officer error precedes constraint/conflict handling`);
    assert.deepEqual(await state(variant==='invalid-officer-and-short-reason'?multiBad:inReview),
      variant==='invalid-officer-and-short-reason'?{status:'in_review',decisions:0,repairs:0,audits:0}:{status:'approved',decisions:1,repairs:1,audits:1});
    pass(`${variant}: no decision/workflow side effects`);
  }
  await reject('valid officer still receives reason CHECK violation',()=>db.query(
    `INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason) VALUES($1,$2,'approved','short')`,
    [multiBad,sample.officer_id]),/reason_check/,'23514');
  const noOp=await db.query(`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason)
    VALUES($1,$2,'approved','REVIEW valid conflicting duplicate decision') ON CONFLICT(claim_id) DO NOTHING`,[inReview,sample.officer_id]);
  assert.equal(noOp.rowCount,0);pass('valid officer duplicate DO NOTHING still returns zero rows');
  mkdirSync(evidence,{recursive:true});
  writeFileSync(`${evidence}/${stage}-behavior.json`,JSON.stringify({passed:tests.length,tests,observations,mutations:'ROLLED BACK'},null,2));
  console.log(JSON.stringify({passed:tests.length,observations}));
} finally { await db.query('ROLLBACK'); db.release(); await pool.end(); }
