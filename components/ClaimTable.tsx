'use client';
import Link from 'next/link';
import { useMemo,useState } from 'react';
import Status from './Status';
import {dateText} from '@/lib/format';
export type ClaimListItem={id:string;customer_name:string;manufacturer_name:string;model_name:string;serial_number:string;status:string;submitted_at:string;issue_description:string};
export default function ClaimTable({claims,customer}:{claims:ClaimListItem[];customer:boolean}) {
 const [filter,setFilter]=useState('all');
 const [search,setSearch]=useState('');
 const rows=useMemo(()=>claims.filter(c=>(filter==='all'||c.status===filter)&&
  `${c.manufacturer_name} ${c.model_name} ${c.serial_number} ${c.customer_name} ${c.issue_description}`.toLowerCase().includes(search.toLowerCase().trim())),[claims,filter,search]);
 return <>
 <div className="filters"><label className="filterfield"><span>Search claims</span><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Product, serial, issue..." aria-label="Search claims"/></label>
 <label className="filterfield"><span>Status</span><select value={filter} onChange={e=>setFilter(e.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="submitted">Submitted</option><option value="in_review">In review</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></label>
 <span className="filtercount">Showing {rows.length} of {claims.length}</span></div>
 {rows.length?<div className="tablewrap"><table><thead><tr><th>Product</th>{!customer?<th>Customer</th>:null}<th>Issue</th><th>Submitted</th><th>Status</th><th></th></tr></thead><tbody>
 {rows.map(c=><tr key={c.id}><td><b>{c.manufacturer_name} {c.model_name}</b><div className="muted small">{c.serial_number}</div></td>{!customer?<td>{c.customer_name}</td>:null}<td className="ellipsed">{c.issue_description}</td><td>{dateText(c.submitted_at)}</td><td><Status value={c.status}/></td><td><Link className="tablelink" href={`/claims/${c.id}`}>View →</Link></td></tr>)}
 </tbody></table></div>:<div className="empty">No claims match these filters.</div>}
 </>;
}
