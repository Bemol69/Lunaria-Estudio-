import { json, leerBody, usaRedis } from './_lib/core.js';
import { crearReserva } from './_lib/reservar.js';

// POST /api/reservar
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Método no permitido.' });
  try {
    if (process.env.VERCEL && !usaRedis) { console.error('Falta conectar Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN)'); return json(res, 503, { ok: false, error: 'La agenda online aún no está conectada a su base de datos. Escríbeme por WhatsApp.' }); }
    const d = await leerBody(req);
    if (d.web) return json(res, 400, { ok: false, error: 'Solicitud inválida.' }); // honeypot
    const r = await crearReserva(d);
    if (!r.ok) return json(res, r.code, { ok: false, error: r.error });
    const { id, servicio_nombre, fecha, hora, duracion_min } = r.reserva;
    json(res, 200, { ok: true, reserva: { id, servicio_nombre, fecha, hora, duracion_min } });
  } catch (e) {
    console.error(e); json(res, 500, { ok: false, error: 'No pudimos guardar tu reserva. Intenta de nuevo o escríbeme por WhatsApp.' });
  }
}
