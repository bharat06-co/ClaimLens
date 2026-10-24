import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { query } from './db';
import { issueToken, verifyToken, Role } from './security';

export type Session = { id: string; name: string; email: string; role: Role };
export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get('cl_session')?.value;
  if (!token) return null;
  const parsed = verifyToken(token);
  if (!parsed) return null;
  const result = await query<Session>(
    'SELECT id,full_name AS name,email,role FROM app_users WHERE id=$1 AND is_active=true', [parsed.uid]
  );
  return result.rows[0] || null;
}
export async function requireSession(role?: Role): Promise<Session> {
  const user = await getSession();
  if (!user) redirect('/login');
  if (role && user.role !== role) redirect('/dashboard');
  return user;
}
export async function createCookie(uid: string) {
  (await cookies()).set('cl_session', issueToken(uid), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/', maxAge: 7 * 86400,
  });
}
export async function clearCookie() {
  (await cookies()).delete('cl_session');
}
