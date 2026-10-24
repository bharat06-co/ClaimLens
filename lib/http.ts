import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getSession, Session } from './auth';
import type { Role } from './security';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function requireApiUser(role?: Role): Promise<Session> {
  const user = await getSession();
  if (!user) throw new ApiError(401, 'Please sign in');
  if (role && user.role !== role) throw new ApiError(403, 'You are not permitted to perform this action');
  return user;
}
export function responseError(error: unknown) {
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Request body must contain valid JSON' }, { status: 400 });
  if (error instanceof ApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  if (error instanceof Error && (error.message === 'DATABASE_URL is not configured' || error.message.startsWith('SESSION_SECRET must'))) {
    console.error('CLAIMLENS setup problem:', error.message);
    return NextResponse.json({ error: 'Server configuration is incomplete. Run npm run setup:local and npm run doctor.' }, { status: 503 });
  }
  const pgError = error as { code?: string };
  if (pgError?.code === '23505') return NextResponse.json({ error: 'This record already exists' }, { status: 409 });
  if (['23503','23514','22P02','P0001'].includes(pgError?.code ?? ''))
    return NextResponse.json({ error: 'Invalid operation or conflicting database constraint' }, { status: 400 });
  console.error('CLAIMLENS server error', error);
  return NextResponse.json({ error: 'Internal server error. Check server logs.' }, { status: 500 });
}
