// ===== pixel.js : skeleton + software pixel rasterizer for chibi sprites =====
// Local frame for poses: [s, u, f] = [character right, up, forward]

// ---------- color ramps ----------
function hex2rgb(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgb2hsl(r, g, b) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b); let h = 0, s = 0; const l = (mx + mn) / 2; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
function hsl2rgb(h, s, l) { h = ((h % 1) + 1) % 1; s = clamp(s, 0, 1); l = clamp(l, 0, 1); if (s === 0) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = t => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]; }
const RAMPS = {};
function ramp(hex) {
  if (RAMPS[hex]) return RAMPS[hex];
  const [r, g, b] = hex2rgb(hex); const [h, s, l] = rgb2hsl(r, g, b);
  const mid = [r, g, b];
  // shadows: darker and shifted toward cool purple; highlights: warmer and lighter
  const sh = [r * 0.66 + 14, g * 0.6 + 8, b * 0.68 + 26];
  const li = hsl2rgb(h + 0.012, s * 0.95, Math.min(0.93, l * 1.1 + 0.05));
  const hi = hsl2rgb(h + 0.02, s * 0.8, Math.min(0.97, l * 1.22 + 0.12));
  const ol = [r * 0.28 + 10, g * 0.22 + 6, b * 0.3 + 16];
  const res = [sh, mid, li, hi, ol].map(c => c.map(v => Math.round(clamp(v, 0, 255))));
  RAMPS[hex] = res; return res;
}

// ---------- local frame math ----------
const L = {
  yaw: (v, t) => { const c = Math.cos(t), s = Math.sin(t); return [v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c]; },
  basis(yaw, pitch, roll) {
    const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
    let S = [cr, -sr, 0], U = [sr, cr, 0], F = [0, 0, 1];
    const U2 = vadd(vscale(U, cp), vscale(F, sp)), F2 = vsub(vscale(F, cp), vscale(U, sp));
    return { S: L.yaw(S, yaw), U: L.yaw(U2, yaw), F: L.yaw(F2, yaw) };
  },
  at: (o, B, s, u, f) => [o[0] + B.S[0] * s + B.U[0] * u + B.F[0] * f, o[1] + B.S[1] * s + B.U[1] * u + B.F[1] * f, o[2] + B.S[2] * s + B.U[2] * u + B.F[2] * f],
};
function ik2(A, T, l1, l2, pole) {
  let d = vsub(T, A); let len = vlen(d);
  const mn = Math.abs(l1 - l2) + 1e-3, mx = l1 + l2 - 1e-3;
  len = clamp(len, mn, mx);
  const dir = vnorm(d);
  const Tp = vmad(A, dir, len);
  const a = (l1 * l1 - l2 * l2 + len * len) / (2 * len);
  const h = Math.sqrt(Math.max(l1 * l1 - a * a, 0));
  let pv = vsub(pole, A); pv = vsub(pv, vscale(dir, vdot(pv, dir)));
  if (vlen(pv) < 1e-5) pv = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  pv = vnorm(pv);
  return { mid: vadd(vmad(A, dir, a), vscale(pv, h)), end: Tp };
}

// ---------- default body ----------
const BODY = { hipW: 0.085, thigh: 0.19, shin: 0.19, torso: 0.2, shW: 0.17, shU: 0.085, up: 0.15, fore: 0.14, headR: 0.31, neck: 0.15, headOff: 0.26 };

// ---------- skeleton solve ----------
function solveSkeleton(P, look) {
  const b = look._body;
  const J = {};
  const root = P.root || [0, b.pelvisH, 0];
  J.pelvis = root;
  const pY = P.yaw || 0;
  J.pB = L.basis(pY, (P.pitch || 0) * 0.3, (P.roll || 0) * 0.4);
  J.cB = L.basis(pY + (P.cYaw || 0), P.pitch || 0, P.roll || 0);
  J.chest = L.at(root, J.cB, 0, b.torso, 0);
  J.neck = L.at(J.chest, J.cB, 0, b.neck, 0);
  J.hB = L.basis(pY + (P.cYaw || 0) + (P.hYaw || 0), (P.pitch || 0) * 0.4 + (P.hPitch || 0), (P.roll || 0) * 0.5 + (P.hRoll || 0));
  J.head = L.at(J.neck, J.hB, 0, b.headOff, 0);
  for (const side of [1, -1]) {
    const k = side > 0 ? 'R' : 'L';
    const sh = L.at(J.chest, J.cB, side * b.shW, b.shU, 0);
    J['sh' + k] = sh;
    let hand = P['h' + k];
    if (!hand) hand = L.at(sh, J.cB, side * 0.05, -0.26, 0.04);
    const pole = P['e' + k] || L.at(sh, J.cB, side * 0.35, -0.25, -0.35);
    const arm = ik2(sh, hand, b.up, b.fore, pole);
    J['el' + k] = arm.mid; J['ha' + k] = arm.end;
    const hip = L.at(root, J.pB, side * b.hipW, -0.02, 0);
    J['hip' + k] = hip;
    let foot = P['f' + k];
    if (!foot) foot = [side * 0.11, 0.05, 0];
    const kp = P['k' + k] || vadd(L.at(hip, J.pB, side * 0.12, -0.2, 0.5), [0, 0, 0]);
    const leg = ik2(hip, foot, b.thigh, b.shin, kp);
    J['kn' + k] = leg.mid; J['ft' + k] = leg.end;
    J['fd' + k] = P['fd' + k] || L.yaw([0, 0, 1], (P.yaw || 0) * 0.6 + side * -0.25);
  }
  return J;
}

