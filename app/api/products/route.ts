import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { requireApiUser, responseError } from '@/lib/http';
import { productSchema } from '@/lib/validation';
export const runtime='nodejs';
export async function POST(req:Request) {
  try {
    const u=await requireApiUser('customer');
    const v=productSchema.parse(await req.json());
    const r=await query<{id:string}>(`SELECT register_warranty($1,$2,$3,$4::date,$5) AS id`,
      [u.id,v.modelId,v.serialNumber,v.purchaseDate,v.policyId]);
    return NextResponse.json({ok:true,warrantyId:r.rows[0].id},{status:201});
  } catch(e) {return responseError(e);}
}
