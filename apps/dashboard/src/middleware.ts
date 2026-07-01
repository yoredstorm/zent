import { NextRequest, NextResponse } from 'next/server';

const INTERNAL_API_URL = process.env.INTERNAL_API_URL || 'http://backend-api:3000/api';

/**
 * Redirige al wizard /setup mientras el sistema no este instalado.
 * Tolerante a fallos: si no puede consultar el estado, deja pasar la peticion.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith('/setup') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${INTERNAL_API_URL}/setup/status`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data && data.installed === false) {
        return NextResponse.redirect(new URL('/setup', req.url));
      }
    }
  } catch {
    // No bloquear si el backend no responde.
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