// ---------- part list ----------
// part: {k:'e' ellipsoid, c, B:{S,U,F}, r:[rs,ru,rf], m:mat}  {k:'c' capsule a,b,r1,r2,m} {k:'s' sphere c,r,m}
function buildParts(J, P, look) {
  const parts = [], b = look._body;
  const add = p => { parts.push(p); return p; };
  const M = look._mat;
  const glove = P.glove; // 'L'|'R'|null
  // legs
  for (const k of ['R', 'L']) {
    add({ k: 'c', a: J['hip' + k], b: J['kn' + k], r1: 0.062 * b.leg, r2: 0.055 * b.leg, m: M.pants, g: 'leg' + k });
    add({ k: 'c', a: J['kn' + k], b: vadd(J['ft' + k], [0, 0.02, 0]), r1: 0.052 * b.leg, r2: 0.045 * b.leg, m: M.socks, g: 'leg' + k });
    const fd = J['fd' + k];
    const fB = { S: vnorm(vcross([0, 1, 0], fd)).map(v => -v), U: [0, 1, 0], F: fd };
    fB.S = vnorm(vcross(fd, [0, 1, 0]));
    add({ k: 'e', c: L.at(J['ft' + k], { S: fB.S, U: [0, 1, 0], F: fd }, 0, -0.01, 0.035), B: { S: fB.S, U: [0, 1, 0], F: fd }, r: [0.052, 0.042, 0.088], m: M.shoes, g: 'leg' + k });
  }
  // pelvis & torso
  add({ k: 'e', c: J.pelvis, B: J.pB, r: [0.15 * b.w, 0.1, 0.115 * b.w], m: M.pants, g: 'body' });
  add({ k: 'e', c: L.at(J.chest, J.cB, 0, -0.02, 0), B: J.cB, r: [0.165 * b.w * b.chest, 0.17, 0.125 * b.w * b.chest], m: M.jersey, g: 'body' });
  if (b.belly) add({ k: 'e', c: L.at(J.chest, J.cB, 0, -0.08, 0.06), B: J.cB, r: [0.17 * b.belly, 0.15 * b.belly, 0.13 * b.belly], m: M.jersey, g: 'body' });
  // jersey trim belt
  add({ k: 'e', c: L.at(J.pelvis, J.pB, 0, 0.07, 0), B: J.pB, r: [0.153 * b.w, 0.025, 0.118 * b.w], m: M.belt, g: 'body' });
  // arms
  for (const k of ['R', 'L']) {
    add({ k: 'c', a: J['sh' + k], b: J['el' + k], r1: 0.05 * b.arm, r2: 0.045 * b.arm, m: M.sleeve, g: 'arm' + k });
    add({ k: 'c', a: J['el' + k], b: J['ha' + k], r1: 0.043 * b.arm, r2: 0.04 * b.arm, m: M.skin, g: 'arm' + k });
    if (glove === k) add({ k: 'e', c: J['ha' + k], B: J.cB, r: [0.085, 0.1, 0.06], m: M.glove, g: 'arm' + k });
    else add({ k: 's', c: J['ha' + k], r: 0.052 * b.arm, m: look.batGloves ? M.bglove : M.skin, g: 'arm' + k });
  }
  // neck & head
  add({ k: 'c', a: J.chest, b: J.neck, r1: 0.06, r2: 0.055, m: M.skin, g: 'body' });
  const hr = b.headR;
  add({ k: 'e', c: J.head, B: J.hB, r: [hr * 1.04, hr * 0.96, hr], m: M.skin, g: 'head', face: true });
  // bat / weapon
  if (P.bat) {
    const hand = P.bat.hand === 'L' ? J.haL : J.haR;
    const grip = P.bat.hand === 'both' ? vlerp(J.haR, J.haL, 0.5) : hand;
    const dir = vnorm(P.bat.dir);
    WEAPONS[look.bat ? look.bat.t : 'bat'](add, grip, dir, look, M, P.bat);
  }
  if (P.ball) add({ k: 's', c: P.ball, r: 0.04, m: M.ball, g: 'ball' });
  // accessories
  for (const a of look.acc || []) if (ACC[a.t]) ACC[a.t](add, J, P, look, M, a);
  // hair
  HAIR[look.hairStyle || 'short'](add, J, look, M);
  return parts;
}

// ---------- weapons (bats) ----------
const WEAPONS = {
  bat(add, g, d, look, M) {
    const len = 0.82 * (look.batLen || 1);
    add({ k: 'c', a: vmad(g, d, -0.08), b: vmad(g, d, len * 0.45), r1: 0.022, r2: 0.03, m: M.bat, g: 'bat' });
    add({ k: 'c', a: vmad(g, d, len * 0.45), b: vmad(g, d, len), r1: 0.03, r2: 0.045, m: M.bat, g: 'bat' });
  },
  staff(add, g, d, look, M) { // 如意金箍棒
    const len = 1.15 * (look.batLen || 1);
    add({ k: 'c', a: vmad(g, d, -0.32), b: vmad(g, d, len), r1: 0.032, r2: 0.032, m: M.wpn, g: 'bat' });
    add({ k: 'c', a: vmad(g, d, len - 0.12), b: vmad(g, d, len + 0.02), r1: 0.042, r2: 0.042, m: M.wpn2, g: 'bat' });
    add({ k: 'c', a: vmad(g, d, -0.32), b: vmad(g, d, -0.2), r1: 0.042, r2: 0.042, m: M.wpn2, g: 'bat' });
  },
  rake(add, g, d, look, M) { // 九齒釘耙
    const len = 0.95;
    add({ k: 'c', a: vmad(g, d, -0.1), b: vmad(g, d, len), r1: 0.026, r2: 0.03, m: M.wpn, g: 'bat' });
    const side = vnorm(vcross(d, [0, 1, 0.001]));
    const head = vmad(g, d, len);
    add({ k: 'c', a: vmad(head, side, -0.16), b: vmad(head, side, 0.16), r1: 0.035, r2: 0.035, m: M.wpn2, g: 'bat' });
    for (let i = -2; i <= 2; i++) { const p = vmad(head, side, i * 0.075); add({ k: 'c', a: p, b: vmad(p, vnorm(vcross(side, d)), 0.12), r1: 0.014, r2: 0.01, m: M.wpn2, g: 'bat' }); }
  },
  katana(add, g, d, look, M) {
    const len = 0.9;
    add({ k: 'c', a: vmad(g, d, -0.1), b: vmad(g, d, 0.18), r1: 0.026, r2: 0.026, m: M.wpn2, g: 'bat' });
    add({ k: 'e', c: vmad(g, d, 0.2), B: { S: vnorm(vcross(d, [0, 1, 0.001])), U: d, F: vnorm(vcross(vnorm(vcross(d, [0, 1, 0.001])), d)) }, r: [0.06, 0.012, 0.06], m: M.gold, g: 'bat' });
    add({ k: 'c', a: vmad(g, d, 0.2), b: vmad(g, d, len), r1: 0.026, r2: 0.016, m: M.wpn, g: 'bat' });
  },
  fan(add, g, d, look, M) { // 羽團扇
    add({ k: 'c', a: vmad(g, d, -0.05), b: vmad(g, d, 0.4), r1: 0.02, r2: 0.022, m: M.wpn2, g: 'bat' });
    const side = vnorm(vcross(d, [0, 1, 0.001]));
    const c = vmad(g, d, 0.62);
    add({ k: 'e', c, B: { S: side, U: d, F: vnorm(vcross(side, d)) }, r: [0.22, 0.26, 0.03], m: M.wpn, g: 'bat' });
  },
  spade(add, g, d, look, M) { // 月牙鏟
    const len = 1.05;
    add({ k: 'c', a: vmad(g, d, -0.3), b: vmad(g, d, len), r1: 0.024, r2: 0.024, m: M.wpn2, g: 'bat' });
    const side = vnorm(vcross(d, [0, 1, 0.001]));
    const top = vmad(g, d, len);
    add({ k: 'e', c: top, B: { S: side, U: d, F: vnorm(vcross(side, d)) }, r: [0.09, 0.07, 0.02], m: M.wpn, g: 'bat' });
    const bot = vmad(g, d, -0.32);
    add({ k: 'e', c: bot, B: { S: side, U: d, F: vnorm(vcross(side, d)) }, r: [0.1, 0.05, 0.02], m: M.wpn, g: 'bat' });
  },
  needle(add, g, d, look, M) {
    add({ k: 'c', a: vmad(g, d, -0.05), b: vmad(g, d, 0.75), r1: 0.018, r2: 0.006, m: M.wpn, g: 'bat' });
    add({ k: 's', c: vmad(g, d, -0.06), r: 0.03, m: M.wpn2, g: 'bat' });
  },
  rod(add, g, d, look, M) { // fishing rod
    add({ k: 'c', a: vmad(g, d, -0.1), b: vmad(g, d, 1.0), r1: 0.022, r2: 0.01, m: M.wpn, g: 'bat' });
    add({ k: 's', c: vmad(g, d, 0.05), r: 0.04, m: M.wpn2, g: 'bat' });
  },
  club(add, g, d, look, M) {
    add({ k: 'c', a: vmad(g, d, -0.1), b: vmad(g, d, 0.85), r1: 0.03, r2: 0.075, m: M.wpn, g: 'bat' });
    for (let i = 0; i < 3; i++) add({ k: 's', c: vmad(vmad(g, d, 0.5 + i * 0.13), [0, 1, 0], 0.05 * (i % 2 ? 1 : -1)), r: 0.03, m: M.wpn2, g: 'bat' });
  },
  hammer(add, g, d, look, M) {
    add({ k: 'c', a: vmad(g, d, -0.08), b: vmad(g, d, 0.5), r1: 0.028, r2: 0.028, m: M.wpn2, g: 'bat' });
    const side = vnorm(vcross(d, [0, 1, 0.001]));
    const head = vmad(g, d, 0.58);
    add({ k: 'e', c: head, B: { S: side, U: d, F: vnorm(vcross(side, d)) }, r: [0.2, 0.11, 0.12], m: M.wpn, g: 'bat' });
  },
  spear(add, g, d, look, M) {
    add({ k: 'c', a: vmad(g, d, -0.25), b: vmad(g, d, 0.95), r1: 0.022, r2: 0.022, m: M.wpn2, g: 'bat' });
    add({ k: 'c', a: vmad(g, d, 0.92), b: vmad(g, d, 1.12), r1: 0.05, r2: 0.005, m: M.wpn, g: 'bat' });
  },
  bident(add, g, d, look, M) {
    add({ k: 'c', a: vmad(g, d, -0.2), b: vmad(g, d, 0.9), r1: 0.022, r2: 0.022, m: M.wpn2, g: 'bat' });
    const side = vnorm(vcross(d, [0, 1, 0.001]));
    for (const sx of [-1, 1]) { const p = vmad(vmad(g, d, 0.9), side, sx * 0.06); add({ k: 'c', a: p, b: vmad(p, d, 0.2), r1: 0.02, r2: 0.006, m: M.wpn, g: 'bat' }); }
  },
  bow(add, g, d, look, M) { add({ k: 'c', a: vmad(g, d, -0.05), b: vmad(g, d, 0.8), r1: 0.025, r2: 0.04, m: M.bat, g: 'bat' }); },
};

