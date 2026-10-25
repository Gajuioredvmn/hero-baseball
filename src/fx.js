// ===== fx.js : particles, trails, lightning, floating text =====
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) { } }
// weather of the current half inning (see game.js rollWeather)
const W8 = { kind: null, rain: 0, storm: 0, fog: 0, wind: [0, 0], windName: '', slip: 1, drag: 1, roll: 1, mix: 0, lookKind: null, boltT: 5, strikes: 0, drops: null, streaks: null };
const WEATHER = {
  rain: { name: '暴雨', chip: '#9ad0ff', desc: '場地濕滑，所有人跑速變慢，飛球飛不遠、滾地球滾不快', icon: '<path d="M7 14a4 4 0 0 1 .4-8 5 5 0 0 1 9.6 1.6A3.3 3.3 0 0 1 16.5 14H7z"/><path d="M9 17l-1 3M13 17l-1 3M17 17l-1 3"/>',
    look: { fog: [60, 420], fogCol: [0.3, 0.3, 0.38], gain: [0.8, 0.83, 0.93], sat: 0.8 } },
  storm: { name: '雷雨', chip: '#c8b8ff', desc: '大雨加上落雷，被雷打中的野手會麻痺', icon: '<path d="M7 13a4 4 0 0 1 .4-8 5 5 0 0 1 9.6 1.6A3.3 3.3 0 0 1 16.5 13H7z"/><path d="M12 13l-2 4h3l-2 4"/>',
    look: { fog: [50, 360], fogCol: [0.24, 0.24, 0.32], gain: [0.7, 0.73, 0.86], sat: 0.76 } },
  wind: { name: '強風', chip: '#b8ffd8', desc: '高飛球會被風吹偏', icon: '<path d="M3 8h10a3 3 0 1 0-3-3M3 12h14a3 3 0 1 1-3 3M3 16h7"/>',
    look: null },
  fog: { name: '濃霧', chip: '#e6e2ee', desc: '看不清球，野手反應變慢，也看不到飛球落點', icon: '<path d="M4 9h16M2 13h14M6 17h14M8 5h10"/>',
    look: { fog: [5, 78], fogCol: [0.6, 0.58, 0.65], gain: [0.96, 0.96, 0.99], sat: 0.72 } },
};
function W8label(short) { return W8.kind === 'wind' ? `強風・${short ? W8.windShort : W8.windName}` : W8.kind ? WEATHER[W8.kind].name : ''; }
function W8desc() {
  if (W8.kind !== 'wind') return W8.kind ? WEATHER[W8.kind].desc : '';
  return W8.windName === '順風' ? '風往外野吹，高飛球會飛得更遠' : W8.windName === '逆風' ? '風往本壘吹，高飛球會被吹回來' : `高飛球會被${W8.windName}`;
}
function W8set(kind) {
  W8.kind = kind || null;
  W8.rain = kind === 'rain' || kind === 'storm' ? 1 : 0; W8.storm = kind === 'storm' ? 1 : 0; W8.fog = kind === 'fog' ? 1 : 0;
  W8.wind = [0, 0]; W8.windName = '';
  if (kind === 'wind') {
    const a = rand() * TAU, s = 1.6; // ~±15% carry on a long fly ball
    W8.wind = [Math.sin(a) * s, -Math.cos(a) * s];
    const fa = Math.atan2(W8.wind[0], -W8.wind[1]) / DEG;
    W8.windName = Math.abs(fa) < 45 ? '順風' : Math.abs(fa) > 135 ? '逆風' : fa < 0 ? '吹向左外野' : '吹向右外野';
    W8.windShort = Math.abs(fa) < 45 ? '順風' : Math.abs(fa) > 135 ? '逆風' : fa < 0 ? '往左' : '往右';
  }
  W8.slip = W8.rain ? 0.88 : 1; W8.drag = W8.rain ? 1.1 : 1; W8.roll = W8.rain ? 1.2 : 1;
  W8.boltT = 3 + rand() * 4; W8.strikes = 0;
  if (typeof UI !== 'undefined' && UI.weatherChip) UI.weatherChip(W8.kind);
}
const FX = {
  parts: [], soft: [], dust: [], bolts: [], texts: [], trail: [], trail2: [], shake: 0, hitstop: 0, layer: null, decals: [],
  sand: 0, rewindT: 0, clockT: 0, punch: 0, lines: null, batTrail: null, impCv: null, impCtx: null, impDirty: false,
  init() {
    this.layer = document.getElementById('fx');
    this.impCv = document.getElementById('impact');
    if (this.impCv) this.impCtx = this.impCv.getContext('2d');
  },
  // ---------- impact feel ----------
  // tier 0 weak, 1 solid, 2 sweet spot / hard hit, 3 home run off the bat
  impact(pos, tier, q, ev, special) {
    const col = tier >= 3 ? [1, 0.8, 0.3] : tier >= 2 ? [1, 0.92, 0.6] : [1, 1, 1];
    this.hitstop = Math.max(this.hitstop, [0.045, 0.085, 0.14, 0.24][tier]);
    this.shake = Math.max(this.shake, [0.14, 0.28, 0.5, 0.8][tier]);
    this.punch = Math.max(this.punch, [0.25, 0.5, 0.85, 1][tier]);
    if (tier >= 1 && !special) { POST.flash = Math.max(POST.flash, [0, 0.16, 0.36, 0.62][tier]); POST.flashCol = tier >= 3 ? [1, 0.9, 0.62] : [1, 1, 0.95]; }
    this.burst(pos, col, [12, 20, 34, 52][tier], [4, 6.5, 9, 12][tier], [0.06, 0.075, 0.09, 0.11][tier]);
    if (tier >= 2) for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; const r = [R.camRight, R.camUp]; const d = vadd(vscale(r[0], Math.cos(a)), vscale(r[1], Math.sin(a))); this.emit({ x: pos[0], y: pos[1], z: pos[2], vx: d[0] * 9, vy: d[1] * 9, vz: d[2] * 9, life: 0.28, size: 0.16, r: col[0], g: col[1], b: col[2], drag: 4, soft: true }); }
    this.trail = [];
    this.batTrail = tier >= 2 ? { w: tier >= 3 ? 0.24 : 0.13, col: tier >= 3 ? [1, 0.78, 0.25, 0.95] : [1, 0.93, 0.62, 0.8], len: tier >= 3 ? 36 : 24, sparkle: tier >= 3 ? 4 : 1 } : null;
    const s = worldToScreen(pos);
    if (s[2] > 0) {
      this.lines = { x: s[0], y: s[1], t: 0, life: [0.2, 0.3, 0.45, 0.7][tier], tier, rot: rand() * TAU, gold: tier >= 3 };
      this.sfxWord(s[0], s[1], ['啪！', '鏘！', '鏘！！', '鏘——！！'][tier], 't' + tier);
      if (tier >= 1) this.shockDom(s[0], s[1], 't' + tier);
    }
    buzz([12, 24, 45, [70, 40, 120]][tier]);
  },
  // ---------- batter auras (each hero's own presence while at bat) ----------
  batterAura(dt) {
    if (!G || !G.batter || !['batterUp', 'pre', 'windup', 'flight', 'aim'].includes(G.phase)) return;
    const B = G.batter, A = AURA[B.hero.id]; if (!A) return;
    const sc = B.sprite.scale || 1, o = B.pos, T = R.time;
    // additive glow piles up into white when the camera is right next to him (intro / cut close-ups): thin it out
    const fade = R.camPos ? clamp((vdist(R.camPos, o) - 1.2) / 3.5, 0.3, 1) : 1;
    const E = q => { q.a = (q.a === undefined ? 1 : q.a) * fade; return this.emit(q); };
    const col = () => { const k = rand(); return [A.c[0] + (A.c2[0] - A.c[0]) * k, A.c[1] + (A.c2[1] - A.c[1]) * k, A.c[2] + (A.c2[2] - A.c[2]) * k]; };
    const soft = !A.hard && A.size >= 0.2;
    const boost = (G.clutch ? 1.3 : 1) * (B.awake ? 1.1 : 1); // 關鍵時刻 / 覺醒: the aura flares up (additive: keep the count modest)
    this.auraAcc = (this.auraAcc || 0) + dt * (A.rate || 30) * boost;
    let n = Math.floor(this.auraAcc); this.auraAcc -= n; n = Math.min(n, 10);
    if (B.awake) { // awakened: red battle flames on top of his own aura
      this.awakeAcc = (this.awakeAcc || 0) + dt * 22;
      while (this.awakeAcc >= 1) { this.awakeAcc -= 1; const a = rand() * TAU, r = rrange(0.3, 0.6) * sc; E({ x: o[0] + Math.cos(a) * r, y: o[1] + rrange(0, 0.25) * sc, z: o[2] + Math.sin(a) * r, vx: gauss() * 0.2, vy: rrange(1.4, 2.4) * Math.max(0.6, sc), vz: gauss() * 0.2, life: rrange(0.4, 0.7), size: rrange(0.18, 0.3) * Math.max(0.6, sc), r: 0.9, g: rrange(0.1, 0.25), b: 0.05, a: 0.45, soft: true, drag: 0.6 }); }
    }
    if (G.clutch) { this.clutchT = (this.clutchT || 0) - dt; if (this.clutchT <= 0) { this.clutchT = 0.9; for (let i = 0; i < 26; i++) { const a = i / 26 * TAU; E({ x: o[0] + Math.cos(a) * 0.4, y: o[1] + 0.06, z: o[2] + Math.sin(a) * 0.4, vx: Math.cos(a) * 2.4, vz: Math.sin(a) * 2.4, life: 0.55, size: 0.16, r: 1, g: 0.8, b: 0.35, a: 0.7, soft: true, drag: 2.2 }); } } }
    if (A.p === 'orbit') { // orbs circling the batter, leaving short trails
      for (let i = 0; i < A.n; i++) {
        const a = T * 2.4 + i / A.n * TAU, h = (0.55 + 0.35 * Math.sin(T * 1.7 + i * 2.1)) * sc;
        const r = 0.62 * sc, c = i % 2 ? A.c2 : A.c;
        const raven = A.ravens && i === 0;
        E({ x: o[0] + Math.cos(a) * r, y: o[1] + h + (raven ? 0.5 * sc : 0), z: o[2] + Math.sin(a) * r, life: 0.3, size: (raven ? 0.3 : A.size) * Math.max(0.6, sc), r: raven ? 0.08 : c[0], g: raven ? 0.07 : c[1], b: raven ? 0.12 : c[2], a: raven ? 1 : 0.9, soft: !raven });
      }
    }
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU, c = col();
      if (A.p === 'rise') { const r = rrange(0.15, 0.48) * sc; E({ x: o[0] + Math.cos(a) * r, y: o[1] + rrange(0.02, 0.35) * sc, z: o[2] + Math.sin(a) * r, vx: A.wobble ? gauss() * 0.3 : 0, vy: rrange(0.9, 1.9) * Math.max(0.6, sc), vz: 0, life: rrange(0.5, 0.95), size: A.size * rrange(0.6, 1.15) * Math.max(0.6, sc), r: c[0], g: c[1], b: c[2], a: soft ? 0.8 : 1, soft, drag: 0.6 }); }
      else if (A.p === 'swirl') { const r = rrange(0.5, 0.85) * sc, h = (A.low ? rrange(0.02, 0.5) : rrange(0.05, 1.35)) * sc; const tx = -Math.sin(a), tz = Math.cos(a), sp = rrange(2.2, 3.4); const wisp = !A.low; E({ x: o[0] + Math.cos(a) * r, y: o[1] + h, z: o[2] + Math.sin(a) * r, vx: tx * sp - Math.cos(a) * 0.4, vy: rrange(0.1, 0.6), vz: tz * sp - Math.sin(a) * 0.4, life: rrange(0.35, 0.7), size: A.size * rrange(0.7, 1.3) * (wisp ? 2 : 1), r: c[0], g: c[1], b: c[2], a: wisp ? 0.55 : 1, soft: wisp, drag: 0.8 }); }
      else if (A.p === 'fall') { const r = rrange(0, 0.45) * sc; E({ x: o[0] + Math.cos(a) * r, y: o[1] + rrange(1.3, 1.7) * sc, z: o[2] + Math.sin(a) * r, vy: -rrange(0.5, 0.9), life: rrange(0.9, 1.4), size: A.size * rrange(0.7, 1.3), r: c[0], g: c[1], b: c[2] }); }
      else if (A.p === 'rays') { const r = rrange(0.1, 0.35) * sc, bk = vscale(R.camFwd, 0.45 * sc); E({ x: o[0] + Math.cos(a) * r + bk[0], y: o[1] + rrange(0.45, 1.25) * sc, z: o[2] + Math.sin(a) * r + bk[2], vx: Math.cos(a) * 0.6, vy: rrange(0.2, 0.7), vz: Math.sin(a) * 0.6, life: rrange(0.5, 0.9), size: A.size * rrange(0.7, 1.2) * sc, r: c[0], g: c[1], b: c[2], a: 0.24, soft: true }); }
      else if (A.p === 'burst') { const r = rrange(0.2, 0.55) * sc; E({ x: o[0] + Math.cos(a) * r, y: o[1] + 0.05, z: o[2] + Math.sin(a) * r, vx: Math.cos(a) * rrange(0.5, 1.5), vy: rrange(1.5, 3), vz: Math.sin(a) * rrange(0.5, 1.5), life: rrange(0.5, 0.9), size: A.size * rrange(0.7, 1.4), r: c[0], g: c[1], b: c[2], grav: 8, drag: 0.5 }); }
    }
    if (A.ring) for (let i = 0; i < 2; i++) { const a = T * 3 + i * PI; E({ x: o[0] + Math.cos(a) * 0.55 * sc, y: o[1] + 0.75 * sc, z: o[2] + Math.sin(a) * 0.55 * sc, life: 0.4, size: 0.14, r: A.c[0], g: A.c[1], b: A.c[2], a: 0.9, soft: true }); }
    if (A.cloud && rand() < dt * 10) E({ x: o[0] + gauss() * 0.3, y: o[1] + 0.08, z: o[2] + gauss() * 0.3, vx: gauss() * 0.3, vy: 0.15, vz: gauss() * 0.3, life: rrange(0.8, 1.3), size: rrange(0.4, 0.7), r: 1, g: 1, b: 0.96, a: 0.55, soft: true, drag: 1 });
    if (A.stomp) { this.auraStomp = (this.auraStomp || 0) - dt; if (this.auraStomp <= 0) { this.auraStomp = rrange(1.1, 1.7); this.ring([o[0], o[1] + 0.06, o[2]], A.c2); for (let i = 0; i < 8; i++) { const a = rand() * TAU; E({ x: o[0] + Math.cos(a) * 0.3, y: o[1] + 0.05, z: o[2] + Math.sin(a) * 0.3, vx: Math.cos(a) * 1.4, vy: rrange(0.6, 1.4), vz: Math.sin(a) * 1.4, life: 0.5, size: 0.3, r: 0.8, g: 0.7, b: 0.58, a: 0.5, soft: true, drag: 2 }); } } }
    if (A.bolt && rand() < dt * A.bolt) { const a = rand() * TAU, r = rrange(0.3, 0.7) * sc; const top = [o[0] + Math.cos(a) * r, o[1] + rrange(1.4, 2.1) * sc, o[2] + Math.sin(a) * r]; this.bolt(top, [top[0] + gauss() * 0.2, o[1] + rrange(0.2, 0.8) * sc, top[2] + gauss() * 0.2], A.boltCol || [0.7, 0.85, 1], 0.12, 0.05); }
  },
  // 覺醒: a red burst of battle spirit around the batter
  awaken(pl) {
    const sc = pl.sprite.scale || 1;
    POST.flash = Math.max(POST.flash, 0.35); POST.flashCol = [1, 0.42, 0.28];
    this.shake = Math.max(this.shake, 0.5);
    for (let i = 0; i < 34; i++) { const a = rand() * TAU, r = rrange(0.45, 0.9) * sc; this.emit({ x: pl.pos[0] + Math.cos(a) * r, y: rrange(0.05, 0.3), z: pl.pos[2] + Math.sin(a) * r, vx: Math.cos(a) * 1.2, vy: rrange(2, 4), vz: Math.sin(a) * 1.2, life: rrange(0.5, 0.9), size: rrange(0.18, 0.32) * sc, r: 1, g: rrange(0.15, 0.35), b: 0.08, a: 0.6, soft: true, drag: 0.8 }); }
    this.ring([pl.pos[0], 0.1, pl.pos[2]], [1, 0.4, 0.2]);
    this.kick(pl.pos[0], pl.pos[2], 12, { ring: 2.6, sc });
    buzz([40, 30, 80]);
  },
  // special move cut-in: flash and sparks in the move's colour
  cutinFx(pl) {
    const col = SPECIAL_COLORS[pl.hero.active.id] || [1, 0.9, 0.5], sc = pl.sprite.scale || 1;
    POST.flash = Math.max(POST.flash, 0.35); POST.flashCol = col;
    this.shake = Math.max(this.shake, 0.35);
    const p = vadd(pl.pos, [0, 0.9 * sc, 0]);
    for (let i = 0; i < 44; i++) { const d = vnorm([gauss(), Math.abs(gauss()), gauss()]); this.emit({ x: p[0], y: p[1], z: p[2], vx: d[0] * 5, vy: d[1] * 5, vz: d[2] * 5, life: rrange(0.4, 0.8), size: 0.12, r: col[0], g: col[1], b: col[2], drag: 2 }); }
    buzz([30, 20, 60]);
  },
  // bat meets ball (user batting): time slows, aim + power before the hit is released
  aimStart(pos, q) {
    this.hitstop = Math.max(this.hitstop, 0.05);
    this.shake = Math.max(this.shake, 0.15);
    POST.flash = Math.max(POST.flash, 0.12); POST.flashCol = [1, 1, 0.95];
    for (let i = 0; i < 16; i++) { const d = vnorm([gauss(), gauss(), gauss()]); this.emit({ x: pos[0], y: pos[1], z: pos[2], vx: d[0] * 3, vy: d[1] * 3, vz: d[2] * 3, life: rrange(0.2, 0.4), size: 0.05, r: 1, g: 0.95, b: 0.8, drag: 3 }); }
    const s = worldToScreen(pos);
    if (s[2] > 0) this.shockDom(s[0], s[1], 't1');
    buzz(14);
  },
  // catcher's mitt: 0 ball, 1 strike, 2 strikeout
  mittPop(pos, kmh, level, userPitching, userBatting) {
    const k = clamp((kmh - 100) / 80, 0, 1);
    for (let i = 0; i < [6, 12, 24][level]; i++) { const d = vnorm([gauss(), Math.abs(gauss()) + 0.2, gauss()]); const sp = (2.5 + k * 2 + level) * rrange(0.4, 1); this.emit({ x: pos[0], y: pos[1], z: pos[2], vx: d[0] * sp, vy: d[1] * sp, vz: d[2] * sp, life: rrange(0.3, 0.6), size: 0.05, r: 1, g: 0.95, b: 0.85, grav: 8, drag: 1.5 }); }
    for (let i = 0; i < [3, 6, 10][level]; i++) this.emit({ x: pos[0] + gauss() * 0.12, y: pos[1] + gauss() * 0.08, z: pos[2] + gauss() * 0.12, vx: gauss() * 1.0, vy: rrange(0.3, 1.0), vz: gauss() * 1.0, life: rrange(0.45, 0.8), size: 0.26, r: 0.85, g: 0.8, b: 0.7, a: 0.35, soft: true, drag: 2 });
    const s = worldToScreen(pos);
    if (level >= 1) {
      this.shake = Math.max(this.shake, level === 2 ? 0.45 : 0.08 + k * 0.1);
      this.punch = Math.max(this.punch, level === 2 ? 0.7 : 0.18 + k * 0.15);
      if (s[2] > 0 && !userBatting) {
        this.sfxWord(s[0], s[1], level === 2 ? '砰！！' : '砰！', level === 2 ? 'm2' : 'm1', 70, 40);
        if (level === 2 || kmh >= 150) this.shockDom(s[0], s[1], level === 2 ? 't2' : 't1');
      }
      if (level === 2) {
        this.hitstop = Math.max(this.hitstop, 0.13);
        POST.flash = Math.max(POST.flash, 0.28); POST.flashCol = userBatting ? [1, 0.55, 0.45] : [1, 0.95, 0.75];
        if (s[2] > 0 && !userBatting) this.lines = { x: s[0], y: s[1], t: 0, life: 0.42, tier: 2, rot: rand() * TAU, gold: false };
      }
      if (userPitching) buzz(level === 2 ? [40, 30, 70] : 16 + Math.round(k * 14));
    } else if (userPitching) buzz(8);
  },
  // the ball has left the yard
  homeRun(b) {
    if (b.hrShown) return; b.hrShown = true;
    const grand = FLD.runners.filter(r => r.state !== 'out' && r.state !== 'scored').length >= 4;
    const dist = Math.round(hrDistance(b, FLD.envMul)), kmh = G && G.contact ? Math.round(G.contact.kmh) : 0;
    b.hrDist = dist;
    UI.hrBanner(grand ? '滿貫全壘打' : '全壘打', `飛行距離 ${dist} 公尺　擊球初速 ${kmh} km/h`);
    POST.flash = Math.max(POST.flash, 0.5); POST.flashCol = [1, 0.88, 0.55];
    this.shake = Math.max(this.shake, 0.6);
    const p = b.pos;
    for (let i = 0; i < 140; i++) {
      const c = [[1, 0.85, 0.3], [1, 0.4, 0.45], [0.45, 0.75, 1], [0.6, 1, 0.6], [1, 1, 1]][i % 5];
      this.emit({ x: p[0] + gauss() * 14, y: rrange(8, 26), z: p[2] + gauss() * 10 - 6, vx: gauss() * 2, vy: rrange(-1, 3), vz: gauss() * 2, life: rrange(1.6, 3), size: 0.9, r: c[0], g: c[1], b: c[2], grav: 2.2, drag: 1.4 });
    }
    SFX.homer(); SFX.hrRoar(); MUSIC.duck(2.6); this.fireworks(vcopy(b.pos)); this.hrAt = vcopy(b.pos);
    buzz([90, 50, 90, 50, 160]);
    if (G && G.ump) G.ump.setAnim('umpHR');
  },
  sfxWord(x, y, txt, cls, dx = 0, dy = 0) {
    if (!this.layer) return;
    const el = document.createElement('div');
    el.className = 'sfxw ' + cls; el.textContent = txt;
    const fs = { t0: 26, t1: 38, t2: 54, t3: 72, m1: 30, m2: 46 }[cls] || 40;
    const w = txt.length * fs * 0.95;
    x = clamp(x + dx, w / 2 + 10, innerWidth - w / 2 - 10);
    y = clamp(y + dy, fs * 1.4 + 60, innerHeight - 40);
    el.style.left = x.toFixed(1) + 'px'; el.style.top = y.toFixed(1) + 'px';
    el.style.setProperty('--rot', rrange(-14, 6).toFixed(1) + 'deg');
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  },
  shockDom(x, y, cls) {
    if (!this.layer) return;
    const el = document.createElement('div');
    el.className = 'shock ' + cls;
    el.style.left = x.toFixed(1) + 'px'; el.style.top = y.toFixed(1) + 'px';
    this.layer.appendChild(el);
    setTimeout(() => el.remove(), 800);
  },
  // manga-style speed lines + impact star on a 2D overlay (real time)
  drawLines(dt) {
    const cv = this.impCv, g = this.impCtx; if (!cv || !g) return;
    const L = this.lines;
    if (!L) { if (this.impDirty) { g.clearRect(0, 0, cv.width, cv.height); this.impDirty = false; } return; }
    L.t += dt;
    const k = L.t / L.life;
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    g.clearRect(0, 0, W, H);
    if (k >= 1) { this.lines = null; this.impDirty = false; return; }
    const x = L.x * dpr, y = L.y * dpr, Rr = Math.hypot(W, H);
    const n = [26, 40, 60, 84][L.tier];
    const r0 = (50 + 260 * easeOut(k)) * dpr;
    g.globalAlpha = (1 - k) * (L.tier >= 2 ? 0.92 : 0.7);
    g.fillStyle = L.gold ? '#ffe7a6' : '#ffffff';
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a = (i + Math.random() * 0.8) / n * TAU;
      const w = (0.003 + Math.random() * 0.011) * (1 + L.tier * 0.35);
      const rs = r0 * (0.75 + Math.random() * 0.7);
      g.moveTo(x + Math.cos(a) * rs, y + Math.sin(a) * rs);
      g.lineTo(x + Math.cos(a - w) * Rr, y + Math.sin(a - w) * Rr);
      g.lineTo(x + Math.cos(a + w) * Rr, y + Math.sin(a + w) * Rr);
      g.closePath();
    }
    g.fill();
    if (k < 0.4) { // central star
      const sk = 1 - k / 0.4;
      const rr = [44, 72, 110, 170][L.tier] * dpr * (0.55 + 0.45 * sk);
      g.globalAlpha = sk;
      g.fillStyle = L.gold ? '#fff0b8' : '#ffffff';
      g.beginPath();
      const sp = 12;
      for (let i = 0; i <= sp * 2; i++) {
        const a = i / (sp * 2) * TAU + L.rot, r = i % 2 ? rr * 0.26 : rr * (0.75 + ((i * 37) % 11) / 22);
        if (i) g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); else g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.fill();
    }
    g.globalAlpha = 1;
    this.impDirty = true;
  },
  emit(o) {
    const p = Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, size: 0.1, r: 1, g: 1, b: 1, a: 1, grav: 0, drag: 0, soft: false, fade: true }, o);
    p.max = p.life;
    (p.dust ? this.dust : p.soft ? this.soft : this.parts).push(p);
    return p;
  },
  // ---------- dust kicked up off the ground (alpha-blended, not glowing) ----------
  // o: { vx, vz: mover velocity, sc: body scale, heavy: slide/dive, ring: radial speed (landing), skid: forward spray }
  kick(x, z, n, o = {}) {
    if (this.dust.length > 700) return;
    const dirt = groundDirt(x, z), sc = Math.max(0.7, o.sc || 1);
    const v = Math.hypot(o.vx || 0, o.vz || 0) || 1, ux = (o.vx || 0) / v, uz = (o.vz || 0) / v;
    const wet = W8.rain > 0;
    for (let i = 0; i < n; i++) {
      if (!dirt && rand() < 0.45) continue; // turf throws up less dust
      let vx = gauss() * 0.35, vz = gauss() * 0.35, vy = rrange(0.3, 0.8);
      if (o.ring) { const a = rand() * TAU; vx = Math.cos(a) * o.ring * rrange(0.6, 1.1); vz = Math.sin(a) * o.ring * rrange(0.6, 1.1); vy = rrange(0.2, 0.6); }
      else if (o.skid) { vx += ux * rrange(1.5, 3.2) + uz * gauss() * 0.9; vz += uz * rrange(1.5, 3.2) - ux * gauss() * 0.9; vy = rrange(0.4, 1.1); }
      else { vx -= (o.vx || 0) * 0.07; vz -= (o.vz || 0) * 0.07; }
      const tone = rrange(-0.04, 0.04);
      const c = dirt ? (wet ? [0.55 + tone, 0.42 + tone, 0.3] : [0.97 + tone, 0.86 + tone, 0.68 + tone]) : [0.86 + tone, 0.9 + tone, 0.72];
      const heavy = o.heavy || o.skid || o.ring;
      this.emit({
        x: x - ux * 0.2 + gauss() * 0.12, y: rrange(0.12, 0.3), z: z - uz * 0.2 + gauss() * 0.12, vx, vy: wet ? vy * 0.5 : vy, vz,
        life: heavy ? rrange(0.9, 1.5) : rrange(0.55, 0.95), size: (heavy ? rrange(0.8, 1.3) : rrange(0.5, 0.8)) * sc, grow: heavy ? 1.4 : 0.9,
        r: c[0], g: c[1], b: c[2], a: (dirt ? (wet ? 0.35 : 0.66) : 0.32) * (heavy ? 1.1 : 1), drag: 2.4, soft: true, dust: true, fa: true,
      });
    }
  },
  // everybody on the field leaves a trail of dust when running; skids, slides, dives and landings throw up clouds
  dustUpdate(dt) {
    if (!G) return;
    const sdt = dt * (G.timeScale || 1) * (G.slowmo || 1);
    const live = G.phase === 'play' || G.phase === 'result';
    for (const T of G.teams) for (const id in T.players) {
      const p = T.players[id];
      if (!live || !p.sprite.visible || p.ko) { p._dp = null; continue; }
      const x = p.pos[0], z = p.pos[2];
      if (!p._dp || sdt <= 1e-5) { if (!p._dp) { p._dp = [x, z]; p._dv = 0; } continue; }
      const vx = (x - p._dp[0]) / sdt, vz = (z - p._dp[1]) / sdt; p._dp[0] = x; p._dp[1] = z;
      const v = Math.hypot(vx, vz);
      if (v > 30) { p._dv = 0; continue; } // placed, not running
      const air = p.lift > 0.08, pv = p._dv || 0, sc = p.sprite.scale || 1, k = p.anim.k;
      p._dv = v;
      if (p._dair && !air) this.kick(x, z, 9, { ring: 1.7, sc }); // landing
      p._dair = air;
      if (air) continue;
      const heavy = (k === 'slide' || k === 'dive') && v > 1;
      if (heavy) p._da = (p._da || 0) + sdt * 38;
      else if (v > 2.4) p._da = (p._da || 0) + sdt * (v - 1.6) * 1.7;
      if (pv > 5.5 && v < 1.4) this.kick(x, z, 7, { skid: 1, vx: p._svx || 0, vz: p._svz || 0, sc }); // digging in to stop
      if (v > 1) { p._svx = vx; p._svz = vz; }
      let n = 0; while (p._da >= 1 && n < 4) { p._da -= 1; n++; this.kick(x, z, 1, { vx, vz, sc, heavy }); }
      if (n >= 4) p._da = 0;
    }
  },
  burst(pos, col, n = 20, speed = 5, size = 0.09) {
    for (let i = 0; i < n; i++) {
      const d = vnorm([gauss(), Math.abs(gauss()) + 0.3, gauss()]);
      this.emit({ x: pos[0], y: pos[1], z: pos[2], vx: d[0] * speed * rrange(0.3, 1), vy: d[1] * speed * rrange(0.3, 1), vz: d[2] * speed * rrange(0.3, 1), life: rrange(0.4, 0.9), size, r: col[0], g: col[1], b: col[2], grav: 9, drag: 1.5 });
    }
    this.emit({ x: pos[0], y: pos[1], z: pos[2], life: 0.25, size: 1.6, r: col[0], g: col[1], b: col[2], a: 0.9, soft: true });
  },
  ring(pos, col) { for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; this.emit({ x: pos[0], y: pos[1], z: pos[2], vx: Math.cos(a) * 4, vz: Math.sin(a) * 4, life: 0.5, size: 0.12, r: col[0], g: col[1], b: col[2], drag: 2 }); } },
  text3d(pos, txt, col, big) {
    if (!this.layer) return;
    const el = document.createElement('div');
    el.className = 'ftext' + (big ? ' big' : '');
    el.textContent = txt; el.style.color = col || '#fff';
    this.layer.appendChild(el);
    this.texts.push({ el, pos: vcopy(pos), t: 0, life: 1.3, rise: 1.2 });
    if (this.texts.length > 14) { const o = this.texts.shift(); o.el.remove(); }
  },
  dmgNum(pos, amt) { this.text3d(pos, '-' + amt, amt >= 30 ? '#ff4040' : '#ffb060', amt >= 30); },
  fireworks(at) {
    for (let k = 0; k < 8; k++) {
      setTimeout(() => {
        const c = [[1, 0.8, 0.3], [0.5, 0.8, 1], [1, 0.4, 0.5], [0.6, 1, 0.6]][k % 4];
        const pos = at ? [at[0] * 0.8 + rrange(-30, 30), rrange(26, 46), at[2] * 0.9 + rrange(-20, 10)] : [rrange(-40, 40), rrange(35, 55), rrange(-140, -100)];
        for (let i = 0; i < 70; i++) { const d = vnorm([gauss(), gauss(), gauss()]); this.emit({ x: pos[0], y: pos[1], z: pos[2], vx: d[0] * 16, vy: d[1] * 16, vz: d[2] * 16, life: rrange(0.9, 1.6), size: 2.2, r: c[0], g: c[1], b: c[2], grav: 4, drag: 1.2, soft: true }); }
        this.emit({ x: pos[0], y: pos[1], z: pos[2], life: 0.35, size: 14, r: c[0], g: c[1], b: c[2], a: 0.8, soft: true });
        SFX.boom();
      }, k * 260);
    }
  },
  koFx(pl) {
    const p = vadd(pl.pos, [0, 1, 0]);
    this.burst(p, [1, 0.3, 0.2], 40, 7, 0.12);
    POST.flash = 0.35; POST.flashCol = [1, 0.95, 0.9]; this.shake = 0.5; this.hitstop = 0.15;
    for (let i = 0; i < 5; i++) this.emit({ x: p[0], y: p[1] + 1, z: p[2], vx: Math.cos(i * 1.3) * 1.2, vy: 1.5, vz: Math.sin(i * 1.3) * 1.2, life: 1.8, size: 0.16, r: 1, g: 0.95, b: 0.3, drag: 0.5 });
  },
  onPitchRelease(p, P0) {
    this.trail = []; this.batTrail = null;
    if (p.special === 'sunArrow') { this.shake = 0.25; POST.flash = 0.15; POST.flashCol = [1, 0.7, 0.3]; }
    if (p.special === 'thunderZig') { POST.flash = 0.25; POST.flashCol = [0.7, 0.8, 1]; SFX.thunder(); }
    if (p.special === 'gustBag') SFX.wind();
  },
  onContact(pos, q, ev) {
    this.hitstop = q > 0.75 ? 0.07 : 0.03;
    this.shake = Math.max(this.shake, q * 0.25);
    const c = q > 0.75 ? [1, 0.95, 0.6] : [1, 1, 1];
    this.burst(pos, c, Math.round(8 + q * 20), 4 + q * 4, 0.07);
    if (q > 0.85) { POST.flash = 0.2; POST.flashCol = [1, 1, 0.9]; }
    this.trail = [];
  },
  onSpecialHit(id, b) {
    this.hitstop = 0.18; this.shake = 0.6; POST.flash = 0.45;
    POST.flashCol = { iaiSplit: [0.8, 0.9, 1], chainLightning: [0.6, 0.8, 1], sunBlind: [1, 0.95, 0.6], rakeGrounder: [1, 0.6, 0.3], fireWheels: [1, 0.5, 0.2] }[id] || [1, 1, 1];
    this.burst(b.pos, POST.flashCol, 40, 9, 0.12);
    if (id === 'iaiSplit') SFX.slash();
    if (id === 'chainLightning') SFX.thunder();
    if (id === 'giantMallet') SFX.boom();
  },
  fireTrail(p) { if (rand() < 0.6) this.emit({ x: p[0] + gauss() * 0.2, y: 0.1, z: p[2] + gauss() * 0.2, vy: 1.5, life: 0.6, size: 0.35, r: 1, g: 0.45, b: 0.1, a: 0.9, soft: true }); },
  aura(pl, id) {
    const col = SPECIAL_COLORS[id] || [1, 0.9, 0.5];
    pl.aura = { col, t: 0 };
    const p = vadd(pl.pos, [0, 1, 0]);
    for (let i = 0; i < 30; i++) this.emit({ x: p[0] + gauss() * 0.4, y: p[1] + gauss() * 0.5, z: p[2] + gauss() * 0.4, vy: rrange(1, 3), life: rrange(0.6, 1.2), size: 0.1, r: col[0], g: col[1], b: col[2] });
  },
  hearts(P) { if (!P) return; for (let i = 0; i < 14; i++) this.emit({ x: P.pos[0] + gauss() * 0.4, y: 1.6 + rand(), z: P.pos[2] + gauss() * 0.4, vy: 1.2, life: 1.5, size: 0.14, r: 1, g: 0.45, b: 0.7 }); },
  smoke(P) { if (!P) return; for (let i = 0; i < 40; i++) this.emit({ x: P.pos[0] + gauss() * 0.5, y: 0.5 + rand() * 1.5, z: P.pos[2] + gauss() * 0.5, vx: gauss() * 0.5, vy: rrange(0.5, 1.5), vz: gauss() * 0.5, life: rrange(1, 2.2), size: 0.9, r: 0.95, g: 0.95, b: 0.95, a: 0.5, soft: true, drag: 0.8 }); },
  clock() { this.clockT = 2.5; SFX.tick(); },
  rewind() { this.rewindT = 1.2; },
  stone(f) { f.sprite.tint = [0.6, 0.6, 0.62, 1]; this.burst(vadd(f.pos, [0, 1, 0]), [0.7, 0.7, 0.7], 14, 3); },
  lightningStrike(pos) { this.bolt([pos[0], 30, pos[2]], vadd(pos, [0, 0.8, 0]), [0.7, 0.85, 1], 0.4, 1.2); POST.flash = 0.5; POST.flashCol = [0.8, 0.9, 1]; SFX.thunder(); this.shake = 0.5; },
  zap(a, b) { this.bolt(a, b, [0.6, 0.8, 1], 0.3, 0.5); SFX.zap(); },
  bolt(a, b, col, life, width = 0.3) {
    const pts = [a]; const n = 9;
    for (let i = 1; i < n; i++) { const t = i / n; const p = vlerp(a, b, t); const off = vdist(a, b) * 0.07; pts.push([p[0] + gauss() * off, p[1] + gauss() * off, p[2] + gauss() * off]); }
    pts.push(b);
    this.bolts.push({ pts, col, life, max: life, width });
  },
  sandField() { this.sand = 14; },
  // weather: fade the lighting in/out, rain drops, wind streaks, fog wisps, lightning
  weatherFx(dt) {
    if (!R.envBase) { R.envBase = JSON.parse(JSON.stringify(R.env)); POST.baseGain = POST.gain.slice(); POST.baseSat = POST.sat; }
    if (W8.kind) W8.lookKind = W8.kind;
    W8.mix += ((W8.kind ? 1 : 0) - W8.mix) * Math.min(1, dt * 1.1);
    const L = W8.lookKind && WEATHER[W8.lookKind].look, m = L ? W8.mix : 0, E = R.envBase;
    R.env.fog = L ? [lerp(E.fog[0], L.fog[0], m), lerp(E.fog[1], L.fog[1], m)] : E.fog;
    R.env.fogCol = L ? E.fogCol.map((v, i) => lerp(v, L.fogCol[i], m)) : E.fogCol;
    POST.gain = L ? POST.baseGain.map((v, i) => v * lerp(1, L.gain[i], m)) : POST.baseGain;
    POST.sat = L ? POST.baseSat * lerp(1, L.sat, m) : POST.baseSat;
    if (!G || !R.camPos) return;
    const fl = Math.hypot(R.camFwd[0], R.camFwd[2]) || 1;
    const C = vadd(R.camPos, [R.camFwd[0] / fl * 8, 0, R.camFwd[2] / fl * 8]); // weather box sits just in front of the camera
    // rain drops (drawn as streaks in draw())
    const wantRain = W8.rain && W8.mix > 0.05;
    if (wantRain && !W8.drops) W8.drops = Array.from({ length: 320 }, () => ({ x: C[0] + rrange(-11, 11), y: R.camPos[1] + rrange(-8, 6), z: C[2] + rrange(-11, 11), v: rrange(15, 19) }));
    if (!wantRain) W8.drops = null;
    if (W8.drops) for (const d of W8.drops) {
      d.y -= d.v * dt;
      if (d.y < 0) { if (rand() < 0.3) this.emit({ x: d.x, y: 0.05, z: d.z, vy: 0.6, life: 0.25, size: 0.2, r: 0.8, g: 0.85, b: 1, a: 0.55, soft: true, dust: true, fa: true, grow: 0.9 }); d.y = R.camPos[1] + rrange(2, 7); d.x = C[0] + rrange(-11, 11); d.z = C[2] + rrange(-11, 11); }
      if (Math.abs(d.x - C[0]) > 12) d.x = C[0] + rrange(-11, 11);
      if (Math.abs(d.z - C[2]) > 12) d.z = C[2] + rrange(-11, 11);
    }
    // wind streaks
    const wantWind = W8.kind === 'wind';
    if (wantWind && !W8.streaks) W8.streaks = Array.from({ length: 36 }, () => ({ x: C[0] + rrange(-14, 14), y: rrange(0.4, 7), z: C[2] + rrange(-14, 14), t: rand() * 2, len: rrange(2.5, 5) }));
    if (!wantWind) W8.streaks = null;
    if (W8.streaks) { const wl = Math.hypot(W8.wind[0], W8.wind[1]) || 1, sp = 12; for (const s of W8.streaks) { s.t += dt; s.x += W8.wind[0] / wl * sp * dt; s.z += W8.wind[1] / wl * sp * dt; if (s.t > 2 || Math.abs(s.x - C[0]) > 16 || Math.abs(s.z - C[2]) > 16) { s.t = 0; s.x = C[0] - W8.wind[0] / wl * 9 + rrange(-9, 9); s.z = C[2] - W8.wind[1] / wl * 9 + rrange(-9, 9); s.y = rrange(0.4, 7); } }
      if (rand() < dt * 14) { const a = rand() * TAU; this.emit({ x: C[0] + rrange(-12, 12), y: rrange(0.3, 4), z: C[2] + rrange(-12, 12), vx: W8.wind[0] / wl * rrange(7, 11), vy: rrange(-0.3, 0.6), vz: W8.wind[1] / wl * rrange(7, 11), life: rrange(1.2, 2), size: rrange(0.07, 0.12), r: 0.55 + rand() * 0.3, g: 0.6, b: 0.3, a: 0.9 }); } } // leaves
    // fog wisps drifting over the grass
    if (W8.fog && W8.mix > 0.3 && rand() < dt * 3) this.emit({ x: C[0] + rrange(-25, 25), y: rrange(0.5, 3), z: C[2] + rrange(-30, 10), vx: rrange(0.3, 0.9), vy: 0, vz: rrange(-0.2, 0.2), life: rrange(4, 7), size: rrange(7, 12), r: 0.9, g: 0.88, b: 0.94, a: 0.1, soft: true, dust: true, fa: true });
    // thunderstorm: lightning in the distance, now and then a strike on the field
    if (W8.storm && W8.mix > 0.5) {
      W8.boltT -= dt;
      if (W8.boltT <= 0) {
        W8.boltT = rrange(5, 11);
        const live = G.phase === 'play' && FLD.playT > 0.5 && W8.strikes < 1 && rand() < 0.4;
        const tgt = live ? fielderList().filter(f => ableFielder(f) && !f.hasBall && f.fpos !== 'P' && f.fpos !== 'C')[0 | rand() * 7] : null;
        if (tgt) { // a fielder gets hit
          W8.strikes++;
          this.lightningStrike(tgt.pos); damage(tgt, 8, 'zap', tgt.pos); tgt.stun = Math.max(tgt.stun, 1.5);
          this.text3d(vadd(tgt.pos, [0, 2.4, 0]), '落雷！', '#d8c8ff', true); this.kick(tgt.pos[0], tgt.pos[2], 10, { ring: 2.5 });
          UI.say(`落雷！${tgt.hero.name}被雷打中，麻痺了！`, 2);
        } else {
          const a = rrange(-1.2, 1.2), r = rrange(150, 240), top = [Math.sin(a) * r, 90, -Math.cos(a) * r];
          this.bolt(top, [top[0] + gauss() * 10, 22, top[2] + gauss() * 10], [0.85, 0.85, 1], 0.35, 2.2);
          POST.flash = Math.max(POST.flash, 0.28); POST.flashCol = [0.82, 0.85, 1];
          setTimeout(() => SFX.thunder(), 300 + rand() * 900);
        }
      }
    }
  },
  weatherDraw(pushTri, line3) {
    if (W8.drops) {
      const a = 0.42 * W8.mix, col = [0.8, 0.86, 1, a], sl = [0.22, 0, 0.08];
      for (const d of W8.drops) line3([d.x, d.y, d.z], [d.x + sl[0], d.y + 0.95, d.z + sl[2]], 0.02, col);
    }
    if (W8.streaks) {
      const wl = Math.hypot(W8.wind[0], W8.wind[1]) || 1, ux = W8.wind[0] / wl, uz = W8.wind[1] / wl;
      for (const s of W8.streaks) { const k = Math.sin(clamp(s.t / 2, 0, 1) * PI); const col = [1, 1, 1, 0.3 * k]; line3([s.x, s.y, s.z], [s.x + ux * s.len, s.y, s.z + uz * s.len], 0.04, col); }
    }
  },
  update(dt) {
    const step = arr => {
      for (let i = arr.length - 1; i >= 0; i--) {
        const p = arr[i];
        p.life -= dt;
        if (p.life <= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); continue; }
        p.vy -= p.grav * dt;
        const d = Math.max(0, 1 - p.drag * dt);
        p.vx *= d; p.vy *= d; p.vz *= d;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.grow) p.size += p.grow * dt;
        if (p.y < 0.02 && p.grav) { p.y = 0.02; p.vy *= -0.3; }
      }
    };
    step(this.parts); step(this.soft); step(this.dust);
    this.batterAura(dt);
    this.dustUpdate(dt);
    this.weatherFx(dt);
    for (let i = this.bolts.length - 1; i >= 0; i--) { this.bolts[i].life -= dt; if (this.bolts[i].life <= 0) this.bolts.splice(i, 1); }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.punch > 0) this.punch = Math.max(0, this.punch - dt * 3.2);
    if (POST.flash > 0) POST.flash = Math.max(0, POST.flash - dt * 2.2);
    if (this.sand > 0) this.sand -= dt;
    if (this.clockT > 0) this.clockT -= dt;
    if (this.rewindT > 0) this.rewindT -= dt;
    // texts
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.t += dt;
      if (t.t > t.life) { t.el.remove(); this.texts.splice(i, 1); continue; }
      const s = worldToScreen([t.pos[0], t.pos[1] + t.rise * easeOut(t.t / t.life), t.pos[2]]);
      if (s[2] <= 0) { t.el.style.opacity = 0; continue; }
      t.el.style.transform = `translate(${s[0].toFixed(1)}px, ${s[1].toFixed(1)}px) translate(-50%,-50%) scale(${(1 + Math.max(0, 0.25 - t.t) * 2).toFixed(2)})`;
      t.el.style.opacity = (1 - Math.max(0, (t.t - t.life * 0.6) / (t.life * 0.4))).toFixed(2);
    }
    // ball trail
    const b = FLD.ball;
    const clonePitch = G && G.phase === 'flight' && G.pitch && G.pitch.clones && !G.pitch.trueSight;
    const moving = (b.state === 'pitch' || b.state === 'fly' || b.state === 'loose' || b.state === 'throw') && b.visible !== false && !clonePitch; // a trail would give the real ball away
    const bp = b.pos;
    const BT = b.state === 'fly' && this.batTrail;
    if (moving && bp) { this.trail.push(vcopy(bp)); if (this.trail.length > (BT ? BT.len : 18)) this.trail.shift(); }
    if (G && G.phase === 'aim' && G.aim) { const pw = G.aim.power; for (let i = 0; i < 2; i++) this.emit({ x: b.pos[0] + gauss() * 0.08, y: b.pos[1] + gauss() * 0.08, z: b.pos[2] + gauss() * 0.08, vx: gauss() * 0.5, vy: gauss() * 0.5 + 0.3, vz: gauss() * 0.5, life: 0.25, size: 0.15 + pw * 0.35, r: 1, g: 0.9 - pw * 0.3, b: 0.5 - pw * 0.3, soft: true }); }
    if (BT && b.visible !== false) for (let i = 0; i < BT.sparkle; i++) this.emit({ x: bp[0] + gauss() * 0.15, y: bp[1] + gauss() * 0.15, z: bp[2] + gauss() * 0.15, vx: gauss() * 0.6, vy: gauss() * 0.6, vz: gauss() * 0.6, life: rrange(0.3, 0.6), size: 0.35, r: BT.col[0], g: BT.col[1], b: BT.col[2], soft: true, drag: 1 });
    else if (this.trail.length) this.trail.shift();
    // special pitch particles
    if (G && G.phase === 'flight' && G.pitch && G.pitch.special) {
      const sp = G.pitch.special, p = b.pos;
      const c = SPECIAL_COLORS[sp] || [1, 1, 1];
      if (G.pitch.clones) { // the same faint smoke on every ball of the pack
        for (const k of G.pitch.clones) if (!k.popped && G.pitch.t / k.T > 1.02) { k.popped = true; const q = clonePos(G.pitch, k, k.T); this.burst(q, [0.55, 0.85, 0.5], 10, 2.5, 0.06); }
        const all = [p].concat(G.pitch.clones.filter(k => G.pitch.t / k.T <= 1.02).map(k => clonePos(G.pitch, k, G.pitch.t)));
        for (const q of all) this.emit({ x: q[0] + gauss() * 0.05, y: q[1] + gauss() * 0.05, z: q[2] + gauss() * 0.05, vx: gauss() * 0.3, vy: 0.3, vz: gauss() * 0.3, life: 0.3, size: 0.22, r: c[0], g: c[1], b: c[2], a: 0.6, soft: true });
      } else for (let i = 0; i < 3; i++) this.emit({ x: p[0] + gauss() * 0.06, y: p[1] + gauss() * 0.06, z: p[2] + gauss() * 0.06, vx: gauss() * 0.4, vy: gauss() * 0.4 + 0.3, vz: gauss() * 0.4, life: 0.35, size: sp === 'sunArrow' ? 0.5 : 0.3, r: c[0], g: c[1], b: c[2], soft: true });
      if (sp === 'thunderZig' && rand() < 0.3) this.bolt(vadd(p, [gauss() * 0.4, 0.4, 0]), vadd(p, [gauss() * 0.4, -0.4, 0]), [0.7, 0.85, 1], 0.08, 0.06);
    }
    if (b.hot && (b.state === 'fly' || b.state === 'loose')) this.emit({ x: b.pos[0], y: b.pos[1], z: b.pos[2], vy: 1, life: 0.4, size: 0.5, r: 1, g: 0.5, b: 0.15, soft: true });
    if (b.glow && (b.state === 'fly' || b.state === 'loose')) this.emit({ x: b.pos[0], y: b.pos[1], z: b.pos[2], life: 0.2, size: 1.2, r: b.glow[0], g: b.glow[1], b: b.glow[2], soft: true });
    if (b.tornado && b.state === 'fly') for (let i = 0; i < 2; i++) { const a = rand() * TAU; this.emit({ x: b.pos[0] + Math.cos(a) * 0.8, y: b.pos[1] + gauss() * 0.4, z: b.pos[2] + Math.sin(a) * 0.8, vx: -Math.sin(a) * 3, vz: Math.cos(a) * 3, life: 0.4, size: 0.1, r: 0.85, g: 1, b: 0.9 }); }
    if (this.sand > 0 && rand() < 0.5) this.emit({ x: rrange(-40, 40), y: 0.2, z: rrange(-90, 0), vx: rrange(-1, 1), vy: 0.3, life: 1.5, size: 1.4, r: 0.85, g: 0.7, b: 0.45, a: 0.35, soft: true });
    // auras on players
    if (G) for (const T of G.teams) for (const id in T.players) { const pl = T.players[id]; if (pl.aura) { pl.aura.t += dt; if (pl.aura.t > 3) pl.aura = null; else if (pl.sprite.visible && rand() < 0.7) { const c = pl.aura.col; this.emit({ x: pl.pos[0] + gauss() * 0.3, y: 0.2 + rand() * 1.4, z: pl.pos[2] + gauss() * 0.3, vy: 2, life: 0.5, size: 0.08, r: c[0], g: c[1], b: c[2] }); } } }
  },
  draw() {
    // trail ribbon
    const verts = FX._rv || (FX._rv = new Float32Array(RIB.max * 7));
    let n = 0;
    const pushTri = (a, b, c, ca, cb, cc) => { for (const [p, col] of [[a, ca], [b, cb], [c, cc]]) { if (n >= RIB.max) return; const o = n * 7; verts[o] = p[0]; verts[o + 1] = p[1]; verts[o + 2] = p[2]; verts[o + 3] = col[0]; verts[o + 4] = col[1]; verts[o + 5] = col[2]; verts[o + 6] = col[3]; n++; } };
    const strip = (pts, w0, col) => {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const d = vnorm(vsub(b, a));
        const toCam = vnorm(vsub(R.camPos, b));
        const side = vnorm(vcross(d, toCam));
        const wa = w0 * (i - 1) / pts.length, wb = w0 * i / pts.length;
        const ca = [col[0], col[1], col[2], col[3] * (i - 1) / pts.length], cb = [col[0], col[1], col[2], col[3] * i / pts.length];
        const a1 = vmad(a, side, wa), a2 = vmad(a, side, -wa), b1 = vmad(b, side, wb), b2 = vmad(b, side, -wb);
        pushTri(a1, a2, b1, ca, ca, cb); pushTri(a2, b2, b1, ca, cb, cb);
      }
    };
    if (this.trail.length > 2) {
      const sp = G && G.pitch && G.phase === 'flight' ? G.pitch.special : null;
      const BT = FLD.ball.state === 'fly' && this.batTrail;
      const col = sp ? (SPECIAL_COLORS[sp] || [1, 1, 1]).concat([0.9]) : BT ? BT.col : [1, 1, 1, 0.55];
      strip(this.trail, sp ? 0.12 : BT ? BT.w : 0.05, col);
    }
    const line3 = (a, b, w, col) => { const d = vnorm(vsub(b, a)); const toCam = vnorm(vsub(R.camPos, a)); const side = vscale(vnorm(vcross(d, toCam)), w); pushTri(vadd(a, side), vsub(a, side), vadd(b, side), col, col, col); pushTri(vsub(a, side), vsub(b, side), vadd(b, side), col, col, col); };
    if (this.zoneFrame) {
      const sc = this.zoneFrame, zc = (ZONE.bot + ZONE.top) / 2, hh = (ZONE.top - ZONE.bot) / 2 * sc, hw = ZONE.x * (sc < 1 ? 0.75 : 1);
      const C = [[-hw, zc - hh], [hw, zc - hh], [hw, zc + hh], [-hw, zc + hh]].map(q => [q[0], q[1], 0.0]);
      const col = [1, 1, 1, 0.32];
      for (let i = 0; i < 4; i++) line3(C[i], C[(i + 1) % 4], 0.012, col);
    }
    // batting: the meet cursor locks onto the incoming ball and slides to where it crosses the plate
    if (G && G.isUserOffense() && G.phase === 'flight' && G.pitch && MAIN.viewMode() === 'bat') {
      const p = G.pitch, cross = pitchPosIn(p, 1), zc = (ZONE.bot + ZONE.top) / 2;
      const k = smooth(clamp(p.t / p.T, 0, 1)), near = clamp(1 - (p.T - p.t) / 0.25, 0, 1), z = -0.02;
      // targets: the ball, or every ball of the clone pack
      const pack = p.clones && !p.trueSight ? [[cross[0], cross[1]]].concat(p.clones.map(c => [cross[0] + c.off[0], cross[1] + c.off[1]])) : [[cross[0], cross[1]]];
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const q of pack) { x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]); }
      const cx = ((x0 + x1) / 2) * k, cy = zc + ((y0 + y1) / 2 - zc) * k;
      const pad = 0.17 + 0.08 * (1 - k), hx = (x1 - x0) / 2 * k + pad, hy = (y1 - y0) / 2 * k + pad, L = Math.min(hx, hy) * 0.6, w = 0.02 + 0.01 * near;
      const col = [1, 0.8 + 0.18 * near, 0.22 + 0.6 * near, 0.75 + 0.25 * near], fill = [1, 0.85, 0.35, (pack.length > 1 ? 0.05 : 0.1) + 0.12 * near];
      pushTri([cx - hx, cy - hy, z], [cx + hx, cy - hy, z], [cx + hx, cy + hy, z], fill, fill, fill); pushTri([cx - hx, cy - hy, z], [cx + hx, cy + hy, z], [cx - hx, cy + hy, z], fill, fill, fill);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const c0 = [cx + sx * hx, cy + sy * hy, z];
        line3(c0, [c0[0] - sx * L, c0[1], z], w, col); line3(c0, [c0[0], c0[1] - sy * L, z], w, col);
      }
      const dot = 0.018 + 0.012 * near;
      for (const q of pack) { const px = q[0] * k, py = zc + (q[1] - zc) * k; line3([px - dot, py, z], [px + dot, py, z], dot, col); }
    }
    this.weatherDraw(pushTri, line3);
    for (const bo of this.bolts) {
      const a = bo.life / bo.max;
      for (let i = 1; i < bo.pts.length; i++) {
        const p0 = bo.pts[i - 1], p1 = bo.pts[i];
        const d = vnorm(vsub(p1, p0)); const toCam = vnorm(vsub(R.camPos, p1)); const side = vnorm(vcross(d, toCam));
        const w = bo.width * 0.5;
        const c = [bo.col[0], bo.col[1], bo.col[2], a];
        pushTri(vmad(p0, side, w), vmad(p0, side, -w), vmad(p1, side, w), c, c, c);
        pushTri(vmad(p0, side, -w), vmad(p1, side, -w), vmad(p1, side, w), c, c, c);
      }
    }
    glDrawRibbons(verts, n, true);
    glDrawParticles(this.dust, true, false);
    glDrawParticles(this.soft, true, true);
    glDrawParticles(this.parts, false, false);
  },
};
const SPECIAL_COLORS = {
  sunArrow: [1, 0.55, 0.15], gustBag: [0.6, 1, 0.75], thunderZig: [0.65, 0.8, 1], shadowTrick: [0.6, 0.9, 0.5],
  ruyiStaff: [1, 0.8, 0.3], giantMallet: [1, 0.85, 0.4], iaiSplit: [0.75, 0.88, 1], tornadoFan: [0.7, 1, 0.85], quicksand: [0.9, 0.75, 0.45],
  rakeGrounder: [1, 0.5, 0.2], fireWheels: [1, 0.45, 0.15], sumoCharge: [1, 0.85, 0.4], charm: [1, 0.5, 0.8], agingBox: [0.95, 0.95, 0.95],
  invisBall: [0.7, 0.55, 1], skyHigh: [1, 0.85, 0.5], thiefGod: [1, 0.95, 0.6], strategy: [1, 0.8, 0.4], rageLiner: [1, 0.35, 0.3],
  gungnir: [0.85, 0.9, 1], sunBlind: [1, 0.95, 0.55], petrify: [0.75, 0.9, 0.6], chainLightning: [0.6, 0.8, 1], timeSlow: [1, 0.9, 0.6],
};
