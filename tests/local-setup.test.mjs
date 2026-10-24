import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

const setupScript = resolve('scripts/setup-local.mjs');
const doctorScript = resolve('scripts/doctor.mjs');
const example = readFileSync('.env.example', 'utf8');
const execFileAsync = promisify(execFile);
function cleanEnv() {
  const env = { ...process.env };
  for (const key of ['DATABASE_URL', 'SESSION_SECRET', 'SEED_DEMO_PASSWORD']) delete env[key];
  return env;
}
async function configuredEnvironment(run) {
  const server = createServer(socket => socket.end());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    await run({
      ...cleanEnv(),
      DATABASE_URL: `postgresql://ci_user:ci_password@127.0.0.1:${server.address().port}/ci_test`,
      SESSION_SECRET: 'ci-regression-secret-at-least-32-characters',
      SEED_DEMO_PASSWORD: 'CiRegressionPassword123',
    });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('setup generates safe complete .env and never overwrites it', () => {
  const temp = mkdtempSync(join(tmpdir(), 'claimlens-setup-'));
  try {
    writeFileSync(join(temp, '.env.example'), example);
    const run = (script) => spawnSync(process.execPath, [script], { cwd: temp, env: cleanEnv(), encoding: 'utf8' });
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
    const result = spawnSync(process.execPath, [doctorScript], { cwd: temp, env: cleanEnv(), encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /\.env is missing.*npm run setup:local/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('doctor accepts CI environment without a .env file and does not create one', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'claimlens-ci-env-'));
  try {
    await configuredEnvironment(async env => {
      const result = await execFileAsync(process.execPath, [doctorScript], { cwd: temp, env, encoding: 'utf8' });
      for (const name of ['DATABASE_URL', 'SESSION_SECRET', 'SEED_DEMO_PASSWORD', 'PostgreSQL TCP port reachable']) {
        assert.ok(result.stdout.includes(`PASS ${name}`), result.stdout);
      }
      assert.equal(existsSync(join(temp, '.env')), false);
    });
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('doctor still rejects invalid configuration supplied through the environment', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'claimlens-ci-invalid-'));
  try {
    await configuredEnvironment(async env => {
      await assert.rejects(execFileAsync(process.execPath, [doctorScript], {
        cwd: temp, env: { ...env, SESSION_SECRET: 'short' }, encoding: 'utf8',
      }), error => error.code === 1 && /FAIL SESSION_SECRET/.test(error.stdout));
    });
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('supplied environment overrides .env defaults without changing the file', async () => {
  const temp = mkdtempSync(join(tmpdir(), 'claimlens-ci-precedence-'));
  try {
    const contents = 'DATABASE_URL=postgresql://file_user:file_password@127.0.0.1:1/file_db\nSESSION_SECRET=short\nSEED_DEMO_PASSWORD=short\n';
    writeFileSync(join(temp, '.env'), contents);
    await configuredEnvironment(async env => {
      const result = await execFileAsync(process.execPath, [doctorScript], { cwd: temp, env, encoding: 'utf8' });
      assert.match(result.stdout, /PASS PostgreSQL TCP port reachable/);
      assert.equal(readFileSync(join(temp, '.env'), 'utf8'), contents);
    });
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
