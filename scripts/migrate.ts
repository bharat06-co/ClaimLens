import 'dotenv/config';
import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

async function main(){
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 try {
  const client=await pool.connect();
  try {
   // Serialize first-time installs and concurrent migration processes.
   await client.query('SELECT pg_advisory_lock(92316031)');
   await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations(
     name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())`);
   const migrations=readdirSync('db/migrations').filter(f=>f.endsWith('.sql')).sort();
   for(const name of migrations){
    const found=await client.query('SELECT 1 FROM schema_migrations WHERE name=$1',[name]);
    if(found.rowCount){console.log(`Already applied: ${name}`);continue;}
    const sql=readFileSync(join('db/migrations',name),'utf8')
     .replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
    await client.query('BEGIN');
    try {
     await client.query(sql);
     await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]);
     await client.query('COMMIT');
     console.log(`Applied ${name}`);
    } catch(e) {await client.query('ROLLBACK');throw e;}
   }
  } finally {
   await client.query('SELECT pg_advisory_unlock(92316031)');
   client.release();
  }
 } finally {await pool.end();}
}
main().catch(e=>{console.error('Migration failed:',e);process.exitCode=1;});
