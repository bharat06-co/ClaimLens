// Read-only structural/data fingerprints. Refuses the user's normal DB port.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Pool } from 'pg';

const url = new URL(process.env.DATABASE_URL || '');
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.port, '55433', 'Only the disposable review database is permitted');
const pool = new Pool({ connectionString: url.href });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stage = process.env.REVIEW_STAGE;
assert.ok(['baseline', 'proposed', 'final'].includes(stage));
const db = await pool.connect();
try {
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const tables = (await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
    AND tablename<>'schema_migrations' ORDER BY tablename`)).rows.map(r => r.tablename);
  const rows = {};
  for (const table of tables) {
    assert.match(table, /^[a-z_]+$/);
    const data = (await db.query(`SELECT to_jsonb(t) AS data FROM public.${table} t ORDER BY to_jsonb(t)::text`)).rows;
    rows[table] = { count: data.length, sha256: hash(data) };
  }
  const definitions = {};
  definitions.columns = (await db.query(`SELECT table_name,column_name,ordinal_position,data_type,udt_name,
    is_nullable,column_default FROM information_schema.columns WHERE table_schema='public'
    AND table_name IN (SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations')
    ORDER BY table_name,ordinal_position`)).rows;
  definitions.constraints = (await db.query(`SELECT c.relname AS table_name,k.conname,pg_get_constraintdef(k.oid) AS definition
    FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname<>'schema_migrations' ORDER BY c.relname,k.conname`)).rows;
  definitions.indexes = (await db.query(`SELECT tablename,indexname,indexdef FROM pg_indexes
    WHERE schemaname='public' AND tablename<>'schema_migrations' ORDER BY tablename,indexname`)).rows;
  definitions.views = (await db.query(`SELECT viewname,definition FROM pg_views WHERE schemaname='public' ORDER BY viewname`)).rows;
  definitions.registration = (await db.query(`SELECT pg_get_functiondef(p.oid) AS definition FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='register_warranty'`)).rows;
  const triggers = (await db.query(`SELECT t.tgname,c.relname AS table_name,p.proname,pg_get_triggerdef(t.oid) AS definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_proc p ON p.oid=t.tgfoid WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY t.tgname`)).rows;
  const functions = (await db.query(`SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prorettype='trigger'::regtype ORDER BY p.proname`)).rows;
  const migrations = (await db.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(r => r.name);
  const result = { stage, tables: tables.length, triggers: triggers.length,
    triggerFunctions: functions.length, usedTriggerFunctions: new Set(triggers.map(t => t.proname)).size,
    columns: definitions.columns.length, constraints: definitions.constraints.length,
    indexes: definitions.indexes.length, views: definitions.views.length,
    rows, relationalDefinitionsSha256: hash(definitions), definitions, triggerDefinitions: triggers,
    functionDefinitions: functions, migrations };
  mkdirSync('docs/refactor-evidence', { recursive: true });
  writeFileSync(`docs/refactor-evidence/${stage}-snapshot.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, rows: Object.fromEntries(Object.entries(rows).map(([k,v]) => [k,v.count])),
    definitions: undefined, triggerDefinitions: undefined, functionDefinitions: undefined }, null, 2));
} finally {
  await db.query('ROLLBACK'); db.release(); await pool.end();
}
