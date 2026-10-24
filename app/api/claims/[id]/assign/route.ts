import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { requireApiUser, responseError, ApiError } from '@/lib/http';
import { z } from 'zod';
export const runtime='nodejs';
export async function POST(_req: Request, ctx: {params:Promise<{id:string}>}) {
  try {
    const u=await requireApiUser('officer');
    const {id}=await ctx.params; z.uuid().parse(id);
    await transaction(async db => {
      // Lock the claim first to serialize competing assignments.
      const res=await db.query<{status:string}>(`SELECT status FROM warranty_claims WHERE id=$1 FOR UPDATE`,[id]);
      if(!res.rowCount) throw new ApiError(404,'Claim not found');
      if(res.rows[0].status!=='submitted') throw new ApiError(409,'Claim is not awaiting assignment');
      await db.query(`INSERT INTO claim_assignments(claim_id,officer_id) VALUES($1,$2)`,[id,u.id]);
      await db.query(`UPDATE warranty_claims SET status='in_review',updated_at=now() WHERE id=$1`,[id]);
      await db.query(`INSERT INTO audit_events(event_type,entity_id,actor_id) VALUES('claim_assigned',$1,$2)`,[id,u.id]);
    });
    return NextResponse.json({ok:true});
  } catch(e) {return responseError(e);}
}
