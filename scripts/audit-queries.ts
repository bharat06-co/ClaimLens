import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { Pool } from 'pg';

async function main(){
 const pool=new Pool({connectionString:process.env.DATABASE_URL});const db=await pool.connect();
 try{
  const checks:Record<string,string>={
   claim_ownership:`SELECT count(*)::int n FROM warranty_claims c JOIN warranties w ON w.id=c.warranty_id JOIN registered_products rp ON rp.id=w.product_id WHERE c.customer_id<>rp.customer_id`,
   manufacturer_scope:`SELECT count(*)::int n FROM warranties w JOIN registered_products rp ON rp.id=w.product_id JOIN product_models pm ON pm.id=rp.model_id JOIN warranty_policies p ON p.id=w.policy_id WHERE pm.manufacturer_id<>p.manufacturer_id`,
   final_decision:`SELECT count(*)::int n FROM warranty_claims c LEFT JOIN claim_decisions d ON d.claim_id=c.id WHERE (c.status IN ('approved','rejected') AND (d.id IS NULL OR c.status::text<>d.verdict::text)) OR (d.id IS NOT NULL AND c.status::text<>d.verdict::text)`,
   review_assignment:`SELECT count(*)::int n FROM warranty_claims c LEFT JOIN claim_assignments a ON a.claim_id=c.id WHERE c.status<>'submitted' AND a.claim_id IS NULL`,
   repair_approval:`SELECT count(*)::int n FROM repair_orders r JOIN warranty_claims c ON c.id=r.claim_id LEFT JOIN claim_decisions d ON d.claim_id=c.id WHERE c.status<>'approved' OR d.verdict IS DISTINCT FROM 'approved'::verdict_kind`,
   missing_approved_repair:`SELECT count(*)::int n FROM warranty_claims c LEFT JOIN repair_orders r ON r.claim_id=c.id WHERE c.status='approved' AND r.id IS NULL`,
   semantic_scope:`SELECT count(*)::int n FROM semantic_matches sm JOIN warranty_claims c ON c.id=sm.claim_id JOIN warranties w ON w.id=c.warranty_id JOIN document_chunks ch ON ch.id=sm.chunk_id JOIN policy_documents d ON d.id=ch.document_id WHERE d.policy_id<>w.policy_id`,
   vector_integrity:`SELECT count(*)::int n FROM document_chunks WHERE vector_dims(embedding)<>384 OR abs(vector_norm(embedding)-1)>0.001`,
   document_checksum:`SELECT count(*)::int n FROM policy_documents WHERE sha256<>encode(digest(original_text,'sha256'),'hex')`,
   inclusive_dates:`SELECT count(*)::int n FROM warranties w JOIN registered_products rp ON rp.id=w.product_id JOIN warranty_policies p ON p.id=w.policy_id WHERE w.start_date<>rp.purchased_on OR w.end_date<>((w.start_date+make_interval(months=>p.coverage_months))::date-1)`,
  };
  const invariants:Record<string,number>={};
  for(const [name,sql] of Object.entries(checks)){
   invariants[name]=(await db.query(sql)).rows[0].n;
   console.log(`${invariants[name]===0?'PASS':'FAIL'} ${name}: ${invariants[name]} inconsistent rows`);
  }
  const viva=await db.query(readFileSync('db/queries_for_viva.sql','utf8'));
  const statements=(Array.isArray(viva)?viva:[viva]).map(r=>({command:r.command,rowCount:r.rowCount}));
  const sample=(await db.query('SELECT embedding::text vector FROM document_chunks LIMIT 1')).rows[0].vector;
  const plan=(await db.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM document_chunks ORDER BY embedding <=> $1::vector LIMIT 5`,[sample])).rows[0]['QUERY PLAN'];
  await db.query('BEGIN');
  await db.query('SET LOCAL enable_seqscan=off');
  const indexed=(await db.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT id FROM document_chunks ORDER BY embedding <=> $1::vector LIMIT 5`,[sample])).rows[0]['QUERY PLAN'];
  await db.query('ROLLBACK');
  assert.ok(JSON.stringify(indexed).includes('chunks_embedding_hnsw_idx'));
  mkdirSync('docs/audit-evidence',{recursive:true});
  writeFileSync('docs/audit-evidence/queries-and-integrity.json',JSON.stringify({invariants,vivaStatements:statements,normalPlan:plan,indexDemonstrationPlan:indexed,note:'Forced index plan demonstrates usability; normal planner may choose a sequential scan on this small dataset.'},null,2));
  console.log('PASS viva JOIN/group/HAVING/subquery/DDL/DML queries and HNSW EXPLAIN; temporary DDL rolled back.');
  if(Object.values(invariants).some(n=>n!==0))process.exitCode=1;
 }finally{await db.query('ROLLBACK');db.release();await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
