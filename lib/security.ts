import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(plain: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(plain, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
export function checkPassword(plain: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash || !/^[a-f0-9]{128}$/.test(hash)) return false;
  const proposed = scryptSync(plain, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return proposed.length === expected.length && timingSafeEqual(proposed, expected);
}
export type Role = 'customer' | 'officer';
type TokenData = { uid: string; exp: number };
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters');
  return s;
}
export function assertSessionConfigured(): void { secret(); }

export function issueToken(uid: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ uid, exp: now + 7 * 86400_000 } satisfies TokenData)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
export function verifyToken(token: string, now = Date.now()): TokenData | null {
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(sig, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const obj: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (obj && typeof obj === 'object' && 'uid' in obj && 'exp' in obj &&
        typeof obj.uid === 'string' && /^[0-9a-f-]{36}$/.test(obj.uid) &&
        typeof obj.exp === 'number' && obj.exp > now) return obj as TokenData;
  } catch { /* invalid token */ }
  return null;
}
