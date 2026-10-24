// Deterministic overlapping transactions; synthetic fixtures in disposable DB only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Pool } from 'pg';

const url=new URL(process.env.DATABASE_URL || '');
assert.equal(url.hostname,'127.0.0.1'); assert.equal(url.port,'55433');
const pool=new Pool({connectionString:url.href,max:5});
const a=await pool.connect(),b=await pool.connect();
const tests=[]; const pass=name=>{tests.push(name);console.log('PASS',name);};
const stage=process.env.REVIEW_STAGE;
assert.ok(['baseline','proposed','final'].includes(stage));
try {
  for(const db of [a,b]) await db.query("SET statement_timeout='10s'");
  const sample=(await pool.query(`SELECT rp.customer_id,rp.model_id,w.policy_id,
    (SELECT id FROM app_users WHERE role='officer' AND is_active LIMIT 1) officer_id
    FROM registered_products rp JOIN warranties w ON w.product_id=rp.id LIMIT 1`)).rows[0];
  const warranty=(await pool.query('SELECT register_warranty($1,$2,$3,CURRENT_DATE,$4) id',
    [sample.customer_id,sample.model_id,`REVIEW-RACE-${randomUUID()}`,sample.policy_id])).rows[0].id;
  const claim=async()=> (await pool.query(`INSERT INTO warranty_claims(warranty_id,customer_id,issue_description)
    VALUES($1,$2,'REVIEW concurrency synthetic manufacturing fault') RETURNING id`,[warranty,sample.customer_id])).rows[0].id;
  const assign=(db,id)=>db.query('INSERT INTO claim_assignments(claim_id,officer_id) VALUES($1,$2)',[id,sample.officer_id]);
  const decide=(db,id,verdict='approved')=>db.query(`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason)
    VALUES($1,$2,$3,'REVIEW concurrent synthetic decision with adequate reason')`,[id,sample.officer_id,verdict]);
  const pid=(await b.query('SELECT pg_backend_pid() AS id')).rows[0].id;
  const waiting=async()=>{
    const deadline=Date.now()+4000;
    while(Date.now()<deadline){
      const r=(await pool.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid])).rows[0];
      if(r.wait_event_type==='Lock')return;
      await delay(20);
    }
    assert.fail('Contending transaction never entered a PostgreSQL lock wait');
  };
  const contend=async(first,second)=>{
    await a.query('BEGIN'); await b.query('BEGIN');
    let outcome;
    try {
      await first();
      const pending=second().then(result=>({ok:true,rows:result.rowCount}),error=>({ok:false,code:error.code,message:error.message}));
      await waiting(); await a.query('COMMIT'); outcome=await pending;
      await b.query(outcome.ok?'COMMIT':'ROLLBACK');
      return outcome;
    }finally{await a.query('ROLLBACK');await b.query('ROLLBACK');}
  };
  const assigned=await claim();
  const assignment=await contend(async()=>{await assign(a,assigned);await a.query("UPDATE warranty_claims SET status='in_review' WHERE id=$1",[assigned]);},()=>assign(b,assigned));
  assert.equal(assignment.ok,false); assert.equal(assignment.code,'P0001'); assert.match(assignment.message,/Only submitted claims/);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM claim_assignments WHERE claim_id=$1',[assigned])).rows[0].n,1);
  pass('overlapping assignments serialize to one assignment');

  const decision=await contend(()=>decide(a,assigned),()=>decide(b,assigned,'rejected'));
  assert.equal(decision.ok,false); assert.equal(decision.code,'23505');
  const result=(await pool.query(`SELECT status,(SELECT count(*)::int FROM claim_decisions WHERE claim_id=$1) decisions,
    (SELECT count(*)::int FROM repair_orders WHERE claim_id=$1) repairs,
    (SELECT count(*)::int FROM audit_events WHERE entity_id=$1 AND event_type='claim_decision') audits
    FROM warranty_claims WHERE id=$1`,[assigned])).rows[0];
  assert.deepEqual(result,{status:'approved',decisions:1,repairs:1,audits:1});
  pass('overlapping approval/rejection has one decision and one repair/audit');

  const lifecycle=await contend(()=>a.query("UPDATE repair_orders SET status='in_progress' WHERE claim_id=$1",[assigned]),
    ()=>b.query("UPDATE repair_orders SET status='completed' WHERE claim_id=$1",[assigned]));
  assert.equal(lifecycle.ok,true);
  const repairs=(await pool.query(`SELECT status,(SELECT count(*)::int FROM audit_events WHERE entity_id=$1 AND event_type='repair_status_changed') audits
    FROM repair_orders WHERE claim_id=$1`,[assigned])).rows[0];
  assert.deepEqual(repairs,{status:'completed',audits:2});
  pass('waiting repair completion sees committed in-progress state and two audits');

  const terminal=await claim(); await assign(pool,terminal);await pool.query("UPDATE warranty_claims SET status='in_review' WHERE id=$1",[terminal]);
  await decide(pool,terminal);await pool.query("UPDATE repair_orders SET status='in_progress' WHERE claim_id=$1",[terminal]);
  const conflict=await contend(()=>a.query("UPDATE repair_orders SET status='completed' WHERE claim_id=$1",[terminal]),
    ()=>b.query("UPDATE repair_orders SET status='cancelled' WHERE claim_id=$1",[terminal]));
  assert.equal(conflict.ok,false);assert.equal(conflict.code,'P0001');assert.match(conflict.message,/Invalid repair order/);
  assert.equal((await pool.query('SELECT status FROM repair_orders WHERE claim_id=$1',[terminal])).rows[0].status,'completed');
  pass('competing terminal repair transitions cannot overwrite the winner');

  const rollback=await claim();await assign(pool,rollback);await pool.query("UPDATE warranty_claims SET status='in_review' WHERE id=$1",[rollback]);
  await a.query('BEGIN');await decide(a,rollback);await a.query('ROLLBACK');
  const rolled=(await pool.query(`SELECT status,(SELECT count(*)::int FROM claim_decisions WHERE claim_id=$1) decisions,
    (SELECT count(*)::int FROM repair_orders WHERE claim_id=$1) repairs FROM warranty_claims WHERE id=$1`,[rollback])).rows[0];
  assert.deepEqual(rolled,{status:'in_review',decisions:0,repairs:0});
  pass('explicit transaction rollback removes approval and generated repair');

  mkdirSync('docs/refactor-evidence',{recursive:true});
  writeFileSync(`docs/refactor-evidence/${stage}-concurrency.json`,JSON.stringify({passed:tests.length,tests,
    isolation:'READ COMMITTED',coordination:'Observed pg_stat_activity Lock before releasing winner',
    fixtures:'Synthetic committed rows retained only in disposable tmpfs database'},null,2));
  console.log(`PASS ${tests.length} concurrency/transaction cases`);
} finally {
  await a.query('ROLLBACK');await b.query('ROLLBACK');a.release();b.release();await pool.end();
}
