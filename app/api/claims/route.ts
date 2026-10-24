import { NextResponse } from 'next/server';
import { transaction } from '@/lib/db';
import { requireApiUser, responseError, ApiError } from '@/lib/http';
import { claimSchema } from '@/lib/validation';
export const runtime='nodejs';
export async function POST(req:Request) {
  try {
    const u=await requireApiUser('customer');
    const v=claimSchema.parse(await req.json());
    const id=await transaction(async db => {
      const owned=await db.query(
        `SELECT 1 FROM warranties w JOIN registered_products p ON p.id=w.product_id
         WHERE w.id=$1 AND p.customer_id=$2 AND NOT w.is_void`,[v.warrantyId,u.id]);
      if(!owned.rowCount) throw new ApiError(403,'That warranty does not belong to you or is void');
      const res=await db.query<{id:string}>(
        `INSERT INTO warranty_claims(warranty_id,customer_id,issue_description) VALUES($1,$2,$3) RETURNING id`,
        [v.warrantyId,u.id,v.issue]
      );
      if (v.evidenceUrl) await db.query(
        `INSERT INTO claim_evidence(claim_id,evidence_url,note) VALUES($1,$2,$3)`,
        [res.rows[0].id,v.evidenceUrl,v.evidenceNote??null]
      );
      return res.rows[0].id;
    });
    return NextResponse.json({ok:true,id},{status:201});
  } catch(e) {return responseError(e);}
}
