import 'dotenv/config';
import assert from 'node:assert/strict';
import { readFileSync,readdirSync,mkdirSync,writeFileSync } from 'node:fs';
import { Pool } from 'pg';

async function main(){
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 const db=await pool.connect();
 const schema=`audit_migrations_${Date.now()}`;
 try{
  await db.query('BEGIN');
  await db.query(`CREATE SCHEMA ${schema}`);
  await db.query(`SET LOCAL search_path TO ${schema}, public`);
  const migrations=readdirSync('db/migrations').filter(f=>f.endsWith('.sql')).sort();
  for(const name of migrations){
   const sql=readFileSync(`db/migrations/${name}`,'utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
   await db.query(sql);console.log(`PASS clean schema migration ${name}`);
  }
  const tables=await db.query('SELECT tablename FROM pg_tables WHERE schemaname=$1',[schema]);
  assert.equal(tables.rowCount,16);
  const columns=await db.query(`SELECT format_type(a.atttypid,a.atttypmod) type FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relname='document_chunks' AND a.attname='embedding'`,[schema]);
  assert.equal(columns.rows[0].type,'vector(384)');
  const indexes=await db.query('SELECT indexdef FROM pg_indexes WHERE schemaname=$1',[schema]);
  assert.ok(indexes.rows.some(r=>r.indexdef.includes('USING hnsw')));
  assert.ok(indexes.rows.some(r=>r.indexdef.includes('USING gin')));
  mkdirSync('docs/audit-evidence',{recursive:true});
  writeFileSync('docs/audit-evidence/migrations.json',JSON.stringify({passed:true,migrations,tables:tables.rowCount,vectorDimensions:384,hnsw:true,gin:true,mutations:'ROLLED BACK'},null,2));
  console.log('PASS 16 fresh tables, vector(384), HNSW and GIN; temporary schema rolled back.');
 }finally{await db.query('ROLLBACK');db.release();await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
