import { callGateway, errorResponse, GatewayError } from '../../../lib/gateway.ts';
import { CHECKLISTS } from '../../../lib/inspection.ts';

export async function GET(req: Request): Promise<Response> {
  try {
    const areaId = new URL(req.url).searchParams.get('areaId');
    if (!CHECKLISTS.areas.some(a => a.id === areaId)) throw new GatewayError('VALIDATION_ERROR', 'Pilih area inspeksi.');
    const result = await callGateway<object>('listLocations', { areaId });
    return Response.json({ ok: true, ...result }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) { return errorResponse(err); }
}
