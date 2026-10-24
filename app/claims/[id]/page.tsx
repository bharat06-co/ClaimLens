import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireSession} from '@/lib/auth';
import {query} from '@/lib/db';
import {dateText} from '@/lib/format';
import Status from '@/components/Status';
import ApiForm from '@/components/ApiForm';
import ActionButton from '@/components/ActionButton';
import { z } from 'zod';

type Claim={id:string;customer_id:string;customer_name:string;issue_description:string;status:string;submitted_at:Date;manufacturer_name:string;model_name:string;serial_number:string;start_date:Date;end_date:Date;within_warranty_period:boolean;officer_id:string|null;assigned_officer:string|null;verdict:string|null;decision_reason:string|null;policy_id:string;policy_title:string};
type Evidence={id:string;evidence_url:string;note:string|null};
type Match={id:string;content:string;document_title:string;similarity_score:number;result_rank:number;retrieved_at:Date};
type Event={id:number;event_type:string;details:Record<string,unknown>;occurred_at:Date};
type Repair={id:string;status:string;service_center:string|null;notes:string|null;opened_at:Date};
export default async function ClaimDetail({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const u=await requireSession();
 if(!z.uuid().safeParse(id).success)notFound();
 const r=await query<Claim>(`SELECT v.*,w.policy_id,p.title AS policy_title
  FROM v_claim_overview v JOIN warranty_claims c ON c.id=v.id
  JOIN warranties w ON w.id=c.warranty_id JOIN warranty_policies p ON p.id=w.policy_id
  WHERE v.id=$1`,[id]);
 const c=r.rows[0];if(!c || (u.role==='customer' && c.customer_id!==u.id))notFound();
 const [evidence,matches,events,repair]=await Promise.all([
  query<Evidence>('SELECT id,evidence_url,note FROM claim_evidence WHERE claim_id=$1 ORDER BY created_at',[id]),
  query<Match>(`SELECT sm.id,sm.similarity_score,sm.result_rank,sm.retrieved_at,ch.content,
   d.title AS document_title FROM semantic_matches sm
   JOIN document_chunks ch ON ch.id=sm.chunk_id JOIN policy_documents d ON d.id=ch.document_id
   WHERE sm.claim_id=$1 ORDER BY sm.result_rank`,[id]),
  query<Event>('SELECT id,event_type,details,occurred_at FROM audit_events WHERE entity_id=$1 ORDER BY occurred_at DESC',[id]),
  query<Repair>('SELECT id,status,service_center,notes,opened_at FROM repair_orders WHERE claim_id=$1',[id]),
 ]);
 const officer=u.role==='officer';
 return <main className="shell content"><div className="pagehead"><div><div className="eyebrow"><Link href="/dashboard" className="backlink">← CLAIM REGISTER</Link> / CASE {id.slice(0,8).toUpperCase()}</div><h1>Claim review</h1><p className="muted">{c.manufacturer_name} {c.model_name} · {c.serial_number}</p></div><Status value={c.status}/></div>
 <div className="detailgrid"><div className="detailmain">
 <section className="panel"><div className="panelhead"><h2>Reported issue</h2><span className="muted small">{dateText(c.submitted_at)}</span></div><p className="issuebox">{c.issue_description}</p>
 <div className="detailfacts"><div><span>Submitted by</span><b>{c.customer_name}</b></div><div><span>Officer</span><b>{c.assigned_officer??'Not yet assigned'}</b></div><div><span>Warranty period</span><b>{dateText(c.start_date)} — {dateText(c.end_date)}</b></div><div><span>Within date range</span><b>{c.within_warranty_period?'Yes':'No'}</b></div></div>
 <div className="notice">Warranty date validity does not guarantee damage coverage. An officer must evaluate the actual policy terms and evidence.</div>
 </section>
 <section className="panel"><div className="panelhead"><div><div className="eyebrow">DOCUMENT RETRIEVAL</div><h2>Relevant warranty clauses</h2></div></div>
 <p className="muted">Policy: <strong>{c.policy_title}</strong>. A search uses normalized MiniLM embeddings and pgvector cosine similarity restricted to this claim's warranty policy.</p>
 {officer?<div className="actionrow"><ActionButton endpoint={`/api/claims/${id}/matches`} label="↗ Run semantic search"/><Link className="tablelink" href={`/policies/${c.policy_id}`}>View policy library →</Link></div>:null}
 {matches.rows.length?matches.rows.map(m=><div className="match" key={m.id}><div className="matchhead"><b>#{m.result_rank} · {m.document_title}</b><span>Similarity {(m.similarity_score*100).toFixed(1)}%</span></div><p>{m.content}</p></div>):<div className="empty">No passages retrieved yet. {officer?'Run semantic search after ingesting the relevant policy document.':'The claim officer can retrieve policy evidence during review.'}</div>}
 <p className="muted tiny">Similarity scores are retrieval signals, not approval probabilities or legal conclusions.</p>
 </section>
 <section className="panel"><div className="panelhead"><h2>Supporting evidence</h2><span className="paneltag">{evidence.rows.length} LINK(S)</span></div>
 {evidence.rows.length?evidence.rows.map(e=><p key={e.id}><a href={e.evidence_url} target="_blank" rel="noopener noreferrer">Open attached link ↗</a>{e.note?<span className="muted"> — {e.note}</span>:null}</p>):<p className="muted">No evidence links provided.</p>}
 </section>
 </div><aside className="detailside">
 <section className="panel"><div className="eyebrow">CASE STATUS</div><h2>Decision desk</h2>
 {c.status==='submitted'&&officer?<><p className="muted">This claim has not been assigned. Claim it to begin the review process.</p><ActionButton endpoint={`/api/claims/${id}/assign`} label="Assign to me →"/></>:
 c.status==='in_review'&&officer&&c.officer_id===u.id?<><p className="muted">Review the evidence and the original policy before making a final decision.</p><ApiForm endpoint={`/api/claims/${id}/decision`} submitText="Record decision" successPath={`/claims/${id}`} fields={[
 {name:'verdict',label:'Decision',type:'select',required:true,options:[{value:'approved',label:'Approve claim'},{value:'rejected',label:'Reject claim'}]},
 {name:'reason',label:'Reason (required)',type:'textarea',required:true,minLength:20,placeholder:'Reference the relevant policy clause and explain your decision...'}
 ]}/></>:
 c.status==='in_review'?<p className="muted">In review by {c.assigned_officer}. Only the assigned officer may record the decision.</p>:
 c.verdict?<div className="verdict"><Status value={c.verdict}/><p>{c.decision_reason}</p></div>:<p className="muted">Awaiting officer review.</p>}
 </section>
 {repair.rows[0]?<section className="panel"><div className="eyebrow">APPROVED CASE</div><h2>Repair workflow</h2>
  <p className="muted">Repair order created {dateText(repair.rows[0].opened_at)}</p>
  <p><Status value={repair.rows[0].status}/></p>
  {repair.rows[0].notes?<p className="muted small">{repair.rows[0].notes}</p>:null}
  {officer&&c.officer_id===u.id&&['open','in_progress'].includes(repair.rows[0].status)?
   <ApiForm endpoint={`/api/repairs/${repair.rows[0].id}`} submitText="Update repair" successPath={`/claims/${id}`} fields={[
    {name:'status',label:'Next repair stage',type:'select',required:true,options:repair.rows[0].status==='open'?
      [{value:'in_progress',label:'Start repair'},{value:'cancelled',label:'Cancel repair'}]:
      [{value:'completed',label:'Mark completed'},{value:'cancelled',label:'Cancel repair'}]}
   ]}/>:null}
  </section>:null}
 <section className="panel"><div className="eyebrow">ACTIVITY HISTORY</div><h2>Audit trail</h2>
 <div className="timeline">{events.rows.map(ev=><div className="timelinestep" key={ev.id}><b>{ev.event_type.replaceAll('_',' ')}</b><div className="muted tiny">{dateText(ev.occurred_at)}</div></div>)}</div>
 </section>
 </aside></div></main>;
}
