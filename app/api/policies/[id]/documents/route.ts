import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApiUser, responseError, ApiError } from '@/lib/http';
import { ingestPolicy } from '@/lib/policy';
import { policyDocumentSchema } from '@/lib/validation';
import { z } from 'zod';
export const runtime='nodejs';
export const maxDuration=120;
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}) {
  try {
    const u=await requireApiUser('officer');
    const {id}=await ctx.params; z.uuid().parse(id);
    const v=policyDocumentSchema.parse(await req.json());
    const exists=await query(`SELECT 1 FROM warranty_policies WHERE id=$1`,[id]);
    if(!exists.rowCount) throw new ApiError(404,'Policy not found');
    const result=await ingestPolicy(id,v.title,v.text,u.id);
    return NextResponse.json({ok:true,...result},{status:201});
  } catch(e) {return responseError(e);}
}