// ---------- hair ----------
function hp(J, s, u, f) { return L.at(J.head, J.hB, s, u, f); }
const HAIR = {
  none() { },
  bald(add, J, look, M) {
    const r = look._body.headR;
    for (let i = 0; i < 9; i++) { const a = PI + i * (PI / 8); add({ k: 's', c: hp(J, Math.cos(a) * r * 0.92, -r * 0.02 + Math.sin(i * 1.7) * r * 0.04, Math.sin(a) * r * 0.85 - r * 0.05), r: r * 0.22, m: M.hair, g: 'hair' }); }
  },
  short(add, J, look, M) {
    const r = look._body.headR;
    add({ k: 'e', c: hp(J, 0, r * 0.2, -r * 0.12), B: J.hB, r: [r * 1.08, r * 0.86, r * 1.0], m: M.hair, g: 'hair' });
    add({ k: 'e', c: hp(J, 0, r * 0.55, r * 0.45), B: J.hB, r: [r * 0.8, r * 0.3, r * 0.4], m: M.hair, g: 'hair' });
  },
  spiky(add, J, look, M) {
    HAIR.short(add, J, look, M);
    const r = look._body.headR;
    const spikes = [[0, 1.05, -0.1], [-0.55, 0.85, -0.2], [0.55, 0.85, -0.2], [-0.3, 0.95, 0.35], [0.3, 0.95, 0.35], [0, 0.7, -0.75], [-0.75, 0.4, -0.5], [0.75, 0.4, -0.5]];
    for (const s of spikes) { const base = hp(J, s[0] * r * 0.7, s[1] * r * 0.7, s[2] * r * 0.7); const tip = hp(J, s[0] * r * 1.35, s[1] * r * 1.35, s[2] * r * 1.35); add({ k: 'c', a: base, b: tip, r1: r * 0.25, r2: r * 0.05, m: M.hair, g: 'hair' }); }
  },
  wild(add, J, look, M) {
    HAIR.spiky(add, J, look, M);
    const r = look._body.headR;
    add({ k: 'e', c: hp(J, 0, -r * 0.45, -r * 0.65), B: J.hB, r: [r * 0.95, r * 1.0, r * 0.55], m: M.hair, g: 'hair' });
  },
  long(add, J, look, M) {
    HAIR.short(add, J, look, M);
    const r = look._body.headR;
    add({ k: 'e', c: hp(J, 0, -r * 0.55, -r * 0.55), B: J.hB, r: [r * 0.95, r * 1.05, r * 0.5], m: M.hair, g: 'hair' });
    add({ k: 'e', c: hp(J, -r * 0.82, -r * 0.4, -r * 0.1), B: J.hB, r: [r * 0.22, r * 0.75, r * 0.4], m: M.hair, g: 'hair' });
    add({ k: 'e', c: hp(J, r * 0.82, -r * 0.4, -r * 0.1), B: J.hB, r: [r * 0.22, r * 0.75, r * 0.4], m: M.hair, g: 'hair' });
  },
  buns(add, J, look, M) { // 哪吒雙丫髻
    HAIR.short(add, J, look, M);
    const r = look._body.headR;
    add({ k: 's', c: hp(J, -r * 0.62, r * 0.88, -r * 0.1), r: r * 0.32, m: M.hair, g: 'hair' });
    add({ k: 's', c: hp(J, r * 0.62, r * 0.88, -r * 0.1), r: r * 0.32, m: M.hair, g: 'hair' });
  },
  topknot(add, J, look, M) {
    HAIR.short(add, J, look, M);
    const r = look._body.headR;
    add({ k: 's', c: hp(J, 0, r * 1.05, -r * 0.2), r: r * 0.28, m: M.hair, g: 'hair' });
  },
  bowl(add, J, look, M) {
    const r = look._body.headR;
    add({ k: 'e', c: hp(J, 0, r * 0.25, -r * 0.05), B: J.hB, r: [r * 1.1, r * 0.82, r * 1.08], m: M.hair, g: 'hair' });
  },
  wavy(add, J, look, M) { // golden curls
    HAIR.short(add, J, look, M);
    const r = look._body.headR;
    for (let i = 0; i < 7; i++) { const a = -1.4 + i * 0.47; add({ k: 's', c: hp(J, Math.sin(a) * r * 0.95, -r * 0.1, Math.cos(a) * r * 0.2 - r * 0.6), r: r * 0.3, m: M.hair, g: 'hair' }); }
  },
  snakes(add, J, look, M) {
    HAIR.short(add, J, look, M);
    const r = look._body.headR;
    const t = look._t || 0;
    for (let i = 0; i < 8; i++) {
      const a = -PI * 0.85 + i * (PI * 1.7 / 7);
      let p = hp(J, Math.sin(a) * r * 0.8, r * 0.5, Math.cos(a) * r * 0.5 - r * 0.25);
      for (let k = 0; k < 3; k++) {
        const q = vadd(p, L.at([0, 0, 0], J.hB, Math.sin(a) * r * 0.25, r * (0.15 - k * 0.12) + Math.sin(t * 4 + i + k) * 0.02, Math.cos(a) * r * 0.2 - r * 0.1));
        add({ k: 'c', a: p, b: q, r1: r * (0.13 - k * 0.025), r2: r * (0.11 - k * 0.025), m: k === 2 ? M.acc2 : M.hair, g: 'hair' });
        p = q;
      }
    }
  },
};

