import { json, leerBody, tokenOk, store, config, clavesDe, fechaValida } from '../_lib/core.js';
import { crearReserva } from '../_lib/reservar.js';

// GET ?desde=&hasta=   · POST (crear) · DELETE ?id=&borrar=1 (cancelar o borrar)
export default async function handler(req, res) {
  if (!tokenOk(req)) return json(res, 401, { ok: false, error: 'Sesión vencida.' });
  try {
    const cfg = config();
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    if (req.method === 'GET') {
      let rs = await store.todas();
      if (fechaValida(q.desde || '')) rs = rs.filter(r => r.fecha >= q.desde);
      if (fechaValida(q.hasta || '')) rs = rs.filter(r => r.fecha <= q.hasta);
      rs.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
      return json(res, 200, { ok: true, reservas: rs, servicios: cfg.servicios, horario: cfg.horario, bloque: cfg.reservas.duracion_bloque_min });
    }
    if (req.method === 'POST') {
      const r = await crearReserva(await leerBody(req), { admin: true });
      return r.ok ? json(res, 200, r) : json(res, r.code, { ok: false, error: r.error });
    }
    if (req.method === 'DELETE') {
      const r = (await store.todas()).find(x => x.id === q.id);
      if (!r) return json(res, 404, { ok: false, error: 'No existe esa reserva.' });
      if (r.estado !== 'cancelada') await store.soltar(clavesDe(cfg, r));
      if (q.borrar) await store.borrar(r.id);
      else { r.estado = 'cancelada'; await store.guardar(r); }
      return json(res, 200, { ok: true });
    }
    json(res, 405, { ok: false });
  } catch (e) {
    console.error(e); json(res, 500, { ok: false, error: 'Error del servidor.' });
  }
}
