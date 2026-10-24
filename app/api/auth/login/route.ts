import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { createCookie } from '@/lib/auth';
import { checkPassword, assertSessionConfigured } from '@/lib/security';
import { loginSchema } from '@/lib/validation';
import { ApiError,responseError } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    const {email,password}=loginSchema.parse(await req.json());
    assertSessionConfigured();
    const res=await query<{id:string;password_hash:string}>(
      `SELECT id,password_hash FROM app_users WHERE lower(email)=$1 AND is_active`,[email]
    );
    if(!res.rows[0] || !checkPassword(password,res.rows[0].password_hash))
      throw new ApiError(401,'Invalid email or password');
    await createCookie(res.rows[0].id);
    return NextResponse.json({ok:true});
  } catch(e) { return responseError(e); }
}
