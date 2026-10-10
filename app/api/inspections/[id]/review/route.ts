import { callGateway, errorResponse, GatewayError } from '../../../../../lib/gateway.ts';

// T6 review: revisi baru dengan expectedVersion; reviewId sama = replay idempoten; versi basi = VERSION_CONFLICT 409.
export async function POST(req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new GatewayError('VALIDATION_ERROR', 'Body harus objek JSON');
    const result = await callGateway<object>('reviewInspection', { ...body, inspectionId: id });
    return Response.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    if (err instanceof GatewayError && err.code === 'VALIDATION_ERROR' && err.message === 'Action tidak dikenal') {
      return errorResponse(new GatewayError('GATEWAY_OUTDATED', 'Layanan review belum diperbarui; isian review masih tersedia.'));
    }
    return errorResponse(err);
  }
}
