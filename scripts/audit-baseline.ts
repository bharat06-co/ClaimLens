import 'dotenv/config';
import { Pool } from 'pg';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';

async function main() {
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const file = 'audit-private/original-rows.json';
try {
  if (process.argv.includes('--verify')) {
    const baseline = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, unknown>[]>;
    let total = 0;
    let approvedCorrections = 0;
    const correction = existsSync('audit-private/approved-data-correction.json')
      ? JSON.parse(readFileSync('audit-private/approved-data-correction.json','utf8')) : null;
    for (const [table, rows] of Object.entries(baseline)) {
      for (const row of rows) {
        const key = 'id' in row ? 'id' : table === 'schema_migrations' ? 'name' : 'claim_id';
        const actual = await pool.query(`SELECT to_jsonb(t) AS value FROM "${table}" t WHERE "${key}"=$1`, [row[key]]);
        const expected={...row};
        if(correction && table==='warranties' && row.id==='0c87ea1e-bfe0-48c0-9b29-ca66706dd0f2'){
          assert.equal(correction.before,'2028-02-15');assert.equal(correction.after,'2028-02-14');
          assert.equal(row.end_date,correction.before);expected.end_date=correction.after;
          const audit=await pool.query(`SELECT 1 FROM audit_events WHERE event_type='warranty_date_corrected' AND entity_id=$1
           AND details->>'old_end_date'=$2 AND details->>'new_end_date'=$3`,[row.id,correction.before,correction.after]);
          assert.equal(audit.rowCount,1);approvedCorrections++;
        }
        assert.deepEqual(actual.rows[0]?.value, expected, `Original ${table} row changed unexpectedly`);
        total++;
      }
    }
    console.log(`PASS: all ${total} original rows retained; ${approvedCorrections} explicitly approved field correction(s); all other original fields unchanged.`);
    mkdirSync('docs/audit-evidence',{recursive:true});
    writeFileSync('docs/audit-evidence/preservation.json',JSON.stringify({originalRowsRetained:total,approvedFieldCorrections:approvedCorrections,allOtherOriginalFieldsUnchanged:true,checkedAt:new Date().toISOString()},null,2));
  } else {
    const tables = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
    const baseline: Record<string, unknown[]> = {};
    for (const { tablename } of tables.rows) {
      assert.match(tablename, /^[a-z_]+$/);
      baseline[tablename] = (await pool.query(`SELECT to_jsonb(t) AS value FROM "${tablename}" t`)).rows.map(r => r.value);
    }
    mkdirSync('audit-private', { recursive: true });
    writeFileSync(file, JSON.stringify(baseline), { flag: 'wx', mode: 0o600 });
    console.log('Private original-row snapshot saved; no row contents printed.');
  }
} finally { await pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
