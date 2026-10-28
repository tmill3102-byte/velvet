/* Velvet v1.5: iOS-style interaction helpers (no app state in here).
   Gestures use touch events only, so mouse/keyboard and automated clicks behave exactly as before. */
export const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* "haptic" feedback: a tiny vibration where the platform supports it (Android); iOS web has no API, so the
   visual press state in CSS carries it there */
export function haptic(kind = 'light') {
  try { if (navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 18 : kind === 'warn' ? [12, 40, 12] : 8); } catch (e) { }
}

/* bottom sheet: drag down from the grabber/header, or from anywhere while the sheet is scrolled to the top */
export function sheetDrag(sheet, onClose) {
  let y0 = null, dy = 0, t0 = 0, scroller = null;
  sheet.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    const t = e.target; if (t.closest('input,textarea,select,.chrow,.prow,.clist,.pgrid.pick,.pvrep')) { if (!t.closest('.grab')) return; }
    scroller = sheet; if (sheet.scrollTop > 0 && !t.closest('.grab')) return;
    y0 = e.touches[0].clientY; dy = 0; t0 = performance.now();
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (y0 == null) return; dy = e.touches[0].clientY - y0;
    if (dy <= 0) { sheet.style.transform = ''; return; }
    if (e.cancelable) e.preventDefault();
    sheet.style.transition = 'none'; sheet.style.transform = `translateY(${dy}px)`;
    const m = sheet.parentElement; if (m) m.style.setProperty('--dim', String(clamp(1 - dy / 500, .2, 1)));
  }, { passive: false });
  const end = () => {
    if (y0 == null) return; const v = dy / Math.max(1, performance.now() - t0); y0 = null;
    sheet.style.transition = ''; const m = sheet.parentElement; if (m) m.style.removeProperty('--dim');
    if (dy > Math.min(160, sheet.offsetHeight * .3) || (v > .6 && dy > 40)) { haptic(); onClose(); }
    else sheet.style.transform = '';
    dy = 0;
  };
  sheet.addEventListener('touchend', end); sheet.addEventListener('touchcancel', end);
}

/* edge swipe back on pushed screens (like a UINavigationController) */
export function swipeBack({ canBack, onBack, target }) {
  let x0 = null, y0 = 0, dx = 0, el = null, decided = false, t0 = 0;
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || !canBack()) return; const t = e.touches[0];
    if (t.clientX > 24) return; el = target(); if (!el) return;
    x0 = t.clientX; y0 = t.clientY; dx = 0; decided = false; t0 = performance.now();
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (x0 == null) return; const t = e.touches[0]; dx = t.clientX - x0; const ddy = t.clientY - y0;
    if (!decided) { if (Math.abs(dx) < 8 && Math.abs(ddy) < 8) return; decided = true; if (Math.abs(ddy) > Math.abs(dx) || dx < 0) { x0 = null; return; } document.body.classList.add('swiping-back'); }
    if (e.cancelable) e.preventDefault();
    const w = innerWidth, p = clamp(dx / w, 0, 1);
    el.style.transition = 'none'; el.style.transform = `translateX(${dx * (dx > 0 ? 1 : 0)}px)`; el.style.boxShadow = `-20px 0 40px rgba(0,0,0,${.5 * (1 - p)})`;
    document.body.style.setProperty('--back-p', p.toFixed(3));
  }, { passive: false });
  const end = () => {
    if (x0 == null) return; x0 = null; const e2 = el; el = null; document.body.classList.remove('swiping-back');
    if (!decided) return;
    const v = dx / Math.max(1, performance.now() - t0), go = dx > innerWidth * .33 || (v > .5 && dx > 50);
    e2.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1)'; e2.style.transform = go ? `translateX(${innerWidth}px)` : '';
    setTimeout(() => { e2.style.transition = ''; e2.style.transform = ''; e2.style.boxShadow = ''; document.body.style.removeProperty('--back-p'); if (go) { haptic(); onBack(); } }, go ? 240 : 280);
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
}

