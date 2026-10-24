import {notFound} from 'next/navigation';
import Link from 'next/link';
import {requireSession} from '@/lib/auth';
import {query} from '@/lib/db';
import ApiForm from '@/components/ApiForm';
import {dateText} from '@/lib/format';
import { z } from 'zod';
type Policy={id:string;title:string;version:string;manufacturer_name:string;coverage_months:number};
type Doc={id:string;title:string;created_at:Date;chunk_count:number};
type Rule={id:string;kind:string;description:string};
export default async function PolicyDetails({params}:{params:Promise<{id:string}>}){
 await requireSession('officer');const {id}=await params;
 if(!z.uuid().safeParse(id).success)notFound();
 const result=await query<Policy>(`SELECT p.id,p.title,p.version,p.coverage_months,m.name AS manufacturer_name
 FROM warranty_policies p JOIN manufacturers m ON m.id=p.manufacturer_id WHERE p.id=$1`,[id]);
 const p=result.rows[0];if(!p)notFound();
 const [docs,rules]=await Promise.all([
 query<Doc>(`SELECT d.id,d.title,d.created_at,count(c.id)::int AS chunk_count
 FROM policy_documents d LEFT JOIN document_chunks c ON c.document_id=d.id
 WHERE d.policy_id=$1 GROUP BY d.id ORDER BY d.created_at DESC`,[id]),
 query<Rule>('SELECT id,kind,description FROM policy_rules WHERE policy_id=$1 ORDER BY kind',[id]),
 ]);
 return <main className="shell content"><div className="pagehead"><div><div className="eyebrow"><Link href="/dashboard" className="backlink">← POLICY LIBRARY</Link></div><h1>{p.title}</h1><p className="muted">{p.manufacturer_name} · v{p.version} · {p.coverage_months}-month coverage</p></div></div>
 <div className="detailgrid"><div className="detailmain"><section className="panel"><div className="panelhead"><h2>Indexed documents</h2><span className="paneltag">{docs.rows.length} DOCUMENT(S)</span></div>
 {docs.rows.length?docs.rows.map(d=><div className="docitem" key={d.id}><div><b>{d.title}</b><div className="muted small">Ingested {dateText(d.created_at)}</div></div><span>{d.chunk_count} embedded chunks</span></div>):<div className="empty">No documents have been indexed for this policy.</div>}</section>
 <section className="panel"><div className="panelhead"><h2>Structured policy rules</h2><span className="paneltag">{rules.rows.length} RULE(S)</span></div>
 {rules.rows.map(r=><div className="rule" key={r.id}><span className={`rulepill ${r.kind}`}>{r.kind}</span><p>{r.description}</p></div>)}
 </section></div><aside className="detailside"><section className="panel"><div className="eyebrow">EMBEDDING PIPELINE</div><h2>Index policy text</h2><p className="muted">Paste genuine warranty policy text. It will be divided into overlapping passages and embedded into 384-dimensional pgvector records.</p>
 <ApiForm endpoint={`/api/policies/${id}/documents`} submitText="Ingest and index ↗" successPath={`/policies/${id}`} fields={[
 {name:'title',label:'Document title',required:true,minLength:4,placeholder:'Official warranty terms v1'},
 {name:'text',label:'Warranty document content',type:'textarea',required:true,minLength:50,maxLength:50000,placeholder:'Paste warranty coverage, exclusions, terms and conditions...'}
 ]}/><p className="muted tiny">First ingestion downloads the embedding model. Duplicate policy text is rejected based on SHA-256.</p></section></aside></div></main>;
}
