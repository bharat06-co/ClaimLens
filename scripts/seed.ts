import 'dotenv/config';
import { query } from '../lib/db';
import { hashPassword } from '../lib/security';
import { ingestPolicy } from '../lib/policy';

const seedPassword=process.env.SEED_DEMO_PASSWORD;
if(!seedPassword || seedPassword.length<10){
 console.error('Set SEED_DEMO_PASSWORD (at least 10 characters) in .env before seeding.');
 process.exit(1);
}
const terms=[
 {manufacturer:'Northstar Electronics',name:'Laptop Protection Warranty',months:24,version:'1.0',models:[['N14 Pro','Laptop'],['N16 Studio','Laptop']],
 rules:[
  ['coverage','Manufacturing defects in internal electronics and keyboard assembly under normal use are covered.'],
  ['exclusion','Accidental liquid spills and water ingress are not covered under this limited warranty.'],
  ['condition','The original receipt and legible product serial number are required when requesting warranty service.'],
 ],text:`DEMONSTRATION WARRANTY TERMS — NORTHSTAR ELECTRONICS LAPTOP PROTECTION POLICY. This document is fictional and provided for database demonstration only. It is not a manufacturer's actual legal policy.
 Limited Hardware Warranty. Northstar Electronics warrants laptops N14 Pro and N16 Studio against defects in materials and workmanship during normal use for a period of twenty-four months beginning on the original retail purchase date. If an internal component fails due to a verified manufacturing defect within that period, an authorized service representative may arrange repair or replacement. Covered examples include a keyboard that stops responding under ordinary operating conditions, a non-functional internal fan resulting from a component defect, and charging hardware failure not caused by external damage.
 Exclusions and accidental damage. This limited warranty excludes any failure resulting from liquid contact, spilled beverages, moisture entering the enclosure, misuse, crushed connectors, unauthorized repair or modification, drops, impact damage, and cosmetic wear. Even if a product is within its stated warranty period, the mere fact of an active warranty does not establish coverage for accidental damage. Liquid damage caused by tea, coffee, or water spilling on the keyboard is specifically outside this standard policy. The customer may request paid repair from a service provider instead.
 Claim submission requirements. A customer should provide purchase receipt details, a readable serial number, a description of the observed issue, and relevant photos or service observations where available. The manufacturer or designated claim officer reviews whether the reported failure is caused by a manufacturing defect or an excluded event. A diagnostic examination may be requested before accepting or rejecting a claim. The written decision should identify the applicable clause. An approved claim results in an authorized repair order. Decisions may be reviewed in accordance with local consumer protection law.`,
 },
 {manufacturer:'Aurelia Devices',name:'Audio Product Limited Warranty',months:12,version:'1.0',models:[['WavePods X2','Earbuds']],
 rules:[
  ['coverage','Battery or charging faults caused by internal manufacturing defects are covered for twelve months.'],
  ['exclusion','Loss, theft, physical crush damage and unauthorized modifications are excluded.'],
  ['condition','Customers must provide purchase proof and return the affected device for testing if asked.'],
 ],text:`DEMONSTRATION WARRANTY TERMS — AURELIA DEVICES WAVE PODS AUDIO. This policy is fictional and is only for a classroom database demo.
 Standard coverage. Aurelia Devices provides a twelve-month limited warranty against defects of materials and workmanship on WavePods X2 wireless earbuds, their charging case, and original power components. A device that is unable to charge due to an internal manufacturing fault may qualify for repair or replacement after inspection. Unexpected battery failure during normal recommended use can be eligible, subject to verification. The warranty period begins on the date appearing on the original purchase receipt. A valid purchase receipt and product identification information should accompany each warranty claim.
 What is not covered. This policy does not cover earbuds that are lost or stolen, damage from crushing the charging case, water damage outside documented resistance ratings, deliberately broken charging pins, unauthorized modifications, or damage caused by improper cleaning. Cosmetic surface scratches are not a manufacturing defect. Accessories sold separately are governed by their own terms. Battery wear resulting solely from ordinary aging may not qualify as defective manufacturing.
 Inspection and claims. Claims should describe the symptoms clearly, including whether the case indicator lights operate, whether the earbuds connect to a paired device, and whether charging has been attempted with an approved cable. A claim officer checks whether the warranty is still within the date range, retrieves relevant policy restrictions, and evaluates any supporting evidence. The officer records a reasoned decision, and approval generates a repair workflow. This demonstration policy does not replace statutory consumer rights.`,
 }
] as const;

