import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPassword, hashPassword, issueToken, verifyToken } from '../lib/security';

process.env.SESSION_SECRET='unit-test-secret-should-never-ship-123456789';
test('scrypt hashes are salted and correct passwords verify',()=>{
 const a=hashPassword('VeryStrongPass123');const b=hashPassword('VeryStrongPass123');
 assert.notEqual(a,b);assert.equal(checkPassword('VeryStrongPass123',a),true);
 assert.equal(checkPassword('IncorrectPass123',a),false);
 assert.equal(checkPassword('anything','malformed'),false);
});
test('signed sessions expire and tampering fails',()=>{
 const id='f305e4bb-0b9b-4bb8-b0d5-6384d47f493a';
 const token=issueToken(id,1000);
 assert.equal(verifyToken(token,1500)?.uid,id);
 assert.equal(verifyToken(token,1000+8*86400_000),null);
 assert.equal(verifyToken(token.replace(/.$/,'A'),1500),null);
});
