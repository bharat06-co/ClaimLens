import Link from 'next/link';
import ApiForm from '@/components/ApiForm';
export default function Login(){return <main className="authwrap"><section className="panel authpanel">
 <div className="eyebrow">WELCOME BACK</div><h1>Sign in</h1><p className="muted">Continue to your warranty workspace.</p>
 <ApiForm endpoint="/api/auth/login" submitText="Sign in" fields={[
 {name:'email',label:'Email',type:'email',required:true,placeholder:'you@example.com'},
 {name:'password',label:'Password',type:'password',required:true}
 ]}/><p className="muted small">New customer? <Link href="/register">Create an account</Link></p>
 </section></main>}
