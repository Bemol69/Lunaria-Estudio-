// Build de Lunaria Estudio: valida datos, optimiza fotos, escribe el HTML y genera la config de la API.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

const R = process.cwd();
const rd = p => path.join(R, p);
const avisos = [];
const leer = (p, def) => {
  try { return JSON.parse(fs.readFileSync(rd(p), 'utf8')); }
  catch (e) { avisos.push(`⚠ ${p} dañado o ausente, uso valores por defecto (${e.message})`); return def; }
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clp = n => '$' + Math.round(n).toLocaleString('es-CL');
const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const site = leer('sitio.config.json', { nombre: 'Negocio', dominio: 'https://example.com', seo: {}, colores: {} });
const aj = leer('data/ajustes.json', {});
const flyer = leer('data/flyer.json', { mostrar: false });
const testis = leer('data/testimonios.json', { items: [] }).items || [];
const c = aj.contacto || {}, u = aj.ubicacion || {}, por = aj.portada || {};
const rv = { activas: true, duracion_bloque_min: 60, anticipacion_horas: 2, dias_adelante: 30, ...(aj.reservas || {}) };
const horario = (aj.horario || []).filter(h => h && h.dia);

/* ---------- Validaciones ---------- */
let wa = String(c.whatsapp || '').replace(/\D/g, '');
if (wa && !/^569\d{8}$/.test(wa)) { avisos.push(`⚠ WhatsApp "${c.whatsapp}" no es 569XXXXXXXX: se oculta el botón`); wa = ''; }
for (const h of horario) for (const k of ['abre', 'cierra', 'pausa_desde', 'pausa_hasta']) {
  if (h[k] && !/^([01]\d|2[0-3]):[0-5]\d$/.test(h[k])) { avisos.push(`⚠ Horario ${h.dia}.${k} "${h[k]}" inválido (HH:MM)`); h.cerrado = true; }
}

/* ---------- Servicios ---------- */
const dirS = rd('data/servicios');
let servicios = fs.existsSync(dirS) ? fs.readdirSync(dirS).filter(f => f.endsWith('.json')).map(f => {
  const s = leer('data/servicios/' + f, null);
  if (s && !s.id) s.id = slug(s.nombre || f.replace('.json', ''));
  return s;
}).filter(s => s && s.visible !== false && s.nombre) : [];
servicios.sort((a, b) => (a.orden ?? 99) - (b.orden ?? 99));
servicios = servicios.slice(0, 10);
servicios.forEach(s => { s.duracion_min = Math.max(15, +s.duracion_min || rv.duracion_bloque_min); });

/* ---------- Salida ---------- */
const dist = rd('dist');
fs.mkdirSync(dist, { recursive: true });
for (const f of fs.readdirSync(dist)) fs.rmSync(path.join(dist, f), { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'img'), { recursive: true });

const hechas = new Map();
async function foto(rel, w = 900, calidad = 78) {
  if (!rel) return '';
  const origen = rd('img/' + rel);
  if (!fs.existsSync(origen)) { avisos.push(`⚠ Falta la foto img/${rel}`); return ''; }
  const out = rel.replace(/\.[a-z]+$/i, '') + `-${w}.webp`;
  if (!hechas.has(out)) {
    fs.mkdirSync(path.dirname(path.join(dist, 'img', out)), { recursive: true });
    await sharp(origen).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: calidad }).toFile(path.join(dist, 'img', out));
    hechas.set(out, true);
  }
  return '/img/' + out;
}

const hero = await foto('servicios/hero.jpg', 1200, 80);
if (fs.existsSync(rd('img/servicios/hero.jpg'))) await sharp(rd('img/servicios/hero.jpg')).resize(1200, 630, { fit: 'cover' }).jpeg({ quality: 80 }).toFile(path.join(dist, 'og.jpg'));

