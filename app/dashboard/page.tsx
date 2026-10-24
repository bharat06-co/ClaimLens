import Link from 'next/link';
import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import Status from '@/components/Status';
import {dateText} from '@/lib/format';
import ClaimTable from '@/components/ClaimTable';

type Claim={id:string;customer_name:string;manufacturer_name:string;model_name:string;serial_number:string;status:string;submitted_at:Date;assigned_officer:string|null;issue_description:string};
type Product={id:string;manufacturer_name:string;model_name:string;serial_number:string;start_date:Date;end_date:Date;is_void:boolean;is_active:boolean};
type Policy={id:string;title:string;version:string;manufacturer_name:string;document_count:number;chunk_count:number};
export default async function Dashboard(){
 const u=await requireSession();
 const customer=u.role==='customer';
 const claims=await query<Claim>(
  `SELECT id,customer_name,manufacturer_name,model_name,serial_number,status,submitted_at,assigned_officer,issue_description
   FROM v_claim_overview ${customer?'WHERE customer_id=$1':''} ORDER BY submitted_at DESC`,
  customer?[u.id]:[]);
 const counts=claims.rows.reduce((a,c)=>{a[c.status]=(a[c.status]||0)+1;return a;},{} as Record<string,number>);
 let products:Product[]=[];let policies:Policy[]=[];
 if(customer){
  products=(await query<Product>(`SELECT rp.id,m.name AS manufacturer_name,pm.model_name,rp.serial_number,w.start_date,w.end_date,w.is_void,
      (CURRENT_DATE BETWEEN w.start_date AND w.end_date AND NOT w.is_void) AS is_active
    FROM registered_products rp JOIN product_models pm ON pm.id=rp.model_id
    JOIN manufacturers m ON m.id=pm.manufacturer_id JOIN warranties w ON w.product_id=rp.id
    WHERE rp.customer_id=$1 ORDER BY rp.registered_at DESC`,[u.id])).rows;
 }else{
  policies=(await query<Policy>('SELECT * FROM v_policy_inventory ORDER BY manufacturer_name,title')).rows;
 }
 return <main className="shell content">
 <div className="pagehead"><div><div className="eyebrow">{customer?'CUSTOMER WORKSPACE':'CLAIM OFFICER WORKSPACE'}</div>
 <h1>{customer?'Your warranty overview':'Claim operations'}</h1>
 <p className="muted">{customer?'Welcome back, '+u.name+'. All your product coverage in one place.':'Review incoming claims, consult relevant policy clauses, and make recorded decisions.'}</p></div>
 <div className="headeractions">{customer?<><Link href="/products/new" className="btn btn-outline">+ Register product</Link><Link href="/claims/new" className="btn btn-primary">+ New claim</Link></>:null}</div></div>
 <div className="stats">
  <div className="stat"><span>Total claims</span><strong>{claims.rows.length}</strong><small>Recorded submissions</small></div>
  <div className="stat"><span>Awaiting review</span><strong>{counts.submitted||0}</strong><small>Unassigned claims</small></div>
  <div className="stat"><span>In review</span><strong>{counts.in_review||0}</strong><small>Officer assessment</small></div>
  <div className="stat"><span>Resolved</span><strong>{(counts.approved||0)+(counts.rejected||0)}</strong><small>Approved or rejected</small></div>
 </div>
 <section className="panel tablepanel"><div className="panelhead"><div><div className="eyebrow">CLAIM REGISTER</div><h2>{customer?'My claims':'All claims'}</h2></div><div className="paneltag">MOST RECENT FIRST</div></div>
 {claims.rows.length?<ClaimTable claims={claims.rows.map(c=>({...c,submitted_at:new Date(c.submitted_at).toISOString()}))} customer={customer}/>:<div className="empty"><h3>Nothing here yet</h3><p>{customer?'Register a product and submit your first claim.':'Customer claims will show up in this queue.'}</p></div>}</section>
 {customer?<section className="panel tablepanel"><div className="panelhead"><div><div className="eyebrow">COVERAGE PORTFOLIO</div><h2>Registered products</h2></div><Link href="/products/new" className="tablelink">+ Add product</Link></div>
 {products.length?<div className="tablewrap"><table><thead><tr><th>Product</th><th>Serial</th><th>Coverage start</th><th>Coverage end</th><th>Period</th></tr></thead><tbody>
 {products.map(p=><tr key={p.id}><td><b>{p.manufacturer_name} {p.model_name}</b></td><td>{p.serial_number}</td><td>{dateText(p.start_date)}</td><td>{dateText(p.end_date)}</td><td><span className={`status ${p.is_active?'status-approved':p.is_void?'status-rejected':'status-submitted'}`}>{p.is_void?'Voided':p.is_active?'Active':'Expired'}</span></td></tr>)}
 </tbody></table></div>:<div className="empty">No registered products yet.</div>}
 </section>:<section className="panel tablepanel"><div className="panelhead"><div><div className="eyebrow">KNOWLEDGE BASE</div><h2>Warranty policies</h2></div><div className="paneltag">POSTGRESQL + PGVECTOR</div></div>
 <div className="tablewrap"><table><thead><tr><th>Manufacturer</th><th>Policy</th><th>Documents</th><th>Embedded chunks</th><th></th></tr></thead><tbody>
 {policies.map(p=><tr key={p.id}><td>{p.manufacturer_name}</td><td><b>{p.title}</b> <span className="muted small">v{p.version}</span></td><td>{p.document_count}</td><td>{p.chunk_count}</td><td><Link href={`/policies/${p.id}`} className="tablelink">Open →</Link></td></tr>)}
 </tbody></table></div></section>}
 </main>;
}