// ---------- accessories ----------
const ACC = {
  circlet(add, J, P, look, M) { const r = look._body.headR; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; add({ k: 's', c: hp(J, Math.sin(a) * r * 1.02, r * 0.38, Math.cos(a) * r * 1.0), r: r * 0.08, m: M.gold, g: 'hair' }); } },
  laurel(add, J, P, look, M) { const r = look._body.headR; for (let i = 0; i < 9; i++) { const a = -2.2 + i * 0.55; add({ k: 'e', c: hp(J, Math.sin(a) * r * 1.02, r * 0.45, Math.cos(a) * r * 1.0), B: J.hB, r: [r * 0.12, r * 0.07, r * 0.12], m: M.acc, g: 'hair' }); } },
  crown(add, J, P, look, M) { const r = look._body.headR; add({ k: 'e', c: hp(J, 0, r * 0.82, 0), B: J.hB, r: [r * 0.75, r * 0.2, r * 0.7], m: M.gold, g: 'hair' }); for (let i = 0; i < 5; i++) { const a = -1.2 + i * 0.6; add({ k: 'c', a: hp(J, Math.sin(a) * r * 0.65, r * 0.9, Math.cos(a) * r * 0.6), b: hp(J, Math.sin(a) * r * 0.7, r * 1.2, Math.cos(a) * r * 0.65), r1: r * 0.08, r2: r * 0.02, m: M.gold, g: 'hair' }); } },
  tail(add, J, P, look, M, a) {
    const t = (look._t || 0) * 3;
    let p = L.at(J.pelvis, J.pB, 0, -0.02, -0.12);
    for (let i = 0; i < 6; i++) { const q = L.at(p, J.pB, Math.sin(t + i * 0.7) * 0.05, 0.05 + i * 0.02, -0.07); add({ k: 'c', a: p, b: q, r1: 0.03, r2: 0.028, m: M[a.m || 'hair'], g: 'tail' }); p = q; }
  },
  tails9(add, J, P, look, M) {
    const t = (look._t || 0) * 2.5;
    for (let n = 0; n < 9; n++) {
      const spread = (n - 4) * 0.28;
      let p = L.at(J.pelvis, J.pB, 0, 0.0, -0.1);
      for (let i = 0; i < 5; i++) {
        const q = L.at(p, J.pB, Math.sin(spread) * 0.07 + Math.sin(t + n + i * 0.6) * 0.012, 0.06 + Math.cos(spread) * 0.03, -0.06);
        add({ k: 'c', a: p, b: q, r1: 0.04 + i * 0.006, r2: 0.045 + i * 0.006, m: i >= 3 ? M.acc2 : M.acc, g: 'tail' });
        p = q;
      }
    }
  },
  foxEars(add, J, P, look, M) { const r = look._body.headR; for (const s of [-1, 1]) add({ k: 'c', a: hp(J, s * r * 0.55, r * 0.75, -r * 0.05), b: hp(J, s * r * 0.75, r * 1.35, -r * 0.1), r1: r * 0.2, r2: r * 0.03, m: M.acc, g: 'hair' }); },
  pig(add, J, P, look, M) { const r = look._body.headR; add({ k: 'e', c: hp(J, 0, -r * 0.2, r * 0.92), B: J.hB, r: [r * 0.3, r * 0.22, r * 0.18], m: M.acc, g: 'head' }); for (const s of [-1, 1]) add({ k: 'e', c: hp(J, s * r * 0.8, r * 0.55, 0), B: J.hB, r: [r * 0.32, r * 0.4, r * 0.1], m: M.acc, g: 'hair' }); },
  monkey(add, J, P, look, M) { const r = look._body.headR; add({ k: 'e', c: hp(J, 0, -r * 0.18, r * 0.62), B: J.hB, r: [r * 0.72, r * 0.6, r * 0.45], m: M.acc, g: 'head', face: true }); for (const s of [-1, 1]) add({ k: 's', c: hp(J, s * r * 1.0, 0, 0), r: r * 0.22, m: M.acc, g: 'head' }); },
  tengu(add, J, P, look, M) { const r = look._body.headR; add({ k: 'c', a: hp(J, 0, -r * 0.05, r * 0.85), b: hp(J, 0, r * 0.05, r * 1.75), r1: r * 0.17, r2: r * 0.1, m: M.skin, g: 'head' }); add({ k: 'e', c: hp(J, 0, r * 0.95, r * 0.25), B: J.hB, r: [r * 0.25, r * 0.22, r * 0.25], m: M.acc2, g: 'hair' }); },
  wings(add, J, P, look, M, a) { const sp = P.wing !== undefined ? P.wing : 0.4; for (const s of [-1, 1]) { const base = L.at(J.chest, J.cB, s * 0.08, 0.05, -0.14); const tip = L.at(J.chest, J.cB, s * (0.45 + sp * 0.3), 0.32 + sp * 0.15, -0.3); add({ k: 'c', a: base, b: tip, r1: 0.1, r2: 0.05, m: M[a.m || 'acc2'], g: 'wing' }); add({ k: 'c', a: vlerp(base, tip, 0.4), b: vadd(tip, [0, -0.35, 0]), r1: 0.09, r2: 0.03, m: M[a.m || 'acc2'], g: 'wing' }); } },
  footWings(add, J, P, look, M) { for (const k of ['R', 'L']) { const f = J['ft' + k]; const s = k === 'R' ? 1 : -1; add({ k: 'c', a: vadd(f, [0, 0.06, 0]), b: L.at(f, J.pB, s * 0.12, 0.16, -0.1), r1: 0.035, r2: 0.012, m: M.acc, g: 'leg' + k }); } },
  wingHat(add, J, P, look, M) { const r = look._body.headR; add({ k: 'e', c: hp(J, 0, r * 0.62, 0), B: J.hB, r: [r * 1.15, r * 0.28, r * 1.12], m: M.acc2, g: 'hair' }); for (const s of [-1, 1]) add({ k: 'c', a: hp(J, s * r * 0.85, r * 0.7, -r * 0.1), b: hp(J, s * r * 1.35, r * 1.15, -r * 0.35), r1: r * 0.14, r2: r * 0.04, m: M.acc, g: 'hair' }); },
  beard(add, J, P, look, M, a) { const r = look._body.headR; const L2 = a.len || 1; add({ k: 'e', c: hp(J, 0, -r * 0.62, r * 0.55), B: J.hB, r: [r * 0.62, r * 0.42 * L2, r * 0.38], m: M[a.m || 'beard'], g: 'head' }); if (L2 > 1.2) add({ k: 'e', c: hp(J, 0, -r * 1.05, r * 0.5), B: J.hB, r: [r * 0.38, r * 0.35 * L2, r * 0.25], m: M[a.m || 'beard'], g: 'head' }); },
  eyepatch(add, J, P, look, M) { },
  helmet(add, J, P, look, M, a) { const r = look._body.headR; add({ k: 'e', c: hp(J, 0, r * 0.28, -r * 0.05), B: J.hB, r: [r * 1.12, r * 0.92, r * 1.1], m: M[a.m || 'acc'], g: 'hair' }); if (a.crest) { for (let i = 0; i < 5; i++) { const t = i / 4; add({ k: 's', c: hp(J, 0, r * (1.1 + Math.sin(t * PI) * 0.25), r * (0.6 - t * 1.4)), r: r * 0.2, m: M[a.crest], g: 'hair' }); } } },
  cap(add, J, P, look, M, a) { const r = look._body.headR, m = M[a.m || 'acc']; add({ k: 'e', c: hp(J, 0, r * 0.46, -r * 0.03), B: J.hB, r: [r * 1.07, r * 0.66, r * 1.07], m, g: 'hair' }); add({ k: 'e', c: hp(J, 0, r * 0.3, r * 0.98), B: J.hB, r: [r * 0.66, r * 0.075, r * 0.45], m, g: 'hair' }); add({ k: 's', c: hp(J, 0, r * 1.1, 0), r: r * 0.1, m: M.acc2, g: 'hair' }); },
  hood(add, J, P, look, M) { // lion hood
    const r = look._body.headR;
    add({ k: 'e', c: hp(J, 0, r * 0.45, -r * 0.08), B: J.hB, r: [r * 1.15, r * 0.85, r * 1.12], m: M.acc, g: 'hair' });
    add({ k: 'e', c: hp(J, 0, r * 0.95, r * 0.55), B: J.hB, r: [r * 0.55, r * 0.35, r * 0.4], m: M.acc, g: 'hair' });
    for (let i = 0; i < 8; i++) { const a = -2.5 + i * 0.7; add({ k: 's', c: hp(J, Math.sin(a) * r * 1.1, r * 0.1 + Math.cos(a * 0.5) * r * 0.2, Math.cos(a) * r * 0.6 - r * 0.4), r: r * 0.3, m: M.acc2, g: 'hair' }); }
    for (const s of [-1, 1]) add({ k: 'c', a: L.at(J.chest, J.cB, s * 0.1, 0.12, 0.08), b: L.at(J.chest, J.cB, s * 0.03, -0.05, 0.14), r1: 0.05, r2: 0.04, m: M.acc, g: 'body' });
    for (const s of [-1, 1]) add({ k: 's', c: hp(J, s * r * 0.2, r * 1.08, r * 0.86), r: r * 0.075, m: M.eye, g: 'hood' });
    add({ k: 's', c: hp(J, 0, r * 0.96, r * 0.96), r: r * 0.1, m: M.acc2, g: 'hood' });
  },
  cape(add, J, P, look, M, a) { const sw = P.capeSwing || 0; add({ k: 'e', c: L.at(J.chest, J.cB, 0, -0.08, -0.17 - sw * 0.1), B: L.basis((P.yaw || 0) + (P.cYaw || 0), -0.25 - sw * 0.5, 0), r: [0.2, 0.28, 0.035], m: M[a.m || 'acc'], g: 'cape' }); },
  sash(add, J, P, look, M) { const t = (look._t || 0) * 4; let p = L.at(J.chest, J.cB, -0.15, 0.08, -0.05); for (let i = 0; i < 7; i++) { const q = vadd(p, L.at([0, 0, 0], J.cB, -0.06, -0.04 + Math.sin(t + i) * 0.05, -0.06)); add({ k: 'c', a: p, b: q, r1: 0.035, r2: 0.03, m: M.acc, g: 'cape' }); p = q; } },
  ring(add, J, P, look, M) { for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; add({ k: 's', c: L.at(J.chest, J.cB, Math.cos(a) * 0.14, 0.13, Math.sin(a) * 0.1), r: 0.028, m: M.gold, g: 'body' }); } },
  wheels(add, J, P, look, M) { for (const k of ['R', 'L']) { const f = J['ft' + k]; add({ k: 'e', c: vadd(f, [0, 0.03, 0]), B: J.pB, r: [0.13, 0.035, 0.13], m: M.fire, g: 'leg' + k }); } },
  extraArms(add, J, P, look, M) {
    const t = (look._t || 0) * 2;
    for (const s of [1, -1]) for (let n = 0; n < 2; n++) {
      const sh = L.at(J.chest, J.cB, s * 0.13, 0.02 - n * 0.08, -0.06);
      const hand = L.at(J.chest, J.cB, s * (0.38 + n * 0.06), 0.1 - n * 0.3 + Math.sin(t + n * 2 + s) * 0.04, -0.05 + n * 0.1);
      const el = vlerp(sh, hand, 0.5); el[1] += 0.06;
      add({ k: 'c', a: sh, b: el, r1: 0.042, r2: 0.038, m: M.sleeve, g: 'xarm' });
      add({ k: 'c', a: el, b: hand, r1: 0.036, r2: 0.034, m: M.skin, g: 'xarm' });
      add({ k: 's', c: hand, r: 0.045, m: M.skin, g: 'xarm' });
    }
  },
  bib(add, J, P, look, M) { add({ k: 'e', c: L.at(J.chest, J.cB, 0, -0.05, 0.075), B: J.cB, r: [0.15, 0.18, 0.07], m: M.acc, g: 'bib' }); },
  beads(add, J, P, look, M) { for (let i = 0; i < 9; i++) { const a = PI * 0.15 + i / 8 * PI * 0.7; add({ k: 's', c: L.at(J.chest, J.cB, Math.cos(a) * 0.15, 0.12 - Math.sin(a) * 0.12, 0.1), r: 0.035, m: M.acc, g: 'body' }); } },
  windbag(add, J, P, look, M) { add({ k: 'c', a: L.at(J.chest, J.cB, -0.28, 0.32, -0.22), b: L.at(J.chest, J.cB, 0.28, 0.32, -0.22), r1: 0.11, r2: 0.11, m: M.acc, g: 'cape' }); for (const s of [-1, 1]) add({ k: 's', c: L.at(J.chest, J.cB, s * 0.33, 0.3, -0.2), r: 0.12, m: M.acc, g: 'cape' }); },
  bowHat(add, J, P, look, M) { const r = look._body.headR; add({ k: 'e', c: hp(J, 0, r * 0.78, 0), B: J.hB, r: [r * 0.95, r * 0.3, r * 0.95], m: M.acc, g: 'hair' }); },
  straw(add, J, P, look, M) { const r = look._body.headR; add({ k: 'e', c: hp(J, 0, r * 0.62, 0), B: J.hB, r: [r * 1.55, r * 0.12, r * 1.5], m: M.acc, g: 'hair' }); add({ k: 'e', c: hp(J, 0, r * 0.82, 0), B: J.hB, r: [r * 0.7, r * 0.28, r * 0.7], m: M.acc, g: 'hair' }); },
  box(add, J, P, look, M) { add({ k: 'e', c: L.at(J.pelvis, J.pB, 0.17, 0.02, -0.04), B: J.pB, r: [0.05, 0.08, 0.08], m: M.acc2, g: 'body' }); },
  halo(add, J, P, look, M) { const r = look._body.headR; for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; add({ k: 's', c: hp(J, Math.cos(a) * r * 1.35, Math.sin(a) * r * 1.35 + r * 0.2, -r * 0.7), r: r * 0.1, m: M.gold, g: 'halo' }); } },
  shield(add, J, P, look, M) { const h = J.haL; add({ k: 'e', c: L.at(h, J.cB, -0.03, 0.02, 0.04), B: J.cB, r: [0.025, 0.2, 0.2], m: M.acc, g: 'shield' }); },
  horns(add, J, P, look, M, a) { const r = look._body.headR; for (const s of [-1, 1]) add({ k: 'c', a: hp(J, s * r * 0.5, r * 0.7, r * 0.1), b: hp(J, s * r * 0.75, r * 1.25, r * 0.0), r1: r * 0.13, r2: r * 0.03, m: M[a.m || 'acc2'], g: 'hair' }); },
  hourglass(add, J, P, look, M) { const c = L.at(J.chest, J.cB, 0, 0.0, -0.22); add({ k: 'e', c: vadd(c, [0, 0.11, 0]), B: J.cB, r: [0.08, 0.1, 0.08], m: M.acc, g: 'cape' }); add({ k: 'e', c: vadd(c, [0, -0.11, 0]), B: J.cB, r: [0.08, 0.1, 0.08], m: M.acc, g: 'cape' }); add({ k: 'c', a: vadd(c, [0, -0.22, 0]), b: vadd(c, [0, 0.22, 0]), r1: 0.02, r2: 0.02, m: M.gold, g: 'cape' }); },
  thirdEye() { },
  axeBack(add, J, P, look, M) { const a = L.at(J.chest, J.cB, 0.1, -0.15, -0.16), b = L.at(J.chest, J.cB, -0.12, 0.35, -0.16); add({ k: 'c', a, b, r1: 0.022, r2: 0.022, m: M.wpn2, g: 'cape' }); add({ k: 'e', c: b, B: J.cB, r: [0.13, 0.08, 0.02], m: M.wpn, g: 'cape' }); },
  quiver(add, J, P, look, M) { const a = L.at(J.chest, J.cB, 0.12, -0.12, -0.15), b = L.at(J.chest, J.cB, -0.1, 0.28, -0.16); add({ k: 'c', a, b, r1: 0.06, r2: 0.06, m: M.acc2, g: 'cape' }); for (let i = 0; i < 3; i++) add({ k: 'c', a: b, b: vadd(b, [-0.03 + i * 0.03, 0.12, 0]), r1: 0.012, r2: 0.012, m: M.gold, g: 'cape' }); },
  ravens(add, J, P, look, M) { for (const s of [-1, 1]) { const c = L.at(J.chest, J.cB, s * 0.22, 0.2, -0.02); add({ k: 'e', c, B: J.cB, r: [0.05, 0.05, 0.08], m: M.acc2, g: 'raven' }); add({ k: 's', c: vadd(c, [0, 0.06, 0]), r: 0.04, m: M.acc2, g: 'raven' }); } },
};

