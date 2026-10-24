import { requireSession } from '@/lib/auth';
import { query } from '@/lib/db';
import ProductForm from '@/components/ProductForm';
export default async function NewProduct(){
 await requireSession('customer');
 const models=await query<{id:string;manufacturer_id:string;model_name:string;manufacturer_name:string;category:string}>(
 `SELECT pm.id,pm.manufacturer_id,pm.model_name,m.name AS manufacturer_name,pm.category
  FROM product_models pm JOIN manufacturers m ON m.id=pm.manufacturer_id ORDER BY m.name,pm.model_name`);
 const policies=await query<{id:string;manufacturer_id:string;title:string;version:string;coverage_months:number;effective_from:string}>(
 `SELECT id,manufacturer_id,title,version,coverage_months,effective_from::text FROM warranty_policies ORDER BY title`);
 return <main className="shell content"><div className="pagehead"><div><div className="eyebrow">STEP 01 / PRODUCT ONBOARDING</div><h1>Register a product</h1><p className="muted">Attach an existing manufacturer's warranty policy to your purchase.</p></div></div>
 <section className="panel narrow">{models.rows.length?<ProductForm models={models.rows} policies={policies.rows}/>:<p>No products are configured. Ask an officer to initialize the demo catalog.</p>}</section></main>;
}
