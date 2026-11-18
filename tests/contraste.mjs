// Auditoría de contraste (WCAG 2.1) de todo texto visible en una vista ya pintada.
// Se inyecta en la página con page.evaluate(auditarContraste).
export function auditarContraste() {
  const rgb = c => {
    const t = String(c), m = t.match(/[\d.]+/g);
    if (!m) return [0, 0, 0, 0];
    const n = m.map(Number);
    // color-mix() devuelve "color(srgb r g b [/ a])" con canales de 0 a 1
    if (/^color\(srgb/.test(t)) return [n[0] * 255, n[1] * 255, n[2] * 255, n.length > 3 ? n[3] : 1];
    return n;
  };
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const mezcla = (a, b) => { const al = a[3] ?? 1; return [0, 1, 2].map(i => a[i] * al + b[i] * (1 - al)).concat(1); };
  function fondo(el) {
    const capas = [];
    for (let e = el; e; e = e.parentElement) {
      const c = rgb(getComputedStyle(e).backgroundColor);
      if ((c[3] ?? 1) > 0) { capas.push(c); if ((c[3] ?? 1) >= 1) break; }
    }
    let base = capas.length && (capas[capas.length - 1][3] ?? 1) >= 1 ? capas.pop() : rgb(getComputedStyle(document.body).backgroundColor);
    while (capas.length) base = mezcla(capas.pop(), base);
    return base;
  }
  const visible = el => {
    if (el.closest('[aria-hidden="true"], .oculto, .off, .sheet:not(.on), details:not([open]) > :not(summary)')) return false;
    const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0;
  };
  const fallas = [];
  const vistos = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'svg', 'path', 'rect', 'circle', 'line'].includes(el.tagName)) continue;
    const texto = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
    if (!texto || !visible(el)) continue;
    if (el.closest('button:disabled, [disabled]')) continue;   // WCAG: componentes inactivos exentos
    const cs = getComputedStyle(el);
    const esSvg = el instanceof SVGElement;
    let fg = rgb(esSvg ? cs.fill : cs.color);
    const bg = fondo(esSvg ? el.closest('svg').parentElement : el);
    if ((fg[3] ?? 1) < 1) fg = mezcla(fg, bg);
    let op = 1; for (let e = el; e; e = e.parentElement) op *= +getComputedStyle(e).opacity;
    if (op < 1) fg = mezcla([...fg.slice(0, 3), op], bg);
    const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(cs.fontSize), negrita = +cs.fontWeight >= 600;
    const grande = px >= 24 || (negrita && px >= 18.66);
    const minimo = grande ? 3 : 4.5;
    if (ratio < minimo) {
      const clave = (el.className && String(el.className.baseVal ?? el.className)) + '|' + el.tagName + '|' + Math.round(ratio * 10);
      if (vistos.has(clave)) continue; vistos.add(clave);
      fallas.push({ texto: texto.slice(0, 30), elemento: el.tagName.toLowerCase() + (el.className ? '.' + String(el.className.baseVal ?? el.className).trim().replace(/\s+/g, '.') : ''),
        ratio: +ratio.toFixed(2), minimo, color: cs.color, fondo: `rgb(${bg.slice(0, 3).map(Math.round).join(',')})` });
    }
  }
  return fallas;
}
