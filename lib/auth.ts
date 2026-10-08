// Sesi perangkat: cookie HttpOnly bertanda tangan (tanpa penyimpanan di server). Pencabutan perangkat ditegakkan
// gateway pada setiap operasi data, jadi cookie yang masih sah secara tanda tangan tidak memberi akses setelah dicabut.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { GatewayError } from './gateway.ts';

const COOKIE = 'di_session';
export const SESSION_DAYS = 30; // usulan; belum ditetapkan pengguna

function sign(payload: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new GatewayError('CONFIGURATION_ERROR', 'SESSION_SECRET belum diatur (minimal 32 karakter)');
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function sessionCookie(deviceId: string): string {
  const payload = Buffer.from(JSON.stringify({ d: deviceId, exp: Date.now() + SESSION_DAYS * 86_400_000 })).toString('base64url');
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE}=${payload}.${sign(payload)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_DAYS * 86_400}${secure}`;
}

// Perubahan hanya diterima dari halaman kita sendiri (pelengkap SameSite=Lax terhadap CSRF).
export function checkOrigin(req: Request): void {
  if (req.method === 'GET' || req.method === 'HEAD') return;
  const host = req.headers.get('x-forwarded-host') ?? new URL(req.url).host;
  let originHost = '';
  try {
    originHost = new URL(req.headers.get('origin') ?? '').host;
  } catch {
    // origin kosong atau "null"
  }
  if (!originHost || originHost !== host) throw new GatewayError('FORBIDDEN', 'Origin tidak sah');
}

export function requireDevice(req: Request): string {
  checkOrigin(req);
  const cookie = /(?:^|;\s*)di_session=([^;]+)/.exec(req.headers.get('cookie') ?? '')?.[1];
  const [payload, mac] = cookie?.split('.') ?? [];
  if (payload && mac) {
    const expected = Buffer.from(sign(payload));
    const given = Buffer.from(mac);
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      try {
        const { d, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        if (typeof d === 'string' && typeof exp === 'number' && exp > Date.now()) return d;
      } catch {
        // payload rusak: jatuh ke penolakan di bawah
      }
    }
  }
  throw new GatewayError('NO_SESSION', 'Perangkat belum diaktivasi atau sesi habis');
}
