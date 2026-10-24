import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createConnection } from 'node:net';


const envFile = resolve('.env');
if (!existsSync(envFile)) {
  console.error('ERROR: .env is missing. Run: npm run setup:local');
  process.exit(1);
}
process.loadEnvFile(envFile);
let bad = false;
function test(ok, name, remedy) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' — ' + remedy}`);
  if (!ok) bad = true;
}
let db;
try { db = new URL(process.env.DATABASE_URL ?? ''); }
catch { db = undefined; }
test(!!db && /^postgres(ql)?:$/.test(db.protocol) && !!db.hostname && !!db.username && !!db.password && !!db.pathname && db.pathname !== '/',
  'DATABASE_URL includes a host, user, password and database', 'Edit .env to match compose.yaml');
test((process.env.SESSION_SECRET ?? '').length >= 32 && !process.env.SESSION_SECRET?.startsWith('replace-'),
  'SESSION_SECRET configured', 'Run setup on a fresh .env or set a unique secret of at least 32 characters');
test((process.env.SEED_DEMO_PASSWORD ?? '').length >= 10 && !process.env.SEED_DEMO_PASSWORD?.startsWith('replace-'),
  'SEED_DEMO_PASSWORD configured', 'Provide at least 10 characters in .env');
if (db && !bad) {
  const reachable = await new Promise(resolve => {
    const socket = createConnection({ host: db.hostname, port: Number(db.port || 5432) });
    socket.setTimeout(2500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
  test(reachable, 'PostgreSQL TCP port reachable', 'Start Docker Desktop, then run docker compose up -d db');
  if (reachable) console.log('Note: Port reachability does not verify credentials or migrations; run npm run db:migrate and npm run db:smoke.');
}
if (bad) process.exitCode = 1;
