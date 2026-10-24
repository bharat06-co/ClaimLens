'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function ActionButton({endpoint,label}:{endpoint:string;label:string}){
 const [busy,setBusy]=useState(false);const [err,setErr]=useState('');const router=useRouter();
 return <div><button className="btn btn-primary" disabled={busy} onClick={async()=>{
 setBusy(true);setErr('');try{
  const r=await fetch(endpoint,{method:'POST'});
  const x=await r.json(); if(!r.ok)throw new Error(x.error??'Action failed');router.refresh();
 }catch(e){setErr(e instanceof Error?e.message:'Unexpected error');}finally{setBusy(false);}
 }}>{busy?'Processing…':label}</button>{err?<div role="alert" className="error">{err}</div>:null}</div>;
}
