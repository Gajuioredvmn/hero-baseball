// ===== physics.js : pitches, batted balls, throws =====
const BALL_R = 0.037;
// on-screen pitch speed: hard fastballs play close to real speed, slower pitches are slowed down more,
// so the gap between pitch types and between pitchers stands out
const pitchSpeedScale = kmh => 0.55 + 0.37 * clamp((kmh - 110) / 50, 0, 1);
const kmh2sim = kmh => kmh / 3.6 * pitchSpeedScale(kmh);
// a look-alike ball from Loki's clone pitch: follows the real path on its own clock and drifts off to its own spot
function clonePos(p, c, t) {
  const s = t / c.T, base = pitchPosIn(p, Math.min(1, s)), k = smooth((s - c.split) / 0.45);
  return [base[0] + c.off[0] * k, base[1] + c.off[1] * k, base[2]];
}
const DRAG = 0.0045, LIFT = 0.0012, GRAV = 9.8;
const ZONE = { x: 0.25, bot: 0.3, top: 0.92 };

const diamondST = (x, z) => [(x - z) * 0.70710678, (-x - z) * 0.70710678];

class Ball {
  constructor() { this.reset(); }
  reset() {
    for (const k of Object.keys(this)) delete this[k];
    this.pos = [0, -10, 0]; this.vel = [0, 0, 0]; this.state = 'none'; this.holder = null;
    this.pitch = null; this.thr = null; this.landed = false; this.fair = null; this.hr = false; this.dead = false;
    this.bounces = 0; this.trail = []; this.visible = true; this.carry = 1; this.lastTouch = null; this.firstLand = null;
    this.gr = false; this.stopped = false; this.special = null; this.glow = null; this.hiddenFor = 0; this.phantom = false;
    this.flightT = 0; this.wallHit = false; this.caughtFly = false; this.touchedByFielder = false; this.size = 1;
  }
}

// ---- pitch ----
// p: {P0, P1, B (break vec), T (time to reach z=0), special, fx}
function pitchPosIn(p, s) { // s in [0,1]
  if (p.fn) { const r = p.fn(s, p); if (r) return r; }
  const B = p.B;
  return [p.P0[0] + (p.P1[0] - p.P0[0] - B[0]) * s + B[0] * s * s,
    p.P0[1] + (p.P1[1] - p.P0[1] - B[1]) * s + B[1] * s * s,
    p.P0[2] + (p.P1[2] - p.P0[2] - B[2]) * s + B[2] * s * s];
}
function pitchPos(p, t) {
  const s = t / p.T;
  if (s <= 1) return pitchPosIn(p, Math.max(0, s));
  // continue straight with end velocity
  const v = pitchVel(p);
  const dt = t - p.T;
  const e = pitchPosIn(p, 1);
  return [e[0] + v[0] * dt, Math.max(BALL_R, e[1] + v[1] * dt - 2 * dt * dt), e[2] + v[2] * dt];
}
function pitchVel(p) {
  const a = pitchPosIn(p, 0.98), b = pitchPosIn(p, 1);
  return vscale(vsub(b, a), 1 / (0.02 * p.T));
}
// where does the pitch cross the plate (z=0)?
function pitchPlate(p) { return pitchPos(p, p.T); }

