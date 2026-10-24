import test from 'node:test';
import assert from 'node:assert/strict';
import {chunkPolicy,vectorLiteral} from '../lib/embedding';
test('empty input produces no chunks',()=>assert.deepEqual(chunkPolicy('   '),[]));
test('long policy splits into overlapping windows',()=>{
 const words=Array.from({length:31},(_,i)=>`word${i}`);
 const chunks=chunkPolicy(words.join(' '),12,3);
 assert.equal(chunks.length,4);
 assert.equal(chunks[0].split(' ').length,12);
 assert.deepEqual(chunks[0].split(' ').slice(-3),chunks[1].split(' ').slice(0,3));
 assert.equal(chunks.at(-1)?.endsWith('word30'),true);
});
test('vectorLiteral produces pgvector syntax',()=>assert.equal(vectorLiteral([0.1,-0.2,0.3]),'[0.1,-0.2,0.3]'));
