// Klien server -> gateway Apps Script. Hanya diimpor dari route handler (memakai node:crypto dan rahasia server).
import { createHmac, randomUUID } from 'node:crypto';

export class GatewayError extends Error {
  code: string;
  retryable: boolean;
  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

type GatewayAction = 'activateDevice' | 'prepareInspection' | 'uploadPhoto' | 'getPhoto';

export function signMessage(msg: string, secret: string): string {
  return createHmac('sha256', secret).update(msg, 'utf8').digest('hex');
}

export async function callGateway<T>(action: GatewayAction, deviceId: string | null, payload: unknown): Promise<T> {
  const url = process.env.GATEWAY_URL;
  const secret = process.env.GATEWAY_HMAC_SECRET;
  if (!url || !secret) throw new GatewayError('CONFIGURATION_ERROR', 'GATEWAY_URL / GATEWAY_HMAC_SECRET belum diatur');
  const timeoutMs = Number(process.env.GATEWAY_TIMEOUT_MS) || 30_000; // usulan; ukur di staging

  // requestId dan ts baru pada setiap panggilan: pengulangan di level transport tidak boleh memakai ulang nonce
  // (akan ditolak REPLAY). Idempotensi bisnis ada pada ID inspeksi/foto di dalam payload, bukan pada requestId.
  const msg = JSON.stringify({ v: 1, action, requestId: randomUUID(), ts: Date.now(), deviceId, payload });
  const body = JSON.stringify({ msg, sig: signMessage(msg, secret) });

  let status: number;
  let text: string;
  try {
    // Web app Apps Script membalas POST dengan 302 ke URL hasil; fetch mengikutinya (POST -> GET) secara bawaan.
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' },
      body,
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    status = res.status;
    text = await res.text();
  } catch {
    // Timeout/jaringan putus: permintaan MUNGKIN sudah dieksekusi. Hasil belum diketahui, bukan pasti gagal.
    throw new GatewayError('UPSTREAM_UNKNOWN', 'Gateway tidak merespons; hasil belum diketahui, ulangi dengan ID yang sama', true);
  }
  if (status >= 500) throw new GatewayError('UPSTREAM_ERROR', `Gateway error HTTP ${status}`, true);

  let parsed: { ok?: boolean; code?: string; message?: string; result?: unknown } | null;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Biasanya halaman login/akses Google: kebijakan Workspace atau deployment tidak "Anyone".
    throw new GatewayError('GATEWAY_BAD_RESPONSE', `Respons gateway bukan JSON (HTTP ${status}); periksa akses deployment Apps Script`);
  }
  if (!parsed?.ok) {
    const code = parsed?.code ?? 'INTERNAL_ERROR';
    throw new GatewayError(code, parsed?.message ?? 'Gateway gagal', code === 'RETRYABLE_ERROR');
  }
  return parsed.result as T;
}

const HTTP_STATUS: Record<string, number> = {
  VALIDATION_ERROR: 400,
  NO_SESSION: 401,
  DEVICE_INACTIVE: 401,
  INVALID_ACTIVATION: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RETRYABLE_ERROR: 503,
  UPSTREAM_ERROR: 503,
  UPSTREAM_UNKNOWN: 504,
};

// Penolakan tingkat gateway (tanda tangan/nonce/konfigurasi) adalah kesalahan sisi server, bukan salah pengguna:
// jangan dikirim ke browser sebagai 401 karena UI akan salah mengira sesi perangkat habis.
const SERVER_FAULT = new Set(['UNAUTHORIZED', 'REPLAY', 'INTERNAL_ERROR', 'GATEWAY_BAD_RESPONSE', 'CONFIGURATION_ERROR']);

export function errorResponse(err: unknown): Response {
  const headers = { 'cache-control': 'no-store' };
  if (err instanceof GatewayError && !SERVER_FAULT.has(err.code)) {
    const body = { ok: false, code: err.code, message: err.message, retryable: err.retryable };
    return Response.json(body, { status: HTTP_STATUS[err.code] ?? 502, headers });
  }
  // Log kode dan pesan saja; tidak pernah payload, kode aktivasi, atau byte foto.
  console.error('Kesalahan server:', err instanceof GatewayError ? `${err.code} ${err.message}` : err instanceof Error ? err.message : '');
  const body = { ok: false, code: 'SERVER_ERROR', message: 'Layanan penyimpanan bermasalah; hubungi admin', retryable: false };
  return Response.json(body, { status: err instanceof GatewayError && err.code === 'CONFIGURATION_ERROR' ? 500 : 502, headers });
}
