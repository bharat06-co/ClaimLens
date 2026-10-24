import 'dotenv/config';
import { Pool } from 'pg';

async function main() {
 const origin = 'http://127.0.0.1:3001';
 const db = new Pool({connectionString:process.env.DATABASE_URL});
 try {
  const login=await fetch(`${origin}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'officer@claimlens.local',password:process.env.SEED_DEMO_PASSWORD})});
  const cookie=login.headers.get('set-cookie')?.split(';')[0] ?? '';
  for(const [name,path,options] of [
   ['malformed JSON','/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'}],
   ['cross-origin login','/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://attacker.example'},body:'{}'}],
   ['malformed claim UUID','/claims/------------------------------------',{headers:{Cookie:cookie}}],
   ['malformed policy UUID','/policies/------------------------------------',{headers:{Cookie:cookie}}],
  ] as const) {
   const r=await fetch(origin+path,options); console.log(`${name}: HTTP ${r.status}`); await r.arrayBuffer();
  }
  const client=await db.connect();
  try {
   await client.query('BEGIN');
   const sample=(await client.query(`SELECT c.id,rp.id product_id FROM warranty_claims c JOIN warranties w ON w.id=c.warranty_id JOIN registered_products rp ON rp.id=w.product_id LIMIT 1`)).rows[0];
   const probes=[
    ['repair for unapproved claim',`INSERT INTO repair_orders(claim_id,status) VALUES($1,'completed')`,[sample.id]],
    ['change registered purchase date',`UPDATE registered_products SET purchased_on=purchased_on-1 WHERE id=$1`,[sample.product_id]],
   ] as const;
   for(const [name,sql,params] of probes){
    await client.query('SAVEPOINT probe');
    try{await client.query(sql,[...params]);console.log(`${name}: INCORRECTLY ACCEPTED`);}
    catch(e){console.log(`${name}: rejected (${(e as {code?:string}).code})`);}
    await client.query('ROLLBACK TO SAVEPOINT probe');
   }
  } finally {await client.query('ROLLBACK');client.release();}
 } finally {await db.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