/* pull to refresh: the indicator lives in #ptr under the navigation bar */
export function pullToRefresh({ enabled, onRefresh, indicator }) {
  let y0 = null, dy = 0, busy = false; const TH = 70;
  document.addEventListener('touchstart', e => {
    if (busy || e.touches.length !== 1 || !enabled() || window.scrollY > 0) return;
    if (e.target.closest('.modal,.overlay.open,.cxm,.prow,.smart-row,.chips,.seg,.chrow')) return;
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (y0 == null) return; dy = e.touches[0].clientY - y0;
    if (dy <= 0 || window.scrollY > 0) { indicator.style.transform = ''; indicator.classList.remove('pull', 'armed'); return; }
    const d = Math.min(120, dy * .5); indicator.classList.add('pull'); indicator.classList.toggle('armed', d >= TH * .75);
    indicator.style.setProperty('--pull', d.toFixed(1) + 'px'); indicator.style.setProperty('--rot', (d * 4) + 'deg');
  }, { passive: true });
  const end = async () => {
    if (y0 == null) return; y0 = null; const armed = indicator.classList.contains('armed');
    indicator.classList.remove('pull', 'armed'); indicator.style.removeProperty('--pull');
    if (!armed) return; busy = true; haptic(); indicator.classList.add('busy');
    try { await Promise.all([onRefresh(), new Promise(r => setTimeout(r, 650))]); } finally { indicator.classList.remove('busy'); busy = false; }
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
}

/* large titles: the navigation bar shows its inline title (and its frosted background) once the big title scrolls under it */
export function largeTitles(navbar, getTitleEl) {
  let raf = 0;
  const upd = () => { raf = 0; const h = getTitleEl(); const nb = navbar.getBoundingClientRect();
    const past = h ? h.getBoundingClientRect().bottom <= nb.bottom + 2 : window.scrollY > 8;
    navbar.classList.toggle('collapsed', past); navbar.classList.toggle('scrolled', window.scrollY > 2); };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
  addEventListener('resize', upd);
  return upd;
}

/* pinch on a grid: fingers apart = bigger tiles (fewer columns), together = smaller tiles */
export function pinch(el, onStep) {
  let d0 = 0, fired = 0;
  const dist = t => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  el.addEventListener('touchstart', e => { if (e.touches.length === 2) { d0 = dist(e.touches); fired = 0; } }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (e.touches.length !== 2 || !d0) return; if (e.cancelable) e.preventDefault();
    const r = dist(e.touches) / d0;
    if (r > 1.22 && fired >= 0) { fired = 1; d0 = dist(e.touches); onStep(-1); haptic(); }
    else if (r < .82 && fired <= 0) { fired = -1; d0 = dist(e.touches); onStep(1); haptic(); }
  }, { passive: false });
  el.addEventListener('touchend', e => { if (e.touches.length < 2) d0 = 0; });
}

/* vertical swipe-down-to-close for full-screen viewers */
export function swipeDown(el, { onClose, ignore }) {
  let y0 = null, x0 = 0, dy = 0, decided = false, t0 = 0;
  el.addEventListener('touchstart', e => { if (e.touches.length !== 1 || (ignore && ignore(e))) return; y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; decided = false; t0 = performance.now(); }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (y0 == null) return;
    if (e.touches.length > 1) { if (decided) { el.style.transition = ''; el.style.transform = ''; el.style.removeProperty('--fade'); } y0 = null; return; }   // a second finger = pinch, not a swipe
    const t = e.touches[0]; dy = t.clientY - y0; const dx = t.clientX - x0;
    if (!decided) { if (Math.abs(dy) < 10 && Math.abs(dx) < 10) return; decided = true; if (Math.abs(dx) > Math.abs(dy) || dy < 0) { y0 = null; return; } }
    if (e.cancelable) e.preventDefault();
    const s = clamp(1 - dy / 1600, .85, 1); el.style.transition = 'none'; el.style.transform = `translateY(${Math.max(0, dy)}px) scale(${s})`; el.style.setProperty('--fade', clamp(1 - dy / 600, .3, 1).toFixed(3));
  }, { passive: false });
  const end = () => {
    if (y0 == null) return; y0 = null; if (!decided) return;
    const v = dy / Math.max(1, performance.now() - t0), go = dy > 130 || (v > .6 && dy > 50);
    el.style.transition = ''; el.style.transform = ''; el.style.removeProperty('--fade');
    if (go) { haptic(); onClose(); }
  };
  el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
}

/* press and hold on touch (context menus on cards); swallows the click that follows a long press */
export function longPress(el, fn, ms = 480) {
  let t = null, x = 0, y = 0, fired = false;
  el.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') return; fired = false; x = e.clientX; y = e.clientY; clearTimeout(t); el.classList.add('pressing');
    t = setTimeout(() => { fired = true; el.classList.remove('pressing'); haptic('heavy'); fn(); }, ms); });
  const stop = () => { clearTimeout(t); el.classList.remove('pressing'); };
  el.addEventListener('pointermove', e => { if (Math.abs(e.clientX - x) + Math.abs(e.clientY - y) > 8) stop(); });
  el.addEventListener('pointerup', stop); el.addEventListener('pointercancel', stop); el.addEventListener('pointerleave', stop);
  el.addEventListener('click', e => { if (fired) { fired = false; e.stopPropagation(); e.preventDefault(); } }, true);
}
