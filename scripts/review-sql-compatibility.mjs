// Reproduce the rejected 007 behavior and compare the corrected revision with
// migrations 001-006 in the SAME disposable schema/transaction. No private DB.
import assert from 'node:assert/strict';
import { readFileSync,readdirSync,mkdirSync,writeFileSync } from 'node:fs';
import { randomUUID,createHash } from 'node:crypto';
import { Pool } from 'pg';
const url=new URL(process.env.DATABASE_URL || '');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55433');
assert.equal(url.pathname,'/claimlens');
const evidence=process.env.REVIEW_EVIDENCE_DIR || 'docs/refactor-evidence/strict';
const pool=new Pool({connectionString:url.href});const db=await pool.connect();
const sql=name=>readFileSync(`db/migrations/${name}`,'utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
try {
  if(process.argv.includes('--install-baseline')) {
    assert.equal((await db.query("SELECT to_regclass('public.app_users') AS t")).rows[0].t,null,'Baseline install requires an empty disposable DB');
    await db.query('BEGIN');
    await db.query('CREATE TABLE schema_migrations(name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
    for(const name of readdirSync('db/migrations').filter(f=>/^00[1-6]_.*\.sql$/.test(f)).sort()) {
      await db.query(sql(name));await db.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
      console.log('Applied baseline',name);
    }
    await db.query('COMMIT');
  } else {
    await db.query('BEGIN');
    // A private temporary schema makes comparison repeatable even after 007.
    // All objects/fixtures are rolled back; the populated public schema is untouched.
    await db.query('CREATE SCHEMA strict_sql_compatibility');
    await db.query('SET LOCAL search_path TO strict_sql_compatibility,public');
    for(const name of readdirSync('db/migrations').filter(f=>/^00[1-6]_.*\.sql$/.test(f)).sort()) await db.query(sql(name));
    const customer=(await db.query(`INSERT INTO app_users(full_name,email,password_hash) VALUES('REVIEW compatibility customer','customer@example.test','unused') RETURNING id`)).rows[0].id;
    const officer=(await db.query(`INSERT INTO app_users(full_name,email,password_hash,role) VALUES('REVIEW compatibility officer','officer@example.test','unused','officer') RETURNING id`)).rows[0].id;
    const manufacturer=(await db.query("INSERT INTO manufacturers(name) VALUES('REVIEW compatibility manufacturer') RETURNING id")).rows[0].id;
    const model=(await db.query(`INSERT INTO product_models(manufacturer_id,model_name,category,default_warranty_months)
      VALUES($1,'REVIEW keyboard','Laptop',12) RETURNING id`,[manufacturer])).rows[0].id;
    const policy=(await db.query(`INSERT INTO warranty_policies(manufacturer_id,title,version,coverage_months,effective_from)
      VALUES($1,'REVIEW compatibility policy','1',12,CURRENT_DATE) RETURNING id`,[manufacturer])).rows[0].id;
    const sample={customer_id:customer,officer_id:officer,model_id:model,policy_id:policy};
    const inactive=(await db.query(`INSERT INTO app_users(full_name,email,password_hash,role,is_active)
      VALUES('REVIEW inactive compatibility officer',$1,'unused','officer',false) RETURNING id`,[`strict.${randomUUID()}@example.test`])).rows[0].id;
    const warranty=(await db.query('SELECT register_warranty($1,$2,$3,CURRENT_DATE,$4) id',
      [sample.customer_id,sample.model_id,`STRICT-${randomUUID()}`,sample.policy_id])).rows[0].id;
    const create=async()=>{
      const id=(await db.query(`INSERT INTO warranty_claims(warranty_id,customer_id,issue_description)
        VALUES($1,$2,'REVIEW strict compatibility manufacturing failure') RETURNING id`,[warranty,sample.customer_id])).rows[0].id;
      await db.query('INSERT INTO claim_assignments(claim_id,officer_id) VALUES($1,$2)',[id,sample.officer_id]);
      await db.query("UPDATE warranty_claims SET status='in_review' WHERE id=$1",[id]);return id;
    };
    const pending=await create(),decided=await create();
    await db.query(`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason)
      VALUES($1,$2,'approved','REVIEW pre-existing valid decision used for duplicate conflict')`,[decided,sample.officer_id]);
    const cases=[];
    for(const [kind,officer] of [['customer',sample.customer_id],['inactive',inactive],['valid',sample.officer_id]])
      for(const variant of ['short-reason','conflicting-do-nothing']) cases.push({kind,officer,variant});
    const state=async()=> (await db.query(`SELECT
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM claim_decisions t WHERE claim_id=ANY($1)) decisions,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM warranty_claims t WHERE id=ANY($1)) claims,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM repair_orders t WHERE claim_id=ANY($1)) repairs,
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM audit_events t WHERE entity_id=ANY($1)) audits`,[[pending,decided]])).rows[0];
    const run=async()=>{
      const outcomes=[];
      for(const c of cases) {
        const before=await state();await db.query('SAVEPOINT attempt');let outcome;
        try {
          const short=c.variant==='short-reason';
          const result=await db.query(`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason)
            VALUES($1,$2,'approved',$3) ${short?'':'ON CONFLICT(claim_id) DO NOTHING'}`,
            [short?pending:decided,c.officer,short?'short':'REVIEW detailed duplicate decision should be ignored for a valid officer']);
          outcome={rows:result.rowCount};
        }catch(e){outcome={code:e.code,message:e.message};}
        await db.query('ROLLBACK TO SAVEPOINT attempt');await db.query('RELEASE SAVEPOINT attempt');
        assert.deepEqual(await state(),before,'Decision/claim/repair/audit rows changed after failed/no-op statement');
        outcomes.push({case:`${c.kind}-${c.variant}`,...outcome});
      }
      return outcomes;
    };
    const decisionDefinitions=async()=>({
      functions:(await db.query(`SELECT proname,pg_get_functiondef(oid) definition FROM pg_proc
        WHERE pronamespace=current_schema()::regnamespace AND proname IN ('validate_deciding_officer','apply_claim_decision') ORDER BY proname`)).rows,
      triggers:(await db.query(`SELECT tgname,pg_get_triggerdef(oid) definition FROM pg_trigger
        WHERE tgrelid='claim_decisions'::regclass AND tgname IN ('trg_validate_deciding_officer','trg_apply_claim_decision')
        AND NOT tgisinternal ORDER BY tgname`)).rows
    });
    const beforeDefinitions=await decisionDefinitions();
    const baseline=await run();await db.query('SAVEPOINT baseline');
    // Retain the rejected SQL as a hash-verified test fixture, so the replay also
    // works in a source ZIP without Git history. Never deploy this fixture.
    const previousSql=readFileSync('docs/refactor-evidence/strict/previous-migration-007.rejected.sql','utf8').replace(/\r\n/g,'\n');
    assert.equal(createHash('sha256').update(previousSql).digest('hex'),'b26a9589325b2f855563057db4facb613f7d3ea584091878af637f774aa0198c');
    await db.query(previousSql);const previous=await run();
    await db.query('ROLLBACK TO SAVEPOINT baseline');
    await db.query(sql('007_consolidate_integrity_guards.sql'));const revised=await run();
    assert.deepEqual(await decisionDefinitions(),beforeDefinitions,'Original decision trigger/functions must be unchanged');
    assert.deepEqual(revised,baseline,'Strict SQL outcomes must match audited baseline exactly');
    for(let i=0;i<4;i++) {
      assert.deepEqual(baseline[i],{case:cases[i].kind+'-'+cases[i].variant,code:'P0001',message:'Decision requires an active officer'});
      if(cases[i].variant==='short-reason') assert.equal(previous[i].code,'23514');else assert.deepEqual(previous[i],{case:cases[i].kind+'-'+cases[i].variant,rows:0});
    }
    assert.equal(revised[4].code,'23514');assert.equal(revised[5].rows,0);
    const result={cases:6,attempts:18,baseline,previous,revised,strictMatchesBaseline:true,
      bothPreviouslyReportedDifferencesReproduced:true,originalDecisionDefinitionsUnchanged:true,
      workflowRowsUnchangedAfterEveryCase:true,mutations:'ROLLED BACK'};
    mkdirSync(evidence,{recursive:true});writeFileSync(`${evidence}/direct-sql-comparison.json`,JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
  }
}finally{await db.query('ROLLBACK');db.release();await pool.end();}