const publicos = [];
let tarjetas = '', cats = [];
for (const s of servicios) {
  const img = await foto(s.portada);
  const extra = []; for (const f of s.fotos || []) { const x = await foto(f); if (x) extra.push(x); }
  const precio = s.precio ? `${s.precio_prefijo ? s.precio_prefijo + ' ' : ''}${clp(s.precio)}` : '';
  if (!cats.includes(s.categoria)) cats.push(s.categoria);
  publicos.push({ id: s.id, nombre: s.nombre, cat: s.categoria || '', desc: s.descripcion || '', precio, dur: s.duracion_min, fotos: [img, ...extra].filter(Boolean) });
  const visual = img
    ? `<img src="${img}" alt="${esc(s.nombre)}" width="900" height="1125" loading="lazy">`
    : `<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" stroke-width=".8"/><path d="M22 4.500A12 12 0 1 0 22 27.500 14 14 0 0 1 22 4.500Z" fill="currentColor"/></svg>`;
  const pre = precio
    ? `<p class="precio">${s.precio_prefijo === 'desde' ? '<span>desde</span>' : s.precio_prefijo === '+' ? '<span>suma</span>' : '<span>precio</span>'}<b>${clp(s.precio)}</b></p>`
    : `<p class="precio precio--cotiza"><span>Valor</span><b>Cotizar por WhatsApp</b></p>`;
  tarjetas += `
    <article class="card reveal" data-cat="${esc(s.categoria)}">
      <button class="card__img${img ? '' : ' card__img--luna'}" type="button" data-open="${esc(s.id)}" aria-label="Ver ${esc(s.nombre)}">${s.etiqueta ? `<span class="tag">${esc(s.etiqueta)}</span>` : ''}${visual}</button>
      <p class="card__cat">${esc(s.categoria)}</p>
      <h3>${esc(s.nombre)}</h3>
      ${pre}
      <div class="card__btns">${rv.activas ? `<button class="btn btn--sm" type="button" data-reservar="${esc(s.id)}">Reservar</button>` : ''}<button class="btn btn--sm btn--ghost" type="button" data-open="${esc(s.id)}">Ver más</button></div>
    </article>`;
}
const filtros = cats.length > 1
  ? `<button type="button" role="tab" aria-selected="true" data-cat="todos">Todos</button>` + cats.map(k => `<button type="button" role="tab" aria-selected="false" data-cat="${esc(k)}">${esc(k)}</button>`).join('')
  : '';

/* ---------- Config para la API de reservas ---------- */
fs.mkdirSync(rd('api'), { recursive: true });
fs.writeFileSync(rd('api/_config.json'), JSON.stringify({
  reservas: rv, horario,
  servicios: servicios.map(s => ({ id: s.id, nombre: s.nombre, duracion_min: s.duracion_min }))
}, null, 1));

/* ---------- Textos ---------- */
const dominio = (site.dominio || '').replace(/\/$/, '');
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
const direccion = u.direccion || '';
const mapaQ = encodeURIComponent(direccion);
const tituloHtml = esc(por.titulo || site.nombre).split(/\s+/).map((w, i) => `<span class="w"><span style="--i:${i}">${w}</span></span>`).join(' ')
  .replace(/(<span class="w"><span style="--i:\d+">)(regaloneo)/i, '$1<em>$2</em>');
const diaTxt = d => d.cerrado || !d.abre ? '<td class="cer">Cerrado</td>' : `<td>${d.abre} – ${d.cierra}${d.pausa_desde ? ` <small>(pausa ${d.pausa_desde}–${d.pausa_hasta})</small>` : ''}</td>`;
const horarioTabla = horario.map(d => `<tr><td>${esc(d.dia[0].toUpperCase() + d.dia.slice(1))}</td>${diaTxt(d)}</tr>`).join('');
const marq = ['Esmaltado permanente', 'Extensión polygel', 'Francesas', 'Ojo de gato', 'Perlado', 'Efecto aurora', 'Diseños a mano', 'Cosmetología'].map(t => `<span>${t}</span>`).join('');
const opciones = servicios.map(s => `<option value="${esc(s.id)}">${esc(s.nombre)}${s.precio ? ' · ' + (s.precio_prefijo === 'desde' ? 'desde ' : s.precio_prefijo === '+' ? '+' : '') + clp(s.precio) : ''}</option>`).join('');
const opcionesWa = servicios.map(s => `<option>${esc(s.nombre)}</option>`).join('') + '<option>Otra consulta</option>';
const testisHtml = testis.map(t => `<blockquote class="reveal"><p>“${esc(t.texto)}”</p><footer>${esc(t.nombre)}</footer></blockquote>`).join('');

const jsonld = {
  '@context': 'https://schema.org', '@type': site.schema_tipo || 'LocalBusiness',
  name: site.nombre, description: site.seo?.descripcion, url: dominio + '/', image: dominio + '/og.jpg',
  address: { '@type': 'PostalAddress', streetAddress: direccion, addressLocality: u.comuna, addressRegion: u.region, addressCountry: 'CL' },
  sameAs: [`https://www.instagram.com/${c.instagram}/`], priceRange: '$$',
  openingHoursSpecification: horario.filter(h => !h.cerrado && h.abre).map(h => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: { lunes: 'Monday', martes: 'Tuesday', 'miércoles': 'Wednesday', jueves: 'Thursday', viernes: 'Friday', 'sábado': 'Saturday', domingo: 'Sunday' }[h.dia], opens: h.abre, closes: h.cierra })),
  hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Servicios', itemListElement: servicios.map(s => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.nombre, description: s.descripcion }, ...(s.precio ? { price: s.precio, priceCurrency: 'CLP' } : {}) })) }
};
if (wa) jsonld.telephone = '+' + wa;

