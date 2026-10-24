'use client';
import { FormEvent,useState } from 'react';
import { useRouter } from 'next/navigation';
type Model={id:string;manufacturer_id:string;model_name:string;manufacturer_name:string;category:string};
type Policy={id:string;manufacturer_id:string;title:string;version:string;coverage_months:number;effective_from:string};
export default function ProductForm({models,policies}:{models:Model[];policies:Policy[]}){
 const router=useRouter();
 const [modelId,setModelId]=useState(models[0]?.id??'');
 const [purchaseDate,setPurchaseDate]=useState('');
 const [error,setError]=useState('');const [busy,setBusy]=useState(false);
 const model=models.find(m=>m.id===modelId);
 const eligible=policies.filter(p=>p.manufacturer_id===model?.manufacturer_id && (!purchaseDate||p.effective_from<=purchaseDate));
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setBusy(true);setError('');
  const data=Object.fromEntries(new FormData(e.currentTarget).entries());
  try{
   const r=await fetch('/api/products',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,modelId,policyId:data.policyId})});
   const x=await r.json();if(!r.ok)throw new Error(x.error??'Failed to register');
   router.push('/dashboard');router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Unexpected error');}
  finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="formstack">
  <label className="field"><span>Product model</span><select value={modelId} onChange={e=>setModelId(e.target.value)} required>
   {models.map(m=><option key={m.id} value={m.id}>{m.manufacturer_name} — {m.model_name} ({m.category})</option>)}
  </select></label>
  <label className="field"><span>Applicable policy</span><select name="policyId" key={`${modelId}:${purchaseDate}`} required>
   {eligible.map(p=><option key={p.id} value={p.id}>{p.title} · v{p.version} · {p.coverage_months} months</option>)}
  </select></label>
  <label className="field"><span>Product serial number</span><input name="serialNumber" required minLength={5} maxLength={100} placeholder="e.g. NTB-2026-A1842"/></label>
  <label className="field"><span>Purchase date</span><input type="date" name="purchaseDate" required value={purchaseDate} onInput={e=>setPurchaseDate(e.currentTarget.value)} onChange={e=>setPurchaseDate(e.target.value)} max={new Date().toISOString().slice(0,10)} /></label>
  {purchaseDate&&!eligible.length?<p className="notice">No configured policy from this manufacturer was effective on the purchase date. Choose the correct purchase date or ask an officer to provision the applicable policy version.</p>:null}
  <p className="muted small">A warranty record will be created automatically with the policy's coverage period. Serial numbers must be unique.</p>
  {error?<div className="error" role="alert">{error}</div>:null}
  <button className="btn btn-primary" disabled={!eligible.length ||busy}>{busy?'Registering…':'Register product ↗'}</button>
 </form>;
}
