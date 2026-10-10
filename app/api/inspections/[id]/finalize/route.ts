import { callGateway, errorResponse, GatewayError } from '../../../../../lib/gateway.ts';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id: inspectionId } = await context.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new GatewayError('VALIDATION_ERROR', 'Body harus objek JSON');
    const result = await callGateway<object>('finalizeInspection', { ...body, inspectionId });
    return Response.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    if (err instanceof GatewayError && err.code === 'VALIDATION_ERROR' && err.message === 'Action tidak dikenal') {
      return errorResponse(new GatewayError('GATEWAY_OUTDATED', 'Layanan finalisasi belum diperbarui; isian masih tersedia untuk dicoba lagi.'));
    }
    return errorResponse(err);
  }
}
