import test from 'node:test';
import assert from 'node:assert/strict';
import { dateText } from '../lib/format';
import { email, productSchema, claimSchema } from '../lib/validation';
import { isTrustedMutation } from '../lib/request-security';
import { query } from '../lib/db';
import { types } from 'pg';

test('SQL DATE stays a calendar date across local time zones',()=>{
  void query; // Load the application parser configuration.
  const parsed=types.getTypeParser(1082)('2026-10-01');
  assert.equal(parsed,'2026-10-01');
  assert.equal(dateText(parsed),'01 Oct 2026');
});
test('email normalization precedes validation',()=>{
  assert.equal(email.parse('  Audit@Example.COM  '),'audit@example.com');
});
test('invalid dates, malformed identifiers and unsafe evidence are rejected',()=>{
  assert.equal(productSchema.safeParse({modelId:'-'.repeat(36),policyId:'-'.repeat(36),serialNumber:'AUDIT-1',purchaseDate:'2026-02-30'}).success,false);
  assert.equal(claimSchema.safeParse({warrantyId:'f305e4bb-0b9b-4bb8-b0d5-6384d47f493a',issue:'A valid description of a manufacturing fault',evidenceUrl:'javascript:alert(1)'}).success,false);
});
test('cross-origin and cross-site mutations fail while local API clients work',()=>{
  const make=(headers:Record<string,string>)=>new Request('http://localhost:3001/api/auth/login',{method:'POST',headers});
  assert.equal(isTrustedMutation(make({Origin:'https://attacker.example'})),false);
  assert.equal(isTrustedMutation(make({'Sec-Fetch-Site':'cross-site'})),false);
  assert.equal(isTrustedMutation(make({Origin:'http://localhost:3001'})),true);
  assert.equal(isTrustedMutation(make({Origin:'http://127.0.0.1:3001',Host:'127.0.0.1:3001'})),true);
  assert.equal(isTrustedMutation(make({Origin:'https://attacker.example',Host:'127.0.0.1:3001'})),false);
  assert.equal(isTrustedMutation(make({})),true);
});
