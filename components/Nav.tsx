import Link from 'next/link';
import { getSession } from '@/lib/auth';
import Logout from './Logout';
export default async function Nav() {
  const user=await getSession();
  return <header className="topbar"><div className="navinner">
    <Link href={user?'/dashboard':'/'} className="brand"><span className="brandmark">C</span> CLAIM<span>LENS</span></Link>
    <nav className="navlinks">
      {user ? <>
        <Link href="/dashboard">Dashboard</Link>
        {user.role==='customer' ? <>
          <Link href="/products/new">Register product</Link>
          <Link href="/claims/new">New claim</Link>
        </>:null}
        <span className="userpill">{user.name.split(' ')[0]} · {user.role}</span>
        <Logout />
      </>:<><Link href="/login">Sign in</Link><Link className="btn btn-sm btn-primary" href="/register">Get started</Link></>}
    </nav>
  </div></header>;
}