// ---------- materials ----------
function buildLook(look) {
  const b = Object.assign({ w: 1, chest: 1, arm: 1, leg: 1, belly: 0, headR: BODY.headR }, look.body || {});
  b.pelvisH = 0.43; b.torso = BODY.torso; b.neck = BODY.neck; b.headOff = BODY.headOff * (b.headR / BODY.headR);
  b.shW = BODY.shW * b.w; b.shU = BODY.shU; b.up = BODY.up * b.arm; b.fore = BODY.fore * b.arm; b.hipW = BODY.hipW * b.w; b.thigh = BODY.thigh; b.shin = BODY.shin;
  look._body = b;
  const C = look.colors;
  const m = {};
  const names = ['skin', 'hair', 'jersey', 'sleeve', 'pants', 'socks', 'shoes', 'belt', 'glove', 'bglove', 'bat', 'wpn', 'wpn2', 'acc', 'acc2', 'gold', 'beard', 'fire', 'ball', 'eye'];
  const defaults = { sleeve: C.jersey, glove: '#8a5428', bglove: C.trim || '#dddddd', bat: '#c89a5a', wpn: '#c0c0c8', wpn2: '#6b4a2a', acc: '#d9b45a', acc2: '#3a3040', gold: '#f0c040', beard: C.hair || '#ffffff', fire: '#ff7a1a', ball: '#ffffff', eye: '#1a1020', belt: C.trim || '#222222', shoes: '#26222a', socks: C.jersey, pants: '#ece6da' };
  names.forEach((n, i) => { m[n] = { id: i, ramp: ramp(C[n] || defaults[n] || '#ff00ff') }; });
  look._mat = m; look._mats = names.map(n => m[n]);
  return look;
}

