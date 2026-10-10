import { callGateway, errorResponse, GatewayError } from '../../../../../../lib/gateway.ts';
import { MAX_PHOTO_BYTES } from '../../../../../../lib/photos.ts';

type Ctx = { params: Promise<{ id: string; photoId: string }> };

export const maxDuration = 60; // usulan; Vercel membatasi sesuai paket. Ukur durasi upload di staging.

// Satu foto per request, byte mentah (tanpa base64 dari browser). Dikonfirmasi hanya setelah gateway
// menyimpan file di Drive dan menandai barisnya 'stored'.
// Tanpa aktivasi perangkat (keputusan pengguna 2026-10-09): terbuka untuk siapa pun yang tahu URL-nya.
export async function PUT(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const { id, photoId } = await ctx.params;
    const tooLarge = new GatewayError('PAYLOAD_TOO_LARGE', 'Foto melebihi batas ukuran');
    if (Number(req.headers.get('content-length')) > MAX_PHOTO_BYTES) throw tooLarge;
    const bytes = Buffer.from(await req.arrayBuffer());
    if (bytes.length > MAX_PHOTO_BYTES) throw tooLarge;
    const result = await callGateway<object>('uploadPhoto', {
      inspectionId: id,
      photoId,
      mime: req.headers.get('content-type')?.split(';')[0].trim(),
      sha256: req.headers.get('x-photo-sha256'),
      bytesBase64: bytes.toString('base64'),
    });
    return Response.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return errorResponse(err);
  }
}

// Foto privat: tidak pernah memakai tautan Drive publik. Tanpa aktivasi, satu-satunya penjaga adalah pasangan ID
// inspeksi + foto yang harus berpasangan (UUID acak 122 bit); jangan menampilkan atau mencatat ID itu di tempat umum.
export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  try {
    const { id, photoId } = await ctx.params;
    const r = await callGateway<{ mime: string; sha256: string; bytesBase64: string }>('getPhoto', { inspectionId: id, photoId });
    return new Response(new Uint8Array(Buffer.from(r.bytesBase64, 'base64')), {
      headers: {
        'content-type': r.mime,
        'x-photo-sha256': r.sha256,
        'cache-control': 'private, no-store',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
