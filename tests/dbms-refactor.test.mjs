// Static patch/baseline consistency, not a substitute for running PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const sql = readFileSync('db/migrations/007_consolidate_integrity_guards.sql', 'utf8');
const originalDecisionSql = readFileSync('db/migrations/001_init.sql', 'utf8') + readFileSync('db/migrations/005_audit_integrity.sql', 'utf8');
const baseline = {
  '001_init.sql': '9cdb353cc6392dab364ad247d362f00150d3ae0f2eb5e14c3a801258a86fca05',
  '002_repair_lifecycle.sql': '39bdca992cb160d50f43643cfefe242a801dc729ab30cbb4322aa5466052e505',
  '003_claim_state_integrity.sql': '294abee3e881e128cc1da4f49f3e78dee800e3898108021b0fc38817798da9e8',
  '004_temporal_integrity.sql': '59b6119e1dfc90c7539641b0140729253ecd7cbc3f35fc858b12ba35de36d869',
  '005_audit_integrity.sql': '87e234c40842abe2b553bd9bd150de7c576b395ef171d388f32ed398f88e79a0',
  '006_warranty_validation.sql': '84a081a587cda814fa1c0289d6064691a7e9b24c9b4391ba2f1206305f4c6f01',
};

test('refactor expects the audited SQL migration baseline, not an older ZIP', () => {
  for (const [name, sha] of Object.entries(baseline)) {
    const actual = createHash('sha256').update(readFileSync(`db/migrations/${name}`, 'utf8').replace(/\r\n/g, '\n')).digest('hex');
    assert.equal(actual, sha, `Audited migration changed: ${name}`);
  }
});

test('refactor leaves table/view/index definitions and data untouched', () => {
  assert.doesNotMatch(sql, /\b(?:DROP|ALTER)\s+(?:TABLE|VIEW|INDEX)\b/i);
  assert.doesNotMatch(sql, /\b(?:TRUNCATE|DELETE\s+FROM)\b/i);
  assert.doesNotMatch(sql, /\bCREATE\s+TABLE\b/i);
});

test('refactor retains identity, authorization, dates, state transitions, audits', () => {
  for (const rule of [
    /Assigned user is not an active officer/,
    /Claim warranty facts are immutable/,
    /Warranty dates must match the purchase and inclusive policy coverage/,
    /A repair must start open for an approved, decided claim/,
    /Invalid repair order status transition/,
    /Final claim decisions are immutable/,
    /Audit events are immutable/,
  ]) assert.match(sql,rule);
  for (const rule of [/Decision requires an active officer/, /Created automatically following approval/, /jsonb_build_object\('verdict'/])
    assert.match(originalDecisionSql,rule);
});

test('refactor preserves original BEFORE authorization and AFTER decision routines', () => {
  assert.match(originalDecisionSql, /CREATE TRIGGER trg_validate_deciding_officer BEFORE INSERT ON claim_decisions/);
  assert.doesNotMatch(sql, /(?:CREATE\s+(?:OR\s+REPLACE\s+)?|DROP\s+)FUNCTION\s+(?:validate_deciding_officer|apply_claim_decision)\s*\(/i);
  assert.doesNotMatch(sql, /DROP\s+TRIGGER\s+(?:trg_validate_deciding_officer|trg_apply_claim_decision)\b/i);
});
