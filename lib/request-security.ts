export function isTrustedMutation(req: Request): boolean {
  // Non-browser API clients may omit Origin. Browsers must post from this app.
  if (req.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    const source = new URL(origin);
    const target = new URL(req.url);
    // Next normalizes 127.0.0.1 to localhost in middleware URLs. Host retains
    // the authority the browser actually addressed; do not trust forwarded-host.
    return source.host === (req.headers.get('host') || target.host)
      && source.protocol === target.protocol;
  }
  catch { return false; }
}
