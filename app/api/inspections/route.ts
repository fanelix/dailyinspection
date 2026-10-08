import { callGateway, errorResponse, GatewayError } from '../../../lib/gateway.ts';
import { requireDevice } from '../../../lib/auth.ts';

// prepareInspection: membuat/memastikan metadata inspeksi dan mencadangkan ID file Drive untuk tiap foto.
// Aman diulang dengan isi sama. Validasi isi dilakukan gateway (yang menulis ke penyimpanan); di sini cukup bentuk objek.
export async function POST(req: Request): Promise<Response> {
  try {
    const deviceId = requireDevice(req);
    const body = await req.json().catch(() => null);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new GatewayError('VALIDATION_ERROR', 'Body harus objek JSON');
    const result = await callGateway<object>('prepareInspection', deviceId, body);
    return Response.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
