// ===== anim.js : procedural poses =====
// pose fields: root yaw pitch roll cYaw hYaw hPitch hRoll hR hL eR eL fR fL kR kL fdR fdL bat glove ball expr wing capeSwing
function lerpPose(a, b, t) {
  const o = {};
  for (const k in a) {
    const va = a[k], vb = b[k];
    if (vb === undefined) { o[k] = va; continue; }
    if (typeof va === 'number') o[k] = va + (vb - va) * t;
    else if (Array.isArray(va)) o[k] = va.map((x, i) => x + (vb[i] - x) * t);
    else if (k === 'bat' && va && vb) o[k] = { hand: t < 0.5 ? va.hand : vb.hand, dir: vnorm(va.dir.map((x, i) => x + (vb.dir[i] - x) * t)) };
    else o[k] = t < 0.5 ? va : vb;
  }
  for (const k in b) if (!(k in a)) o[k] = b[k];
  return o;
}
function keyPose(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i], [t1, p1, ease] = keys[i + 1];
    if (t <= t1) { let u = (t - t0) / (t1 - t0 || 1); u = ease === 'lin' ? u : ease === 'in' ? easeIn(u) : ease === 'out' ? easeOut(u) : smooth(u); return lerpPose(p0, p1, u); }
  }
  return keys[keys.length - 1][1];
}
const mirrorV = v => v ? [-v[0], v[1], v[2]] : v;
function mirrorPose(p) {
  const o = Object.assign({}, p);
  o.yaw = -(p.yaw || 0); o.cYaw = -(p.cYaw || 0); o.hYaw = -(p.hYaw || 0); o.roll = -(p.roll || 0); o.hRoll = -(p.hRoll || 0);
  o.root = mirrorV(p.root);
  o.hR = mirrorV(p.hL); o.hL = mirrorV(p.hR); o.eR = mirrorV(p.eL); o.eL = mirrorV(p.eR);
  o.fR = mirrorV(p.fL); o.fL = mirrorV(p.fR); o.kR = mirrorV(p.kL); o.kL = mirrorV(p.kR); o.fdR = mirrorV(p.fdL); o.fdL = mirrorV(p.fdR);
  if (p.bat) o.bat = { hand: p.bat.hand === 'R' ? 'L' : p.bat.hand === 'L' ? 'R' : 'both', dir: mirrorV(p.bat.dir) };
  if (p.glove) o.glove = p.glove === 'R' ? 'L' : 'R';
  o.ball = mirrorV(p.ball);
  return o;
}

