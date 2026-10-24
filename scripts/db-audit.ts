import 'dotenv/config';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

async function main(){
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 const db=await pool.connect();
 const passed:string[]=[];
 try {
  await db.query('BEGIN');
  const sample=(await db.query(`SELECT rp.customer_id,rp.model_id,w.policy_id,pm.manufacturer_id,
   (SELECT id FROM app_users WHERE role='officer' AND is_active LIMIT 1) officer_id
   FROM registered_products rp JOIN warranties w ON w.product_id=rp.id JOIN product_models pm ON pm.id=rp.model_id LIMIT 1`)).rows[0];
  const warranty=(await db.query(`SELECT register_warranty($1,$2,$3,CURRENT_DATE,$4) id`,
   [sample.customer_id,sample.model_id,`AUDIT-ROLLBACK-${randomUUID()}`,sample.policy_id])).rows[0].id;
  const product=(await db.query('SELECT product_id FROM warranties WHERE id=$1',[warranty])).rows[0].product_id;
  const createClaim=async()=> (await db.query(`INSERT INTO warranty_claims(warranty_id,customer_id,issue_description)
   VALUES($1,$2,'AUDIT rollback fixture: keyboard failure during ordinary use') RETURNING id`,[warranty,sample.customer_id])).rows[0].id as string;
  const claim=await createClaim();
  const reject=async(name:string,sql:string,values:unknown[],pattern:RegExp)=>{
   await db.query('SAVEPOINT negative');
   await assert.rejects(db.query(sql,values),pattern,name);
   await db.query('ROLLBACK TO SAVEPOINT negative');
   await db.query('RELEASE SAVEPOINT negative');
   passed.push(name); console.log(`PASS ${name}`);
  };
  await reject('unapproved repair insert',`INSERT INTO repair_orders(claim_id) VALUES($1)`,[claim],/approved, decided/);
  await reject('new claim terminal status',`INSERT INTO warranty_claims(warranty_id,customer_id,issue_description,status) VALUES($1,$2,'AUDIT invalid initial claim state','approved')`,[warranty,sample.customer_id],/begin in submitted/);
  await reject('submitted issue immutability',`UPDATE warranty_claims SET issue_description='AUDIT changed historical description' WHERE id=$1`,[claim],/cannot be rewritten/);
  await reject('submitted timestamp immutability',`UPDATE warranty_claims SET submitted_at=now()-interval '1 day' WHERE id=$1`,[claim],/cannot be rewritten/);
  await reject('warranty dates immutability',`UPDATE warranties SET end_date=end_date+1 WHERE id=$1`,[warranty],/warranty facts are immutable/);
  for(const [field,value] of [['purchased_on','purchased_on-1'],['customer_id',`'${sample.officer_id}'::uuid`],['serial_number',`'AUDIT-REWRITTEN'`]]){
   await reject(`product ${field} immutability`,`UPDATE registered_products SET ${field}=${value} WHERE id=$1`,[product],/product facts are immutable/);
  }
  await reject('referenced policy version immutability',`UPDATE warranty_policies SET version=version||'-changed' WHERE id=$1`,[sample.policy_id],/policy terms are immutable/);
  const otherPolicy=(await db.query('SELECT id,manufacturer_id FROM warranty_policies WHERE manufacturer_id<>$1 LIMIT 1',[sample.manufacturer_id])).rows[0];
  await reject('registered model manufacturer immutability',`UPDATE product_models SET manufacturer_id=$2 WHERE id=$1`,[sample.model_id,otherPolicy.manufacturer_id],/manufacturer is immutable/);
  await reject('claim warranty policy immutability',`UPDATE warranties SET policy_id=$2 WHERE id=$1`,[warranty,otherPolicy.id],/warranty facts are immutable/);
  await reject('customer assignment prohibited',`INSERT INTO claim_assignments(claim_id,officer_id) VALUES($1,$2)`,[claim,sample.customer_id],/not an active officer/);
  await db.query('SAVEPOINT inactive');
  await db.query('UPDATE app_users SET is_active=false WHERE id=$1',[sample.officer_id]);
  await reject('inactive officer assignment prohibited',`INSERT INTO claim_assignments(claim_id,officer_id) VALUES($1,$2)`,[claim,sample.officer_id],/not an active officer/);
  await db.query('ROLLBACK TO SAVEPOINT inactive');
  await db.query('INSERT INTO claim_assignments(claim_id,officer_id) VALUES($1,$2)',[claim,sample.officer_id]);
  await db.query(`UPDATE warranty_claims SET status='in_review' WHERE id=$1`,[claim]);
  await reject('assignment deletion prohibited','DELETE FROM claim_assignments WHERE claim_id=$1',[claim],/assignment is immutable/);
  await reject('non-officer decision prohibited',`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason) VALUES($1,$2,'approved','AUDIT invalid decision made by a customer')`,[claim,sample.customer_id],/active officer/);
  await db.query('SAVEPOINT inactive_decision');
  await db.query('UPDATE app_users SET is_active=false WHERE id=$1',[sample.officer_id]);
  await reject('inactive officer decision prohibited',`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason) VALUES($1,$2,'approved','AUDIT invalid decision made by inactive officer')`,[claim,sample.officer_id],/active officer/);
  await db.query('ROLLBACK TO SAVEPOINT inactive_decision');
  await db.query(`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason) VALUES($1,$2,'approved','AUDIT approval checks atomic decision and repair generation')`,[claim,sample.officer_id]);
  const repair=(await db.query('SELECT id FROM repair_orders WHERE claim_id=$1',[claim])).rows[0].id;
  assert.ok(repair);passed.push('approval automatically creates repair');
  await reject('repair cannot skip stages',`UPDATE repair_orders SET status='completed' WHERE id=$1`,[repair],/Invalid repair order status transition/);
  await reject('repair cannot be rebound',`UPDATE repair_orders SET claim_id=$2 WHERE id=$1`,[repair,await createClaim()],/identity and claim are immutable/);
  await reject('repair cannot be deleted','DELETE FROM repair_orders WHERE id=$1',[repair],/must be retained/);
  await reject('repair opened date immutability',`UPDATE repair_orders SET opened_at=opened_at-interval '1 day' WHERE id=$1`,[repair],/identity and claim are immutable/);
  await db.query(`UPDATE repair_orders SET status='cancelled' WHERE id=$1`,[repair]);
  await reject('cancelled repair terminal',`UPDATE repair_orders SET status='in_progress' WHERE id=$1`,[repair],/Invalid repair/);
  const rejected=await createClaim();
  await db.query('INSERT INTO claim_assignments(claim_id,officer_id) VALUES($1,$2)',[rejected,sample.officer_id]);
  await db.query(`UPDATE warranty_claims SET status='in_review' WHERE id=$1`,[rejected]);
  await db.query(`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason) VALUES($1,$2,'rejected','AUDIT liquid damage excluded by the fictional policy')`,[rejected,sample.officer_id]);
  assert.equal((await db.query('SELECT id FROM repair_orders WHERE claim_id=$1',[rejected])).rowCount,0);passed.push('rejection never creates repair');
  await reject('rejected claim cannot acquire repair',`INSERT INTO repair_orders(claim_id) VALUES($1)`,[rejected],/approved, decided/);
  const doc=(await db.query(`SELECT d.id,ch.id chunk_id FROM policy_documents d JOIN document_chunks ch ON ch.document_id=d.id WHERE d.policy_id=$1 LIMIT 1`,[sample.policy_id])).rows[0];
  await db.query('INSERT INTO semantic_matches(claim_id,chunk_id,similarity_score,result_rank) VALUES($1,$2,0.5,1)',[claim,doc.chunk_id]);
  await reject('indexed document source immutability',`UPDATE policy_documents SET original_text=original_text||' AUDIT change' WHERE id=$1`,[doc.id],/source is immutable/);
  await reject('indexed document policy immutability',`UPDATE policy_documents SET policy_id=$2 WHERE id=$1`,[doc.id,otherPolicy.id],/source is immutable/);
  await reject('retrieved passage immutability',`UPDATE document_chunks SET content=content||' AUDIT change' WHERE id=$1`,[doc.chunk_id],/passage is immutable/);
  await reject('similarity bounds',`UPDATE semantic_matches SET similarity_score=2 WHERE claim_id=$1`,[claim],/check constraint/);
  await reject('rank bounds',`UPDATE semantic_matches SET result_rank=0 WHERE claim_id=$1`,[claim],/check constraint/);
  await reject('vector dimensions',`UPDATE document_chunks SET embedding='[1,2,3]'::vector WHERE id=$1`,[doc.chunk_id],/expected 384 dimensions/);
  await reject('case-insensitive duplicate identity',`INSERT INTO app_users(full_name,email,password_hash) SELECT full_name,upper(email),password_hash FROM app_users WHERE id=$1`,[sample.customer_id],/unique constraint/);
  await reject('duplicate serial registration',`SELECT register_warranty($1,$2,(SELECT serial_number FROM registered_products WHERE id=$3),CURRENT_DATE,$4)`,[sample.customer_id,sample.model_id,product,sample.policy_id],/unique constraint/);
  await reject('future purchase',`SELECT register_warranty($1,$2,'AUDIT-FUTURE',CURRENT_DATE+1,$3)`,[sample.customer_id,sample.model_id,sample.policy_id],/cannot be in the future/);
  await reject('purchase before policy effective date',`SELECT register_warranty($1,$2,'AUDIT-PRE-POLICY','2024-01-01',$3)`,[sample.customer_id,sample.model_id,sample.policy_id],/not effective/);
  await reject('direct warranty dates must match purchase',`INSERT INTO warranties(product_id,policy_id,start_date,end_date) SELECT id,$2,purchased_on-1,purchased_on+500 FROM registered_products WHERE id=$1`,[product,sample.policy_id],/dates must match/);
  await reject('direct product cannot belong to officer',`INSERT INTO registered_products(customer_id,model_id,serial_number,purchased_on) VALUES($1,$2,'AUDIT-INVALID-ROLE',CURRENT_DATE)`,[sample.officer_id,sample.model_id],/active customer/);
  await reject('foreign key protection',`INSERT INTO claim_evidence(claim_id,evidence_url) VALUES($1,'https://example.com')`,[randomUUID()],/foreign key constraint/);
  await reject('unsafe evidence protocol',`INSERT INTO claim_evidence(claim_id,evidence_url) VALUES($1,'javascript:alert(1)')`,[claim],/check constraint/);
  mkdirSync('docs/audit-evidence',{recursive:true});
  writeFileSync('docs/audit-evidence/database.json',JSON.stringify({passed:passed.length,tests:passed,mutations:'ROLLED BACK'},null,2));
  console.log(`PASS ${passed.length} extended integrity assertions; all writes rolled back.`);
 }finally{await db.query('ROLLBACK');db.release();await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
