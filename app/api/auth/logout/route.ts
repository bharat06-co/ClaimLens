import { NextResponse } from 'next/server';
import { clearCookie } from '@/lib/auth';
export const runtime='nodejs';
export async function POST() { await clearCookie(); return NextResponse.json({ok:true}); }
