import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const envFile = resolve('.env');
const exampleFile = resolve('.env.example');
if (!existsSync(exampleFile)) {
  console.error('Could not find .env.example. Run this command from the CLAIMLENS directory.');
  process.exit(1);
}
if (existsSync(envFile)) {
  console.log('Existing .env detected; no values were overwritten.');
  console.log('Run npm run doctor to check it, or manually edit .env if needed.');
  process.exit(0);
}
const secret = randomBytes(32).toString('hex');
const demoPassword = `Demo${randomBytes(12).toString('hex')}9`;
const template = readFileSync(exampleFile, 'utf8');
if (!/^DATABASE_URL=.+$/m.test(template) || !/^SESSION_SECRET=.*$/m.test(template)
    || !/^SEED_DEMO_PASSWORD=.*$/m.test(template)) {
  console.error('Required keys are missing from .env.example.');
  process.exit(1);
}
const contents = template
  .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${secret}`)
  .replace(/^SEED_DEMO_PASSWORD=.*$/m, `SEED_DEMO_PASSWORD=${demoPassword}`);
writeFileSync(envFile, contents, { flag: 'wx', mode: 0o600 });
console.log('Created private .env with the Docker Compose database URL and new random secrets.');
console.log('Demo password (keep private):', demoPassword);
console.log('Next: docker compose up -d db; npm run db:migrate; npm run db:seed; npm run db:smoke');
