// Pruebas del núcleo de Umbral (sin DOM). Casos U del plan de pruebas.
//   node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const ini = html.indexOf('<script>') + 8, fin = html.indexOf('UMBRAL — interfaz');
const ctx = vm.createContext({ console, TextEncoder, Date, Math, JSON });
vm.runInContext(html.slice(ini, html.lastIndexOf('/*', fin)) + `
globalThis.N = { vdotDe, zonasDe, ritmoDe, segundos, parseTolerante, normalizarPlan, resolverFechas, validar,
  advertenciasCarga, metricaSesion, duracionTecnica, zonaTecnica, parseEjercicios, detectarEjercicios, esEstacion,
  cargaDia, EJERCICIOS, TERMINOS, planEjemplo };`, ctx);
const N = ctx.N;
const plano = x => JSON.parse(JSON.stringify(x));   // los objetos del vm tienen otro prototipo

test('U01–U02 VDOT contra la tabla de Daniels', () => {
  assert.ok(Math.abs(N.vdotDe(21097, 6330) - 42.4) <= 0.3);
  assert.ok(Math.abs(N.vdotDe(10000, 2400) - 51.9) <= 0.3);      // corrige el 49,8 del documento original
  assert.ok(Math.abs(N.vdotDe(5000, 1197) - 50) <= 0.1);          // VDOT 50 = 5K 19:57
});

test('U03–U04 ritmos y orden de zonas', () => {
  const z = N.zonasDe(42.4);
  assert.ok(Math.abs(z.E.tip - 367) <= 4 && Math.abs(z.T.tip - 297) <= 4 && Math.abs(z.I.tip - 268) <= 4);
  assert.ok(z.E.tip > z.M.tip && z.M.tip > z.T.tip && z.T.tip > z.I.tip && z.I.tip > z.R.tip);
});

test('U10–U11 formatos de tiempo', () => {
  assert.equal(N.segundos('4:35'), 275); assert.equal(N.segundos('1:45:30'), 6330);
  assert.equal(N.segundos('1h45'), 6300); assert.equal(N.segundos('90min'), 5400); assert.equal(N.segundos('45'), 2700);
  assert.equal(N.segundos('abc'), null);
});

test('U20–U25 parseo tolerante y validación', () => {
  const crudo = N.parseTolerante('Acá va:\n```json\n{ “formato”: "utp/1", "plan": { "nombre": "X", // comentario\n "objetivo": {"distancia_km": 10, "fecha": "2027-01-10"}, "semanas": [{"numero":1,"sesiones":[{"dia":"Sunday","tipo":"easy","segmentos":[{"rol":"main","distancia":"5km","zona":"e"}]}]}], } }\n```');
  assert.ok(crudo);
  const p = N.resolverFechas(N.normalizarPlan(crudo));
  assert.equal(p.objetivo.distancia_m, 10000);
  assert.equal(p.semanas[0].sesiones[0].tipo, 'suave');
  assert.equal(p.semanas[0].sesiones[0].segmentos[0].distancia_m, 5000);
  assert.equal(N.validar(crudo, p).err.length, 0);
  const sinDist = N.parseTolerante('{"formato":"utp/1","plan":{"objetivo":{"fecha":"2027-01-10"},"semanas":[{"numero":1,"sesiones":[]}]}}');
  assert.ok(plano(N.validar(sinDist, N.resolverFechas(N.normalizarPlan(sinDist))).err).some(e => e[0] === 'E03'));
  assert.equal(N.parseTolerante('sin json'), null);
});

test('U44 la técnica no define el ritmo y suma minutos explícitos (2.0)', () => {
  assert.equal(N.zonaTecnica({ descripcion: '6 × 100 m progresivos' }), 'R');
  assert.equal(N.zonaTecnica({ descripcion: 'cadencia con metrónomo' }), 'E');
  assert.equal(N.duracionTecnica({ descripcion: '6 × 20 s progresivos con 40 s de trote' }), 5.3);
  assert.equal(N.duracionTecnica({ descripcion: 'Drills 5 min + 4 × 20 s progresivos' }), 8.3);
  assert.equal(N.duracionTecnica({ descripcion: 'Drills 10 min' }), 10);
});