// ---------- rasterizer ----------
const RAS = { w: 0, h: 0, z: null, mat: null, sh: null, part: null, out: null, cap: 0 };
function rasEnsure(w, h) {
  const n = w * h;
  if (n > RAS.cap) { RAS.cap = n; RAS.z = new Float32Array(n); RAS.mat = new Int16Array(n); RAS.sh = new Uint8Array(n); RAS.part = new Int16Array(n); RAS.out = new Uint8ClampedArray(n * 4); RAS.prev = null; }
  const P = RAS.prev;
  if (!P || RAS.w !== w || RAS.h !== h) {
    RAS.z.fill(-1e9, 0, n); RAS.mat.fill(-1, 0, n); RAS.part.fill(-1, 0, n); RAS.out.fill(0, 0, n * 4);
  } else if (P.x1 >= P.x0) {
    for (let y = P.y0; y <= P.y1; y++) { const a = y * w + P.x0, b = y * w + P.x1 + 1; RAS.z.fill(-1e9, a, b); RAS.mat.fill(-1, a, b); RAS.part.fill(-1, a, b); RAS.out.fill(0, a * 4, b * 4); }
  }
  RAS.w = w; RAS.h = h;
  RAS.bx0 = w; RAS.by0 = h; RAS.bx1 = -1; RAS.by1 = -1;
}
// view: {rx,ry,rz, ux,uy,uz, vx,vy,vz} vectors in local frame; ppm pixels per meter; ox, oy origin pixel
const LDIR = vnorm([-0.38, 0.55, 0.75]);
function shadeIdx(nx, ny, nz) {
  const d = nx * LDIR[0] + ny * LDIR[1] + nz * LDIR[2];
  return d < -0.05 ? 0 : d < 0.45 ? 1 : d < 0.88 ? 2 : 3;
}
function rasterParts(parts, V, ppm, ox, oy) {
  const W = RAS.w, H = RAS.h, Z = RAS.z, MAT = RAS.mat, SH = RAS.sh, PT = RAS.part;
  const proj = p => [ox + (p[0] * V.r[0] + p[1] * V.r[1] + p[2] * V.r[2]) * ppm, oy - (p[0] * V.u[0] + p[1] * V.u[1] + p[2] * V.u[2]) * ppm, p[0] * V.v[0] + p[1] * V.v[1] + p[2] * V.v[2]];
  for (let pi = 0; pi < parts.length; pi++) {
    const P = parts[pi];
    const mid = P.m.id;
    if (P.k === 's' || P.k === 'e') {
      const c = proj(P.c);
      let rr, inv = null;
      if (P.k === 's') rr = P.r * ppm;
      else {
        rr = Math.max(P.r[0], P.r[1], P.r[2]) * ppm;
        // ellipsoid axes in view space scaled
        const ax = [P.B.S, P.B.U, P.B.F].map((a, i) => { const s = 1 / P.r[i]; return [vdot(a, V.r) * s, vdot(a, V.u) * s, vdot(a, V.v) * s]; });
        inv = ax; // rows: transform view-space offset (meters) to unit sphere coords: q_i = dot(axis_i_view, d)/r_i
      }
      const x0 = Math.max(0, Math.floor(c[0] - rr - 1)), x1 = Math.min(W - 1, Math.ceil(c[0] + rr + 1));
      const y0 = Math.max(0, Math.floor(c[1] - rr - 1)), y1 = Math.min(H - 1, Math.ceil(c[1] + rr + 1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - c[0]) / ppm, dy = -(y + 0.5 - c[1]) / ppm; // meters in view plane
        let depth, nx, ny, nz;
        if (!inv) {
          const r = P.r, d2 = dx * dx + dy * dy;
          if (d2 > r * r) continue;
          const dz = Math.sqrt(r * r - d2);
          depth = c[2] + dz; nx = dx / r; ny = dy / r; nz = dz / r;
        } else {
          // ray o = (dx,dy,BIG) dir=(0,0,-1) in view; in unit space: q = A*o, dq = A*(0,0,-1)
          const A = inv;
          const ox_ = A[0][0] * dx + A[0][1] * dy, oy_ = A[1][0] * dx + A[1][1] * dy, oz_ = A[2][0] * dx + A[2][1] * dy;
          const dxq = -A[0][2], dyq = -A[1][2], dzq = -A[2][2];
          // solve |o + t*(d)|^2 = 1 where o is at view depth 0 relative to center; t measured along -view
          const a = dxq * dxq + dyq * dyq + dzq * dzq, b = 2 * (ox_ * dxq + oy_ * dyq + oz_ * dzq), cc = ox_ * ox_ + oy_ * oy_ + oz_ * oz_ - 1;
          const disc = b * b - 4 * a * cc;
          if (disc < 0) continue;
          const t = (-b - Math.sqrt(disc)) / (2 * a); // smallest t => most positive view z (toward viewer)
          depth = c[2] - t;
          // unit-space point
          const qx = ox_ + dxq * t, qy = oy_ + dyq * t, qz = oz_ + dzq * t;
          // normal in view space = A^T * q (scaled by 1/r)
          nx = A[0][0] * qx + A[1][0] * qy + A[2][0] * qz;
          ny = A[0][1] * qx + A[1][1] * qy + A[2][1] * qz;
          nz = A[0][2] * qx + A[1][2] * qy + A[2][2] * qz;
          const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
        }
        const idx = y * W + x;
        if (depth > Z[idx]) { Z[idx] = depth; MAT[idx] = mid; SH[idx] = shadeIdx(nx, ny, nz); PT[idx] = pi; if (x < RAS.bx0) RAS.bx0 = x; if (x > RAS.bx1) RAS.bx1 = x; if (y < RAS.by0) RAS.by0 = y; if (y > RAS.by1) RAS.by1 = y; }
      }
    } else { // capsule (projected)
      const a = proj(P.a), b = proj(P.b);
      const r1 = P.r1 * ppm, r2 = P.r2 * ppm, rm = Math.max(r1, r2);
      const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0]) - rm - 1)), x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0]) + rm + 1));
      const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1]) - rm - 1)), y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1]) + rm + 1));
      const ex = b[0] - a[0], ey = b[1] - a[1], el2 = ex * ex + ey * ey || 1e-6;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - a[0], py = y + 0.5 - a[1];
        const t = clamp((px * ex + py * ey) / el2, 0, 1);
        const cx = px - ex * t, cy = py - ey * t;
        const d2 = cx * cx + cy * cy;
        const r = r1 + (r2 - r1) * t;
        if (d2 > r * r) continue;
        const dz = Math.sqrt(r * r - d2);
        const depth = (a[2] + (b[2] - a[2]) * t) + dz / ppm;
        const idx = y * W + x;
        if (depth > Z[idx]) { Z[idx] = depth; MAT[idx] = mid; SH[idx] = shadeIdx(cx / r, -cy / r, dz / r); PT[idx] = pi; if (x < RAS.bx0) RAS.bx0 = x; if (x > RAS.bx1) RAS.bx1 = x; if (y < RAS.by0) RAS.by0 = y; if (y > RAS.by1) RAS.by1 = y; }
      }
    }
  }
}

