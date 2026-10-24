import 'dotenv/config';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { embed, vectorLiteral } from '../lib/embedding';

async function main(){
 const db=new Pool({connectionString:process.env.DATABASE_URL});
 try {
  const v=await embed('Coffee spilled onto the keyboard and the laptop no longer powers on.');
  assert.equal(v.length,384);
  assert.ok(Math.abs(Math.hypot(...v)-1)<0.0001);
  const rows=await db.query(`SELECT ch.content,doc.policy_id,1-(ch.embedding <=> $1::vector) AS score
   FROM document_chunks ch JOIN policy_documents doc ON doc.id=ch.document_id
   JOIN warranty_policies p ON p.id=doc.policy_id WHERE p.title='Laptop Protection Warranty'
   ORDER BY ch.embedding <=> $1::vector LIMIT 5`,[vectorLiteral(v)]);
  assert.ok(rows.rowCount);
  assert.match(rows.rows[0].content,/liquid|spill/i);
  const original=await db.query('SELECT content,embedding::text AS embedding FROM document_chunks LIMIT 1');
  const regenerated=await embed(original.rows[0].content);
  const stored=JSON.parse(original.rows[0].embedding) as number[];
  const similarity=regenerated.reduce((a,x,i)=>a+x*stored[i],0)/(Math.hypot(...regenerated)*Math.hypot(...stored));
  assert.ok(similarity>0.999,'Updated runtime must preserve the existing embedding space');
  console.log(JSON.stringify({passed:true,dimensions:v.length,norm:Math.hypot(...v),existingEmbeddingCosine:similarity,rankedScores:rows.rows.map(r=>r.score),topPassageMentionsLiquidSpills:true},null,2));
 }finally{await db.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
