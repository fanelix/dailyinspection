import { errorResponse } from '../../../lib/gateway.ts';
import { requireDevice } from '../../../lib/auth.ts';

// Hanya memeriksa cookie (tanpa ke gateway agar cepat). Perangkat yang dicabut baru ketahuan pada operasi data berikutnya.
export function GET(req: Request): Response {
  try {
    requireDevice(req);
    return Response.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}