// ---- batted ball integration ----
function ballStep(b, dt, env) {
  const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / sub;
  for (let i = 0; i < sub; i++) {
    const v = b.vel, p = b.pos;
    const sp = Math.hypot(v[0], v[1], v[2]);
    const onGround = p[1] <= groundY(p[0], p[2]) + BALL_R + 0.002 && Math.abs(v[1]) < 0.6;
    if (onGround) {
      // rolling
      const vh = Math.hypot(v[0], v[2]);
      const fair = isFair(p[0], p[2]);
      const mu = ((fair && Math.hypot(p[0], p[2]) > 30) ? 3.6 : 3.0) * (env && env.roll || 1);
      if (vh > 0) { const nv = Math.max(0, vh - mu * h); v[0] *= nv / vh; v[2] *= nv / vh; }
      v[1] = 0; p[1] = groundY(p[0], p[2]) + BALL_R;
      if (vh < 0.25) { v[0] = v[2] = 0; b.stopped = true; }
    } else {
      const k = DRAG * (env && env.dragMul || 1);
      const lift = (b.liftOn ? LIFT : 0) * (env && env.liftMul || 1);
      const vh2 = v[0] * v[0] + v[2] * v[2];
      v[0] += (-k * sp * v[0]) * h;
      v[1] += (-GRAV * (b.gravMul || 1) - k * sp * v[1] + lift * vh2) * h;
      v[2] += (-k * sp * v[2]) * h;
      if (b.wind) { v[0] += b.wind[0] * h; v[2] += b.wind[2] * h; }
      if (env && env.wind && p[1] > 1.5) { v[0] += env.wind[0] * h; v[2] += env.wind[2] * h; } // weather: strong wind
    }
    p[0] += v[0] * h; p[1] += v[1] * h; p[2] += v[2] * h;
    b.flightT += h;
    // ground contact
    const gy = groundY(p[0], p[2]) + BALL_R;
    if (p[1] < gy && v[1] < 0) {
      p[1] = gy;
      const dirt = isDirtAt(p[0], p[2]);
      if (!b.landed) { b.landed = true; b.firstLand = [p[0], 0, p[2]]; ballEvent(b, 'land'); }
      b.bounces++;
      v[1] = -v[1] * (dirt ? 0.48 : 0.4);
      const fr = dirt ? 0.82 : 0.74;
      v[0] *= fr; v[2] *= fr;
      if (Math.abs(v[1]) < 0.9) v[1] = 0;
      ballEvent(b, 'bounce');
    }
    // walls
    const r = Math.hypot(p[0], p[2]);
    const ang = fieldAng(p[0], p[2]);
    const fairZone = Math.abs(ang) <= PI / 4;
    const wr = fairZone ? fenceR(ang) : boundaryR(ang);
    const wh = fairZone ? FIELD.fenceH : (Math.abs(ang) > PI * 0.62 ? 9 : 1.25);
    if (r > wr - BALL_R && !b.hr && !b.dead) {
      if (p[1] < wh) {
        const n = [p[0] / r, 0, p[2] / r];
        const vn = vdot(v, n);
        if (vn > 0) {
          v[0] -= n[0] * vn * 1.35; v[2] -= n[2] * vn * 1.35; v[0] *= 0.8; v[2] *= 0.8;
          p[0] = n[0] * (wr - BALL_R - 0.01); p[2] = n[2] * (wr - BALL_R - 0.01);
          b.wallHit = true; ballEvent(b, 'wall');
        }
      } else {
        if (fairZone && !b.landed) { b.hr = true; ballEvent(b, 'hr'); }
        else if (fairZone && b.landed) { b.gr = true; ballEvent(b, 'groundRule'); }
        else { b.dead = true; b.standsOut = true; ballEvent(b, 'stands'); }
      }
    }
    if (r > wr + 25 || p[1] < -5) { b.dead = true; }
  }
}
function isDirtAt(x, z) {
  const d = Math.hypot(x, z), dr = Math.hypot(x, z + 18.44);
  const [s, t] = diamondST(x, z);
  const inGrass = s > 1 && t > 1 && s < 26.4 && t < 26.4;
  if (dr < 2.74 || d < 4) return true;
  if (dr < 29 && -z > Math.abs(x) - 2.5 && !inGrass) return true;
  return false;
}
let ballEvent = () => { };

// predict future path of a batted ball (copy)
function predictBall(b, maxT = 9, dt = 1 / 30, env) {
  const c = new Ball();
  c.pos = vcopy(b.pos); c.vel = vcopy(b.vel); c.liftOn = b.liftOn; c.landed = b.landed; c.gravMul = b.gravMul; c.wind = b.wind; c.flightT = b.flightT;
  const saveEv = ballEvent; ballEvent = () => { };
  const pts = [];
  let t = 0;
  while (t < maxT) {
    pts.push({ t, p: vcopy(c.pos), air: !c.landed, h: c.pos[1] });
    ballStep(c, dt, env);
    t += dt;
    if (c.hr || c.dead || c.gr) { pts.push({ t, p: vcopy(c.pos), air: !c.landed, h: c.pos[1], out: true }); break; }
    if (c.stopped) { pts.push({ t, p: vcopy(c.pos), air: false, h: c.pos[1], stop: true }); break; }
  }
  ballEvent = saveEv;
  return pts;
}

// does this batted ball leave the park? (used for presentation only)
function predictHR(b, env) {
  const c = new Ball();
  c.pos = vcopy(b.pos); c.vel = vcopy(b.vel); c.liftOn = b.liftOn; c.gravMul = b.gravMul; c.wind = b.wind; c.flightT = 0;
  const saveEv = ballEvent; ballEvent = () => { };
  let hr = false;
  for (let i = 0; i < 600; i++) { ballStep(c, 1 / 60, env); if (c.hr) { hr = true; break; } if (c.landed || c.dead || c.gr || c.stopped || c.wallHit) break; }
  ballEvent = saveEv;
  return hr;
}
// how far a home run would carry if the stands were not in the way
function hrDistance(b, env) {
  const c = new Ball();
  c.pos = vcopy(b.pos); c.vel = vcopy(b.vel); c.liftOn = b.liftOn; c.gravMul = b.gravMul; c.wind = b.wind; c.hr = true;
  const saveEv = ballEvent; ballEvent = () => { };
  for (let i = 0; i < 900 && !(c.pos[1] < 1 && c.vel[1] < 0); i++) ballStep(c, 1 / 60, env);
  ballEvent = saveEv;
  return Math.hypot(c.pos[0], c.pos[2]);
}

// ---- throws ----
function startThrow(b, from, to, speed, arcK = 0.04) {
  const d = vdist(from, to);
  const T = Math.max(0.22, d / speed);
  b.state = 'throw';
  b.thr = { from: vcopy(from), to: vcopy(to), T, t: 0, h: d * arcK };
  b.pos = vcopy(from);
  b.holder = null;
  return T;
}
function throwPos(thr, t) {
  const s = clamp(t / thr.T, 0, 1);
  const p = vlerp(thr.from, thr.to, s);
  p[1] += 4 * thr.h * s * (1 - s);
  return p;
}
