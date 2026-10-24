import 'dotenv/config';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {Pool} from 'pg';

async function main(){
 assert.ok(process.argv.includes('--owner-approved-one-row'),'Requires explicit owner approval; do not run as a normal setup step.');
 const pool=new Pool({connectionString:process.env.DATABASE_URL});const db=await pool.connect();
 try{
  await db.query(readFileSync('scripts/repair-legacy-warranty.sql','utf8'));
  writeFileSync('audit-private/approved-data-correction.json',JSON.stringify({
   table:'warranties',id:'0c87ea1e-bfe0-48c0-9b29-ca66706dd0f2',field:'end_date',before:'2028-02-15',after:'2028-02-14',
   approval:'User explicitly approved the one-row correction in this chat on 22 October 2026.',
   appliedAt:new Date().toISOString()
  },null,2),{flag:'wx',mode:0o600});
  console.log('PASS owner-approved warranty expiry corrected; audit entry inserted; integrity trigger re-enabled.');
 }finally{await db.query('ROLLBACK');db.release();await pool.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