async function getId(sql:string,params:unknown[]):Promise<string>{
 const r=await query<{id:string}>(sql,params);
 if(!r.rows[0])throw Error('No id returned');return r.rows[0].id;
}
async function main(){
 const officerEmail='officer@claimlens.local';
 const customerEmail='customer@claimlens.local';
 const users:{[key:string]:string}={};
 for(const [role,email,name] of [['officer',officerEmail,'Jordan Lee'],['customer',customerEmail,'Taylor Morgan']] as const){
  users[role]=await getId(`INSERT INTO app_users(full_name,email,password_hash,role)
     VALUES($1,$2,$3,$4::account_role) ON CONFLICT ((lower(email))) DO UPDATE SET full_name=excluded.full_name,password_hash=excluded.password_hash
     RETURNING id`,[name,email,hashPassword(seedPassword!),role]);
 }
 let exampleWarranty='';
 for(const t of terms){
  const manufacturer=await getId(`INSERT INTO manufacturers(name) VALUES($1)
    ON CONFLICT(name) DO UPDATE SET name=excluded.name RETURNING id`,[t.manufacturer]);
  for(const [name,category] of t.models){
   await query(`INSERT INTO product_models(manufacturer_id,model_name,category,default_warranty_months)
    VALUES($1,$2,$3,$4) ON CONFLICT(manufacturer_id,model_name) DO NOTHING`,[manufacturer,name,category,t.months]);
  }
  const policy=await getId(`INSERT INTO warranty_policies(manufacturer_id,title,version,coverage_months,effective_from)
    VALUES($1,$2,$3,$4,'2025-01-01') ON CONFLICT(manufacturer_id,title,version)
    DO UPDATE SET coverage_months=excluded.coverage_months RETURNING id`,[manufacturer,t.name,t.version,t.months]);
  for(const [kind,description] of t.rules){
   const existing=await query('SELECT 1 FROM policy_rules WHERE policy_id=$1 AND kind=$2 AND description=$3',[policy,kind,description]);
   if(!existing.rowCount)await query(`INSERT INTO policy_rules(policy_id,kind,description) VALUES($1,$2::rule_kind,$3)`,[policy,kind,description]);
  }
  const existing=await query('SELECT 1 FROM policy_documents WHERE policy_id=$1 AND title=$2',[policy,'Sample terms for demonstration']);
  if(!existing.rowCount){
   console.log(`Embedding policy: ${t.name} (first run downloads the model)`);
   console.log(await ingestPolicy(policy,'Sample terms for demonstration',t.text,null));
  }
  if(t.manufacturer==='Northstar Electronics'){
   const model=await getId(`SELECT id FROM product_models WHERE manufacturer_id=$1 AND model_name='N14 Pro'`,[manufacturer]);
   const old=await query<{id:string}>(`SELECT w.id FROM warranties w JOIN registered_products rp ON rp.id=w.product_id WHERE rp.serial_number='DEMO-N14-1001'`);
   exampleWarranty=old.rows[0]?.id??await getId(`SELECT register_warranty($1,$2,$3,$4::date,$5) AS id`,
    [users.customer,model,'DEMO-N14-1001','2026-02-15',policy]);
  }
 }
 const existing=await query(`SELECT id FROM warranty_claims WHERE customer_id=$1 AND warranty_id=$2
  AND issue_description=$3`,[users.customer,exampleWarranty,'Coffee spilled on my keyboard, and the laptop no longer powers on.']);
 if(!existing.rowCount){
  const claim=await getId(`INSERT INTO warranty_claims(warranty_id,customer_id,issue_description)
  VALUES($1,$2,$3) RETURNING id`,[exampleWarranty,users.customer,'Coffee spilled on my keyboard, and the laptop no longer powers on.']);
  console.log('Sample claim created:',claim);
 }
 console.log('Seed complete. Demo accounts:',customerEmail,officerEmail);
 console.log('Both demo accounts use the SEED_DEMO_PASSWORD value from your .env.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
