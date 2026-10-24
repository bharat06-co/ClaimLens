import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { issueToken } from '../lib/security';
import { mkdirSync, writeFileSync } from 'node:fs';

// Real HTTP integration tests. Keeps clearly marked synthetic fixtures; never
// resets/reseeds a database or changes existing users, passwords or claims.
async function main(){
 const base=process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3001';
 assert.ok(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Audit must target localhost');
 const db=new Pool({connectionString:process.env.DATABASE_URL});
 const run=`${Date.now()}-${randomBytes(3).toString('hex')}`;
 const password=`Audit${randomBytes(15).toString('hex')}7`;
 const tests:{name:string;status:string}[]=[];
 const record=(name:string)=>{tests.push({name,status:'PASS'});console.log(`PASS ${name}`);};
 const request=async(path:string,data?:unknown,cookie='',extra:Record<string,string>={})=>{
  const response=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...extra},body:data===undefined?undefined:JSON.stringify(data)});
  const body=await response.json();return {response,body,cookie:response.headers.get('set-cookie')?.split(';')[0] ?? ''};
 };
 const expect=async(name:string,path:string,data:unknown,status:number,cookie='',extra:Record<string,string>={})=>{
  const r=await request(path,data,cookie,extra); assert.equal(r.response.status,status,`${name}: ${JSON.stringify(r.body)}`);record(name);return r;
 };
 const get=async(name:string,path:string,status:number,cookie='',text?:string)=>{
  const r=await fetch(base+path,{headers:cookie?{Cookie:cookie}:{},redirect:'manual'});const html=await r.text();
  assert.equal(r.status,status,name);if(text)assert.ok(html.includes(text),name);record(name);return html;
 };
 try {
  await get('anonymous dashboard redirects','/dashboard',307);
  for(const route of ['/api/products','/api/claims',`/api/claims/${randomUUID()}/assign`,`/api/claims/${randomUUID()}/decision`,`/api/claims/${randomUUID()}/matches`,`/api/repairs/${randomUUID()}`,`/api/policies/${randomUUID()}/documents`]){
   await expect(`anonymous denied ${route.split('/').filter(Boolean).slice(0,2).join('/')}`,route,{},401);
  }
  const malformed=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});
  assert.equal(malformed.status,400);record('malformed JSON is 400');
  await expect('cross-origin mutation denied','/api/auth/login',{},403,'',{Origin:'https://attacker.example'});
  await expect('weak password rejected','/api/auth/register',{fullName:'AUDIT Invalid',email:`audit.invalid.${run}@claimlens.local`,password:'weakpass'},400);
  const email=`audit.api.${run}@claimlens.local`;
  const account=await expect('customer registration','/api/auth/register',{fullName:`AUDIT API ${run}`,email,password,role:'officer'},201);
  const cookie=account.cookie;assert.ok(cookie);
  const setCookie=account.response.headers.get('set-cookie') ?? '';
  assert.match(setCookie,/HttpOnly/i);assert.match(setCookie,/SameSite=Lax/i);record('session cookie HttpOnly and SameSite');
  const customer=(await db.query('SELECT id,role FROM app_users WHERE email=$1',[email])).rows[0];
  assert.equal(customer.role,'customer');record('registration cannot escalate role');
  await expect('case-insensitive duplicate email','/api/auth/register',{fullName:'AUDIT Duplicate',email:email.toUpperCase(),password},409);
  await expect('incorrect password denied','/api/auth/login',{email,password:password+'wrong'},401);
  const normalized=await expect('trimmed uppercase login','/api/auth/login',{email:`  ${email.toUpperCase()}  `,password},200);
  assert.ok(normalized.cookie);
  await get('tampered cookie rejected','/dashboard',307,cookie+'x');
  await get('expired signed cookie rejected','/dashboard',307,`cl_session=${issueToken(customer.id,Date.now()-8*86400_000)}`);
  await get('authenticated customer dashboard','/dashboard',200,cookie,`AUDIT API ${run}`);
  await expect('customer cannot assign','/api/claims/'+randomUUID()+'/assign',{},403,cookie);
  await expect('customer cannot decide','/api/claims/'+randomUUID()+'/decision',{},403,cookie);
  await expect('customer cannot search policies','/api/claims/'+randomUUID()+'/matches',{},403,cookie);
  await expect('customer cannot ingest documents','/api/policies/'+randomUUID()+'/documents',{},403,cookie);
  await expect('customer cannot repair','/api/repairs/'+randomUUID(),{},403,cookie);
  await get('customer blocked from officer policy page','/policies/'+randomUUID(),307,cookie);
  const maker=(await db.query('INSERT INTO manufacturers(name) VALUES($1) RETURNING id',[`AUDIT Manufacturer ${run}`])).rows[0].id;
  const model=(await db.query(`INSERT INTO product_models(manufacturer_id,model_name,category,default_warranty_months) VALUES($1,'AUDIT Keyboard Laptop','Laptop',12) RETURNING id`,[maker])).rows[0].id;
  const policy=(await db.query(`INSERT INTO warranty_policies(manufacturer_id,title,version,coverage_months,effective_from) VALUES($1,$2,'1',12,'2025-01-01') RETURNING id`,[maker,`AUDIT Policy ${run}`])).rows[0].id;
  const foreignPolicy=(await db.query('SELECT id FROM warranty_policies WHERE manufacturer_id<>$1 LIMIT 1',[maker])).rows[0].id;
  const today=new Date().toISOString().slice(0,10);
  const product={modelId:model,policyId:policy,serialNumber:`AUDIT-API-${run}`,purchaseDate:today};
  await expect('manufacturer mismatch rejected','/api/products',{...product,policyId:foreignPolicy},400,cookie);
  await expect('future purchase rejected','/api/products',{...product,purchaseDate:'2099-01-01'},400,cookie);
  await expect('policy not yet effective rejected','/api/products',{...product,purchaseDate:'2024-01-01'},400,cookie);
  await expect('invalid calendar date rejected','/api/products',{...product,purchaseDate:'2026-02-30'},400,cookie);
  const registered=await expect('product registration','/api/products',product,201,cookie);
  const warranty=registered.body.warrantyId;
  await db.query('UPDATE warranties SET is_void=true WHERE id=$1',[warranty]);
  try{
   await expect('void warranty claim denied','/api/claims',{warrantyId:warranty,issue:'AUDIT: Claim on void warranty must be rejected.'},403,cookie);
  }finally{await db.query('UPDATE warranties SET is_void=false WHERE id=$1',[warranty]);}
  await expect('duplicate serial rejected','/api/products',product,409,cookie);
  const coverage=(await db.query(`SELECT start_date::text,end_date::text,end_date=((start_date+interval '12 months')::date-1) correct FROM warranties WHERE id=$1`,[warranty])).rows[0];
  assert.equal(coverage.start_date,today);assert.equal(coverage.correct,true);record('inclusive warranty dates in database');
  const other=await expect('second customer registration','/api/auth/register',{fullName:`AUDIT Other ${run}`,email:`audit.other.${run}@claimlens.local`,password},201);
  const issue='AUDIT internal keyboard stopped responding during normal use; manufacturing electronics defect without accidental damage.';
  const payload={warrantyId:warranty,issue,evidenceUrl:'https://example.com/audit-evidence',evidenceNote:'AUDIT synthetic evidence'};
  await expect('foreign warranty ownership denied','/api/claims',payload,403,other.cookie);
  await expect('short issue rejected','/api/claims',{...payload,issue:'short'},400,cookie);
  await expect('unsafe evidence rejected','/api/claims',{...payload,evidenceUrl:'javascript:alert(1)'},400,cookie);
  const submitted=await expect('claim with evidence created','/api/claims',payload,201,cookie);
  const claim=submitted.body.id;
  assert.equal((await db.query('SELECT count(*)::int n FROM claim_evidence WHERE claim_id=$1',[claim])).rows[0].n,1);record('claim evidence saved atomically');
  await get('owner views own claim',`/claims/${claim}`,200,cookie,issue);
  await get('other customer claim isolated',`/claims/${claim}`,404,other.cookie);
  await get('malformed claim URL is 404','/claims/'+'-'.repeat(36),404,cookie);
  const officer=await expect('existing officer login','/api/auth/login',{email:'officer@claimlens.local',password:process.env.SEED_DEMO_PASSWORD},200);
  const officerCookie=officer.cookie;
  await expect('officer cannot register customer product','/api/products',product,403,officerCookie);
  await expect('officer cannot submit customer claim','/api/claims',payload,403,officerCookie);
  await get('officer policy page',`/policies/${policy}`,200,officerCookie,`AUDIT Policy ${run}`);
  await get('malformed policy URL is 404','/policies/'+'-'.repeat(36),404,officerCookie);
  const decision={verdict:'approved',reason:'AUDIT manufacturing defect covered under the fictional keyboard warranty.'};
  await expect('cannot decide unassigned claim',`/api/claims/${claim}/decision`,decision,409,officerCookie);
  await expect('unknown decision claim is 404',`/api/claims/${randomUUID()}/decision`,decision,404,officerCookie);
  const race=await Promise.all([request(`/api/claims/${claim}/assign`,{},officerCookie),request(`/api/claims/${claim}/assign`,{},officerCookie)]);
  assert.deepEqual(race.map(x=>x.response.status).sort(),[200,409]);record('concurrent assignment has one winner');
  await expect('short decision reason rejected',`/api/claims/${claim}/decision`,{...decision,reason:'short'},400,officerCookie);
  if(process.argv.includes('--semantic')){
   const text='AUDIT FICTIONAL POLICY. Manufacturing defects in the internal keyboard and charging electronics during normal use are covered for twelve months. A keyboard that stops responding due to an internal manufacturing fault qualifies for inspection and authorized repair. Liquid spills, water ingress, drops, impact damage and unauthorized modifications are excluded. Customers must provide their original receipt, readable serial number, and evidence. A human officer records the final decision after reviewing these terms.';
   await expect('real document ingestion',`/api/policies/${policy}/documents`,{title:`AUDIT terms ${run}`,text},201,officerCookie);
   await expect('duplicate policy document rejected',`/api/policies/${policy}/documents`,{title:'AUDIT duplicate text',text},409,officerCookie);
   const search=await expect('real semantic retrieval',`/api/claims/${claim}/matches`,{},200,officerCookie);
   assert.ok(search.body.matches.length);assert.match(search.body.matches[0].content,/keyboard/);
   await expect('repeat retrieval replaces ranks atomically',`/api/claims/${claim}/matches`,{},200,officerCookie);
   const scope=await db.query(`SELECT count(*)::int n FROM semantic_matches sm JOIN document_chunks ch ON ch.id=sm.chunk_id JOIN policy_documents d ON d.id=ch.document_id WHERE sm.claim_id=$1 AND d.policy_id<>$2`,[claim,policy]);
   assert.equal(scope.rows[0].n,0);record('retrieval policy isolation');
  }
  await expect('claim approved',`/api/claims/${claim}/decision`,decision,200,officerCookie);
  await expect('duplicate final decision blocked',`/api/claims/${claim}/decision`,decision,409,officerCookie);
  const repair=(await db.query('SELECT id,status FROM repair_orders WHERE claim_id=$1',[claim])).rows[0];
  assert.equal(repair.status,'open');record('approval automatically creates open repair');
  await expect('repair cannot skip start',`/api/repairs/${repair.id}`,{status:'completed'},400,officerCookie);
  await expect('repair starts',`/api/repairs/${repair.id}`,{status:'in_progress'},200,officerCookie);
  await expect('repair completes',`/api/repairs/${repair.id}`,{status:'completed'},200,officerCookie);
  await expect('completed repair cannot reopen',`/api/repairs/${repair.id}`,{status:'in_progress'},400,officerCookie);
  for(const verdict of ['rejected','approved']){
   const extraClaim=(await expect(`extra ${verdict} claim`, '/api/claims',{warrantyId:warranty,issue:'AUDIT: Liquid spilled on the keyboard and caused power failure.'},201,cookie)).body.id;
   await expect(`assign ${verdict} case`,`/api/claims/${extraClaim}/assign`,{},200,officerCookie);
   await expect(`record ${verdict} case`,`/api/claims/${extraClaim}/decision`,{verdict,reason:'AUDIT synthetic decision to exercise rejection or repair cancellation.'},200,officerCookie);
   const orders=await db.query('SELECT id FROM repair_orders WHERE claim_id=$1',[extraClaim]);
   if(verdict==='rejected'){assert.equal(orders.rowCount,0);record('rejected claim has no repair');}
   else await expect('open repair can cancel',`/api/repairs/${orders.rows[0].id}`,{status:'cancelled'},200,officerCookie);
  }
  const events=(await db.query('SELECT event_type FROM audit_events WHERE entity_id=$1',[claim])).rows.map(r=>r.event_type);
  for(const event of ['claim_submitted','claim_assigned','claim_decision','repair_status_changed'])assert.ok(events.includes(event));record('submission assignment decision repair audit trail');
  await get('resolved owner page',`/claims/${claim}`,200,cookie,'Completed');
  await expect('logout clears cookie','/api/auth/logout',{},200,cookie);
  await db.query('UPDATE app_users SET is_active=false WHERE id=$1',[customer.id]);
  try {
   await get('inactive user session rejected','/dashboard',307,cookie);
   await expect('inactive user login denied','/api/auth/login',{email,password},401);
   await expect('inactive user mutation denied','/api/claims',payload,401,cookie);
  }finally{await db.query('UPDATE app_users SET is_active=true WHERE id=$1',[customer.id]);}
  mkdirSync('docs/audit-evidence',{recursive:true});mkdirSync('audit-private',{recursive:true});
  // A production review server can use a port other than the original 3002.
  const configuredMode=process.env.AUDIT_MODE;
  assert.ok(configuredMode===undefined || ['production','development'].includes(configuredMode),'Invalid AUDIT_MODE');
  const mode=configuredMode ?? (new URL(base).port==='3002'?'production':'development');
  writeFileSync(`docs/audit-evidence/api-${mode}.json`,JSON.stringify({run,base,passed:tests.length,semantic:process.argv.includes('--semantic'),claimId:claim,tests},null,2));
  writeFileSync(`audit-private/api-${mode}-credentials.json`,JSON.stringify({email,password,run}),{mode:0o600});
  console.log(`PASS ${tests.length} HTTP/integration assertions. AUDIT fixtures retained; originals untouched.`);
 }finally{await db.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
