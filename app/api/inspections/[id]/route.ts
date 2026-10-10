import { callGateway, errorResponse, GatewayError } from '../../../../lib/gateway.ts';

// T6 detail: snapshot, review, dan metadata foto (tanpa byte). Foto tetap dibaca lewat pasangan (inspeksi, foto).
export async function GET(_req: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await context.params;
    const result = await callGateway<object>('getInspection', { inspectionId: id });
    return Response.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    if (err instanceof GatewayError && err.code === 'VALIDATION_ERROR' && err.message === 'Action tidak dikenal') {
      return errorResponse(new GatewayError('GATEWAY_OUTDATED', 'Layanan detail belum diperbarui. Hubungi pengelola aplikasi.'));
    }
    return errorResponse(err);
  }
}
