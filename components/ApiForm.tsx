'use client';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
export type InputField = { name:string; label:string; type?:'text'|'email'|'password'|'date'|'url'|'textarea'|'select';
  placeholder?:string; required?:boolean; minLength?:number; maxLength?:number;
  options?:{value:string; label:string}[]; hint?:string; defaultValue?:string };
export default function ApiForm({endpoint, fields,submitText,successPath='/dashboard',method='POST'}:{
 endpoint:string;fields:InputField[];submitText:string;successPath?:string;method?:'POST'|'PUT';
}){
 const [error,setError]=useState(''); const [success,setSuccess]=useState(''); const [loading,setLoading]=useState(false);const router=useRouter();
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault(); setError('');setSuccess('');setLoading(true);
  const form=e.currentTarget;
  const data=Object.fromEntries(new FormData(form).entries());
  try{
   const res=await fetch(endpoint,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
   const result=await res.json();
   if(!res.ok) throw new Error(result.error ?? 'Request failed');
   setSuccess(typeof result.chunkCount==='number'?`Document indexed successfully: ${result.chunkCount} passage(s).`:'Saved successfully.');
   form.reset();
   router.push(successPath==='CLAIM'&&result.id?`/claims/${result.id}`:successPath);router.refresh();
  }catch(err){setError(err instanceof Error?err.message:'Unexpected error');}
  finally{setLoading(false);}
 }
 return <form className="formstack" onSubmit={submit}>
  {fields.map(f=><label className="field" key={f.name}><span>{f.label}</span>
   {f.type==='textarea'?<textarea name={f.name} rows={5} required={f.required} minLength={f.minLength} maxLength={f.maxLength} placeholder={f.placeholder} defaultValue={f.defaultValue}/>:
   f.type==='select'?<select key={f.options?.map(o=>o.value).join('|')} name={f.name} required={f.required} defaultValue={f.defaultValue??f.options?.[0]?.value}>
     {f.options?.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
   </select>:<input name={f.name} type={f.type??'text'} required={f.required} minLength={f.minLength} maxLength={f.maxLength} placeholder={f.placeholder} defaultValue={f.defaultValue}/>}
   {f.hint?<small className="muted">{f.hint}</small>:null}
  </label>)}
  {error?<div className="error" role="alert">{error}</div>:null}
  {success?<div className="notice" role="status">{success}</div>:null}
  <button className="btn btn-primary" type="submit" disabled={loading}>{loading?'Working…':submitText} <span aria-hidden="true">↗</span></button>
 </form>;
}
