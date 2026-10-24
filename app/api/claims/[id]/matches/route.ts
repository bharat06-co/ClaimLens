import { NextResponse } from 'next/server';
import { query, transaction } from '@/lib/db';
import { requireApiUser, responseError, ApiError } from '@/lib/http';
import { embed, vectorLiteral } from '@/lib/embedding';
import { z } from 'zod';
export const runtime='nodejs';
export const maxDuration=120;
export async function POST(_req:Request,ctx:{params:Promise<{id:string}>}) {
  try {
    const u=await requireApiUser('officer');
    const {id}=await ctx.params; z.uuid().parse(id);
    const claim=await query<{issue_description:string;policy_id:string}>(
      `SELECT c.issue_description,w.policy_id FROM warranty_claims c
       JOIN warranties w ON w.id=c.warranty_id WHERE c.id=$1`,[id]
    );
    if(!claim.rows[0]) throw new ApiError(404,'Claim not found');
    const embedding=vectorLiteral(await embed(claim.rows[0].issue_description));
    const matches=await transaction(async db => {
      await db.query('SELECT id FROM warranty_claims WHERE id=$1 FOR UPDATE',[id]);
      const rows=await db.query<{chunk_id:string;content:string;document_title:string;score:number}>(
        `SELECT ch.id AS chunk_id,ch.content,doc.title AS document_title,
         GREATEST(0,LEAST(1,1 - (ch.embedding <=> $2::vector)))::double precision AS score
         FROM document_chunks ch JOIN policy_documents doc ON doc.id=ch.document_id
         WHERE doc.policy_id=$1
         ORDER BY ch.embedding <=> $2::vector LIMIT 5`,
        [claim.rows[0].policy_id,embedding]
      );
      await db.query(`DELETE FROM semantic_matches WHERE claim_id=$1`,[id]);
      for(let i=0;i<rows.rows.length;i++) {
        const x=rows.rows[i];
        await db.query(
          `INSERT INTO semantic_matches(claim_id,chunk_id,similarity_score,result_rank)
           VALUES($1,$2,$3,$4)`,[id,x.chunk_id,x.score,i+1]
        );
      }
      await db.query(`INSERT INTO audit_events(event_type,entity_id,actor_id,details)
        VALUES('semantic_search',$1,$2,$3::jsonb)`,
        [id,u.id,JSON.stringify({returned:rows.rowCount,embedding_model:'all-MiniLM-L6-v2'})]);
      return rows.rows;
    });
    return NextResponse.json({ok:true,matches});
  } catch(e) {return responseError(e);}
}
