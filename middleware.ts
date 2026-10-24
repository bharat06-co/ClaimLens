import { NextRequest, NextResponse } from 'next/server';
import { isTrustedMutation } from './lib/request-security';

export function middleware(req: NextRequest) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !isTrustedMutation(req)) {
    return NextResponse.json({error:'Cross-origin mutations are not permitted'}, {status:403});
  }
  return NextResponse.next();
}
export const config = { matcher: '/api/:path*' };