const POSE = {
  stand(t = 0) {
    const b = Math.sin(t * 3) * 0.006;
    return { root: [0, 0.43 + b, 0], hR: [0.21, 0.24 + b, 0.03], hL: [-0.21, 0.24 + b, 0.03], fR: [0.1, 0.05, 0], fL: [-0.1, 0.05, 0] };
  },
  ready(t = 0, glove = 'L') {
    const b = Math.sin(t * 4) * 0.008;
    return { root: [0, 0.34 + b, 0], pitch: 0.32, hR: [0.12, 0.27, 0.24], hL: [-0.12, 0.27, 0.24], fR: [0.17, 0.05, 0.02], fL: [-0.17, 0.05, 0.02], glove, kR: [0.3, 0.3, 0.6], kL: [-0.3, 0.3, 0.6] };
  },
  run(phase, glove, speed = 1) {
    const s = Math.sin(phase), c = Math.cos(phase);
    const lift = 0.1 * speed;
    const st = 0.17 * speed;
    const bob = Math.abs(Math.cos(phase)) * 0.03 * speed;
    return {
      root: [0, 0.4 + bob, 0], pitch: 0.28 * speed,
      fR: [0.09, 0.05 + Math.max(0, -c) * lift, s * st], fL: [-0.09, 0.05 + Math.max(0, c) * lift, -s * st],
      hR: [0.17, 0.42 + Math.max(0, s) * 0.08, -s * 0.18 + 0.05], hL: [-0.17, 0.42 + Math.max(0, -s) * 0.08, s * 0.18 + 0.05],
      eR: [0.3, 0.3, -0.4], eL: [-0.3, 0.3, -0.4], glove,
    };
  },
  squat(t = 0, glove = 'L') { // catcher
    const b = Math.sin(t * 3) * 0.005;
    return { root: [0, 0.22 + b, -0.04], pitch: 0.18, fR: [0.2, 0.05, 0.05], fL: [-0.2, 0.05, 0.05], kR: [0.5, 0.4, 0.5], kL: [-0.5, 0.4, 0.5], hR: [0.12, 0.42, 0.12], hL: [-0.08, 0.5, 0.28], glove };
  },
  sumo(t = 0, glove = 'L') { // deep sumo squat
    const b = Math.sin(t * 3) * 0.005;
    return { root: [0, 0.2 + b, 0], pitch: 0.1, fR: [0.28, 0.05, 0.02], fL: [-0.28, 0.05, 0.02], kR: [0.8, 0.35, 0.25], kL: [-0.8, 0.35, 0.25], hR: [0.22, 0.36, 0.14], hL: [-0.1, 0.48, 0.3], glove };
  },
  catchAt(target, glove = 'L') { // target in local coords
    const p = POSE.ready(0, glove);
    const reach = vsub(target, [0, 0.5, 0]);
    const h = [clamp(target[0], -0.35, 0.35), clamp(target[1], 0.15, 0.95), clamp(target[2], 0.05, 0.4)];
    if (glove === 'L') p.hL = h; else p.hR = h;
    p.root = [clamp(reach[0] * 0.3, -0.15, 0.15), clamp(0.34 + (target[1] - 0.5) * 0.25, 0.25, 0.45), 0];
    p.pitch = target[1] < 0.3 ? 0.55 : 0.2;
    return p;
  },
  jumpCatch(glove = 'L') { return { root: [0, 0.45, 0], pitch: -0.1, fR: [0.1, 0.0, -0.05], fL: [-0.08, 0.12, 0.1], hR: [0.18, 0.5, 0.05], hL: [-0.12, 1.05, 0.12], glove, kL: [-0.2, 0.3, 0.6] }; },
  dive(glove = 'L', side = -1) { return { root: [side * 0.15, 0.18, 0], roll: -side * 1.2, pitch: 0.6, hL: [-0.45 * -side, 0.25, 0.4], hR: [0.1, 0.3, 0.2], fR: [0.25, 0.25, -0.2], fL: [0.1, 0.12, -0.25], glove }; },
  throwPose(t, glove = 'L', armSlot = 1) { // right-handed thrower facing +f (target)
    const keys = [
      [0, { root: [0, 0.4, 0], yaw: 0.0, cYaw: 0, hR: [0.08, 0.5, 0.18], hL: [-0.06, 0.5, 0.2], fR: [0.12, 0.05, 0], fL: [-0.12, 0.05, 0], glove }],
      [0.4, { root: [0, 0.4, -0.02], yaw: -0.6, cYaw: -0.4, hR: [0.32, 0.6 * armSlot + 0.12, -0.25], hL: [-0.2, 0.55, 0.32], fR: [0.13, 0.05, -0.08], fL: [-0.1, 0.1, 0.22], glove }],
      [0.62, { root: [0, 0.38, 0.06], yaw: 0, cYaw: 0.5, pitch: 0.35, hR: [0.02, 0.5 * armSlot + 0.25, 0.45], hL: [-0.25, 0.3, 0.05], fR: [0.13, 0.12, -0.12], fL: [-0.1, 0.05, 0.25], glove }, 'in'],
      [1, { root: [0, 0.38, 0.08], yaw: 0, cYaw: 0.7, pitch: 0.45, hR: [-0.2, 0.25, 0.25], hL: [-0.25, 0.3, 0.0], fR: [0.05, 0.14, -0.05], fL: [-0.1, 0.05, 0.25], glove }],
    ];
    return keyPose(keys, t);
  },
  hurt(t) { return { root: [0, 0.38, -0.1 * t], pitch: -0.5 * t, hR: [0.3, 0.6, -0.1], hL: [-0.3, 0.6, -0.1], fR: [0.12, 0.08, 0.1], fL: [-0.1, 0.12, 0.15], expr: 'ko' }; },
  lying(t) { return { root: [0, 0.12, 0], pitch: -1.45, hR: [0.35, 0.1, -0.1], hL: [-0.35, 0.1, -0.1], fR: [0.15, 0.08, 0.45], fL: [-0.15, 0.08, 0.42], expr: 'ko', hPitch: -0.2 }; },
  slide(t) { return { root: [0, 0.18, 0], pitch: -1.0, hR: [0.25, 0.45, -0.1], hL: [-0.25, 0.5, -0.05], fR: [0.08, 0.06, 0.55], fL: [-0.08, 0.15, 0.35], kL: [-0.1, 0.5, 0.5] }; },
  cheer(t) { const u = Math.abs(Math.sin(t * 6)); return { root: [0, 0.43 + u * 0.06, 0], hR: [0.18, 0.95 + u * 0.08, 0.05], hL: [-0.18, 0.95 + u * 0.08, 0.05], fR: [0.1, 0.05 + u * 0.05, 0], fL: [-0.1, 0.05 + u * 0.05, 0], expr: 'shout' }; },
  fistPump(t) { const u = Math.abs(Math.sin(t * 5)); return { root: [0, 0.42, 0], hR: [0.12, 0.85 + u * 0.1, 0.12], hL: [-0.2, 0.3, 0.05], fR: [0.12, 0.05, 0], fL: [-0.12, 0.05, 0], expr: 'shout', cYaw: 0.2 }; },
  sad(t) { return { root: [0, 0.4, 0], pitch: 0.35, hPitch: 0.4, hR: [0.15, 0.22, 0.08], hL: [-0.15, 0.22, 0.08], fR: [0.1, 0.05, 0], fL: [-0.1, 0.05, 0], expr: 'sad' }; },
  sit(t) { return { root: [0, 0.3, -0.08], pitch: 0.1, fR: [0.1, 0.05, 0.25], fL: [-0.1, 0.05, 0.25], kR: [0.1, 0.5, 0.8], kL: [-0.1, 0.5, 0.8], hR: [0.14, 0.32, 0.15], hL: [-0.14, 0.32, 0.15] }; },
  // ----- home-plate umpire -----
  umpBase(o) { return Object.assign({ root: [0, 0.43, 0], pitch: 0, roll: 0, cYaw: 0, hPitch: 0, fR: [0.13, 0.05, 0], fL: [-0.13, 0.05, 0], kR: [0.2, 0.25, 0.5], kL: [-0.2, 0.25, 0.5], hR: [0.21, 0.28, 0.04], hL: [-0.21, 0.28, 0.04], eR: [0.5, 0.45, -0.3], eL: [-0.5, 0.45, -0.3] }, o); },
  umpSet(t = 0) { const b = Math.sin(t * 2.5) * 0.004; return POSE.umpBase({ root: [0, 0.3 + b, -0.03], pitch: 0.42, hPitch: -0.32, fR: [0.18, 0.05, 0.03], fL: [-0.18, 0.05, 0.03], kR: [0.5, 0.35, 0.5], kL: [-0.5, 0.35, 0.5], hR: [0.16, 0.31, 0.17], hL: [-0.16, 0.31, 0.17] }); },
  umpStrike(t) {
    const hip = { hL: [-0.2, 0.42, -0.03], eL: [-0.55, 0.5, -0.05] };
    const up = POSE.umpBase(hip);
    const cock = POSE.umpBase(Object.assign({ cYaw: 0.35, hR: [0.2, 0.92, 0.05], eR: [0.45, 0.8, -0.25], expr: 'shout' }, hip));
    const punch = POSE.umpBase(Object.assign({ root: [0.05, 0.42, 0], cYaw: -0.3, roll: -0.1, fR: [0.2, 0.05, 0.02], hR: [0.5, 0.72, 0.1], eR: [0.4, 0.78, -0.3], expr: 'shout' }, hip));
    return keyPose([[0, POSE.umpSet(0)], [0.12, up], [0.24, cock], [0.33, punch, 'out'], [0.9, punch]], t);
  },
  umpK(t) { // strike three: the big punch-out
    const hip = { hL: [-0.2, 0.42, -0.03], eL: [-0.55, 0.5, -0.05] };
    const up = POSE.umpBase(Object.assign({ cYaw: 0.2 }, hip));
    const wind = POSE.umpBase(Object.assign({ root: [0.06, 0.4, 0], cYaw: 0.55, roll: 0.08, fR: [0.3, 0.05, 0.04], hR: [0.12, 1.22, -0.08], eR: [0.4, 0.95, -0.3], expr: 'shout' }, hip));
    const punch = POSE.umpBase(Object.assign({ root: [0.14, 0.36, 0], cYaw: -0.5, roll: -0.22, pitch: 0.12, fR: [0.36, 0.05, 0.06], kR: [0.6, 0.3, 0.5], hR: [0.58, 0.6, 0.16], eR: [0.45, 0.8, -0.3], expr: 'shout' }, hip));
    const recoil = POSE.umpBase(Object.assign({ root: [0.13, 0.37, 0], cYaw: -0.4, roll: -0.18, pitch: 0.1, fR: [0.36, 0.05, 0.06], kR: [0.6, 0.3, 0.5], hR: [0.42, 0.72, 0.08], eR: [0.45, 0.8, -0.3], expr: 'shout' }, hip));
    return keyPose([[0, POSE.umpSet(0)], [0.12, up], [0.26, wind], [0.36, punch, 'out'], [0.48, recoil], [0.58, punch, 'out'], [1.3, punch]], t);
  },
  umpHR(t) { const a = t * 9; return POSE.umpBase({ cYaw: 0.1, hPitch: -0.2, hR: [0.44 + Math.cos(a) * 0.04, 0.92 + Math.sin(a) * 0.05, 0.12], eR: [0.6, 0.8, -0.25], hL: [-0.2, 0.42, -0.03], eL: [-0.55, 0.5, -0.05] }); },
  umpFoul(t) { const u = Math.min(1, t / 0.15); return POSE.umpBase({ hR: [0.22 + u * 0.13, 0.3 + u * 0.66, 0.06 + u * 0.06], hL: [-0.22 - u * 0.13, 0.3 + u * 0.66, 0.06 + u * 0.06], eR: [0.6, 0.8, -0.2], eL: [-0.6, 0.8, -0.2] }); },
  lead(t) { const b = Math.sin(t * 3) * 0.01; return { root: [0, 0.32 + b, 0], pitch: 0.3, fR: [0.2, 0.05, 0], fL: [-0.2, 0.05, 0], hR: [0.2, 0.32, 0.15], hL: [-0.2, 0.32, 0.15], kR: [0.4, 0.3, 0.5], kL: [-0.4, 0.3, 0.5] }; },
};

