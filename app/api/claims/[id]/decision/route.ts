import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { requireApiUser, responseError, ApiError } from '@/lib/http';
import { decisionSchema } from '@/lib/validation';
import { z } from 'zod';
export const runtime='nodejs';
export async function POST(req:Request,ctx:{params:Promise<{id:string}>}) {
  try {
    const u=await requireApiUser('officer');
    const {id}=await ctx.params; z.uuid().parse(id);
    const v=decisionSchema.parse(await req.json());
    await transaction(async db => {
      const claim=await db.query<{status:string;officer_id:string|null}>(
        `SELECT c.status,a.officer_id FROM warranty_claims c LEFT JOIN claim_assignments a ON a.claim_id=c.id
         WHERE c.id=$1 FOR UPDATE OF c`,[id]);
      if(!claim.rows[0]) throw new ApiError(404,'Claim not found');
      if(claim.rows[0].status!=='in_review') throw new ApiError(409,'Claim is not awaiting a decision');
      if(claim.rows[0].officer_id!==u.id) throw new ApiError(403,'Only the assigned officer may decide this claim');
      // Trigger independently enforces assignment, status, audit and repair creation.
      await db.query(`INSERT INTO claim_decisions(claim_id,officer_id,verdict,reason)
                   VALUES($1,$2,$3,$4)`,[id,u.id,v.verdict,v.reason]);
    });
    return NextResponse.json({ok:true});
  } catch(e) {return responseError(e);}
}
