import { callGateway, errorResponse, GatewayError } from '../../../lib/gateway.ts';

// prepareInspection: membuat/memastikan metadata inspeksi dan mencadangkan ID file Drive untuk tiap foto.
// Aman diulang dengan isi sama. Validasi isi dilakukan gateway (yang menulis ke penyimpanan); di sini cukup bentuk objek.
// Tanpa aktivasi perangkat (keputusan pengguna 2026-10-09): endpoint ini terbuka untuk siapa pun yang tahu URL-nya.
export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json().catch(() => null);
    if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new GatewayError('VALIDATION_ERROR', 'Body harus objek JSON');
    // A distinct action makes old gateways reject T3 before writing; T2 callers keep their existing action.
    const result = await callGateway<object>(body.location?.object?.utm !== undefined ? 'prepareUtmInspection' : 'location' in body ? 'prepareLocatedInspection' : 'prepareInspection', body);
    return Response.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    if (err instanceof GatewayError && err.code === 'VALIDATION_ERROR' && err.message === 'Action tidak dikenal') {
      return errorResponse(new GatewayError('GATEWAY_OUTDATED', 'Layanan lokasi belum diperbarui. Hubungi pengelola aplikasi; isian masih tersedia di halaman ini.'));
    }
    return errorResponse(err);
  }
}
