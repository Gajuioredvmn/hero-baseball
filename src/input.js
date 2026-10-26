// ===== input.js : swipe swing, gesture pitch, symbol recognizer =====
// ---------- symbol templates (unit box, y down) ----------
function arcPts(cx, cy, r, a0, a1, n = 24) { const o = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; }
const SYMBOLS = {
  arrow: [[0, 0.5], [1, 0.5], [0.68, 0.22]],
  inf: (() => { const o = []; for (let i = 0; i <= 48; i++) { const t = i / 48 * TAU; o.push([0.5 + 0.5 * Math.sin(t), 0.5 + 0.35 * Math.sin(t) * Math.cos(t) * 2]); } return o; })(),
  mtn: [[0, 1], [0.5, 0], [1, 1]],
  W: [[0, 0], [0.25, 1], [0.5, 0.3], [0.75, 1], [1, 0]],
  circle: arcPts(0.5, 0.5, 0.5, -PI / 2, PI * 1.5, 40),
  Z: [[0, 0], [1, 0], [0, 1], [1, 1]],
  arc: arcPts(0.5, 1, 0.5, PI, TAU, 30),
  C: arcPts(0.5, 0.5, 0.5, -PI * 0.3, -PI * 1.7, 30),
  spiral: (() => { const o = []; const N = 60; for (let i = 0; i <= N; i++) { const t = i / N; const a = t * TAU * 2.2; const r = 0.5 * (1 - t * 0.85); o.push([0.5 + Math.cos(a) * r, 0.5 + Math.sin(a) * r]); } return o; })(),
  nine: arcPts(0.5, 0.32, 0.32, 0, -TAU, 28).concat([[0.82, 0.32], [0.78, 1.0]]),
  U: [[0, 0], [0, 0.55]].concat(arcPts(0.5, 0.55, 0.5, PI, 0, 20).slice(1)).concat([[1, 0]]),
  square: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
  bolt: [[0.65, 0], [0.15, 0.55], [0.8, 0.45], [0.3, 1]],
  question: arcPts(0.5, 0.3, 0.3, PI * 1.1, PI * 2.4, 20).concat([[0.5, 0.62], [0.5, 0.85]]),
  V: [[0, 0], [0.5, 1], [1, 0]],
  M: [[0, 1], [0.18, 0], [0.5, 0.65], [0.82, 0], [1, 1]],
  wave: (() => { const o = []; for (let i = 0; i <= 32; i++) { const x = i / 32; o.push([x, 0.5 - 0.42 * Math.sin(x * TAU)]); } return o; })(),
  tri: [[0.5, 0], [1, 1], [0, 1], [0.5, 0]],
  L: [[0, 0], [0, 1], [0.75, 1]],
  up: [[0.5, 1], [0.5, 0], [0.18, 0.32]],
  star: (() => { const o = []; for (let i = 0; i <= 5; i++) { const a = -PI / 2 + i * (TAU * 2 / 5); o.push([0.5 + Math.cos(a) * 0.5, 0.52 + Math.sin(a) * 0.5]); } return o; })(),
  S: arcPts(0.5, 0.27, 0.27, -PI * 0.15, -PI * 1.5, 14).concat(arcPts(0.5, 0.73, 0.27, -PI * 0.5, PI * 0.85, 14).slice(1)),
  T: [[0, 0], [1, 0], [0.5, 0], [0.5, 1]],
  hourglass: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 0]],
};
// ---------- $1-style recognizer ----------
const REC_N = 48, REC_SIZE = 250;
function pathLen(p) { let d = 0; for (let i = 1; i < p.length; i++) d += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return d; }
function resample(pts, n) {
  const I = pathLen(pts) / (n - 1); let D = 0; const out = [pts[0].slice()];
  const p = pts.map(q => q.slice());
  for (let i = 1; i < p.length; i++) {
    const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (D + d >= I && d > 0) {
      const t = (I - D) / d; const q = [p[i - 1][0] + t * (p[i][0] - p[i - 1][0]), p[i - 1][1] + t * (p[i][1] - p[i - 1][1])];
      out.push(q); p.splice(i, 0, q); D = 0;
    } else D += d;
  }
  while (out.length < n) out.push(p[p.length - 1].slice());
  return out.slice(0, n);
}
function normalizeStroke(pts) {
  let p = resample(pts, REC_N);
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const q of p) { minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); }
  const w = Math.max(maxX - minX, 1e-3), h = Math.max(maxY - minY, 1e-3);
  // keep aspect for very thin shapes
  const sx = REC_SIZE / (w < h * 0.25 ? h : w), sy = REC_SIZE / (h < w * 0.25 ? w : h);
  p = p.map(q => [(q[0] - minX) * sx, (q[1] - minY) * sy]);
  let cx = 0, cy = 0; for (const q of p) { cx += q[0]; cy += q[1]; } cx /= p.length; cy /= p.length;
  return p.map(q => [q[0] - cx, q[1] - cy]);
}
function rotPts(p, a) { const c = Math.cos(a), s = Math.sin(a); return p.map(q => [q[0] * c - q[1] * s, q[0] * s + q[1] * c]); }
function pathDist(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]); return d / a.length; }
function recognize(stroke, symKey) {
  if (stroke.length < 5) return 0;
  const T = normalizeStroke(SYMBOLS[symKey]);
  let best = 1e9;
  for (const cand of [stroke, stroke.slice().reverse()]) {
    const P = normalizeStroke(cand);
    let lo = -0.6, hi = 0.6;
    const phi = 0.5 * (-1 + Math.sqrt(5));
    let x1 = phi * lo + (1 - phi) * hi, x2 = (1 - phi) * lo + phi * hi;
    let f1 = pathDist(rotPts(P, x1), T), f2 = pathDist(rotPts(P, x2), T);
    for (let k = 0; k < 10; k++) {
      if (f1 < f2) { hi = x2; x2 = x1; f2 = f1; x1 = phi * lo + (1 - phi) * hi; f1 = pathDist(rotPts(P, x1), T); }
      else { lo = x1; x1 = x2; f1 = f2; x2 = (1 - phi) * lo + phi * hi; f2 = pathDist(rotPts(P, x2), T); }
    }
    best = Math.min(best, f1, f2);
  }
  return clamp(1 - best / (0.5 * Math.sqrt(2) * REC_SIZE), 0, 1);
}

