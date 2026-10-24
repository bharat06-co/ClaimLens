import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { createCookie } from '@/lib/auth';
import { hashPassword, assertSessionConfigured } from '@/lib/security';
import { registerSchema } from '@/lib/validation';
import { responseError } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(req: Request) {
  try {
    const {fullName,email,password} = registerSchema.parse(await req.json());
    assertSessionConfigured(); // Never create an account unless login cookies can be issued.
    const res = await query<{id:string}>(
      `INSERT INTO app_users(full_name,email,password_hash,role) VALUES($1,$2,$3,'customer') RETURNING id`,
      [fullName,email,hashPassword(password)]
    );
    await createCookie(res.rows[0].id);
    return NextResponse.json({ok:true}, {status:201});
  } catch(e) { return responseError(e); }
}
