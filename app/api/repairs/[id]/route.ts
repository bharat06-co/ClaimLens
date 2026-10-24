import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApiUser, responseError, ApiError } from '@/lib/http';
import { z } from 'zod';
export const runtime='nodejs';
const repairSchema=z.object({status:z.enum(['in_progress','completed','cancelled'])});
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}) {
 try {
  const user=await requireApiUser('officer');
  const {id}=await ctx.params; z.uuid().parse(id);
  const {status}=repairSchema.parse(await req.json());
  const updated=await query(`UPDATE repair_orders r SET status=$1::repair_state
    FROM claim_assignments ca, warranty_claims c
    WHERE r.id=$2 AND ca.claim_id=r.claim_id AND ca.officer_id=$3
      AND c.id=r.claim_id AND c.status='approved'
    RETURNING r.id`,[status,id,user.id]);
  if(!updated.rowCount) throw new ApiError(403,'You cannot modify this repair order');
  return NextResponse.json({ok:true});
 } catch(e) {return responseError(e);}
}