// draw face features onto output buffer
function drawFace(parts, V, ppm, ox, oy, look, P) {
  const W = RAS.w, H = RAS.h, out = RAS.out, Z = RAS.z, PT = RAS.part;
  let headPi = -1;
  for (let i = 0; i < parts.length; i++) if (parts[i].face && parts[i].g === 'head') { headPi = i; break; }
  if (headPi < 0) return;
  const head = parts[headPi];
  const B = head.B, r = look._body.headR;
  const toV = d => [vdot(d, V.r), vdot(d, V.u), vdot(d, V.v)];
  const hf = toV(B.F);
  if (hf[2] < -0.05) return; // facing away
  const proj = p => [ox + vdot(p, V.r) * ppm, oy - vdot(p, V.u) * ppm, vdot(p, V.v)];
  const rp = r * ppm;
  const put = (x, y, col) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; const pt = PT[i]; if (pt < 0) return; const g = parts[pt].g; if (g !== 'head' && !(parts[pt].face)) return; out[i * 4] = col[0]; out[i * 4 + 1] = col[1]; out[i * 4 + 2] = col[2]; out[i * 4 + 3] = 255; };
  const expr = P.expr || look.expr || 'normal';
  const eyeCol = look._mat.eye.ramp[1], white = [250, 248, 240], dark = [26, 16, 32];
  const ew = Math.max(1, Math.round(rp * 0.15)), eh = Math.max(1, Math.round(rp * 0.24));
  for (const s of [-1, 1]) {
    if (look.eyepatch && ((s > 0) === (look.eyepatch === 'R'))) {
      const d = vnorm(vadd(vadd(B.F, vscale(B.S, s * 0.4)), vscale(B.U, 0.0)));
      const c = proj(vmad(head.c, d, r * 1.0));
      if (toV(d)[2] > 0.1) for (let yy = -eh / 2; yy <= eh / 2; yy++) for (let xx = -ew; xx <= ew; xx++) put(c[0] + xx, c[1] + yy, dark);
      continue;
    }
    const d = vnorm(vadd(vadd(B.F, vscale(B.S, s * 0.42)), vscale(B.U, -0.08)));
    const vd = toV(d);
    if (vd[2] < 0.12) continue;
    const c = proj(vmad(head.c, d, r * 1.0));
    const squash = clamp(vd[2] * 1.3, 0.35, 1);
    const w = Math.max(1, Math.round(ew * squash));
    if (expr === 'ko') {
      for (let k = -1; k <= 1; k++) { put(c[0] + k, c[1] + k, dark); put(c[0] + k, c[1] - k, dark); }
      continue;
    }
    if (expr === 'closed' || look.eyeStyle === 'closed') { for (let xx = 0; xx < w + 1; xx++) put(c[0] - w / 2 + xx, c[1], dark); continue; }
    const ec = look.eyeStyle === 'glow' ? look._mat.gold.ramp[3] : eyeCol;
    for (let yy = 0; yy < eh; yy++) for (let xx = 0; xx < w; xx++) put(c[0] - w / 2 + xx, c[1] - eh / 2 + yy, ec);
    if (eh >= 3 && look.eyeStyle !== 'glow') put(c[0] - w / 2 + (s > 0 ? 0 : w - 1), c[1] - eh / 2, white);
    if (rp >= 9 && look.eyeStyle !== 'glow') { // sclera side
      for (let yy = 1; yy < eh; yy++) put(c[0] + (s > 0 ? -w / 2 - 1 : w / 2), c[1] - eh / 2 + yy, white);
    }
    // brows
    if (rp >= 6 && !look.noBrow) {
      const by = c[1] - eh / 2 - Math.max(1, Math.round(rp * 0.1));
      const slope = expr === 'sad' ? -0.35 : 0.35;
      for (let xx = -1; xx <= w; xx++) { const yy = Math.round(((s > 0 ? xx : (w - 1 - xx))) * slope * -1); put(c[0] - w / 2 + xx, by + yy, look.browCol ? hex2rgb(look.browCol) : dark); }
    }
  }
  // mouth
  const md = vnorm(vadd(B.F, vscale(B.U, -0.42)));
  const mv = toV(md);
  if (mv[2] > 0.15) {
    const c = proj(vmad(head.c, md, r));
    const mw = Math.max(1, Math.round(rp * 0.2));
    if (expr === 'shout' || expr === 'ko') { for (let yy = 0; yy < Math.max(2, Math.round(rp * 0.16)); yy++) for (let xx = 0; xx < mw; xx++) put(c[0] - mw / 2 + xx, c[1] + yy, yy === 0 ? dark : [160, 30, 40]); }
    else if (expr === 'grin') { for (let xx = 0; xx < mw + 1; xx++) put(c[0] - mw / 2 + xx, c[1] + (xx === 0 || xx === mw ? -1 : 0), dark); }
    else for (let xx = 0; xx < mw; xx++) put(c[0] - mw / 2 + xx, c[1], dark);
  }
  if (look.thirdEye) {
    const d = vnorm(vadd(B.F, vscale(B.U, 0.3)));
    if (toV(d)[2] > 0.2) { const c = proj(vmad(head.c, d, r)); put(c[0], c[1], [230, 40, 40]); put(c[0], c[1] - 1, [230, 40, 40]); }
  }
  if (look.facePaint) { // tengu red / kabuki cheek marks
    for (const s of [-1, 1]) { const d = vnorm(vadd(vadd(B.F, vscale(B.S, s * 0.6)), vscale(B.U, -0.3))); if (toV(d)[2] > 0.2) { const c = proj(vmad(head.c, d, r)); put(c[0], c[1], hex2rgb(look.facePaint)); put(c[0] + s, c[1], hex2rgb(look.facePaint)); } }
  }
}

