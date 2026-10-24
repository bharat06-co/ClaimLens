import { createHash } from 'node:crypto';
import { transaction } from './db';
import { chunkPolicy, embed, vectorLiteral } from './embedding';

// Embed before beginning the transaction, so model download/inference won't hold SQL locks.
export async function ingestPolicy(policyId: string, title: string, text: string, uploader: string | null) {
  const sha = createHash('sha256').update(text).digest('hex');
  const chunks = chunkPolicy(text);
  const embeddings: string[] = [];
  for (const piece of chunks) embeddings.push(vectorLiteral(await embed(piece)));
  return transaction(async client => {
    const res = await client.query<{id:string}>(
      `INSERT INTO policy_documents(policy_id,title,original_text,sha256,uploaded_by)
       VALUES($1,$2,$3,$4,$5) RETURNING id`, [policyId,title,text,sha,uploader]
    );
    const documentId = res.rows[0].id;
    for (let i=0;i<chunks.length;i++) {
      await client.query(
        `INSERT INTO document_chunks(document_id,chunk_number,content,embedding,metadata)
         VALUES($1,$2,$3,$4::vector,$5::jsonb)`,
        [documentId,i,chunks[i],embeddings[i],JSON.stringify({ title, chunk: i, model: 'all-MiniLM-L6-v2' })]
      );
    }
    return { documentId, chunkCount: chunks.length };
  });
}
