/* Lunaria Estudio · interacción: revelados, horario, filtros, ficha, reservas y WhatsApp */
(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const D = JSON.parse($('#datos').textContent);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const waUrl = txt => `https://api.whatsapp.com/send?phone=${D.wa}&text=${encodeURIComponent(txt)}`;
  const servicio = id => D.servicios.find(s => s.id === id);

  /* ---------- Revelados al hacer scroll ---------- */
  const revs = $$('.reveal');
  revs.forEach((el, i) => el.style.setProperty('--i', el.closest('.grid,.fases,.datos') ? i % 4 : 0));
  if ('IntersectionObserver' in window && !reduce) {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    revs.forEach(el => io.observe(el));
  } else revs.forEach(el => el.classList.add('in'));

  /* ---------- Parallax suave de la luna ---------- */
  const moon = $('[data-parallax]');
  if (moon && !reduce) {
    let tick = false;
    addEventListener('scroll', () => {
      if (tick) return; tick = true;
      requestAnimationFrame(() => { moon.style.transform = `translateY(${Math.min(scrollY, 900) * -.05}px)`; tick = false; });
    }, { passive: true });
  }

  /* ---------- Horario: abierto / cerrado (hora de Chile) ---------- */
  const chile = () => {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const g = t => f.find(x => x.type === t).value;
    const idx = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].indexOf(g('weekday'));
    return { dia: idx, min: +g('hour') * 60 + +g('minute') };
  };
  const m = h => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
  const hh = h => h.replace(/^0/, '');
  const tramos = d => {
    if (!d || d.cerrado || !d.abre || !d.cierra) return [];
    return d.pausa_desde && d.pausa_hasta ? [[d.abre, d.pausa_desde], [d.pausa_hasta, d.cierra]] : [[d.abre, d.cierra]];
  };
  function estado() {
    const H = D.horario || [];
    if (!H.length) return null;
    const now = chile();
    for (const [a, c] of tramos(H[now.dia])) if (now.min >= m(a) && now.min < m(c)) return { abierto: true, txt: `Abierto ahora · cierra a las ${hh(c)}` };
    for (let off = 0; off <= 7; off++) {
      const i = (now.dia + off) % 7;
      for (const [a] of tramos(H[i])) {
        if (off === 0 && m(a) <= now.min) continue;
        const cuando = off === 0 ? 'hoy' : off === 1 ? 'mañana' : `el ${H[i].dia}`;
        return { abierto: false, txt: `Cerrado · abre ${cuando} a las ${hh(a)}` };
      }
    }
    return { abierto: false, txt: 'Cerrado' };
  }
  function pintarEstado() {
    const e = estado(); if (!e) return;
    $$('[data-estado]').forEach(el => { el.hidden = false; el.classList.toggle('abierto', e.abierto); $('b', el).textContent = e.txt; });
    const hoy = chile().dia;
    $$('.horario tr').forEach((tr, i) => tr.classList.toggle('hoy', i === hoy));
  }
  pintarEstado(); setInterval(pintarEstado, 60000);

  /* ---------- Filtros ---------- */
  $$('.filtros button').forEach(b => b.addEventListener('click', () => {
    $$('.filtros button').forEach(x => x.setAttribute('aria-selected', x === b));
    const cat = b.dataset.cat;
    $$('.card').forEach(c => { c.hidden = cat !== 'todos' && c.dataset.cat !== cat; });
  }));

  /* ---------- Brillo de la tarjeta que sigue al puntero ---------- */
  if (finePointer) $$('.card__img').forEach(el => el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
    el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
  }));

  /* ---------- Ficha de servicio ---------- */
  const ficha = $('#ficha');
  let fichaId = null;
  function abrirFicha(id) {
    const s = servicio(id); if (!s) return;
    fichaId = id;
    $('#fichaCat').textContent = s.cat;
    $('#fichaTitulo').textContent = s.nombre;
    $('#fichaPrecio').textContent = s.precio || 'Cotizar por WhatsApp';
    $('#fichaDesc').textContent = s.desc;
    const f = $('#fichaFotos');
    f.innerHTML = '';
    f.classList.toggle('solo', !s.fotos.length);
    s.fotos.forEach((src, i) => { const im = new Image(); im.src = src; im.alt = i ? `${s.nombre}, foto ${i + 1}` : s.nombre; im.loading = 'lazy'; f.append(im); });
    const w = $('#fichaWa'); if (w) w.href = waUrl(`Hola! Quiero info de ${s.nombre} 👋`);
    $('#fichaReservar').hidden = !D.reservas;
    ficha.showModal();
  }
  $$('[data-open]').forEach(b => b.addEventListener('click', () => abrirFicha(b.dataset.open)));
  ficha.addEventListener('click', e => { if (e.target === ficha || e.target.hasAttribute('data-cerrar')) ficha.close(); });
  $('#fichaReservar').addEventListener('click', () => { ficha.close(); elegirServicio(fichaId, true); });
  $$('[data-reservar]').forEach(b => b.addEventListener('click', () => elegirServicio(b.dataset.reservar, true)));

  /* ---------- Reservas ---------- */
  const selS = $('#rsvServicio'), cal = $('#cal'), pasoHora = $('#pasoHora'), horas = $('#horas'), form = $('#rsvForm');
  const st = { servicio: selS.value, fecha: null, hora: null, disp: null };
  const cache = {};
  const fmtFecha = f => new Intl.DateTimeFormat('es-CL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z'));
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  function paso(n) {
    $$('.pasos li').forEach(li => { const k = +li.dataset.pasoN; li.classList.toggle('on', k === n); li.classList.toggle('hecho', k < n); });
  }
  function elegirServicio(id, ir) {
    if (!servicio(id)) return;
    selS.value = id; cambioServicio();
    if (ir) $('#reservar').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }
  function cambioServicio() {
    st.servicio = selS.value; st.fecha = st.hora = null;
    pasoHora.hidden = true; form.hidden = true; $('#rsvOk').hidden = true;
    const s = servicio(st.servicio);
    $('#rsvDur').textContent = s ? `${s.precio ? s.precio + ' · ' : ''}Duración aprox. ${s.dur >= 60 ? (s.dur / 60).toString().replace('.', ',') + ' h' : s.dur + ' min'}` : '';
    paso(2); cargar();
  }
  selS.addEventListener('change', cambioServicio);

  async function cargar(forzar) {
    if (!forzar && cache[st.servicio]) { st.disp = cache[st.servicio]; return pintarCal(); }
    cal.innerHTML = '<p class="cal__cargando">Cargando agenda…</p>';
    try {
      const r = await fetch('/api/disponibilidad?servicio=' + encodeURIComponent(st.servicio));
      const j = await r.json();
      if (!j.ok) throw 0;
      cache[st.servicio] = st.disp = j;
      $('#rsvFallo').hidden = true;
      pintarCal();
    } catch {
      cal.innerHTML = ''; $('#rsvFallo').hidden = false;
    }
  }

  function pintarCal() {
    const { dias, hoy } = st.disp;
    const fechas = Object.keys(dias).sort();
    cal.innerHTML = ['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(x => `<span class="cal__dow">${x}</span>`).join('');
    let mesAct = '';
    fechas.forEach((f, i) => {
      const d = new Date(f + 'T12:00:00Z');
      const mes = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
      if (mes !== mesAct) {
        mesAct = mes;
        cal.insertAdjacentHTML('beforeend', `<p class="cal__mes">${cap(mes)}</p>`);
        const dow = (d.getUTCDay() + 6) % 7;
        for (let k = 0; k < dow; k++) cal.insertAdjacentHTML('beforeend', '<span></span>');
      }
      const info = dias[f], n = info.libres.length;
      const cerrado = !info.total, agotado = !!info.total && !n;
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'dia' + (f === hoy ? ' hoy' : '') + (agotado ? ' ag' : '') + (f === st.fecha ? ' sel' : '');
      b.dataset.f = f; b.disabled = cerrado || agotado;
      b.setAttribute('aria-label', `${fmtFecha(f)}: ${cerrado ? 'sin atención' : agotado ? 'agenda llena' : n + ' horas libres'}`);
      b.style.setProperty('--f', info.total ? n / info.total : 1);
      b.innerHTML = `<span class="dia__luna"><i></i></span><small>${d.getUTCDate()}</small>`;
      b.addEventListener('click', () => elegirDia(f));
      cal.append(b);
    });
  }

  function elegirDia(f) {
    st.fecha = f; st.hora = null; form.hidden = true;
    $$('.dia', cal).forEach(b => b.classList.toggle('sel', b.dataset.f === f));
    const libres = st.disp.dias[f].libres;
    $('#horaTitulo').textContent = cap(fmtFecha(f));
    horas.innerHTML = libres.length ? '' : '<p class="horas__vacio">Ese día ya no quedan horas.</p>';
    libres.forEach(h => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = h; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => elegirHora(h));
      horas.append(b);
    });
    pasoHora.hidden = false; paso(3);
    pasoHora.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }

  function elegirHora(h) {
    st.hora = h;
    $$('button', horas).forEach(b => b.setAttribute('aria-pressed', b.textContent === h));
    const s = servicio(st.servicio);
    $('#resumen').innerHTML = `<b>${s.nombre}</b><br>${cap(fmtFecha(st.fecha))} · ${h} h`;
    $('#rsvErr').hidden = true; form.hidden = false; paso(4);
    form.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const err = $('#rsvErr'), btn = $('#rsvBtn'), fd = new FormData(form);
    const nombre = (fd.get('nombre') || '').trim(), tel = (fd.get('telefono') || '').replace(/\D/g, '');
    err.hidden = true;
    if (nombre.length < 2) return mostrar('Escribe tu nombre.');
    if (!/^(56)?9\d{8}$/.test(tel)) return mostrar('Escribe un celular chileno válido (ej: 9 1234 5678).');
    function mostrar(t) { err.textContent = t; err.hidden = false; }
    btn.disabled = true; btn.textContent = 'Reservando…';
    try {
      const r = await fetch('/api/reservar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ servicio_id: st.servicio, fecha: st.fecha, hora: st.hora, nombre, telefono: tel, nota: fd.get('nota'), web: fd.get('web') }) });
      const j = await r.json();
      if (!j.ok) {
        mostrar(j.error || 'No pudimos guardar tu reserva.');
        if (r.status === 409) { delete cache[st.servicio]; await cargar(true); elegirDia(st.fecha); form.hidden = true; mostrar(j.error); pasoHora.scrollIntoView({ block: 'nearest' }); }
        return;
      }
      const s = servicio(st.servicio);
      $('#okTxt').textContent = `${nombre}, te esperamos el ${fmtFecha(st.fecha)} a las ${st.hora} h para ${s.nombre}. ${D.referencia}.`;
      const w = $('#okWa'); if (w) w.href = waUrl(`Hola Naayú! Acabo de reservar online: ${s.nombre}, ${fmtFecha(st.fecha)} a las ${st.hora} h. A nombre de ${nombre} 🌙`);
      ['#rsvServicio', '#cal', '#pasoHora'].forEach(q => { const el = $(q); (el.closest('.rsv__paso') || el).hidden = true; });
      form.hidden = true; $('#rsvOk').hidden = false; form.reset(); delete cache[st.servicio];
      $$('.pasos li').forEach(li => li.classList.add('hecho'));
    } catch { mostrar('No pudimos conectar. Revisa tu internet o escríbeme por WhatsApp.'); }
    finally { btn.disabled = false; btn.textContent = 'Confirmar mi hora'; }
  });
  $('#okOtra').addEventListener('click', () => {
    $('#rsvOk').hidden = true;
    $$('.rsv__paso').forEach(p => { p.hidden = ['3', '4'].includes(p.dataset.paso); });
    cambioServicio();
  });
  if (D.reservas) cambioServicio();
  else $('#reservar').hidden = true;

  /* ---------- Formulario a WhatsApp ---------- */
  const wf = $('#waForm');
  if (wf) wf.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(wf), nombre = (fd.get('nombre') || '').trim(), err = $('#waErr'), vista = $('#waVista');
    if (nombre.length < 2) { err.textContent = 'Escribe tu nombre para saber quién escribe.'; err.hidden = false; return; }
    err.hidden = true;
    const msg = `Hola Naayú! 🌙\n\n*Nombre:* ${nombre}\n*Me interesa:* ${fd.get('interes')}\n` + ((fd.get('detalle') || '').trim() ? `*Detalle:* ${fd.get('detalle').trim()}\n` : '') + '\n¿Me puedes ayudar? 💅';
    vista.textContent = msg; vista.hidden = false;
    window.open(waUrl(msg), '_blank', 'noopener');
  });

  /* ---------- Mapa diferido ---------- */
  const mapa = $('[data-mapa]');
  if (mapa) {
    const cargarMapa = () => {
      if (mapa.querySelector('iframe')) return;
      const f = document.createElement('iframe');
      f.src = mapa.dataset.mapa; f.loading = 'lazy'; f.title = mapa.title; f.referrerPolicy = 'no-referrer-when-downgrade';
      mapa.append(f); $('[data-mapa-btn]', mapa)?.remove();
    };
    $('[data-mapa-btn]', mapa).addEventListener('click', cargarMapa);
    if ('IntersectionObserver' in window) new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { cargarMapa(); o.disconnect(); } }, { rootMargin: '400px' }).observe(mapa);
  }
})();