const dataPublica = {
  wa, nombre: site.nombre, referencia: u.referencia || '', horario, reservas: !!rv.activas,
  servicios: publicos
};

/* ---------- Archivos con hash ---------- */
const hash = f => crypto.createHash('md5').update(fs.readFileSync(rd(f))).digest('hex').slice(0, 8);
const cssName = `styles.${hash('styles.css')}.css`, jsName = `app.${hash('app.js')}.js`;
fs.copyFileSync(rd('styles.css'), path.join(dist, cssName));
fs.copyFileSync(rd('app.js'), path.join(dist, jsName));

const waLink = wa ? `https://api.whatsapp.com/send?phone=${wa}&text=${encodeURIComponent(c.mensaje_defecto || 'Hola! 👋')}` : '';
const valores = {
  TITULO_SEO: esc(site.seo?.titulo || site.nombre), DESC_SEO: esc(site.seo?.descripcion || ''), CANONICAL: dominio + '/',
  OG_IMG: dominio + '/og.jpg', TEMA: site.colores?.tema || '#2B1F2E', CSS: '/' + cssName, JS: '/' + jsName, NOMBRE: esc(site.nombre),
  JSONLD: JSON.stringify(jsonld).replace(/</g, '\\u003c'), DATA_JSON: JSON.stringify(dataPublica).replace(/</g, '\\u003c'),
  HERO_IMG: hero, HERO_ALT: 'Manos con diseño de uñas hecho en Lunaria Estudio',
  TITULO_PORTADA_HTML: tituloHtml, BAJADA: esc(por.bajada || ''), LEMA: esc(por.lema || ''), COMUNA: esc(u.comuna || ''),
  REFERENCIA: esc(u.referencia || direccion), DIRECCION: esc(direccion), WA_LINK: waLink, INSTAGRAM: esc(c.instagram || ''),
  IG_URL: `https://www.instagram.com/${esc(c.instagram || '')}/`, CORREO: esc(c.correo || ''),
  MAPA_SRC: `https://www.google.com/maps?q=${mapaQ}&output=embed`, COMO_LLEGAR: `https://www.google.com/maps/search/?api=1&query=${mapaQ}`,
  ANIO: hoy.slice(0, 4), FILTROS: filtros, TARJETAS: tarjetas, SELECT_SERVICIOS: opciones, SELECT_SERVICIOS_WA: opcionesWa,
  HORARIO_TABLA: horarioTabla, PAGOS: (aj.pagos || []).map(p => `<li>${esc(p)}</li>`).join(''), MARQUEE: marq, TESTIMONIOS: testisHtml
};
const bloques = { WHATSAPP: !!wa, HORARIO: horario.some(h => !h.cerrado), MAPA: !!direccion, CORREO: !!c.correo, TESTIMONIOS: testis.length > 0, FLYER: !!flyer.mostrar };

let html = fs.readFileSync(rd('index.html'), 'utf8');
for (const [k, v] of Object.entries(bloques)) {
  const re = new RegExp(`<!-- SI:${k} -->([\\s\\S]*?)<!-- /SI:${k} -->`, 'g');
  html = html.replace(re, v ? '$1' : '');
}
if (!servicios.length) avisos.push('⚠ No hay servicios visibles');
html = html.replace(/%%(\w+)%%/g, (m, k) => (k in valores ? valores[k] : (avisos.push(`⚠ Marcador sin valor: ${m}`), '')));
fs.writeFileSync(path.join(dist, 'index.html'), html);

/* ---------- Estáticos ---------- */
const copiar = (a, b) => { if (fs.existsSync(rd(a))) fs.cpSync(rd(a), path.join(dist, b), { recursive: true }); };
copiar('admin', 'admin'); copiar('agenda', 'agenda'); copiar('data', 'data');
fs.writeFileSync(path.join(dist, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2B1F2E"/><path d="M21 6.5A10 10 0 1 0 21 25.500 12 12 0 0 1 21 6.500Z" fill="#F4EEE7"/></svg>`);
fs.writeFileSync(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /agenda/\nDisallow: /api/\nSitemap: ${dominio}/sitemap.xml\n`);
fs.writeFileSync(path.join(dist, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${dominio}/</loc><lastmod>${hoy}</lastmod></url></urlset>\n`);

console.log(`✔ Build listo: ${servicios.length} servicios, ${hechas.size} fotos, bloques: ${Object.entries(bloques).filter(([, v]) => v).map(([k]) => k).join(', ')}`);
avisos.forEach(a => console.log(a));
