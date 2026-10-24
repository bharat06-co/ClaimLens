import Link from 'next/link';
import ApiForm from '@/components/ApiForm';
export default function Register(){return <main className="authwrap"><section className="panel authpanel">
 <div className="eyebrow">CUSTOMER REGISTRATION</div><h1>Create your account</h1><p className="muted">Register products and submit warranty claims.</p>
 <ApiForm endpoint="/api/auth/register" submitText="Create account" fields={[
 {name:'fullName',label:'Full name',required:true,minLength:2,placeholder:'Your name'},
 {name:'email',label:'Email',type:'email',required:true,placeholder:'you@example.com'},
 {name:'password',label:'Password',type:'password',required:true,minLength:10,hint:'Minimum 10 characters, at least one uppercase letter and one digit.'}
 ]}/><p className="muted small">Already registered? <Link href="/login">Sign in</Link></p>
 </section></main>}