test('U50 parseo de ejercicios de fuerza', () => {
  const [sq] = plano(N.parseEjercicios('Sentadilla trasera · 3 × 5 @ RIR 3–4 · 75–80 kg · pausa 2:30 · bajada en 2 s'));
  assert.deepEqual([sq.k, sq.series, sq.reps, sq.rir, sq.carga, sq.pausa, sq.nota],
    ['sentadilla', 3, '5', '3–4', '75–80 kg', '2:30', 'bajada en 2 s']);
  const ss = plano(N.parseEjercicios('Superserie: búlgara 2 × 6 por pierna @ RIR 3 · 20 kg por mano + gemelo sentado (sóleo) 2 × 10 @ RIR 2 · 60 s entre rondas'));
  assert.deepEqual(ss.map(e => [e.k, e.reps, e.pausa]), [['bulgara', '6 por pierna', '60 s'], ['gemelo_sentado', '10', '60 s']]);
  assert.equal(N.parseEjercicios('Sled push 50 m (4 × 12,5 m) · 120 kg').length, 0);   // desglose entre paréntesis
  assert.equal(plano(N.parseEjercicios('Técnica de sled pull · 4 × 12,5 m con 90 kg'))[0].reps, '12,5 m');
  assert.equal(N.parseEjercicios('Circuito × 2 vueltas: Pallof 12 por lado').length, 0);
});

test('U51 detección de ejercicios sin solapamientos', () => {
  const k = t => plano(N.detectarEjercicios(t)).map(x => x.k);
  assert.deepEqual(k('Peso muerto rumano y peso muerto'), ['peso_muerto_rumano', 'peso_muerto']);
  assert.deepEqual(k('plancha lateral 40 s + plancha 60 s'), ['plancha_lateral', 'plancha']);
  assert.deepEqual(k('sentadilla goblet, sentadilla búlgara, sentadilla'), ['sentadilla_goblet', 'bulgara', 'sentadilla']);
  assert.deepEqual(k('Sin nada que reconocer'), []);
  // todo ejercicio y término tiene explicación completa
  for (const e of plano(N.EJERCICIOS)) assert.ok(e.q && e.p.length >= 3 && e.e && e.m, e.k);
  for (const t of plano(N.TERMINOS)) assert.ok(t.q, t.k);
});

test('U52 estaciones de Hyrox y carga del día', () => {
  assert.equal(N.esEstacion({ rol: 'bloque', duracion_min: 4, zona: 'caminar', descripcion: 'RowErg 1000 m' }), true);
  assert.equal(N.esEstacion({ rol: 'bloque', distancia_m: 750, zona: 'M', descripcion: '750 m a ritmo Hyrox' }), false);
  assert.equal(N.esEstacion({ rol: 'bloque', duracion_min: 10, descripcion: 'Sentadilla · 3 × 5' }), false);
  assert.equal(N.esEstacion({ rol: 'bloque', duracion_min: 10, descripcion: 'Zancada búlgara · 3 × 8 por pierna @ RIR 2' }), false);
  assert.equal(N.esEstacion({ rol: 'bloque', duracion_min: 3, descripcion: 'Sandbag lunges 50 m con peso de competencia' }), true);
  assert.equal(plano(N.detectarEjercicios('Zancada búlgara y zancadas'))[0].k, 'bulgara');
  assert.equal(N.cargaDia([]), 'libre');
  assert.equal(N.cargaDia([{ tipo: 'suave' }, { tipo: 'intervalos', clave: true }]), 'alta');
  assert.equal(N.cargaDia([{ tipo: 'fuerza', titulo: 'Fuerza total' }]), 'media');
  assert.equal(N.cargaDia([{ tipo: 'fuerza', titulo: 'Core 8 min' }, { tipo: 'suave' }]), 'baja');
});

test('U53 el plan de ejemplo y la plantilla híbrida siguen validando', () => {
  for (const crudo of [plano(N.planEjemplo()), JSON.parse(fs.readFileSync(new URL('./fixtures/plan-hibrido.json', import.meta.url), 'utf8'))]) {
    const p = N.resolverFechas(N.normalizarPlan(crudo));
    assert.equal(N.validar(crudo, p).err.length, 0);
  }
});
