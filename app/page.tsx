import Link from 'next/link';
import { getSession } from '@/lib/auth';
export default async function Home(){
 const u=await getSession();
 return <main className="shell landing">
 <div className="eyebrow">WARRANTY OPERATIONS / REIMAGINED</div>
 <h1>Make every claim<br/><em>make sense.</em></h1>
 <p className="hero-sub">A connected workspace for product warranties, claim evidence, policy terms, and human-led decisions — grounded in the actual documents.</p>
 <div className="hero-buttons"><Link className="btn btn-primary" href={u?'/dashboard':'/register'}>{u?'Open dashboard':'Create an account'} <span>↗</span></Link><Link className="btn btn-outline" href="/login">Officer sign in →</Link></div>
 <div className="feature-grid">
  <article className="feature"><div className="feature-num">01 / RECORD</div><h3>Track the whole story</h3><p>Products, registered owners, warranty periods, claim history, evidence, assignments and final decisions.</p></article>
  <article className="feature"><div className="feature-num">02 / RETRIEVE</div><h3>Find the relevant clause</h3><p>Local MiniLM embeddings and pgvector cosine search surface the policy passages that matter to a reported issue.</p></article>
  <article className="feature"><div className="feature-num">03 / DECIDE</div><h3>Stay accountable</h3><p>Every claim decision has an assigned officer, a written reason, database-enforced integrity and an audit event.</p></article>
 </div></main>;
}
