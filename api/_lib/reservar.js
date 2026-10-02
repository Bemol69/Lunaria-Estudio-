import { store, config, ahoraChile, fechaValida, aMin, aHora, libres, reservasActivas, ocupadoSet, bloquesDe, clavesDe, limpiar, telefonoCL, nuevoId, servicioPorId, tramoDelDia, sumaDias } from './core.js';

// Crea una reserva (clienta desde la web o admin desde la agenda). Devuelve { ok, reserva } o { ok:false, error, code }.
export async function crearReserva(d, { admin = false } = {}) {
  const cfg = config();
  if (!cfg.reservas.activas && !admin) return { ok: false, code: 403, error: 'Las reservas online están pausadas. Escríbeme por WhatsApp.' };
  const bloqueo = admin && d.tipo === 'bloqueo';
  const fecha = String(d.fecha || ''), hora = String(d.hora || '');
  if (!fechaValida(fecha) || !/^\d{2}:\d{2}$/.test(hora)) return { ok: false, code: 400, error: 'Fecha u hora inválida.' };

  let serv = null, dur = cfg.reservas.duracion_bloque_min;
  if (!bloqueo) {
    serv = servicioPorId(cfg, d.servicio_id);
    if (!serv) return { ok: false, code: 400, error: 'Elige un servicio.' };
    dur = serv.duracion_min;
  } else if (d.duracion_min) dur = Math.max(cfg.reservas.duracion_bloque_min, Math.min(600, +d.duracion_min || dur));

  const nombre = limpiar(d.nombre, 60), nota = limpiar(d.nota, 300);
  let tel = '';
  if (!bloqueo) {
    if (nombre.length < 2) return { ok: false, code: 400, error: 'Escribe tu nombre.' };
    tel = telefonoCL(d.telefono);
    if (!tel && !(admin && !String(d.telefono || '').trim())) return { ok: false, code: 400, error: 'Escribe un celular chileno válido (ej: 9 1234 5678).' };
    tel = tel || '';
  }

  const ahora = ahoraChile();
  if (!admin) {
    if (fecha > sumaDias(ahora.fecha, cfg.reservas.dias_adelante)) return { ok: false, code: 400, error: 'Esa fecha aún no está disponible.' };
  }
  const reservas = await reservasActivas(cfg);
  const ocupado = ocupadoSet(reservas);
  const ok = libres(cfg, fecha, dur, ocupado, ahora, !admin);
  if (!ok.includes(hora)) return { ok: false, code: 409, error: 'Esa hora ya no está disponible. Elige otra, por favor.' };

  const r = {
    id: nuevoId(), tipo: bloqueo ? 'bloqueo' : (admin ? 'admin' : 'web'), estado: 'confirmada',
    servicio_id: serv?.id || '', servicio_nombre: serv?.nombre || 'Hora bloqueada',
    fecha, hora, duracion_min: dur, nombre: nombre || (bloqueo ? 'Bloqueado' : ''), telefono: tel, nota,
    creada: new Date().toISOString()
  };
  if (!(await store.tomar(clavesDe(cfg, r), r.id))) return { ok: false, code: 409, error: 'Esa hora acaba de ser tomada. Elige otra, por favor.' };
  await store.guardar(r);
  return { ok: true, reserva: r };
}
