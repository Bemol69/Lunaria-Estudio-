// Núcleo del sistema de reservas: horario, disponibilidad, almacenamiento y sesión de admin.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function config() {
  const p = path.join(process.cwd(), 'api', '_config.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/* ---------- Hora de Chile ---------- */
export function ahoraChile() {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(new Date());
  const g = t => f.find(x => x.type === t).value;
  return { fecha: `${g('year')}-${g('month')}-${g('day')}`, min: +g('hour') * 60 + +g('minute') };
}
export const aMin = h => { const [a, b] = String(h).split(':').map(Number); return a * 60 + b; };
export const aHora = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function sumaDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const fechaValida = f => /^\d{4}-\d{2}-\d{2}$/.test(f) && !isNaN(new Date(f + 'T12:00:00Z'));
export function diaDeSemana(fecha) { // 0 = lunes … 6 = domingo
  return (new Date(fecha + 'T12:00:00Z').getUTCDay() + 6) % 7;
}

/* ---------- Almacenamiento (Redis REST; archivo local si no hay credenciales) ---------- */
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const usaRedis = !!(URL_ && TOK);

async function redis(cmd) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: `Bearer ${TOK}` }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

const ARCHIVO = path.join(process.cwd(), '.data', 'store.json');
function leerLocal() {
  try { return JSON.parse(fs.readFileSync(ARCHIVO, 'utf8')); } catch { return { reservas: {}, locks: {} }; }
}
function guardarLocal(d) {
  fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true });
  fs.writeFileSync(ARCHIVO, JSON.stringify(d, null, 2));
}

export const store = {
  async todas() {
    if (usaRedis) return ((await redis(['HVALS', 'reservas'])) || []).map(s => JSON.parse(s));
    return Object.values(leerLocal().reservas);
  },
  async guardar(r) {
    if (usaRedis) return redis(['HSET', 'reservas', r.id, JSON.stringify(r)]);
    const d = leerLocal(); d.reservas[r.id] = r; guardarLocal(d);
  },
  async borrar(id) {
    if (usaRedis) return redis(['HDEL', 'reservas', id]);
    const d = leerLocal(); delete d.reservas[id]; guardarLocal(d);
  },
  // Toma todos los bloques o ninguno. Devuelve false si alguno ya estaba ocupado.
  async tomar(claves, id) {
    const tomadas = [];
    for (const k of claves) {
      let ok;
      if (usaRedis) ok = (await redis(['SET', 'slot:' + k, id, 'NX', 'EX', 60 * 60 * 24 * 400])) === 'OK';
      else { const d = leerLocal(); ok = !d.locks[k]; if (ok) { d.locks[k] = id; guardarLocal(d); } }
      if (!ok) { await this.soltar(tomadas); return false; }
      tomadas.push(k);
    }
    return true;
  },
  async soltar(claves) {
    for (const k of claves) {
      if (usaRedis) await redis(['DEL', 'slot:' + k]);
      else { const d = leerLocal(); delete d.locks[k]; guardarLocal(d); }
    }
  }
};

/* ---------- Horario y bloques ---------- */
export function tramoDelDia(cfg, fecha) {
  const h = cfg.horario.find(x => x.dia === DIAS[diaDeSemana(fecha)]);
  if (!h || h.cerrado || !h.abre || !h.cierra) return null;
  return h;
}

// Horas de inicio posibles (en minutos) para un servicio de `dur` minutos ese día.
export function inicios(cfg, fecha, dur) {
  const h = tramoDelDia(cfg, fecha);
  if (!h) return [];
  const paso = cfg.reservas.duracion_bloque_min;
  const abre = aMin(h.abre), cierra = aMin(h.cierra);
  const pd = h.pausa_desde && h.pausa_hasta ? [aMin(h.pausa_desde), aMin(h.pausa_hasta)] : null;
  const out = [];
  for (let m = abre; m + dur <= cierra; m += paso) {
    if (pd && m < pd[1] && m + dur > pd[0]) continue;
    out.push(m);
  }
  return out;
}

export const bloquesDe = (cfg, hora, dur) => {
  const paso = cfg.reservas.duracion_bloque_min, ini = aMin(hora), n = Math.max(1, Math.ceil(dur / paso));
  return Array.from({ length: n }, (_, i) => aHora(ini + i * paso));
};
export const clavesDe = (cfg, r) => bloquesDe(cfg, r.hora, r.duracion_min).map(b => `${r.fecha}:${b}`);

export function ocupadoSet(reservas) {
  const s = new Set();
  for (const r of reservas) if (r.estado !== 'cancelada') for (const k of r._claves || []) s.add(k);
  return s;
}

export async function reservasActivas(cfg) {
  const rs = (await store.todas()).filter(r => r.estado !== 'cancelada');
  rs.forEach(r => { r._claves = clavesDe(cfg, r); });
  return rs;
}

export function libres(cfg, fecha, dur, ocupado, ahora = ahoraChile(), conAnticipacion = true) {
  const minimo = conAnticipacion ? ahora.min + cfg.reservas.anticipacion_horas * 60 : -1;
  return inicios(cfg, fecha, dur).filter(m => {
    if (fecha < ahora.fecha) return false;
    if (conAnticipacion && fecha === ahora.fecha && m < minimo) return false;
    return bloquesDe(cfg, aHora(m), dur).every(b => !ocupado.has(`${fecha}:${b}`));
  }).map(aHora);
}

/* ---------- Validación ---------- */
export const limpiar = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export function telefonoCL(t) {
  const d = String(t ?? '').replace(/\D/g, '');
  if (/^569\d{8}$/.test(d)) return d;
  if (/^9\d{8}$/.test(d)) return '56' + d;
  return null;
}
export const nuevoId = () => crypto.randomBytes(5).toString('hex');

/* ---------- Sesión de admin ---------- */
function claveAdmin() {
  const p = process.env.ADMIN_PASSWORD || (process.env.VERCEL ? '' : 'lunaria-demo');
  return p;
}
const firma = (exp, p) => crypto.createHmac('sha256', (process.env.ADMIN_SECRET || '') + p).update(String(exp)).digest('hex');
export function passwordOk(pw) {
  const p = claveAdmin();
  if (!p) return false;
  const a = Buffer.from(String(pw)), b = Buffer.from(p);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export function crearToken() {
  const exp = Date.now() + 12 * 3600 * 1000;
  return `${exp}.${firma(exp, claveAdmin())}`;
}
export function tokenOk(req) {
  const p = claveAdmin();
  if (!p) return false;
  const t = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const [exp, sig] = t.split('.');
  if (!exp || !sig || +exp < Date.now()) return false;
  const esperado = firma(exp, p);
  return sig.length === esperado.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(esperado));
}

export function servicioPorId(cfg, id) {
  return cfg.servicios.find(s => s.id === id);
}

export function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}
export async function leerBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}