// ---------- drawn pitch path ----------
// how far (meters, before the pitcher's break stat) each pitch can move [sideways, up/down]
// how far each pitch type can be bent (metres, x = sideways, y = up/down) for an average pitcher
const BREAK_MAX = { FB: [0.35, 0.4], SL: [1.6, 0.5], CB: [1.0, 1.8], CH: [0.7, 1.0], SF: [0.35, 1.5] };
// each pitcher's signature pitch bends 30% more
const SIG_PITCH = { houyi: 'FB', fujin: 'SL', zeus: 'SF', loki: 'CB' };
function breakCaps(type, Pt) {
  const st = Pt.hero.stats, brkF = 0.35 + (st.brk || 4) * 0.09, sig = SIG_PITCH[Pt.hero.id] === type ? 1.3 : 1;
  return { mx: BREAK_MAX[type][0] * brkF * sig, my: BREAK_MAX[type][1] * brkF * sig, turns: 1 + Math.floor((st.ctrl || 4) / 3.5) };
}
// turn the finger stroke into offsets from the straight line, sampled along the flight: keeps the drawn shape,
// saturates its size at what this pitcher can do, and irons out more twists than his control allows
function strokeShape(pts, type, Pt) {
  const N = 25;
  const r = resample(pts, N);
  const S = r[0], E = r[N - 1];
  const { mx, my, turns } = breakCaps(type, Pt);
  const K = 1 / (0.1 * innerHeight); // a bend of 10% of the screen height = the pitch's full break
  let ox = [], oy = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const dx = (r[i][0] - (S[0] + (E[0] - S[0]) * u)) * K, dy = (r[i][1] - (S[1] + (E[1] - S[1]) * u)) * K;
    ox.push(-dx * mx); oy.push(-dy * my); // screen right = world -x (pitcher's view); screen down = world down
  }
  const twists = a => { let n = 0, prev = 0; for (let i = 1; i < a.length; i++) { const d = a[i] - a[i - 1]; if (Math.abs(d) < 0.01) continue; const sg = Math.sign(d); if (prev && sg !== prev) n++; prev = sg; } return n; };
  const smooth1 = () => { const a = ox.slice(), b = oy.slice(); for (let i = 1; i < N - 1; i++) { ox[i] = (a[i - 1] + a[i] * 2 + a[i + 1]) / 4; oy[i] = (b[i - 1] + b[i] * 2 + b[i + 1]) / 4; } };
  for (let pass = 0; pass < 2; pass++) smooth1(); // finger wobble
  for (let pass = 0; pass < 14 && (twists(ox) > turns || twists(oy) > turns); pass++) smooth1(); // more twists than he can control
  // saturate rather than shrink: a wild drawing stays wild, just no bigger than his arm allows
  ox = ox.map(v => mx * Math.tanh(v / mx)); oy = oy.map(v => my * Math.tanh(v / my));
  const amt = Math.max(...ox.map(Math.abs)) / mx + Math.max(...oy.map(Math.abs)) / my;
  return { ox, oy, n: N, effort: 1 + Math.min(1.2, amt) * 0.6 }; // big benders tire the arm faster
}
function shapeOffset(sh, s) {
  const f = clamp(s, 0, 1) * (sh.n - 1), i = Math.min(sh.n - 2, Math.floor(f)), t = f - i;
  return [sh.ox[i] + (sh.ox[i + 1] - sh.ox[i]) * t, sh.oy[i] + (sh.oy[i + 1] - sh.oy[i]) * t];
}

