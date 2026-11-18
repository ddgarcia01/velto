#!/usr/bin/env node
// Recorridos de integración de Umbral en un navegador real (Playwright, 390 px).
//   node tests/app.e2e.mjs [--capturas carpeta]
// Cubre los casos I del plan de pruebas y los nuevos de la 2.0 (N). Falla ante
// cualquier error de JavaScript, desborde horizontal o caso no cumplido.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HIBRIDO = fs.readFileSync(path.join(RAIZ, 'tests/fixtures/plan-hibrido.json'), 'utf8');
const args = process.argv.slice(2);
const CAPT = args.includes('--capturas') ? args[args.indexOf('--capturas') + 1] : null;
const HOY = '2026-11-25T10:00:00';   // miércoles de la semana 1 del plan híbrido

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
const srv = http.createServer((req, res) => {
  const f = path.join(RAIZ, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!f.startsWith(RAIZ) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const URL_APP = `http://127.0.0.1:${srv.address().port}/index.html`;

const navegador = await chromium.launch();
const pg = await navegador.newPage({ viewport: { width: 390, height: 844 } });
const errores = [], fallos = [];
let casos = 0;
pg.on('pageerror', e => errores.push(e.message));
pg.on('dialog', d => d.accept());
await pg.addInitScript(f => {
  const F = new Date(f).getTime(), O = Date;
  globalThis.Date = class extends O { constructor(...a) { super(...(a.length ? a : [F])); } static now() { return F; } };
}, HOY);

const ev = (fn, arg) => pg.evaluate(fn, arg);
const texto = sel => pg.textContent(sel);
async function caso(id, nombre, fn) {
  casos++;
  try { await fn(); } catch (e) { fallos.push(`${id} ${nombre}: ${e.message.split('\n')[0]}`); }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg || 'no se cumple'); };
async function importar(txt) {
  await ev(() => irA('importar'));
  await ev(t => { document.getElementById('pegado').value = t; }, txt);
  await pg.click('#btnRevisar');
  await pg.waitForSelector('#shInforme.on');
  ok(await pg.isVisible('#btnConfirmar'), 'la app rechazó el plan');
  await pg.click('#btnConfirmar');
  await pg.waitForTimeout(350);
}
const VISTAS = ['hoy', 'mes', 'semana', 'dia', 'plan', 'panel', 'guia', 'mas', 'ritmos', 'importar', 'ajustes'];
async function sinDesborde(v) {
  const w = await ev(() => document.querySelector('.vista:not(.off)').scrollWidth);
  ok(w <= 391, `desborde horizontal en ${v}: ${w}px`);
}

await pg.goto(URL_APP);

await caso('I01', 'arranque sin datos', async () => {
  ok((await texto('#v-hoy')).includes('Todavía no hay plan'));
  for (const v of VISTAS) { await ev(v => irA(v), v); await sinDesborde(v); }
});
await caso('I02', 'plan de ejemplo', async () => {
  await ev(() => irA('importar')); await pg.click('#btnEjemplo');
  await pg.waitForSelector('#shInforme.on'); await pg.click('#btnConfirmar'); await pg.waitForTimeout(300);
  ok(await ev(() => plan().semanas.length) === 12);
});
await caso('I17', 'segundo plan y cambio del activo', async () => {
  await importar(HIBRIDO);
  ok(await ev(() => D.planes.length) === 2);
  ok((await texto('#hTitulo')).toUpperCase().includes('HYROX'));
});
await caso('I03/N07', 'todas las vistas abren sin errores ni desborde', async () => {
  for (const v of VISTAS) {
    await ev(v => irA(v), v); await pg.waitForTimeout(80);
    ok((await ev(() => document.querySelector('.vista:not(.off)').innerText.length)) > 20, `vista ${v} vacía`);
    await sinDesborde(v);
    if (CAPT) await pg.screenshot({ path: path.join(CAPT, `vista-${v}.png`) });
  }
});
await caso('N08', 'secciones de Más con atajo para volver', async () => {
  for (const v of ['ritmos', 'importar', 'ajustes']) {
    await ev(v => irA(v), v);
    ok(await pg.isVisible(`#v-${v} .volver`), `sin "volver" en ${v}`);
    ok(await ev(() => document.querySelector('.tabs button.on').dataset.v) === 'mas', 'la pestaña Más no queda marcada');
  }
  await pg.click('#v-ajustes .volver');
  ok(await ev(() => vista) === 'mas');
});
await caso('N01', 'Hoy: paso a paso con ejercicios y estado de la semana', async () => {
  await ev(() => irA('hoy'));
  const t = await texto('#v-hoy');
  ok(t.includes('Paso a paso'), 'falta el paso a paso');
  ok(t.includes('Mañana'), 'falta mañana');
  ok(await pg.locator('#v-hoy .ej').count() > 0, 'no hay ejercicios enlazados');
  ok(!(await texto('#v-hoy .hoy-card')).includes('/KM'), 'una sesión de fuerza muestra ritmo de carrera');
  if (CAPT) await pg.screenshot({ path: path.join(CAPT, 'hoy-completo.png'), fullPage: true });
});
await caso('N02', 'Semana: mapa de carga, totales y navegación', async () => {
  await ev(() => irA('semana'));
  ok(await pg.locator('#v-semana .mapa .m').count() === 7);
  ok((await texto('#v-semana .semnav')).includes('Semana 1 de 4'));
  await pg.click('[data-semnav="1"]');
  ok((await texto('#v-semana .semnav')).includes('Semana 2 de 4'), 'no avanza de semana');
  await ev(() => irA('semana'));
  ok((await texto('#v-semana .semnav')).includes('Semana 1 de 4'), 'no vuelve a la semana en curso');
});
await caso('N03', 'Guía: búsqueda y explicación de un ejercicio', async () => {
  await ev(() => irA('guia'));
  ok((await texto('#v-guia')).includes('En tu semana'));
  await pg.fill('#guiaBuscar', 'wall');
  const res = await pg.locator('#v-guia .gitem').allInnerTexts();
  ok(res.length > 0 && res.length < 6 && res.every(t => /wall/i.test(t)), 'la búsqueda no filtra: ' + res.length);
  await pg.click('#v-guia .gitem');
  await pg.waitForSelector('#shGuia.on');
  const g = await texto('#cuerpoGuia');
  ok(g.includes('Cómo se hace') && g.includes('Error común'), 'guía incompleta');
  if (CAPT) await pg.screenshot({ path: path.join(CAPT, 'guia-ejercicio.png') });
  await pg.click('#btnCerrarGuia');
  await pg.fill('#guiaBuscar', '');
  await pg.locator('#v-guia [data-term="rir"]').click();
  ok((await texto('#cuerpoGuia')).includes('reserva'));
  await pg.click('#btnCerrarGuia');
});
await caso('N09', 'Calendario: mes, día y modos', async () => {
  await pg.click('.tabs button[data-v="calendario"]');
  ok(await ev(() => vista) === 'semana', 'el calendario abre en la semana');
  await pg.click('#v-semana .segctl [data-ir="mes"]');
  ok(await pg.locator('#v-mes .cm:not(.vacia)').count() === 30, 'noviembre debe tener 30 días');
  ok((await texto('#v-mes .semnav')).toLowerCase().includes('noviembre 2026'));
  ok(await pg.locator('#v-mes .cm.hoy').count() === 1);
  if (CAPT) await pg.screenshot({ path: path.join(CAPT, 'cal-mes.png') });
  await pg.click('#v-mes [data-mes="2026-12"]');
  ok((await texto('#v-mes .semnav')).toLowerCase().includes('diciembre'), 'no avanza de mes');
  await pg.click('#v-mes [data-mes="2026-11"]');
  await pg.click('#v-mes [data-dia="2026-11-28"]');
  ok(await ev(() => vista) === 'dia');
  ok((await texto('#v-dia')).includes('28 de noviembre') && await pg.locator('#v-dia .hoy-card').count() >= 1, 'el día no muestra sus sesiones');
  await pg.click('#v-dia .semnav [data-dia="2026-11-29"]');
  ok((await texto('#v-dia .semnav')).includes('29 de noviembre'));
  if (CAPT) await pg.screenshot({ path: path.join(CAPT, 'cal-dia.png') });
  await pg.click('#v-dia [data-hoy]');
  ok((await texto('#v-dia .semnav')).includes('25 de noviembre') && !(await pg.isVisible('#v-dia [data-hoy]')), 'Volver a hoy no vuelve');
  await pg.click('#v-dia .segctl [data-ir="plan"]');
  ok(await ev(() => vista) === 'plan' && await pg.isVisible('#v-plan .segctl'));
});
await caso('N12', 'resumen primero; bloques con modalidad y peso al desplegar', async () => {
  await ev(() => irA('hoy'));
  ok(await pg.locator('#v-hoy .resumen li').count() > 0, 'falta el resumen');
  ok(!(await pg.locator('#v-hoy .mas-det').first().evaluate(d => d.open)), 'el detalle debe arrancar cerrado');
  ok(await pg.locator('#v-hoy .peso').count() > 0, 'el resumen no muestra el peso');
  await pg.locator('#v-hoy .mas-det > summary').first().click();
  ok(await pg.locator('#v-hoy .mas-det').first().evaluate(d => d.open), 'no despliega');
  const ejd = pg.locator('#v-hoy .ejd').first();
  await ejd.locator('summary').click();
  ok((await ejd.innerText()).match(/Reserva|Pausa|Cómo se hace/), 'el ejercicio no muestra su detalle');
  if (CAPT) await pg.screenshot({ path: path.join(CAPT, 'hoy-detalle.png'), fullPage: false });
  // un bloque de varios ejercicios muestra modalidad y peso de cada uno
  const html = await ev(() => bloqueFuerzaHTML(parseBloque('Pie y cadera · elevación de talón a una pierna 2 × 12 + puente de glúteo a una pierna 2 × 10 + Copenhagen 2 × 20 s por lado'), ''));
  ok(html.includes('En secuencia') && (html.match(/Peso corporal/g) || []).length === 3, 'bloque mixto poco claro');
});
await caso('N11', 'registro precargado: solo revisar y guardar', async () => {
  const uid = await ev(() => todasSesiones(plan()).find(x => x.s.tipo === 'suave' && !regDe(x.s)).s.uid);
  await ev(u => abrirRegistro(u), uid);
  ok(await pg.isVisible('#cuerpoRegistro .reg-aviso'), 'falta el aviso de precarga');
  const km = await pg.inputValue('#rKm'), t = await pg.inputValue('#rTiempo');
  ok(+km > 0 && /:\d\d$/.test(t), `sin precarga: ${km} / ${t}`);
  ok(await pg.locator('#rKm.sug').count() === 1, 'la precarga no se distingue');
  ok(await pg.locator('#cuerpoRegistro [data-rpe].on').count() === 1, 'sin RPE sugerido');
  await pg.fill('#rKm', String(+km + 1));
  ok(await pg.locator('#rKm.sug').count() === 0, 'al editar debe dejar de verse como sugerido');
  await pg.click('#btnGuardarReg'); await pg.waitForTimeout(200);
  const r = await ev(u => regDe(buscarSesion(u).s), uid);
  ok(r.hecho && Math.abs(r.km - (+km + 1)) < 0.01 && r.tiempo === t && r.rpe === 3, 'no guardó lo precargado: ' + JSON.stringify(r));
  // fuerza: kilos, reps y RIR sugeridos
  const fu = await ev(() => todasSesiones(plan()).find(x => x.s.tipo === 'fuerza' && /Sentadilla/.test(JSON.stringify(x.s.segmentos)) && !regDe(x.s)).s.uid);
  await ev(u => abrirRegistro(u), fu);
  const f1 = pg.locator('#cuerpoRegistro [data-ejreg]').first();
  ok(await f1.locator('[data-r="reps"]').inputValue() !== '' && await f1.locator('[data-r="rir"]').inputValue() !== '', 'fuerza sin precarga');
  if (CAPT) await pg.screenshot({ path: path.join(CAPT, 'registro-precargado.png') });
  await ev(() => cerrarHojas());
});
await caso('C1', 'un toque registra la sesión como planificada, con deshacer y editar', async () => {
  await ev(() => irA('hoy'));
  const uid = await ev(() => todasSesiones(plan()).find(x => x.s.fecha === ymd(hoy()) && x.s.tipo === 'fuerza').s.uid);
  await ev(u => { const p = plan(); delete D.reg[claveReg(p, buscarSesion(u).s)]; pintar(); }, uid);
  await pg.click(`#v-hoy .btn[data-tick="${uid}"]`); await pg.waitForTimeout(150);
  const r = await ev(u => regDe(buscarSesion(u).s), uid);
  ok(r.hecho && r.segun_plan && r.rpe === 7 && r.ejercicios && r.ejercicios.length >= 2 && r.ejercicios.every(e => e.reps), 'registro incompleto: ' + JSON.stringify(r));
  ok(await pg.isVisible('#toastAcc'), 'falta "Editar" en el aviso');
  await pg.click('#toastAcc'); await pg.waitForSelector('#shRegistro.on');
  ok(await pg.inputValue('#cuerpoRegistro [data-ejreg] [data-r="reps"]') !== '', 'el registro no trae lo guardado');
  await ev(() => cerrarHojas());
  // tocar de nuevo desmarca sin borrar los datos
  await ev(u => { irA('semana'); }, uid);
  await pg.click(`#v-semana .tick[data-tick="${uid}"]`); await pg.waitForTimeout(150);
  const r2 = await ev(u => regDe(buscarSesion(u).s), uid);
  ok(!r2.hecho && r2.ejercicios, 'desmarcar no debe borrar lo registrado');
});
await caso('C2', 'el resumen muestra la carga sugerida de hoy cuando hay historial', async () => {
  // con un registro previo de sentadilla a 80 kg y RIR 6 (sobró), la próxima sesión sugiere 82,5 kg
  const [a, b] = await ev(() => todasSesiones(plan()).filter(x => x.s.segmentos.some(g => /Sentadilla trasera/.test(g.descripcion || ''))).map(x => x.s.uid));
  await ev(([a]) => { const p = plan(), s = buscarSesion(a).s; D.reg[claveReg(p, s)] = { hecho: true, fecha_sesion: s.fecha,
    ejercicios: [{ nombre: 'Sentadilla trasera', k: 'sentadilla', carga_kg: 80, reps: '5-5-5-5', rir: 6 }] }; }, [a]);
  const html = await ev(([b]) => resumenSesion(buscarSesion(b).s, zonasActuales(), 0).join(' '), [b]);
  ok(/Hoy 82,5 kg/.test(html), 'no sugiere la carga: ' + html.slice(0, 200));
});
await caso('N10', 'Panel: indicadores, gráficos y tabla', async () => {
  await pg.click('.tabs button[data-v="panel"]');
  ok(await pg.locator('#v-panel .tiles > div').count() >= 4, 'faltan indicadores');
  ok(await pg.locator('#v-panel .graf path').count() > 0, 'falta el gráfico de km');
  await pg.locator('#v-panel .graf [data-tip]').nth(1).click();
  ok(/Semana 1: hecho/.test(await texto('#v-panel .graf-card .tip')), 'el toque no muestra el detalle');
  ok((await texto('#v-panel')).includes('1RM estimado'));
  ok(await pg.locator('#v-panel .graf-card table').count() === 1, 'falta la vista de tabla');
  ok(/Racha/.test(await texto('#v-panel .tiles')), 'falta la racha');
  // un suave registrado demasiado rápido se marca
  await ev(() => { const p = plan(); const x = todasSesiones(p).find(o => o.s.tipo === 'suave' && !(regDe(o.s) || {}).hecho);
    D.reg[claveReg(p, x.s)] = { hecho: true, km: 10, tiempo: '45:00', rpe: 5, fecha_sesion: x.s.fecha }; pintar(); });
  ok(/frente a la zona E/.test(await texto('#v-panel')) && /rápido/.test(await texto('#v-panel')), 'no marca el suave rápido');
  if (CAPT) await pg.screenshot({ path: path.join(CAPT, 'panel.png'), fullPage: false });
});
await caso('I05/N06', 'detalle: estructura, explicaciones, ejercicios y estaciones', async () => {
  const uids = await ev(() => todasSesiones(plan()).map(x => x.s.uid));
  for (const uid of uids) {
    await ev(u => { cerrarHojas(); abrirDetalle(u); }, uid);
    ok((await ev(() => document.querySelector('#shDetalle.on').innerText.length)) > 40, `sesión ${uid} vacía`);
  }
  const hy = await ev(() => todasSesiones(plan()).find(x => /hyrox/i.test(x.s.titulo || '')).s.uid);
  await ev(u => { cerrarHojas(); abrirDetalle(u); }, hy);
  const d = await texto('#cuerpoDetalle');
  ok(d.includes('Estación') && !/caminando/.test(d), 'las estaciones se ven como caminata');
  ok(d.includes('Para qué') && d.includes('Por qué funciona') && d.includes('Cómo se tiene que sentir'));
  if (CAPT) await pg.screenshot({ path: path.join(CAPT, 'detalle-hyrox.png') });
  // un ejercicio dentro del detalle abre la guía encima
  const fu = await ev(() => todasSesiones(plan()).find(x => x.s.tipo === 'fuerza').s.uid);
  await ev(u => { cerrarHojas(); abrirDetalle(u); }, fu);
  if (CAPT) await pg.screenshot({ path: path.join(CAPT, 'detalle-fuerza.png') });
  await pg.locator('#cuerpoDetalle .ej').first().click();
  await pg.waitForSelector('#shGuia.on');
  ok(await pg.isVisible('#shDetalle.on'), 'cerrar la guía no debe cerrar el detalle');
  await pg.click('#btnCerrarGuia');
  ok(await ev(() => document.getElementById('shDetalle').classList.contains('on')), 'el detalle se cerró');
  await ev(() => cerrarHojas());
});
await caso('I06', 'editar título, tipo y fecha', async () => {
  const uid = await ev(() => todasSesiones(plan()).find(x => x.s.tipo === 'suave').s.uid);
  await ev(u => abrirEditor(u), uid);
  await pg.fill('#eTitulo', 'Rodaje editado');
  await pg.click('#btnGuardarSes'); await pg.waitForTimeout(250);
  ok(await ev(u => buscarSesion(u).s.titulo, uid) === 'Rodaje editado');
});
await caso('I07/I08', 'editor de segmentos', async () => {
  const uid = await ev(() => todasSesiones(plan()).find(x => x.s.titulo === 'Rodaje editado').s.uid);
  await ev(u => abrirEditor(u), uid);
  const n0 = await pg.locator('#segsEditor [data-seg]').count();
  await pg.click('#btnAddSeg');
  await pg.selectOption('#segsEditor [data-seg]:last-child [data-c="rol"]', 'serie');
  ok(await pg.locator('#segsEditor [data-seg]:last-child [data-c="repeticiones"]').count() === 1, 'no aparecen repeticiones');
  await pg.click('#btnGuardarSes'); await pg.waitForTimeout(250);
  ok(await ev(u => buscarSesion(u).s.segmentos.length, uid) === n0 + 1);
});
await caso('I09/N04', 'registro con cargas de fuerza y "última vez"', async () => {
  const uid = await ev(() => todasSesiones(plan()).find(x => x.s.tipo === 'fuerza' && x.s.segmentos.some(g => /Sentadilla/.test(g.descripcion || ''))).s.uid);
  await ev(u => abrirRegistro(u), uid);
  ok(await pg.locator('#cuerpoRegistro [data-ejreg]').count() >= 3, 'no hay filas de ejercicios');
  const fila = pg.locator('#cuerpoRegistro [data-ejreg]').first();
  await fila.locator('[data-r="carga_kg"]').fill('80');
  await fila.locator('[data-r="reps"]').fill('5-5-5-5');
  await fila.locator('[data-r="rir"]').fill('3');
  await pg.click('[data-rpe="7"]');
  if (CAPT) await pg.screenshot({ path: path.join(CAPT, 'registro-fuerza.png') });
  await pg.click('#btnGuardarReg'); await pg.waitForTimeout(250);
  const r = await ev(u => regDe(buscarSesion(u).s), uid);
  ok(r.hecho && r.rpe === 7 && r.ejercicios && r.ejercicios[0].carga_kg === 80 && r.ejercicios[0].reps === '5-5-5-5', 'no guardó las cargas');
  // la próxima sesión con sentadilla muestra la última carga
  const otra = await ev(u => todasSesiones(plan()).find(x => x.s.uid !== u && x.s.segmentos.some(g => /Sentadilla trasera/.test(g.descripcion || ''))).s.uid, uid);
  await ev(u => { cerrarHojas(); abrirDetalle(u); }, otra);
  const det = await texto('#cuerpoDetalle');
  ok(det.includes('Última vez') && det.includes('80 kg × 5-5-5-5'), 'no muestra la última vez');
  await ev(() => cerrarHojas());
});
await caso('N05', 'exportar registro de fuerza en CSV', async () => {
  const csv = await ev(() => registroFuerzaCSV());
  const [cab, ...filas] = csv.trim().split('\n');
  ok(cab === 'fecha,ejercicio,series,reps,carga_kg,rir,notas');
  ok(filas.some(l => /^2026-11-23,Sentadilla trasera,4,5,80,3,reps 5-5-5-5$/.test(l)), 'falta la sentadilla: ' + filas.join(' | '));
});
await caso('I10', 'marcar hecha desde la lista', async () => {
  await ev(() => irA('semana'));
  const antes = await ev(() => Object.values(D.reg).filter(r => r.hecho).length);
  await pg.locator('#v-semana .tick:not(.on)').first().click();
  ok(await ev(() => Object.values(D.reg).filter(r => r.hecho).length) === antes + 1);
});
await caso('I11', 'duplicar y eliminar', async () => {
  const total = () => ev(() => todasSesiones(plan()).length);
  const n0 = await total();
  const uid = await ev(() => todasSesiones(plan())[0].s.uid);
  await ev(u => abrirDetalle(u), uid); await pg.click(`[data-duplicar="${uid}"]`); await pg.waitForTimeout(200);
  ok(await total() === n0 + 1);
  await ev(u => abrirDetalle(u), uid); await pg.click(`[data-borrar-ses="${uid}"]`); await pg.waitForTimeout(200);
  ok(await total() === n0);
});
await caso('I12/I13', 'referencia y ajuste por clima', async () => {
  await ev(() => irA('ritmos'));
  await pg.selectOption('#refDist', '10000'); await pg.fill('#refTiempo', '45:00');
  await pg.click('#btnRef'); await pg.waitForTimeout(150);
  ok(Math.abs(await ev(() => vdotActual()) - 45.3) < 0.2);
  ok(await pg.isVisible('#v-ritmos .volver'), 'perdió el "volver" al recalcular');
  const e0 = await ev(() => ritmoRango('E', zonasActuales(), recargoActual())), t0 = await ev(() => ritmoRango('T', zonasActuales(), recargoActual()));
  await pg.click('[data-clima="1"]'); await pg.fill('#climaT', '30'); await pg.dispatchEvent('#climaT', 'change');
  ok(await ev(() => ritmoRango('E', zonasActuales(), recargoActual())) === e0, 'E no debe ajustarse');
  ok(await ev(() => ritmoRango('T', zonasActuales(), recargoActual())) !== t0, 'T debe ajustarse');
  await pg.click('[data-clima="0"]');
});
await caso('I14/I15', 'exportar UTP/1 y reimportar; ICS', async () => {
  const utp = await ev(() => planAUTP(plan()));
  const km0 = await ev(() => plan().semanas.map(w => metricaSemana(w, zonasActuales()).km).join());
  await importar(utp);
  ok(await ev(() => plan().semanas.map(w => metricaSemana(w, zonasActuales()).km).join()) === km0, 'volúmenes distintos');
  const ics = await ev(() => armarICS(todasSesiones(plan()).map(x => x.s).filter(s => s.tipo !== 'descanso'), plan(), zonasActuales(), 0));
  ok(ics.split('BEGIN:VEVENT').length - 1 === await ev(() => todasSesiones(plan()).filter(x => x.s.tipo !== 'descanso').length));
  ok(ics.split('\r\n').every(l => new TextEncoder().encode(l).length <= 75), 'línea ICS de más de 75 octetos');
});
await caso('I16', 'copia de seguridad y restauración', async () => {
  const copia = await ev(() => JSON.stringify(D));
  await ev(() => { D.planes = []; D.reg = {}; D.activo = null; pintar(); });
  await pg.setInputFiles('#fileCopia', { name: 'copia.json', mimeType: 'application/json', buffer: Buffer.from(copia) });
  await pg.waitForTimeout(400);
  ok(await ev(() => JSON.stringify(D)) === copia, 'la restauración no devolvió todo');
});
await caso('I18', 'borrar un plan borra sus registros', async () => {
  await ev(() => irA('ajustes'));
  const id = await ev(() => D.activo);
  await pg.click(`[data-borrar-plan="${id}"]`); await pg.waitForTimeout(250);
  ok(await ev(i => !D.planes.some(p => p.id === i) && !Object.keys(D.reg).some(k => k.startsWith(i + ':')), id));
});
await caso('C6', 'áreas de toque y accesibilidad', async () => {
  await ev(() => irA('semana'));
  const bb = await pg.locator('#v-semana .tick').first().boundingBox();
  ok(bb.width >= 28 && bb.height >= 28, 'tilde pequeño: ' + bb.width);
  ok(await pg.locator('#v-semana .tick[aria-label]').count() === await pg.locator('#v-semana .tick').count(), 'tilde sin etiqueta');
  ok(await pg.locator('#v-semana .segctl [role="tab"][aria-selected="true"]').count() === 1);
  const antes = await pg.locator('#v-semana .tick.on').count();
  await pg.locator('#v-semana .tick:not(.on)').first().focus(); await pg.keyboard.press('Enter'); await pg.waitForTimeout(150);
  ok(await pg.locator('#v-semana .tick.on').count() === antes + 1, 'el teclado no marca la sesión');
  const sinNombre = await ev(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent && !b.textContent.trim() && !b.getAttribute('aria-label')).length);
  ok(sinNombre === 0, `${sinNombre} botones sin nombre accesible`);
});
await caso('C7', 'modo oscuro', async () => {
  await pg.emulateMedia({ colorScheme: 'dark' });
  for (const v of ['hoy', 'mes', 'panel', 'guia']) {
    await ev(v => irA(v), v); await pg.waitForTimeout(80);
    const [fondo, tarjeta, texto] = await ev(() => [getComputedStyle(document.body).backgroundColor,
      getComputedStyle(document.querySelector('.vista:not(.off) .card, .vista:not(.off) .hoy-card, .vista:not(.off) .tiles div') || document.body).backgroundColor,
      getComputedStyle(document.querySelector('.vista:not(.off) b, .vista:not(.off) h2') || document.body).color]);
    const lum = c => { const [r, g, b] = c.match(/\d+/g).map(Number); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };
    ok(lum(fondo) < 0.15 && lum(tarjeta) < 0.2, `${v}: fondo claro en modo oscuro (${fondo} / ${tarjeta})`);
    ok(lum(texto) > 0.6, `${v}: texto oscuro sobre fondo oscuro (${texto})`);
    if (CAPT) await pg.screenshot({ path: path.join(CAPT, `oscuro-${v}.png`) });
  }
  await pg.emulateMedia({ colorScheme: 'light' });
});
await caso('E05', 'inputs de 16 px o más', async () => {
  await ev(() => irA('guia'));
  const chicos = await ev(() => [...document.querySelectorAll('input,select,textarea')].filter(e => e.offsetParent !== null && parseFloat(getComputedStyle(e).fontSize) < 16).length);
  ok(chicos === 0, `${chicos} inputs de menos de 16 px`);
});

await caso('C10', 'robustez: datos corruptos y tiempo inválido', async () => {
  await ev(() => irA('hoy'));
  const uid = await ev(() => todasSesiones(plan()).find(x => x.s.tipo === 'suave').s.uid);
  await ev(u => abrirRegistro(u), uid);
  await pg.fill('#rTiempo', 'cuarenta');
  const antes = await ev(u => JSON.stringify(regDe(buscarSesion(u).s) || null), uid);
  await pg.click('#btnGuardarReg'); await pg.waitForTimeout(150);
  ok(await ev(u => JSON.stringify(regDe(buscarSesion(u).s) || null), uid) === antes, 'guardó un tiempo inválido');
  ok(/Poné el tiempo/.test(await texto('#toast')), 'no avisa el formato');
  await ev(() => cerrarHojas());
  // una sesión corrupta no deja la vista en blanco
  const errores0 = errores.length;
  await ev(() => { irA('semana'); const s = semanaActual(plan()).sesiones.find(x => x.tipo !== 'descanso'); s.__copia = s.segmentos; s.segmentos = [null]; pintar(); });
  ok(/No se pudo mostrar esta vista/.test(await texto('#v-semana')), 'la vista quedó en blanco');
  ok(await pg.isVisible('#v-semana [data-ir="hoy"]'), 'sin salida desde el aviso');
  await ev(() => { const s = semanaActual(plan()).sesiones.find(x => x.__copia); s.segmentos = s.__copia; delete s.__copia; pintar(); });
  ok(await pg.locator('#v-semana .dia-blk').count() === 7, 'no se recupera');
  errores.length = errores0;
});

await caso('E03/C8', 'service worker: funciona sin conexión y la página se pide primero a la red', async () => {
  await pg.evaluate(() => navigator.serviceWorker.ready);
  await pg.reload(); await pg.waitForTimeout(300);
  ok(await ev(() => !!navigator.serviceWorker.controller), 'el service worker no controla la página');
  await pg.context().setOffline(true);
  await pg.reload(); await pg.waitForTimeout(300);
  ok((await texto('#v-hoy')).length > 20, 'sin conexión la app no abre');
  await pg.context().setOffline(false);
  const sw = fs.readFileSync(path.join(RAIZ, 'sw.js'), 'utf8');
  ok(/esPagina/.test(sw) && /SHELL = \[[^\]]*index\.html/.test(sw), 'estrategia o precarga del service worker');
});

await caso('C9', 'rendimiento con años de historial (1000 registros de fuerza)', async () => {
  const ms = await ev(() => {
    for (let i = 0; i < 1000; i++) D.reg['viejo' + i + ':x'] = { hecho: true, fecha_sesion: ymd(addDays(hoy(), -400 + (i % 390))),
      ejercicios: [{ nombre: 'Sentadilla trasera', k: 'sentadilla', carga_kg: 80, reps: '5-5-5', rir: 3 }, { nombre: 'Floor press', k: 'floor_press', carga_kg: 25, reps: '8-8-8', rir: 2 }] };
    const out = {};
    for (const v of ['hoy', 'dia', 'mes', 'semana', 'panel']) { irA(v); const t0 = performance.now(); pintar(); out[v] = performance.now() - t0; }
    return out;
  });
  for (const [v, t] of Object.entries(ms)) ok(t < 50, `${v} tarda ${t.toFixed(0)} ms`);
});

await navegador.close(); srv.close();
if (errores.length) fallos.push('Errores de JavaScript: ' + [...new Set(errores)].join(' | '));
if (fallos.length) { console.error(`✗ ${fallos.length} de ${casos} casos fallan:\n  ` + fallos.join('\n  ')); process.exit(1); }
console.log(`✓ ${casos} recorridos sin errores`);