// ---------- batting: stance + swing (right-handed; mirror for lefties) ----------
// stance params: w (foot spread), crouch, open, hand:[s,u,f], dir:[s,u,f], leg (front leg lift), pend (pendulum), wag, lean, style
function batStance(st, t) {
  const w = st.w || 0.2, cr = st.crouch || 0;
  const root = [0.0, 0.42 - cr * 0.14, 0];
  const p = {
    root, pitch: (st.lean || 0.12), yaw: (st.open || 0) * 0.6 - 0.15, cYaw: -0.25,
    hR: (st.hand || [0.1, 0.72, 0.02]).slice(), hL: vadd(st.hand || [0.1, 0.72, 0.02], [-0.04, -0.03, 0.03]),
    fR: [w * 0.5 + 0.05, 0.05, -0.02], fL: [-w * 0.5 - 0.05, 0.05, 0.03],
    kR: [0.5, 0.3, 0.6], kL: [-0.5, 0.3, 0.6],
    bat: { hand: 'both', dir: st.dir || [0.3, 0.9, -0.3] },
    expr: st.expr || 'normal',
  };
  if (cr > 0.6) { p.kR = [0.9, 0.35, 0.4]; p.kL = [-0.9, 0.35, 0.4]; }
  const wg = st.wag || 0.05;
  const tw = Math.sin(t * (st.wagSpd || 4)) * wg;
  p.bat.dir = vnorm(vadd(p.bat.dir, [tw, 0, tw * 0.6]));
  if (st.leg) { p.fL = [-0.1, 0.05 + st.leg * 0.32, 0.06]; p.kL = [-0.15, 0.6, 0.6]; }
  if (st.pend) { const ph = Math.sin(t * 3.2); p.fL = [-w * 0.5 - 0.05 + ph * 0.06, 0.05 + Math.max(0, ph) * 0.08, 0.03 + ph * 0.07]; }
  if (st.style === 'iai') { p.hR = [0.05, 0.42, 0.12]; p.hL = [-0.08, 0.4, 0.1]; p.bat = { hand: 'both', dir: [0.45, -0.25, -0.85] }; p.pitch = 0.3; p.root[1] = 0.36; }
  if (st.style === 'high') { p.hR = [0.06, 1.02, 0.02]; p.hL = [0.0, 0.98, 0.04]; p.bat = { hand: 'both', dir: [0.1, 0.95, -0.25] }; }
  if (st.style === 'upright') { p.hR = [0.02, 0.62, 0.2]; p.hL = [-0.02, 0.58, 0.2]; p.bat = { hand: 'both', dir: [0.0, 1, 0.05] }; p.cYaw = 0; }
  if (st.style === 'point') { const ph = (t % 4) / 4; if (ph < 0.35) { p.hR = [-0.15, 0.7, 0.25]; p.hL = [-0.1, 0.66, 0.2]; p.bat = { hand: 'R', dir: [-0.85, 0.35, 0.2] }; } }
  if (st.style === 'shoulder') { p.hR = [0.14, 0.78, -0.02]; p.hL = [0.06, 0.74, 0.02]; p.bat = { hand: 'both', dir: [0.55, 0.25, -0.8] }; p.pitch = 0.05; }
  if (st.style === 'open') { p.yaw = 0.7; p.cYaw = -0.4; }
  if (st.style === 'spin') { p.bat = { hand: 'R', dir: vnorm([Math.cos(t * 8), 0.4, Math.sin(t * 8)]) }; }
  if (st.style === 'tiptoe') { p.root[1] = 0.47 + Math.abs(Math.sin(t * 5)) * 0.03; p.fR[1] = 0.09; p.fL[1] = 0.09; }
  if (st.style === 'sumo') { p.root = [0, 0.25, 0]; p.pitch = 0.12; p.kR = [0.9, 0.3, 0.3]; p.kL = [-0.9, 0.3, 0.3]; p.hR = [0.1, 0.6, 0.1]; p.hL = [0.05, 0.57, 0.13]; p.bat = { hand: 'both', dir: [0.35, 0.85, -0.3] }; }
  if (st.style === 'yoke') { p.root = [0, 0.34, 0]; p.pitch = 0.18; p.hR = [0.3, 0.84, -0.08]; p.hL = [-0.3, 0.84, -0.08]; p.bat = { hand: 'R', dir: [-1, 0.04 + Math.sin(t * 2) * 0.03, 0.02] }; p.kR = [0.7, 0.3, 0.4]; p.kL = [-0.7, 0.3, 0.4]; }
  if (st.style === 'fish') { const bob = Math.sin(t * 2.2) * 0.08; p.hR = [0.04, 0.56, 0.2]; p.hL = [0.0, 0.54, 0.22]; p.bat = { hand: 'both', dir: vnorm([-0.35, 0.55 + bob, 0.75]) }; p.cYaw = 0; }
  if (st.style === 'low') { p.root = [0, 0.3, 0]; p.pitch = 0.42; p.hR = [0.12, 0.48, 0.05]; p.hL = [0.08, 0.46, 0.08]; p.bat = { hand: 'both', dir: [0.65, 0.15, -0.75] }; p.kR = [0.6, 0.3, 0.5]; p.kL = [-0.6, 0.3, 0.5]; }
  if (st.style === 'javelin') { p.hR = [0.22, 0.96, -0.1]; p.hL = [-0.26, 0.62, 0.24]; p.bat = { hand: 'R', dir: vnorm([-0.95, 0.12, 0.28]) }; p.cYaw = -0.1; }
  if (st.style === 'charge') { p.pitch = 0.45; p.root = [0, 0.36, 0.03]; p.hR = [0.06, 0.56, 0.14]; p.hL = [0.02, 0.54, 0.16]; p.bat = { hand: 'both', dir: [0.5, 0.6, -0.62] }; }
  if (st.style === 'staff') { p.hR = [-0.04, 0.6, 0.24]; p.hL = [-0.2, 0.3, 0.05]; p.bat = { hand: 'R', dir: [-0.05, -1, 0.04] }; p.pitch = 0.05; p.cYaw = 0.1; }
  if (st.style === 'draw') { p.hR = [0.24, 0.8, -0.06]; p.hL = [-0.36, 0.8, 0.14]; p.bat = { hand: 'R', dir: [0.96, 0.08, -0.2] }; p.cYaw = -0.15; }
  if (st.style === 'snake') { const sw = Math.sin(t * 2.6); p.root = [sw * 0.06, 0.4, 0]; p.roll = sw * 0.16; p.hR = [0.08 + sw * 0.04, 0.62, 0.06]; p.hL = [0.04 + sw * 0.04, 0.6, 0.08]; p.bat = { hand: 'both', dir: vnorm([0.4 + sw * 0.2, 0.75, -0.4]) }; }
  if (st.style === 'smash') { p.hR = [0.12, 1.0, -0.12]; p.hL = [-0.16, 0.62, 0.2]; p.bat = { hand: 'R', dir: vnorm([0.15, 0.35, -0.9]) }; p.pitch = 0.05; }
  return p;
}
// swing: t in [0,1]; contact at t=0.5. variant: upward (-1..1) swing plane
function batSwing(st, t, up = 0) {
  const base = batStance(st, 0);
  const contactH = 0.5 + up * 0.08;
  const iai = st.style === 'iai';
  const keys = [
    [0, base],
    [0.28, Object.assign({}, base, { yaw: base.yaw - 0.1, cYaw: -0.55, pitch: 0.15, roll: 0, fL: [-((st.w || 0.2) * 0.5) - 0.14, 0.1, 0.08], hR: [0.14, 0.74, -0.06], hL: [0.1, 0.71, -0.03], bat: { hand: 'both', dir: vnorm([0.45, 0.75, -0.45]) } })],
    [0.5, { root: [-0.04, 0.37, 0.02], yaw: 0.45, cYaw: 0.45, pitch: 0.2, hR: [-0.02, contactH, 0.24], hL: [-0.06, contactH - 0.02, 0.22], fR: [0.15, 0.06, -0.04], fL: [-0.26, 0.05, 0.12], kR: [0.4, 0.2, 0.7], kL: [-0.5, 0.3, 0.6], bat: { hand: 'both', dir: vnorm([-0.15, up * 0.25 - 0.05, 1]) }, expr: 'shout' }, 'in'],
    [0.66, { root: [-0.05, 0.38, 0.02], yaw: 0.8, cYaw: 0.7, pitch: 0.12, hR: [-0.2, 0.62 + up * 0.1, 0.12], hL: [-0.22, 0.6 + up * 0.1, 0.08], fR: [0.12, 0.08, -0.04], fL: [-0.26, 0.05, 0.12], bat: { hand: 'both', dir: vnorm([-1, 0.2 + up * 0.3, 0.2]) }, expr: 'shout' }, 'out'],
    [1, { root: [-0.05, 0.4, 0], yaw: 0.9, cYaw: 0.75, pitch: 0.05, hR: [-0.18, 0.72, -0.05], hL: [-0.2, 0.7, -0.02], fR: [0.08, 0.12, -0.02], fL: [-0.26, 0.05, 0.12], bat: { hand: 'both', dir: vnorm([0.2, 0.5, -0.9]) }, expr: 'normal' }],
  ];
  if (iai) keys[2][1].bat.dir = vnorm([-0.3, -0.05, 1]);
  return keyPose(keys, t);
}