// ---------- pointer input ----------
const INPUT = {
  el: null, down: false, pts: [], t0: 0, committed: false, mode: null,
  init() {
    const el = document.getElementById('touch');
    this.el = el;
    el.addEventListener('pointerdown', e => this.onDown(e));
    el.addEventListener('pointermove', e => this.onMove(e));
    el.addEventListener('pointerup', e => this.onUp(e));
    el.addEventListener('pointercancel', e => this.onUp(e));
    el.addEventListener('contextmenu', e => e.preventDefault());
  },
  role() {
    if (!G || G.over || G.cut) return null;
    if (G.isUserOffense() && (G.phase === 'flight' || G.phase === 'windup' || G.phase === 'pre' || G.phase === 'aim')) return 'swing';
    if (G.isUserDefense() && G.phase === 'pre') return 'pitch';
    return null;
  },
  last() { const p = this.pts[this.pts.length - 1]; return p ? [p[0], p[1]] : null; },
  onDown(e) {
    SFX.init(); MUSIC.unlock();
    if (G && G.cut) { e.preventDefault(); G.advanceCut(); return; }
    if (G && G.introT > 0) { e.preventDefault(); G.skipIntro(); return; }
    this.mode = this.role();
    if (!this.mode) return;
    e.preventDefault();
    if (this.mode === 'pitch' && !UI.pitchType) { UI.hint('先選擇球種', 1.4); UI.flashMenu(); this.mode = null; return; }
    try { this.el.setPointerCapture(e.pointerId); } catch (_) { }
    this.down = true; this.committed = false;
    this.pts = [[e.clientX, e.clientY, performance.now()]];
    UI.hideHint();
    if (this.mode === 'pitch') UI.drawStroke(this.pts, true);
    // batting: pressing during the pitch's flight is the swing (timing decides contact)
    if (this.mode === 'swing' && G.phase === 'flight' && !G.swing) {
      this.committed = true;
      // touch + display latency compensation: judge the swing slightly earlier than the handler runs
      const evLag = clamp((performance.now() - e.timeStamp) / 1000, 0, 0.05);
      G.doSwing({ angle: 10, power: 1, user: true, early: 0.03 + (isFinite(evLag) ? evLag : 0) });
      UI.swingFx([e.clientX, e.clientY]);
    }
  },
  onMove(e) {
    if (!this.down) return;
    const p = [e.clientX, e.clientY, performance.now()];
    this.pts.push(p);
    if (this.pts.length > 400) this.pts.splice(1, 1);
    if (this.mode === 'swing' && G.phase === 'aim' && G.aim) {
      if (!G.aim.origin) G.aim.origin = [p[0], p[1]];
      G.aim.dx = p[0] - G.aim.origin[0]; G.aim.dy = p[1] - G.aim.origin[1];
    }
    if (this.mode === 'pitch') UI.drawStroke(this.pts, false);
  },
  onUp(e) {
    if (!this.down) return;
    this.down = false;
    if (this.mode === 'pitch') { UI.drawStroke(null); this.evalPitch(); }
    if (this.mode === 'swing' && G) {
      if (G.phase === 'aim') G.releaseAim();
      else if (G.swing && G.swing.user && !G.swing.done) G.swing.released = true;
    }
    this.mode = null;
  },
  evalPitch() {
    const P = this.pts; if (P.length < 4) return;
    const s = P[0], e = P[P.length - 1];
    if (s[1] - e[1] < innerHeight * 0.1) { UI.hint('由下往上畫出球路', 1.5); return; }
    const type = UI.pitchType;
    if (!type) { UI.hint('先選擇球種', 1.4); return; }
    const Pt = G.fld.pos.P;
    // the end of the stroke is where the ball crosses the plate (aim box = the real strike zone on screen)
    const A = UI.aimRect();
    const nx = clamp((e[0] - A.cx) / (A.w / 2), -2.2, 2.2), ny = clamp((A.cy - e[1]) / (A.h / 2), -2.2, 2.2);
    const Z = UI.zoneWorld || { hw: ZONE.x, zc: (ZONE.bot + ZONE.top) / 2, hh: (ZONE.top - ZONE.bot) / 2 };
    const prm = pitchParams(Pt, type, [-nx * Z.hw, Z.zc + ny * Z.hh]); // speed comes from the pitcher and the pitch type
    prm.brk = [0, 0];
    prm.shape = strokeShape(P.map(q => [q[0], q[1]]), type, Pt);
    prm.effort = prm.shape.effort;
    UI.pitchFeedback(prm);
    G.beginPitch(prm);
  },
};
