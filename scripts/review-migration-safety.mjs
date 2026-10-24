// Fault injection and actual concurrent migration runners in disposable storage.
import assert from 'node:assert/strict';
import { readFileSync,readdirSync,mkdirSync,writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Pool } from 'pg';
const url=new URL(process.env.DATABASE_URL || '');
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55433');
const pool=new Pool({connectionString:url.href});const db=await pool.connect();
const tests=[];const pass=name=>{tests.push(name);console.log('PASS',name);};
const sql=name=>readFileSync(`db/migrations/${name}`,'utf8').replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
const count=async()=> (await db.query(`SELECT count(*)::int triggers,count(DISTINCT t.tgfoid)::int functions FROM pg_trigger t
  JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND NOT t.tgisinternal`)).rows[0];
try {
  await db.query('BEGIN');await db.query('CREATE SCHEMA review_migration_rollback');
  await db.query('SET LOCAL search_path TO review_migration_rollback,public');
  for(const name of readdirSync('db/migrations').filter(f=>/^00[1-6]_.*\.sql$/.test(f)).sort()) await db.query(sql(name));
  assert.deepEqual(await count(),{triggers:21,functions:20});
  await db.query('SAVEPOINT pre007');await db.query(sql('007_consolidate_integrity_guards.sql'));
  assert.deepEqual(await count(),{triggers:17,functions:15});pass('007 applies in a fresh nonpublic schema');
  await db.query('ROLLBACK TO SAVEPOINT pre007');
  assert.deepEqual(await count(),{triggers:21,functions:20});pass('transaction rollback restores all original trigger bindings');
  let failed=false;
  try{await db.query(sql('007_consolidate_integrity_guards.sql')+"\nDO $$ BEGIN RAISE EXCEPTION 'REVIEW simulated final migration failure'; END $$;");}
  catch(e){assert.match(e.message,/simulated final migration failure/);failed=true;}
  assert.ok(failed);await db.query('ROLLBACK TO SAVEPOINT pre007');
  assert.deepEqual(await count(),{triggers:21,functions:20});pass('late migration error leaves no partially consolidated schema');
} finally{await db.query('ROLLBACK');db.release();}
try {
  const database=`claimlens_review_race_${Date.now()}`;
  assert.match(database,/^claimlens_review_race_\d+$/);
  await pool.query(`CREATE DATABASE ${database}`);
  const raceUrl=new URL(url);raceUrl.pathname='/'+database;
  const env={...process.env,DATABASE_URL:raceUrl.href};
  const run=promisify(execFile);
  const runners=await Promise.all([run(process.execPath,['--import','tsx','scripts/migrate.ts'],{env}),run(process.execPath,['--import','tsx','scripts/migrate.ts'],{env})]);
  const output=runners.map(r=>r.stdout).join('\n');
  assert.equal((output.match(/^Applied /gm)||[]).length,7);
  assert.equal((output.match(/^Already applied: /gm)||[]).length,7);
  const race=new Pool({connectionString:raceUrl.href});
  try{
    const ledger=await race.query('SELECT name FROM schema_migrations ORDER BY name');assert.equal(ledger.rowCount,7);
    const tables=await race.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'");assert.equal(tables.rowCount,16);
    pass('two concurrent fresh-install runners apply each of seven migrations exactly once');
    const again=await run(process.execPath,['--import','tsx','scripts/migrate.ts'],{env});
    assert.equal((again.stdout.match(/^Already applied: /gm)||[]).length,7);pass('fresh-install rerun skips all seven migrations');
  }finally{await race.end();}
  mkdirSync('docs/refactor-evidence',{recursive:true});
  writeFileSync('docs/refactor-evidence/migration-safety.json',JSON.stringify({passed:tests.length,tests,
    concurrentRunnerOutput:runners.map(r=>r.stdout),temporaryDatabase:database,
    storage:'Same explicitly disposable tmpfs container; destroyed at end of review'},null,2));
  console.log(`PASS ${tests.length} migration safety cases`);
}finally{await pool.end();}
