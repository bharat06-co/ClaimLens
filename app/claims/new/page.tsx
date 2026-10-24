import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import ApiForm from '@/components/ApiForm';
import Link from 'next/link';
export default async function NewClaim(){
 const u=await requireSession('customer');
 const warranties=await query<{id:string;serial_number:string;model_name:string;manufacturer_name:string;end_date:Date}>(
 `SELECT w.id,rp.serial_number,pm.model_name,m.name AS manufacturer_name,w.end_date
  FROM warranties w JOIN registered_products rp ON rp.id=w.product_id
  JOIN product_models pm ON pm.id=rp.model_id JOIN manufacturers m ON m.id=pm.manufacturer_id
  WHERE rp.customer_id=$1 AND NOT w.is_void ORDER BY rp.registered_at DESC`,[u.id]);
 return <main className="shell content"><div className="pagehead"><div><div className="eyebrow">STEP 02 / CLAIM SUBMISSION</div><h1>Submit a claim</h1><p className="muted">Describe the problem clearly so the officer can identify the applicable warranty terms.</p></div></div>
 <section className="panel narrow">{warranties.rows.length?<ApiForm endpoint="/api/claims" submitText="Submit claim" successPath="CLAIM" fields={[
  {name:'warrantyId',label:'Registered product',type:'select',required:true,options:warranties.rows.map(w=>({value:w.id,label:`${w.manufacturer_name} ${w.model_name} · ${w.serial_number}`}))},
  {name:'issue',label:'What went wrong?',type:'textarea',required:true,minLength:15,maxLength:3000,placeholder:'Describe symptoms, damage, and what happened...'},
  {name:'evidenceUrl',label:'Evidence link (optional)',type:'url',placeholder:'https://...'},
  {name:'evidenceNote',label:'Evidence note (optional)',placeholder:'Photo of error message, service receipt, etc.'}
 ]}/>:<><p>Register a product before submitting a claim.</p><Link href="/products/new" className="btn btn-primary">Register product ↗</Link></>}</section></main>;
}
