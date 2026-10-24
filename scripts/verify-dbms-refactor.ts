/** Read-only checks after migrating a disposable CLAIMLENS database. */
import 'dotenv/config';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const migration = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE name=$1',
      ['007_consolidate_integrity_guards.sql'],
    );
    assert.equal(migration.rowCount, 1, 'Refactor migration has not run');

    const tables = await pool.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname=current_schema()
       AND tablename<>'schema_migrations'`);
    assert.equal(tables.rows[0].n, 16, 'Expected all original 16 application tables');

    const records = await pool.query(`SELECT t.tgname AS name, p.proname AS routine
      FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE n.nspname=current_schema() AND NOT t.tgisinternal`);
    const triggers = new Map(records.rows.map(r => [r.name as string, r.routine as string]));
    assert.equal(records.rowCount, 18, 'Expected 18 trigger bindings');
    assert.equal(triggers.size, 18, 'Expected 18 active user-defined triggers');
    assert.equal(new Set(records.rows.map(r => r.routine)).size, 16, 'Expected 16 distinct bound trigger functions');
    const routines = await pool.query(`SELECT count(*)::int AS n FROM pg_proc p
      JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=current_schema() AND p.prorettype='trigger'::regtype`);
    assert.equal(routines.rows[0].n, 16, 'Expected 16 trigger functions, with no unbound extras');

    const expected: Record<string,string> = {
      trg_enforce_assignment_integrity:'enforce_assignment_integrity',
      trg_apply_claim_decision:'apply_claim_decision',
      trg_validate_deciding_officer:'validate_deciding_officer',
      trg_validate_warranty:'validate_warranty',
      trg_enforce_repair_integrity:'enforce_repair_integrity',
      trg_prevent_final_decision_rewrite:'prevent_history_rewrite',
      trg_prevent_audit_rewrite:'prevent_history_rewrite',
      trg_audit_repair_transition:'audit_repair_transition',
    };
    for (const [trigger, routine] of Object.entries(expected)) {
      assert.equal(triggers.get(trigger), routine, `Incorrect trigger binding: ${trigger}`);
    }
    for (const removed of [
      'trg_validate_officer_assignment',
      'trg_preserve_claim_warranty','trg_check_repair_transition',
    ]) {
      assert.equal(triggers.has(removed), false, `${removed} should have been consolidated`);
    }
    const stale = await pool.query(`SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=current_schema() AND proname = ANY($1::text[])`, [[
      'validate_officer_assignment',
      'preserve_claim_warranty', 'check_repair_transition',
      'prevent_final_decision_rewrite', 'prevent_audit_rewrite',
    ]]);
    assert.equal(stale.rowCount, 0, 'Retired trigger functions remain in the active schema');
    const authorization = await pool.query(`SELECT pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=current_schema() AND t.tgname='trg_validate_deciding_officer'`);
    assert.match(authorization.rows[0]?.definition, /BEFORE INSERT ON .*claim_decisions/);
    const vector = await pool.query(`SELECT format_type(a.atttypid,a.atttypmod) AS type
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=current_schema() AND c.relname='document_chunks' AND a.attname='embedding'`);
    assert.equal(vector.rows[0]?.type, 'vector(384)', 'Embedding dimension changed');
    const indexes = await pool.query('SELECT indexdef FROM pg_indexes WHERE schemaname=current_schema()');
    assert.ok(indexes.rows.some(r => r.indexdef.includes('USING hnsw')), 'HNSW index missing');
    assert.ok(indexes.rows.some(r => r.indexdef.includes('USING gin')), 'GIN index missing');
    console.log('PASS: migration 007 applied, 16 tables, 18 triggers, 16 functions, original BEFORE officer check, vector(384), HNSW/GIN');
    console.log('Read-only structural checks passed; run db:smoke + audit:db + audit:api for behavioral verification.');
  } finally {
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
