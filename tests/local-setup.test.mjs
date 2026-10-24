import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const setupScript = resolve('scripts/setup-local.mjs');
const doctorScript = resolve('scripts/doctor.mjs');
const example = readFileSync('.env.example', 'utf8');

test('setup generates safe complete .env and never overwrites it', () => {
  const temp = mkdtempSync(join(tmpdir(), 'claimlens-setup-'));
  try {
    writeFileSync(join(temp, '.env.example'), example);
    const run = (script) => spawnSync(process.execPath, [script], { cwd: temp, encoding: 'utf8' });
    const result = run(setupScript);
    assert.equal(result.status, 0, result.stderr);
    const env = readFileSync(join(temp, '.env'), 'utf8');
    const secret = env.match(/^SESSION_SECRET=(.+)$/m)?.[1];
    const demo = env.match(/^SEED_DEMO_PASSWORD=(.+)$/m)?.[1];
    assert.ok(secret && secret.length >= 32);
    assert.ok(demo && demo.length >= 10);
    assert.match(env, /^DATABASE_URL=postgresql:\/\//m);
    assert.equal(run(setupScript).status, 0);
    assert.equal(readFileSync(join(temp, '.env'), 'utf8'), env);
    const doctor = run(doctorScript);
    assert.match(doctor.stdout, /PASS DATABASE_URL/);
    assert.match(doctor.stdout, /PASS SESSION_SECRET/);
    assert.match(doctor.stdout, /PASS SEED_DEMO_PASSWORD/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('doctor explains absent .env instead of cryptic database exception', () => {
  const temp = mkdtempSync(join(tmpdir(), 'claimlens-doctor-'));
  try {
    const result = spawnSync(process.execPath, [doctorScript], { cwd: temp, encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\.env is missing.*npm run setup:local/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