function composite(parts, look) {
  const W = RAS.w, H = RAS.h, MAT = RAS.mat, SH = RAS.sh, Z = RAS.z, PT = RAS.part, out = RAS.out;
  const mats = look._mats;
  const X0 = Math.max(0, RAS.bx0 - 1), X1 = Math.min(W - 1, RAS.bx1 + 1), Y0 = Math.max(0, RAS.by0 - 1), Y1 = Math.min(H - 1, RAS.by1 + 1);
  RAS.prev = { x0: X0, x1: X1, y0: Y0, y1: Y1 };
  if (X1 < X0) return;
  for (let yy = Y0; yy <= Y1; yy++) for (let xx = X0; xx <= X1; xx++) {
    const i = yy * W + xx;
    const m = MAT[i];
    if (m < 0) { out[i * 4 + 3] = 0; continue; }
    const rp = mats[m].ramp;
    let s = SH[i];
    // internal outline: if a neighbor is much closer and different part group, darken this pixel
    const x = xx, y = yy;
    let edge = false;
    const zi = Z[i], gi = parts[PT[i]].g;
    if (x > 0 && MAT[i - 1] >= 0 && Z[i - 1] - zi > 0.06 && parts[PT[i - 1]].g !== gi) edge = true;
    else if (x < W - 1 && MAT[i + 1] >= 0 && Z[i + 1] - zi > 0.06 && parts[PT[i + 1]].g !== gi) edge = true;
    else if (y > 0 && MAT[i - W] >= 0 && Z[i - W] - zi > 0.06 && parts[PT[i - W]].g !== gi) edge = true;
    else if (y < H - 1 && MAT[i + W] >= 0 && Z[i + W] - zi > 0.06 && parts[PT[i + W]].g !== gi) edge = true;
    let c = edge ? rp[0] : rp[s];
    if (edge) c = [c[0] * 0.7, c[1] * 0.7, c[2] * 0.75];
    out[i * 4] = c[0]; out[i * 4 + 1] = c[1]; out[i * 4 + 2] = c[2]; out[i * 4 + 3] = 255;
  }
  // silhouette outline (sel-out)
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const i = y * W + x;
    if (MAT[i] >= 0) continue;
    let nb = -1;
    if (x > 0 && MAT[i - 1] >= 0) nb = i - 1; else if (x < W - 1 && MAT[i + 1] >= 0) nb = i + 1; else if (y > 0 && MAT[i - W] >= 0) nb = i - W; else if (y < H - 1 && MAT[i + W] >= 0) nb = i + W;
    if (nb < 0) continue;
    const oc = mats[MAT[nb]].ramp[4];
    out[i * 4] = oc[0]; out[i * 4 + 1] = oc[1]; out[i * 4 + 2] = oc[2]; out[i * 4 + 3] = 255;
  }
}

// ---------- sprite object ----------
const SPR_EXT = { side: 1.55, top: 2.45, bot: 0.35 };
class PixelSprite {
  constructor(look) {
    this.look = buildLook(look);
    this.tex = null; this.cw = 0; this.ch = 0; this.ppm = 0;
    this.pos = [0, 0, 0]; this.yaw = 0; this.pose = null; this.scale = look.scale || 1;
    this.lastKey = ''; this.visible = true; this.tint = [1, 1, 1, 1]; this.flash = 0; this.lift = 0;
    this.ox = 0; this.oy = 0;
  }
  // compute view basis in local frame from camera vectors
  viewBasis() {
    const toLocal = w => { const r = rotY(w, -this.yaw); return [-r[0], r[1], r[2]]; };
    return { r: toLocal(R.camRight), u: toLocal(R.camUp), v: toLocal(vscale(R.camFwd, -1)) };
  }
  render(ppm, force) {
    const V = this.viewBasis();
    const key = (this.poseKey || '') + '|' + ppm + '|' + Math.round(Math.atan2(V.v[0], V.v[2]) * 12) + '|' + Math.round(V.v[1] * 12);
    if (!force && key === this.lastKey && this.tex) return false;
    this.lastKey = key;
    const s = this.scale;
    const ppmL = ppm; // pixels per meter of local (unscaled) model; world size scaled
    const W = Math.ceil(SPR_EXT.side * 2 * ppmL), H = Math.ceil((SPR_EXT.top + SPR_EXT.bot) * ppmL);
    rasEnsure(W, H);
    const ox = W / 2, oy = H - SPR_EXT.bot * ppmL;
    const J = solveSkeleton(this.pose, this.look);
    const parts = buildParts(J, this.pose, this.look);
    this.J = J;
    rasterParts(parts, V, ppmL, ox, oy);
    composite(parts, this.look);
    drawFace(parts, V, ppmL, ox, oy, this.look, this.pose);
    const gl = R.gl;
    if (!this.tex) this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(RAS.out.buffer, 0, W * H * 4));
    if (!this.texInit) {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.texInit = true;
    }
    this.cw = W; this.ch = H; this.ppm = ppmL;
    this.ox = ox; this.oy = oy;
    return true;
  }
  // world position of a local point (e.g., hand) accounting for scale/yaw
  localToWorld(p) {
    const s = this.scale;
    const w = rotY([-p[0] * s, p[1] * s, p[2] * s], this.yaw);
    return [this.pos[0] + w[0], this.pos[1] + this.lift + w[1], this.pos[2] + w[2]];
  }
}

function drawSprite(sp, env) {
  if (!sp.visible || !sp.tex) return;
  const gl = R.gl, pr = PROG.sprite;
  const s = sp.scale;
  gl.bindTexture(gl.TEXTURE_2D, sp.tex);
  gl.uniform3f(pr.u.uPos, sp.pos[0], sp.pos[1] + sp.lift, sp.pos[2]);
  gl.uniform2f(pr.u.uSize, sp.cw / sp.ppm * s, sp.ch / sp.ppm * s);
  gl.uniform2f(pr.u.uAnchor, 0.5, (sp.ch - sp.oy) / sp.ch);
  gl.uniform4f(pr.u.uUVRect, 0, 0, 1, 1);
  gl.uniform4fv(pr.u.uTint, sp.tint);
  const f = sp.flash;
  gl.uniform3f(pr.u.uFlash, f, f, f);
  gl.uniform3fv(pr.u.uEnv, env || [1, 1, 1]);
  gl.uniform1f(pr.u.uDither, sp.dither ? 1 : 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}
function beginSprites() {
  const gl = R.gl, pr = PROG.sprite;
  gl.useProgram(pr.p);
  gl.uniformMatrix4fv(pr.u.uVP, false, R.vp);
  gl.uniform3fv(pr.u.uRight, R.camRight); gl.uniform3fv(pr.u.uUp, R.camUp);
  gl.uniform1i(pr.u.uTex, 0);
  gl.uniform1f(pr.u.uLit, 0.55);
  glSetLightUniforms(pr);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(R.quadVAO);
}