// ---------- pitching deliveries (right-handed) ----------
// d: {type, kick, stride, slot, twist}
function pitchDelivery(d, t) {
  const kick = d.kick || 0.35, slot = d.slot === undefined ? 1 : d.slot, tw = d.twist || 0;
  const relU = 0.6 + slot * 0.42, relS = 0.32 - slot * 0.22;
  const set = { root: [0, 0.43, 0], yaw: -1.3, cYaw: 0, hR: [0.02, 0.62, 0.16], hL: [-0.02, 0.62, 0.16], fR: [0.08, 0.05, -0.05], fL: [-0.12, 0.05, 0.08], glove: 'L', ball: null };
  const lift = { root: [0, 0.45, -0.02], yaw: -1.45 - tw, cYaw: -0.25 - tw * 0.5, pitch: -0.05, hR: [0.04, 0.78, 0.1], hL: [-0.02, 0.8, 0.12], fR: [0.08, 0.05, -0.04], fL: [-0.06, 0.05 + kick, 0.12], kL: [-0.2, 0.8, 0.6], glove: 'L' };
  const stride = { root: [0, 0.36, 0.1], yaw: -0.9, cYaw: -0.45, pitch: 0.1, hR: [0.42, 0.5 + slot * 0.35, -0.22], hL: [-0.28, 0.55, 0.3], fR: [0.1, 0.05, -0.08], fL: [-0.12, 0.05, 0.42 * (d.stride || 1)], glove: 'L' };
  const rel = { root: [0, 0.34, 0.2], yaw: -0.1, cYaw: 0.35, pitch: 0.45, roll: (1 - slot) * 0.45, hR: [relS, relU * 0.82, 0.42], hL: [-0.3, 0.3, 0.05], fR: [0.12, 0.14, -0.12], fL: [-0.12, 0.05, 0.42 * (d.stride || 1)], glove: 'L', expr: 'shout' };
  const fin = { root: [0, 0.34, 0.28], yaw: 0.2, cYaw: 0.5, pitch: 0.6, hR: [-0.25, 0.22, 0.25], hL: [-0.3, 0.3, -0.05], fR: [0.05, 0.1, 0.1], fL: [-0.12, 0.05, 0.42 * (d.stride || 1)], glove: 'L' };
  if (d.type === 'sub' || d.type === 'mow') { stride.hR = [0.45, 0.25, -0.2]; rel.hR = [0.42, 0.12, 0.3]; rel.pitch = 0.75; rel.root[1] = 0.26; rel.roll = 0.6; fin.hR = [-0.2, 0.35, 0.3]; }
  if (d.type === 'side') { rel.hR = [0.5, 0.45, 0.3]; rel.roll = 0.35; }
  if (d.type === 'tornado') { lift.yaw = -2.6; lift.cYaw = -0.9; lift.hR = [0.05, 1.05, 0.05]; lift.hL = [-0.03, 1.02, 0.08]; }
  if (d.type === 'kick') { lift.fL = [-0.04, 0.6, 0.25]; lift.kL = [-0.1, 1.2, 0.6]; lift.hR = [0.1, 1.05, 0.0]; lift.hL = [-0.05, 1.05, 0.05]; lift.pitch = -0.25; }
  if (d.type === 'bow') { stride.hR = [0.55, 0.62, -0.42]; stride.hL = [-0.45, 0.65, 0.38]; stride.pitch = -0.2; stride.cYaw = -0.8; }
  if (d.type === 'behind') { rel.hR = [-0.18, 0.4, -0.2]; rel.cYaw = 0.9; fin.hR = [-0.35, 0.35, -0.15]; }
  if (d.type === 'axe') { lift.hR = [0.06, 1.15, -0.1]; lift.hL = [0.0, 1.1, -0.05]; lift.pitch = -0.35; rel.pitch = 0.75; rel.hR = [0.15, 0.95, 0.4]; }
  const keys = [[0, set], [0.32, lift], [0.62, stride], [0.78, rel, 'in'], [1, fin, 'out']];
  return keyPose(keys, t);
}
const PITCH_REL_T = 0.78;
