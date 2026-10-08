import { callGateway, errorResponse } from '../../../lib/gateway.ts';
import { checkOrigin, sessionCookie } from '../../../lib/auth.ts';

// Menukar kode aktivasi (diterbitkan admin, sekali pakai) menjadi sesi perangkat.
export async function POST(req: Request): Promise<Response> {
  try {
    checkOrigin(req);
    const body = await req.json().catch(() => null);
    const r = await callGateway<{ deviceId: string; deviceName: string }>('activateDevice', null, { code: body?.code });
    return Response.json(
      { ok: true, deviceName: r.deviceName },
      { headers: { 'set-cookie': sessionCookie(r.deviceId), 'cache-control': 'no-store' } },
    );
  } catch (err) {
    return errorResponse(err);
  }
}
