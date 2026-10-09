import { callGateway, errorResponse, GatewayError } from '../../../lib/gateway.ts';

// prepareInspection: membuat/memastikan metadata inspeksi dan mencadangkan ID file Drive untuk tiap foto.
// Aman diulang dengan isi sama. Validasi isi dilakukan gateway (yang menulis ke penyimpanan); di sini cukup bentuk objek.
// Tanpa aktivasi perangkat (keputusan pengguna 2026-10-09): endpoint ini terbuka untuk siapa pun yang tahu URL-nya.
export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => null);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new GatewayError('VALIDATION_ERROR', 'Body harus objek JSON');
    const result = await callGateway<object>('prepareInspection', body);
    return Response.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
