import { usaRedis, config, ahoraChile, sumaDias, reservasActivas, ocupadoSet, libres, inicios, servicioPorId, json } from './_lib/core.js';

// GET /api/disponibilidad?servicio=<id>  -> horas libres por día (sin datos personales)
export default async function handler(req, res) {
  try {
    const cfg = config();
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const serv = servicioPorId(cfg, q.servicio) || cfg.servicios[0];
    const ahora = ahoraChile();
    const ocupado = ocupadoSet(await reservasActivas(cfg));
    const dias = {};
    for (let i = 0; i <= cfg.reservas.dias_adelante; i++) {
      const f = sumaDias(ahora.fecha, i);
      const total = inicios(cfg, f, serv.duracion_min).length;
      dias[f] = { total, libres: total ? libres(cfg, f, serv.duracion_min, ocupado, ahora) : [] };
    }
    json(res, 200, { ok: true, almacen: usaRedis ? 'redis' : (process.env.VERCEL ? 'SIN_BASE_DE_DATOS' : 'local'), activas: cfg.reservas.activas, hoy: ahora.fecha, dias });
  } catch (e) {
    console.error(e); json(res, 500, { ok: false, error: 'No pudimos cargar la disponibilidad.' });
  }
}
