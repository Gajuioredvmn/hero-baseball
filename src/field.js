// ===== field.js : players, fielders, runners =====
const BASES = [[0, 0, 0], [19.4, 0, -19.4], [0, 0, -38.8], [-19.4, 0, -19.4]];
const SEG = 27.43;
const basePos = i => BASES[((i % 4) + 4) % 4];
const DEF_POS = { P: [0, 0.25, -18.25], C: [0, 0, 1.0], '1B': [17.0, 0, -24.5], '2B': [8.5, 0, -34.0], SS: [-8.5, 0, -34.0], '3B': [-17.0, 0, -24.5], LF: [-34, 0, -72], CF: [0, 0, -86], RF: [34, 0, -72] };
const POS_ORDER = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
const BASE_NAMES = ['本壘', '一壘', '二壘', '三壘'];

class Player {
  constructor(hero, side) {
    this.hero = hero; this.side = side; this.id = hero.id;
    this.sprite = new PixelSprite(heroLook(hero));
    this.maxHp = 100 * (hero.passive.id === 'bigHP' ? 1.6 : 1);
    this.hp = this.maxHp; this.ko = false; this.out = false;
    this.pos = [0, 0, 0]; this.yaw = 0; this.vel = [0, 0, 0];
    this.anim = { k: 'stand', t: 0 }; this.animT = 0;
    this.stun = 0; this.petrify = 0; this.slow = 1; this.burn = 0;
    this.task = null; this.fpos = null; this.used = {}; this.revived = false;
    this.stamina = 1; this.pitches = 0; this.aged = false; this.aegis = true;
    this.lift = 0; this.liftV = 0; this.flyVel = null; this.knock = 0;
    this.giant = 0;
  }
  get st() { return this.hero.stats; }
  get runSpeed() {
    let s = 6.6 + this.st.spd * 0.3;
    if (this.hero.passive.id === 'wingedFeet') s *= 1.4;
    return s * this.slow * (W8.slip || 1);
  }
  get throwSpeed() {
    let s = 23 + this.st.arm * 1.7;
    if (this.hero.passive.id === 'cannonArm') s *= 1.35;
    return s;
  }
  get gloveHand() { return this.hero.throws === 'L' ? 'R' : 'L'; }
  setAnim(k, extra) { if (this.anim.k !== k || extra) { this.anim = Object.assign({ k, t: 0 }, extra || {}); } }
}

// ---------- field state ----------
const FLD = {
  fielders: {}, // pos -> Player
  runners: [],  // {pl, base, s, dir, tgt, forced, state, mustReturn, leftBase, wait, cmd}
  ball: new Ball(),
  playT: 0, endT: 0, events: [], outsThisPlay: 0, runsThisPlay: 0,
  throwSel: null, // {holder, deadline}
  catchFly: false, pred: null, predT: 0, envMul: null, quicksand: 0,
};

function fielderList() { return POS_ORDER.map(p => FLD.fielders[p]).filter(f => f && !f.ko); }

function placeDefense() {
  for (const p of POS_ORDER) {
    const f = FLD.fielders[p];
    if (!f) continue;
    f.pos = vcopy(DEF_POS[p]);
    f.task = null; f.vel = [0, 0, 0]; f.hasBall = false; f.lift = 0; f.liftV = 0;
    faceToward(f, p === 'C' ? [0, 0, -18] : [0, 0, 0]);
    f.setAnim(p === 'C' ? (f.hero.stance && f.hero.stance.style === 'sumo' ? 'sumo' : 'squat') : (p === 'P' ? 'stand' : 'ready'));
    f.sprite.visible = true;
  }
}
function faceToward(pl, target) { pl.yaw = Math.atan2(target[0] - pl.pos[0], target[2] - pl.pos[2]); }

// runner world position
function runnerPos(r) {
  const a = basePos(r.base), b = basePos(r.base + 1);
  const t = clamp(r.s / SEG, 0, 1);
  const p = vlerp(a, b, t);
  // slight outward bulge when rounding is ignored
  return p;
}
function forcedTo(r) { // is runner forced to advance (batter + chain)
  if (r.base === 0 && r.isBatter) return true;
  const occ = FLD.runners.filter(o => o.state !== 'out' && o.state !== 'scored' && o !== r);
  // runner at base b is forced if all bases 0..b-? are occupied by runners who must move
  let b = r.base;
  for (let k = b - 1; k >= 0; k--) {
    const behind = occ.find(o => o.base === k && (o.isBatter || o.startBase === k));
    if (!behind) return false;
  }
  return r.startBase === r.base && true;
}

// ---------- play start ----------
function startBallInPlay(contact) {
  FLD.playT = 0; FLD.looseT = 0; FLD.looseLogged = false; FLD.endT = 0; FLD.outsThisPlay = 0; FLD.runsThisPlay = 0; FLD.catchFly = false; FLD.throwSel = null;
  FLD.pred = predictBall(FLD.ball, 10, 1 / 30, FLD.envMul); FLD.predT = 0;
  // runners
  for (const r of FLD.runners) { r.startBase = r.base; r.mustReturn = false; r.cmd = null; r.wait = null; r.leftBase = false; }
  const airCatchable = predictCatchable(FLD.pred);
  const catchT = FLD.catchT || 2;
  const twoOut = G.outs === 2;
  // forced chain
  const occ = [false, false, false, false];
  for (const r of FLD.runners) if (r.state === 'base' || r.state === 'run') occ[r.base] = true;
  for (const r of FLD.runners) {
    if (r.isBatter) { r.forced = true; continue; }
    let f = true; for (let k = r.base - 1; k >= 1; k--) if (!occ[k]) f = false; r.forced = f && occ[1] !== undefined;
    r.forced = forcedChain(r.base, occ);
  }
  for (const r of FLD.runners) {
    if (r.state === 'out' || r.state === 'scored') continue;
    if (r.isBatter) { r.dir = 1; r.tgt = 1; r.state = 'run'; continue; }
    if (r.stealing) { r.dir = 1; r.tgt = r.base + 1; r.state = 'run'; }
    if (airCatchable && !twoOut) { r.wait = clamp((catchT - 1.3) * r.pl.runSpeed * 0.45, 1.0, SEG * 0.4); r.dir = 1; r.tgt = r.base + 1; r.state = 'run'; }
    else if (r.forced || twoOut) { r.dir = 1; r.tgt = r.base + 1; r.state = 'run'; }
    else {
      // non-forced on grounder: advance if ball goes to the opposite side or to the outfield
      const land = FLD.pred[FLD.pred.length - 1].p;
      const deep = Math.hypot(land[0], land[2]) > 40;
      const rightSide = FLD.ball.vel[0] > 0;
      if (deep || (r.base === 2 && rightSide) || r.stealing) { r.dir = 1; r.tgt = r.base + 1; r.state = 'run'; }
      else { r.dir = 0; r.tgt = r.base; }
    }
  }
  assignDefense(true);
}
function forcedChain(base, occ) { for (let k = base - 1; k >= 1; k--) if (!occ[k]) return false; return true; }

function predictCatchable(pred) {
  // can any fielder reach the ball while it's still in the air? (sets FLD.catchT)
  let best = 1e9;
  for (const f of fielderList()) {
    const reach = fielderReach(f);
    for (const pt of pred) {
      if (!pt.air) break;
      if (pt.h > reach.h) continue;
      const d = vdistXZ(f.pos, pt.p);
      if (reactLeft(f) + runTime(d, 0, f.runSpeed * 0.95) <= pt.t + 0.05) { best = Math.min(best, pt.t); break; }
    }
  }
  FLD.catchT = best;
  return best < 1e9;
}
function fielderReach(f) {
  let h = 2.15, r = 0.95;
  if (f.hero.passive.id === 'skyLeap') h = 6.2;
  if (f.hero.passive.id === 'sixArms') r *= 1.4;
  if (f.giant) { h *= 2; r *= 2; }
  return { h, r };
}
function reactTime(f) {
  let t = TUNE.react0 - f.st.fld * TUNE.reactK;
  if (G && G.teams && G.ravensActive(f.side)) t -= TUNE.ravens;
  if (W8.fog) t += 0.12; // thick fog: the ball is hard to pick up
  return Math.max(0.02, t);
}
// time to cover distance d starting at speed v0, accelerating at TUNE.acc up to vmax
function runTime(d, v0, vmax) {
  if (d <= 0) return 0;
  const a = TUNE.acc; v0 = Math.min(Math.max(0, v0), vmax);
  const tA = (vmax - v0) / a, dA = v0 * tA + 0.5 * a * tA * tA;
  if (d <= dA) return (-v0 + Math.sqrt(v0 * v0 + 2 * a * d)) / a;
  return tA + (d - dA) / vmax;
}
function speedToward(f, p) { const dx = p[0] - f.pos[0], dz = p[2] - f.pos[2], L = Math.hypot(dx, dz) || 1; return f.vel ? (f.vel[0] * dx + f.vel[2] * dz) / L : 0; }
// reaction time still remaining in this play (fielders stand still until it has passed)
function reactLeft(f) { return Math.max(0, reactTime(f) - (FLD.playT || 0)); }

// ---------- defense assignment ----------
function assignDefense(initial) {
  const b = FLD.ball;
  const fl = fielderList();
  if (!fl.length) return;
  for (const f of fl) if (!f.hasBall && (!f.task || f.task.k !== 'recv')) f.task = null;
  if (b.state === 'fly' || b.state === 'loose') {
    if (FLD.predT <= 0 || initial) { FLD.pred = predictBall(b, 10, 1 / 30, FLD.envMul); FLD.predT = 0.25; }
    const pred = FLD.pred;
    // best interceptor
    let best = null, bestT = 1e9, bestPt = null;
    for (const f of fl) {
      if (f.stun > 0 || f.petrify > 0 || f.ko) continue;
      const reach = fielderReach(f);
      const rt = reactLeft(f);
      for (const pt of pred) {
        if (pt.air && pt.h > reach.h) continue;
        if (!pt.air && pt.h > 1.2) continue;
        const d = vdistXZ(f.pos, pt.p);
        const tReach = rt + runTime(Math.max(0, d - reach.r * 0.6), speedToward(f, pt.p), f.runSpeed * (b.invisible ? 0.5 : 1));
        if (tReach <= pt.t || pt.stop || pt.out) {
          const tt = Math.max(tReach, pt.t);
          if (tt < bestT) { bestT = tt; best = f; bestPt = pt; }
          break;
        }
      }
    }
    if (!best) { // nobody can intercept in time: nearest to final point
      const last = pred[pred.length - 1];
      let bd = 1e9;
      for (const f of fl) { if (f.stun > 0 || f.petrify > 0) continue; const d = vdistXZ(f.pos, last.p); if (d < bd) { bd = d; best = f; bestPt = last; } }
    }
    if (best) best.task = { k: 'chase', p: vcopy(bestPt.p), t: bestPt.t };
    // backup: second nearest outfielder for deep balls
    const last = pred[pred.length - 1].p;
    if (best && Math.hypot(last[0], last[2]) > 45) {
      let b2 = null, d2 = 1e9;
      for (const f of fl) { if (f === best || !['LF', 'CF', 'RF', 'SS', '2B'].includes(f.fpos)) continue; const d = vdistXZ(f.pos, last); if (d < d2) { d2 = d; b2 = f; } }
      if (b2 && d2 < 45) b2.task = { k: 'backup', p: vadd(vscale(vnorm(vsub(last, best.pos)), -6), last) };
    }
  }
  // base coverage
  coverBases();
}
function coverBases() {
  const F = FLD.fielders;
  const ballX = FLD.ball.pos[0];
  const busy = f => !ableFielder(f) || (f.task && (f.task.k === 'chase' || f.task.k === 'recv')) || f.hasBall;
  const cover = (base, cands) => {
    for (const p of cands) { const f = F[p]; if (!busy(f) && !(f.task && f.task.k === 'cover')) { f.task = { k: 'cover', base }; return f; } }
    return null;
  };
  cover(0, ['C', 'P']);
  cover(1, ['1B', '2B', 'P', 'RF']);
  cover(2, ballX > 0 ? ['SS', '2B', 'CF'] : ['2B', 'SS', 'CF']);
  cover(3, ['3B', 'SS', 'LF']);
}

// ---------- per-frame update ----------
function fieldUpdate(dt) {
  FLD.playT += dt;
  FLD.predT -= dt;
  const b = FLD.ball;
  // ball motion
  if (b.state === 'fly' || b.state === 'loose') {
    ballStep(b, dt, FLD.envMul);
    if (b.landed && b.state === 'fly') { b.state = 'loose'; }
    if (b.hiddenFor > 0) b.hiddenFor -= dt;
  } else if (b.state === 'throw') {
    b.thr.t += dt;
    b.pos = throwPos(b.thr, b.thr.t);
    if (b.thr.t >= b.thr.T) throwArrive();
  } else if (b.state === 'held' && b.holder) {
    const H = b.holder;
    b.pos = H.dive ? vadd(H.pos, [H.dive.ux * 0.55, 0.3, H.dive.uz * 0.55]) : vadd(H.pos, [0, 0.8 + H.lift, 0]);
  }
  // fair/foul decision
  if (b.standsOut && !b.gr) { b.standsOut = false; if (b.fairDecided && b.fair) { b.gr = true; b.dead = false; } else { b.fairDecided = false; decideFoul(b); } }
  if (!b.fairDecided && (b.state === 'fly' || b.state === 'loose')) checkFairFoul(b);
  // fielders
  for (const f of fielderList()) fielderUpdate(f, dt);
  // nobody able is chasing a live ball (chaser knocked out / stunned / petrified): re-plan
  if ((b.state === 'fly' || b.state === 'loose') && FLD.predT <= 0 && !fielderList().some(f => f.task && f.task.k === 'chase' && ableFielder(f))) assignDefense(false);
  // runners
  for (const r of FLD.runners) runnerUpdate(r, dt);
  // throw selection timeout (user)
  if (FLD.throwSel) {
    FLD.throwSel.time -= dt / Math.max(0.05, G.timeScale);
    if (FLD.throwSel.time <= 0) { const h = FLD.throwSel.holder; FLD.throwSel = null; G.timeScale = 1; aiThrow(h, true); }
  }
  // end of play
  checkPlayEnd(dt);
}

function checkFairFoul(b) {
  const p = b.pos;
  const [s, t] = diamondST(p[0], p[2]);
  const fair = isFair(p[0], p[2]);
  if (p[2] > 0.6 && b.state !== 'held') { decideFoul(b); return; }
  if (b.landed && b.firstLand && !b.fairDecided) {
    const [fs, ft] = diamondST(b.firstLand[0], b.firstLand[2]);
    if (fs > SEG || ft > SEG) { if (isFair(b.firstLand[0], b.firstLand[2])) decideFair(b); else decideFoul(b); return; }
  }
  if (b.landed && (s > SEG || t > SEG)) { if (fair) decideFair(b); else decideFoul(b); return; }
  if (b.stopped) { if (fair) decideFair(b); else decideFoul(b); }
}
function decideFair(b) { b.fairDecided = true; b.fair = true; }
function decideFoul(b) {
  b.fairDecided = true; b.fair = false;
  if (!b.caughtFly) { FLD.foul = true; b.dead = true; }
}

function moveToward(pl, target, speed, dt, stopDist = 0.15) {
  const d = vsub(target, pl.pos); d[1] = 0;
  const dist = Math.hypot(d[0], d[2]);
  if (dist < stopDist) { pl.vel = [0, 0, 0]; return true; }
  const v = Math.min(speed, dist / Math.max(dt, 1e-3));
  const step = Math.min(dist, v * dt);
  pl.pos[0] += d[0] / dist * step; pl.pos[2] += d[2] / dist * step;
  pl.pos[1] = groundY(pl.pos[0], pl.pos[2]);
  pl.vel = [d[0] / dist * v, 0, d[2] / dist * v];
  pl.yaw = Math.atan2(d[0], d[2]);
  return dist - step < stopDist;
}

function fielderUpdate(f, dt) {
  if (f.ko) return;
  // jump physics
  if (f.lift > 0 || f.liftV) { f.liftV -= 18 * dt; f.lift += f.liftV * dt; if (f.lift <= 0) { f.lift = 0; f.liftV = 0; } }
  if (f.catchCD > 0) f.catchCD -= dt;
  if (f.stun > 0) { f.stun -= dt; f.setAnim('hurt'); return; }
  if (f.petrify > 0) { f.petrify -= dt; return; }
  const b = FLD.ball;
  const T = f.task;
  const spd = f.runSpeed * (FLD.quicksand > 0 ? 0.4 : 1);
  if (f.dive) { // diving: lunge, try to glove it at full stretch, then get back up
    const D = f.dive; D.t += dt;
    if (D.t < 0.3) { const sp = 2 * D.dist / 0.3 * (1 - D.t / 0.3); f.pos[0] += D.ux * sp * dt; f.pos[2] += D.uz * sp * dt; f.vel = [D.ux * sp, 0, D.uz * sp]; }
    else f.vel = [0, 0, 0];
    if (D.t < 0.42 && !f.hasBall && (b.state === 'fly' || b.state === 'loose') && vdistXZ(f.pos, b.pos) < 1.7 && b.pos[1] < 1.7) attemptCatch(f, b, true);
    if (D.t > (f.hasBall ? 0.7 : 0.95)) { f.dive = null; f.setAnim('ready'); }
    else { f.setAnim('dive', { side: D.side }); return; }
  }
  if (f.hasBall) {
    if (FLD.throwSel && FLD.throwSel.holder === f) { f.setAnim('ready'); return; }
    if (f.runTo !== undefined && f.runTo !== null) {
      const arrived = moveToward(f, basePos(f.runTo), spd, dt, 0.3);
      f.setAnim(arrived ? 'ready' : 'run');
      if (arrived) { f.runTo = null; touchBase(f); }
      return;
    }
    if (f.thinkT > 0) { f.thinkT -= dt; f.setAnim('ready'); return; }
    if (!f.decided) { f.decided = true; decideThrow(f); }
    return;
  }
  if (!T) { // drift back toward position
    const home = DEF_POS[f.fpos];
    if (vdistXZ(f.pos, home) > 1.5 && b.state !== 'none') { moveToward(f, home, spd * 0.5, dt, 1.0); f.setAnim('run'); }
    else { faceToward(f, b.pos); f.setAnim(f.fpos === 'C' ? 'squat' : 'ready'); }
    return;
  }
  if (T.k === 'chase' && b.hr) { faceToward(f, b.pos); f.setAnim('ready'); f.vel = [0, 0, 0]; return; } // watch it go
  if (T.k === 'chase') {
    // refresh intercept point from prediction
    if (FLD.predT <= 0) { assignDefense(false); return; }
    let tgt = T.p;
    const near = vdistXZ(f.pos, b.pos);
    const reach = fielderReach(f);
    const bsp = Math.hypot(b.vel[0], b.vel[2]);
    if ((b.state === 'loose' && (b.stopped || bsp < 4)) || near < 3) tgt = b.pos;
    if (FLD.playT < reactTime(f)) { faceToward(f, b.pos); f.setAnim('ready'); f.vel = [0, 0, 0]; }
    else if (near > reach.r * 0.65) { const v = Math.min(spd, Math.max(0, speedToward(f, tgt)) + TUNE.acc * dt); moveToward(f, tgt, v, dt, 0.15); f.setAnim('run'); }
    else { faceToward(f, b.pos); f.vel = [0, 0, 0]; }
    if (FLD.playT >= reactTime(f) && tryDive(f, b, reach, near)) return;
    // catch attempt
    if (b.state === 'fly' || b.state === 'loose') {
      const dh = b.pos[1] - (f.lift);
      if (near < reach.r && dh < reach.h && dh > -0.3 && !(b.phantom && false)) {
        if (b.state === 'fly' && dh > 2.0 && !f.lift) { f.liftV = Math.sqrt(2 * 18 * Math.max(0.5, dh - 1.5)); f.lift = 0.01; f.setAnim('jump'); return; }
        attemptCatch(f, b);
      } else if (b.state === 'fly' && near < 3.5 && b.pos[1] < 3.5 && b.vel[1] < 0) {
        f.setAnim('catch', { tgt: vcopy(b.pos) });
      }
    }
    return;
  }
  if (T.k === 'backup') { moveToward(f, T.p, spd * 0.8, dt, 1); f.setAnim(vdistXZ(f.pos, T.p) > 1 ? 'run' : 'ready'); return; }
  if (T.k === 'cover' || T.k === 'recv') {
    const bp = basePos(T.base);
    const off = T.base === 0 ? [0, 0, 0.9] : vscale(vnorm(vsub([0, 0, -19], bp)), 0.6);
    const arrived = moveToward(f, vadd(bp, off), spd, dt, 0.25);
    if (arrived) { faceToward(f, b.pos); f.setAnim(f.fpos === 'C' && T.base === 0 ? 'ready' : 'ready'); }
    else f.setAnim('run');
    return;
  }
}

function attemptCatch(f, b, dove) {
  const sp = vlen(b.vel);
  if (f.catchCD > 0) return;
  let p = 0.996 - (10 - f.st.fld) * 0.004 - Math.max(0, sp - 34) * 0.0025;
  if (b.state === 'loose') p += 0.01;
  if (b.sunBlind && b.state === 'fly') p = 0;
  if (b.hot) p -= 0.25;
  if (f.hero.passive.id === 'plateGuard') p = Math.max(p, 0.99);
  if (b.stone) p -= 0.2;
  if (dove) p *= 0.32 + f.st.fld * 0.035; // full-stretch dive: good gloves come up with it more often
  if (b.phantom) { // phantom half shatters on touch
    b.dead = true; b.phantom = false; FX.burst(b.pos, [0.8, 0.9, 1], 18); b.visible = false; b.state = 'none'; FLD.phantomBall = null; f.task = null; return;
  }
  // knock-through balls hurt
  if (b.pierce && sp > 18) {
    damage(f, b.pierceDmg || 30, 'ball', b.pos);
    knockback(f, vnorm(b.vel), 6);
    b.vel = vscale(b.vel, 0.85);
    b.pierce--;
    return;
  }
  if (rand() < p) {
    secureCatch(f, b, dove ? 'dive' : null);
  } else if (dove) { // the dive comes up just short: the ball keeps going
    f.catchCD = 1.2;
    FX.text3d(vadd(f.pos, [0, 1.6, 0]), '差一點！', '#ffd8a8');
  } else {
    // error: deflect
    f.catchCD = 0.6;
    b.vel = [b.vel[0] * -0.25 + gauss() * 2, Math.abs(b.vel[1]) * 0.3 + 1, b.vel[2] * -0.25 + gauss() * 2];
    if (b.state === 'fly') b.landed = true;
    b.state = 'loose'; b.error = true;
    FX.text3d(b.pos, '失誤!', '#ffd25a');
    UI.say(`失誤！${f.hero.name}沒接好，球彈開了！`, 1);
    if (sp > 22) { damage(f, Math.round(sp * 0.5), 'ball', b.pos); }
    FLD.predT = 0; assignDefense(false);
  }
}
// the ball is in the glove (how: null, 'dive', 'rob')
function secureCatch(f, b, how) {
  const fly = b.state === 'fly';
  b.state = 'held'; b.holder = f; f.hasBall = true; f.decided = false; f.thinkT = 0.12 + rand() * 0.1; f.task = null;
  b.touchedByFielder = true;
  if (!b.fairDecided) { if (fly) { /* catch decides nothing until out */ } else { if (isFair(b.pos[0], b.pos[2])) decideFair(b); else decideFoul(b); } }
  f.dove = how || false;
  if (how === 'dive' && f.dive) b.pos = vadd(f.pos, [f.dive.ux * 0.55, 0.3, f.dive.uz * 0.55]);
  if (how && MAIN.debugPlays) console.log('LOG catch ' + how);
  if (fly && !b.landed) {
    b.caughtFly = true; FLD.catchFly = true;
    recordOut(G.batterRunner(), 'fly');
    for (const r of FLD.runners) if (!r.isBatter && r.state !== 'out' && r.state !== 'scored') { if (r.s > 0.01 || r.base !== r.startBase) { r.mustReturn = true; r.dir = -1; r.tgt = r.startBase; r.wait = null; } }
    SFX.mitt(); if (!how) FX.text3d(b.pos, '接殺!', '#ffffff');
  } else SFX.mitt(0.6);
  if (how) { // highlight-reel play
    FX.text3d(vadd(f.pos, [0, 2.6 + f.lift, 0]), how === 'rob' ? '沒收全壘打!!' : '美技!', '#ffe07a', true);
    SFX.cheer(how === 'rob' ? 2.2 : 1.4); ST.cheerTarget = 1;
    if (G && !G.autoAll) { G.slowT = Math.max(G.slowT || 0, how === 'rob' ? 1.3 : 0.9); FX.hitstop = Math.max(FX.hitstop, 0.08); FX.shake = Math.max(FX.shake, 0.3); }
    UI.say(how === 'rob' ? `美技！${f.hero.name}在全壘打牆前高高躍起，沒收了這支全壘打！` : `美技！${f.hero.name}飛身撲接，把球攔了下來！`, 2);
  }
  if (how !== 'dive') f.setAnim(how === 'rob' ? 'jump' : 'catch', { tgt: vcopy(b.pos) });
  G.onFielded(f, fly);
}
// full-stretch dive when the ball is about to get past (fly ball dropping in front, hard grounder going by)
function tryDive(f, b, reach, near) {
  if (f.dive || f.lift > 0 || f.hasBall || f.catchCD > 0 || b.phantom) return false;
  const bsp = Math.hypot(b.vel[0], b.vel[2]);
  let tgt = null;
  const run = f.runSpeed * 0.9;
  if (b.state === 'fly' && b.vel[1] < 0 && b.pos[1] < 1.9) { // about to land: dive if running won't make it
    const tg = b.pos[1] / Math.max(1, -b.vel[1]);
    const lx = b.pos[0] + b.vel[0] * tg, lz = b.pos[2] + b.vel[2] * tg, dl = Math.hypot(f.pos[0] - lx, f.pos[2] - lz);
    if (dl - reach.r > run * tg && dl < reach.r + 2.0) tgt = [lx, 0, lz];
  } else if (b.state === 'loose' && bsp > 8 && b.pos[1] < 1.0) { // hard grounder going past
    const rx = f.pos[0] - b.pos[0], rz = f.pos[2] - b.pos[2], tc = (rx * b.vel[0] + rz * b.vel[2]) / (bsp * bsp);
    if (tc > 0 && tc < 0.32) { const cx = b.pos[0] + b.vel[0] * tc, cz = b.pos[2] + b.vel[2] * tc, dc = Math.hypot(f.pos[0] - cx, f.pos[2] - cz); if (dc - reach.r > run * tc && dc < reach.r + 1.8) tgt = [cx, 0, cz]; }
  }
  if (!tgt) return false;
  const dx = tgt[0] - f.pos[0], dz = tgt[2] - f.pos[2], L = Math.hypot(dx, dz) || 1, ux = dx / L, uz = dz / L;
  const side = f.gloveHand === 'L' ? -1 : 1; // dive toward the glove side
  f.dive = { t: 0, ux, uz, dist: Math.min(L, 2.6), side };
  f.yaw = side < 0 ? Math.atan2(-uz, ux) : Math.atan2(uz, -ux);
  f.setAnim('dive', { side });
  SFX.slide();
  if (MAIN.debugPlays) console.log('LOG dive ' + b.state);
  if (G && !G.autoAll) G.slowT = Math.max(G.slowT || 0, 0.5);
  return true;
}
// a home run that barely clears the wall can be robbed by a leaping fielder standing there
function tryRobHR(b) {
  if (MAIN.debugPlays) { let nd = 1e9, nf = null; for (const f of fielderList()) { const d = vdistXZ(f.pos, b.pos); if (d < nd) { nd = d; nf = f; } } console.log('LOG hrnear ' + nd.toFixed(1) + ' h ' + b.pos[1].toFixed(1) + ' ' + (nf && nf.fpos) + ' t ' + FLD.playT.toFixed(1)); }
  if (!G || G.phase !== 'play' || b.pos[1] > FIELD.fenceH + 1.7) return false;
  let best = null, bd = 3.2;
  for (const f of fielderList()) { if (!ableFielder(f) || f.hasBall) continue; const d = vdistXZ(f.pos, b.pos); if (d < bd) { bd = d; best = f; } }
  if (!best) return false;
  if (MAIN.debugPlays) console.log('LOG robtry ' + best.hero.name + ' ' + b.pos[1].toFixed(1));
  const p = 0.22 + best.st.fld * 0.03 + (best.hero.passive.id === 'skyLeap' ? 0.3 : 0);
  best.liftV = Math.sqrt(2 * 18 * Math.max(0.4, b.pos[1] - 2.0)); best.lift = 0.01; best.setAnim('jump');
  { const dx = b.pos[0] - best.pos[0], dz = b.pos[2] - best.pos[2], L = Math.hypot(dx, dz) || 1, go = Math.max(0, L - 0.8); best.flyVel = [dx / L * go * 3, 0, dz / L * go * 3]; best.yaw = Math.atan2(dx, dz); } // lunge at the wall
  if (rand() > p) { FX.text3d(vadd(best.pos, [0, 3.4, 0]), '差一點！', '#ffd8a8'); return false; }
  const r = Math.hypot(b.pos[0], b.pos[2]), k = (r - 1.0) / r; // pull it back over the wall into the glove
  b.pos = [b.pos[0] * k, b.pos[1], b.pos[2] * k]; b.vel = [0, 0, 0]; b.hr = false; // not a home run after all
  secureCatch(best, b, 'rob');
  return true;
}

// ---------- throws ----------
function decideThrow(f) {
  const running = FLD.runners.some(r => r.state !== 'out' && r.state !== 'scored' && (r.dir !== 0 || r.mustReturn || r.s > 0.3));
  if (G.isUserDefense() && !G.autoAll && running && G.outs < 3) {
    const opts = throwOptions(f);
    FLD.throwSel = { holder: f, time: 1.6, opts };
    G.timeScale = 0.22;
    UI.showThrowSelect(f, opts);
    return;
  }
  aiThrow(f, false);
}
function throwOptions(f) {
  // returns [{base, margin, runner}]
  const res = [];
  for (let base = 0; base < 4; base++) {
    const tgtBase = base === 0 ? 4 : base;
    let best = null;
    for (const r of FLD.runners) {
      if (r.state === 'out' || r.state === 'scored') continue;
      const goingTo = r.dir >= 0 ? r.base + 1 : r.base;
      const target = r.mustReturn ? r.startBase : goingTo;
      if ((target % 4) !== base && !(target === 4 && base === 0)) continue;
      const rt = runnerTimeTo(r, target);
      const tt = throwTimeTo(f, base);
      const m = rt - tt;
      if (!best || m > best.margin) best = { base, margin: m, runner: r };
    }
    res.push(best || { base, margin: -9, runner: null });
  }
  return res;
}
function runnerTimeTo(r, target) {
  const sp = r.pl.runSpeed;
  if (r.mustReturn) return (r.s) / sp;
  const dist = (target - r.base) * SEG - r.s;
  return Math.max(0, dist) / sp;
}
function throwTimeTo(f, base) {
  const recv = receiverFor(base);
  const bp = basePos(base);
  const d = vdistXZ(f.pos, bp);
  if (d < 3) return d / f.runSpeed;
  const rT = recv ? Math.max(0, vdistXZ(recv.pos, bp) / recv.runSpeed - d / f.throwSpeed) : 1.0;
  return 0.35 + d / f.throwSpeed + Math.max(0, rT * 0.5) + (G.strategyDelay || 0);
}
function ableFielder(f) { return f && !f.ko && !(f.stun > 0) && !(f.petrify > 0); }
function receiverFor(base) {
  for (const f of fielderList()) if (ableFielder(f) && f.task && (f.task.k === 'cover' || f.task.k === 'recv') && f.task.base === base) return f;
  // choose nearest non-busy
  let best = null, bd = 1e9;
  for (const f of fielderList()) { if (f.hasBall || !ableFielder(f)) continue; const d = vdistXZ(f.pos, basePos(base)); if (d < bd) { bd = d; best = f; } }
  return best;
}
function aiThrow(f, fromUser) {
  if (!f.hasBall) return;
  const opts = throwOptions(f);
  // prefer outs: lead runner first
  let pick = null;
  const prio = [0, 3, 2, 1];
  for (const base of prio) { const o = opts[base]; if (o.runner && o.margin > 0.12 && (!pick || base === 0 || o.margin > pick.margin + 0.4)) { if (!pick) pick = o; } }
  if (!pick) {
    // hold the lead runner: throw ahead of most advanced running runner
    let lead = null;
    for (const r of FLD.runners) if (r.state === 'run' && r.dir > 0 && (!lead || r.base > lead.base)) lead = r;
    if (lead) pick = { base: (lead.base + 1) % 4 };
    else pick = { base: -1 };
  }
  doThrow(f, pick.base);
}
function doThrow(f, base) {
  const b = FLD.ball;
  FLD.throwSel = null; G.timeScale = 1; UI.hideThrowSelect();
  if (base < 0) { // return ball to pitcher, end play
    const p = FLD.fielders.P && !FLD.fielders.P.ko ? FLD.fielders.P : null;
    if (p && p !== f && vdistXZ(f.pos, p.pos) > 2) { throwTo(f, p, -1); }
    else { f.hasBall = true; FLD.settle = true; }
    return;
  }
  const bp = basePos(base);
  if (vdistXZ(f.pos, bp) < 4.5) { f.runTo = base; return; }
  let recv = receiverFor(base);
  if (!recv || recv === f) { f.runTo = base; return; }
  recv.task = { k: 'recv', base };
  throwTo(f, recv, base);
}
function throwTo(f, recv, base) {
  const b = FLD.ball;
  f.hasBall = false;
  const target = base >= 0 ? vadd(basePos(base), [0, 1.0, 0]) : vadd(recv.pos, [0, 1.0, 0]);
  const from = vadd(f.pos, [0, 1.3 + f.lift, 0]);
  const T = startThrow(b, from, target, f.throwSpeed, 0.035);
  b.thr.recv = recv; b.thr.base = base; b.thr.delay = G.strategyDelay || 0;
  if (b.thr.delay) b.thr.T += b.thr.delay;
  f.setAnim('throw'); f.yaw = Math.atan2(target[0] - f.pos[0], target[2] - f.pos[2]);
  SFX.whoosh(0.5);
}
function throwArrive() {
  const b = FLD.ball, thr = b.thr, recv = thr.recv;
  if (ableFielder(recv) && vdist(vadd(recv.pos, [0, 1, 0]), thr.to) < 2.6) {
    const p = 0.985 - (10 - recv.st.fld) * 0.006;
    if (rand() < p || recv.hero.passive.id === 'plateGuard') {
      b.state = 'held'; b.holder = recv; recv.hasBall = true; recv.decided = false; recv.thinkT = 0.15; recv.task = null; SFX.mitt(0.7);
      recv.setAnim('catch', { tgt: vcopy(b.pos) });
      if (thr.base >= 0) touchBase(recv, thr.base);
      if (thr.base < 0) FLD.settle = true;
      return;
    }
  }
  // missed throw -> loose ball
  b.state = 'loose'; b.landed = true;
  const dir = vnorm(vsub(thr.to, thr.from));
  b.pos = vcopy(thr.to); b.vel = [dir[0] * 6 + gauss(), 1.5, dir[2] * 6 + gauss()];
  FX.text3d(b.pos, '暴傳!', '#ffd25a');
  FLD.predT = 0; assignDefense(false);
}
// fielder with ball on/near a base: force & tag outs
function touchBase(f, base) {
  if (base === undefined) { let bd = 1e9; for (let i = 0; i < 4; i++) { const d = vdistXZ(f.pos, basePos(i)); if (d < bd) { bd = d; base = i; } } if (bd > 1.6) return; }
  f.onBase = base;
}
function checkTags() {
  const b = FLD.ball;
  if (b.state !== 'held' || !b.holder) return;
  const f = b.holder;
  // base touching
  let onBase = -1;
  for (let i = 0; i < 4; i++) if (vdistXZ(f.pos, basePos(i)) < 1.4) onBase = i;
  for (const r of FLD.runners) {
    if (r.state === 'out' || r.state === 'scored') continue;
    const rp = runnerPos(r);
    // force out / doubled off at base
    if (onBase >= 0) {
      if (r.mustReturn && r.startBase === onBase && (r.s > 0.2 || r.base !== r.startBase)) { recordOut(r, 'double'); continue; }
      const goingTo = (r.base + 1) % 4;
      if (r.forced && !r.mustReturn && goingTo === onBase && r.dir > 0 && r.s < SEG - 0.05) { recordOut(r, 'force'); continue; }
    }
    // tag out: runner off base within reach
    const off = r.s > 0.6 && r.s < SEG - 0.4;
    if (off && vdistXZ(f.pos, rp) < 1.3 && !r.noTag) { recordOut(r, 'tag'); continue; }
  }
}

// ---------- runners ----------
function runnerUpdate(r, dt) {
  if (r.state === 'out' || r.state === 'scored') return;
  const pl = r.pl;
  if (pl.ko) { recordOut(r, 'ko'); return; }
  if (r.delay > 0) { r.delay -= dt; return; }
  if (r.isBatter && !r.dec1 && r.s > SEG * 0.55 && r.base === 0 && !r.mustReturn) {
    r.dec1 = true;
    const b = FLD.ball;
    if (b.state === 'loose' || b.state === 'fly') {
      let ft = 9;
      for (const f of fielderList()) if (f.task && f.task.k === 'chase') { ft = reactTime(f) * 0 + vdistXZ(f.pos, b.pos) / f.runSpeed + 0.5 + vdistXZ(b.pos, basePos(2)) / f.throwSpeed; }
      const myT = (SEG * 2 - r.s) / r.pl.runSpeed;
      if (myT + (G.outs === 2 ? 0.0 : 0.25) < ft) r.goExtra = true;
    }
  }
  const sp = pl.runSpeed * (r.boost || 1);
  let moving = false;
  if (r.mustReturn) {
    if (r.base > r.startBase) { // passed a base already: go back through
      r.s -= sp * dt; moving = true;
      if (r.s <= 0) { r.base--; r.s = SEG; }
    } else {
      r.s -= sp * dt; moving = true;
      if (r.s <= 0) { r.s = 0; r.mustReturn = false; r.dir = 0; r.state = 'base'; r.tagged = true; aiRunnerTagUp(r); }
    }
  } else if (r.dir > 0) {
    const lim = r.wait !== null && r.wait !== undefined ? r.wait : SEG;
    if (r.s < lim) { r.s = Math.min(lim, r.s + sp * dt); moving = true; }
    if (r.s >= SEG - 1e-3) {
      // reached next base
      r.base++; r.s = 0; r.state = 'base'; r.dir = 0; r.wait = null; r.forced = false;
      if (r.slide) { r.slide = false; r.slideT = 0.6; FX.kick(basePos(r.base)[0], basePos(r.base)[2], 10, { ring: 2.2, sc: r.pl.sprite.scale }); }
      if (r.base >= 4) { scoreRun(r); return; }
      onRunnerReachBase(r);
    }
  } else if (r.dir < 0) {
    r.s = Math.max(0, r.s - sp * dt); moving = true;
    if (r.s <= 0) { r.dir = 0; r.state = 'base'; }
  }
  r.moving = moving;
  // slide into a contested base (throw coming, or a fielder with the ball waiting there)
  if (moving && r.dir > 0 && !r.mustReturn && !r.slide && r.s > SEG - 2.6 && !FLD.ball.hr && !(r.isBatter && r.base === 0)) {
    const tb = (r.base + 1) % 4, b = FLD.ball, bp = basePos(tb);
    if ((b.state === 'throw' && b.thr && b.thr.base === tb) || (b.state === 'held' && b.holder && vdistXZ(b.holder.pos, bp) < 6) || (b.state === 'loose' && vdistXZ(b.pos, bp) < 9)) { r.slide = true; SFX.slide(); }
  }
  if (r.mustReturn || r.dir < 0) r.slide = false;
  // position and anim
  const p = runnerPos(r);
  const prev = pl.pos;
  const d = vsub(p, prev);
  if (Math.hypot(d[0], d[2]) > 0.01 && !(r.slideT > 0 && !moving)) pl.yaw = Math.atan2(d[0], d[2]);
  pl.pos = p;
  if (r.slide && moving) pl.setAnim('slide');
  else if (r.slideT > 0 && r.dir === 0 && !r.mustReturn) { r.slideT -= dt; pl.setAnim('slide'); }
  else if (moving) { r.slideT = 0; pl.setAnim('run'); pl.anim.runner = true; }
  else pl.setAnim(r.s > 0.5 ? 'lead' : 'stand');
  // fire trail
  if (r.fireTrail && moving) { FX.fireTrail(vcopy(p)); for (const f of fielderList()) if (vdistXZ(f.pos, p) < 1.2 && !f.burnHit) { f.burnHit = true; damage(f, 18, 'fire', f.pos); knockback(f, vnorm(vsub(f.pos, p)), 4); } }
  if (r.bowl && moving) { for (const f of fielderList()) if (vdistXZ(f.pos, p) < 1.1 && !f.bowled) { f.bowled = true; damage(f, 25, 'hit', f.pos); knockback(f, vnorm(vsub(f.pos, p)), 7); SFX.thud(); } }
}
function onRunnerReachBase(r) {
  // collision check with a fielder holding ball at this base
  const b = FLD.ball;
  if (b.state === 'held' && b.holder && vdistXZ(b.holder.pos, basePos(r.base)) < 1.4 && FLD.playT - (b.holder.gotT || 0) < 0.35) collide(r, b.holder);
  // decide to continue
  aiRunnerContinue(r);
}
function aiRunnerContinue(r) {
  if (FLD.ball.hr) { r.dir = 1; r.tgt = r.base + 1; r.state = 'run'; r.boost = 0.62; return; } // home run trot
  if (r.cmd === 'go') { r.cmd = null; r.dir = 1; r.tgt = r.base + 1; r.state = 'run'; return; }
  if (r.goExtra && !(G.isUserOffense() && r.userHold)) { r.goExtra = false; r.dir = 1; r.tgt = r.base + 1; r.state = 'run'; return; }
  if (r.cmd === 'hold') { r.cmd = null; return; }
  if (G.isUserOffense() && r.userHold) return;
  const b = FLD.ball;
  if (FLD.catchFly && !r.tagged) return;
  if (b.state === 'held' && b.holder && FLD.settle) return;
  const next = r.base + 1;
  const myT = (SEG) / r.pl.runSpeed + 0.15;
  const defT = defenseTimeTo(next % 4);
  const aggress = (G.outs === 2 ? 0.05 : 0.3) + (r.pl.hero.passive.id === 'wingedFeet' ? -0.3 : 0) - (r.extra ? 1 : 0);
  if (G.gazeHold && G.gazeHold === b.holder) return;
  if (myT + aggress < defT) { r.dir = 1; r.tgt = next; r.state = 'run'; }
}
function aiRunnerTagUp(r) {
  if (!FLD.catchFly) return;
  if (G.isUserOffense() && !G.autoAll) return; // user decides via tap
  const next = r.base + 1;
  const myT = SEG / r.pl.runSpeed;
  const defT = defenseTimeTo(next % 4);
  if (G.outs < 3 && myT + 0.5 < defT) { r.dir = 1; r.tgt = next; r.state = 'run'; r.tagged = true; }
}
function defenseTimeTo(base) {
  const b = FLD.ball;
  const bp = basePos(base);
  if (b.state === 'held' && b.holder) return throwTimeTo(b.holder, base);
  if (b.state === 'throw') return Math.max(0, b.thr.T - b.thr.t) + 0.6;
  // loose: nearest fielder to ball
  let best = 1e9;
  for (const f of fielderList()) { const t = reactLeft(f) + runTime(vdistXZ(f.pos, b.pos), speedToward(f, b.pos), f.runSpeed) + 0.4 + vdistXZ(b.pos, bp) / f.throwSpeed; best = Math.min(best, t); }
  return best;
}
function scoreRun(r) {
  r.state = 'scored'; r.pl.sprite.visible = false;
  // a run counts unless it's the 3rd out on a force/batter; checked in game
  G.addRun(r);
}
function recordOut(r, how) {
  if (!r || r.state === 'out' || r.state === 'scored') return;
  r.state = 'out';
  FLD.outsThisPlay++;
  G.addOut(r, how);
  if (how !== 'fly' && how !== 'ko' && how !== 'k') { FX.text3d(vadd(runnerPos(r), [0, 2.2, 0]), '出局!', '#ff6a5a'); SFX.out(); }
  r.pl.setAnim('sad');
}
function collide(r, f) {
  const plateGuard = f.hero.passive.id === 'plateGuard' && r.base === 4;
  const dmgR = plateGuard ? 30 : 15, dmgF = 12;
  damage(r.pl, dmgR, 'hit', r.pl.pos); damage(f, dmgF, 'hit', f.pos);
  FX.burst(vadd(f.pos, [0, 0.8, 0]), [1, 0.9, 0.6], 16); SFX.thud();
  FX.text3d(vadd(f.pos, [0, 2.4, 0]), '衝撞!', '#ffb04a');
}
function knockback(pl, dir, power) {
  pl.flyVel = [dir[0] * power, power * 0.6, dir[2] * power];
  pl.liftV = power * 0.6; pl.lift = 0.05; pl.stun = Math.max(pl.stun, 1.0);
}

// ---------- damage / KO ----------
function damage(pl, amt, kind, at) {
  if (!pl || pl.ko) return 0;
  const P = pl.hero.passive.id;
  if (P === 'heel' && kind !== 'low') { FX.text3d(vadd(pl.pos, [0, 2.2, 0]), '無效!', '#d0e0ff'); return 0; }
  if (P === 'aegis' && pl.aegis) { pl.aegis = false; FX.text3d(vadd(pl.pos, [0, 2.2, 0]), '神盾!', '#ffe08a'); FX.ring(vadd(pl.pos, [0, 0.8, 0]), [1, 0.85, 0.4]); return 0; }
  if (P === 'lionSkin') amt *= 0.5;
  amt = Math.round(amt);
  pl.hp -= amt;
  pl.sprite.flash = 1;
  FX.dmgNum(vadd(pl.pos, [0, 1.9 + pl.lift, 0]), amt);
  G.onDamaged(pl, amt, kind);
  if (pl.hp <= 0) {
    if (P === 'revive' && !pl.revived) { pl.revived = true; pl.hp = Math.round(pl.maxHp * 0.4); FX.text3d(vadd(pl.pos, [0, 2.4, 0]), '妖狐復活!', '#ffd0e8'); FX.ring(vadd(pl.pos, [0, 0.8, 0]), [1, 0.7, 0.9]); return amt; }
    pl.hp = 0; pl.ko = true;
    pl.setAnim('ko');
    G.onKO(pl);
  }
  return amt;
}

// ---------- end of play ----------
function checkPlayEnd(dt) {
  const b = FLD.ball;
  checkTags();
  if (G.outs >= 3) { FLD.endT += dt; if (FLD.endT > 0.8) G.endPlay(); return; }
  if (b.hr || b.gr || (b.dead && !b.phantomOnly)) { FLD.endT += dt; if (FLD.endT > (b.hr ? 2.6 : 0.6)) G.endPlay(); return; }
  const anyMoving = FLD.runners.some(r => r.state !== 'out' && r.state !== 'scored' && (r.dir !== 0 || r.mustReturn || (r.s > 0.01 && r.s < SEG - 0.01)));
  const ballSettled = (b.state === 'held' && b.holder && !FLD.throwSel && (b.holder.decided || FLD.settle) && b.holder.runTo == null) || b.state === 'none';
  if (!anyMoving && ballSettled) { FLD.endT += dt; if (FLD.endT > 0.5) G.endPlay(); }
  else if (!anyMoving && b.state === 'held' && b.holder && b.holder.decided) { FLD.endT += dt; if (FLD.endT > 0.8) G.endPlay(); }
  else FLD.endT = 0;
  // stuck-runner safety: if runners wait mid-path with no action
  for (const r of FLD.runners) {
    if (r.state !== 'run' || r.mustReturn) continue;
    if (r.wait != null && r.s >= r.wait - 0.01) {
      if (FLD.catchFly) { r.mustReturn = true; }
      else if (FLD.ball.landed || FLD.ball.state !== 'fly') {
        r.wait = null;
        if (!r.forced && !r.isBatter) { // not forced: keep going only if it is safe
          const defT = defenseTimeTo((r.base + 1) % 4);
          if ((SEG - r.s) / r.pl.runSpeed + 0.2 > defT) { r.dir = -1; r.tgt = r.base; }
        }
      }
    }
  }
  // safety: a holder that never makes a decision (should not happen) gets nudged
  if (b.state === 'held' && b.holder && !b.holder.decided && !FLD.settle && !FLD.throwSel) {
    FLD.holdT = (FLD.holdT || 0) + dt;
    if (FLD.holdT > 2) {
      FLD.holdT = 0; const h = b.holder;
      if (MAIN.debugPlays) console.log('LOG nudge ' + JSON.stringify({ fpos: h.fpos, has: h.hasBall, ko: h.ko, stun: h.stun, pet: h.petrify, think: h.thinkT, lift: h.lift, liftV: h.liftV, runTo: h.runTo, inList: fielderList().includes(h) }));
      if (h.ko || !fielderList().includes(h)) { b.state = 'loose'; b.holder = null; h.hasBall = false; b.vel = [0, 0.5, 0]; FLD.predT = 0; assignDefense(false); }
      else { h.hasBall = true; h.stun = 0; h.petrify = 0; h.thinkT = 0; h.runTo = null; h.decided = true; decideThrow(h); }
    }
  } else FLD.holdT = 0;
  // safety: a ball loose for too long is picked up by the nearest able fielder
  if (b.state === 'loose') FLD.looseT = (FLD.looseT || 0) + dt; else FLD.looseT = 0;
  if (FLD.looseT > 9) {
    let best = null, bd = 1e9;
    for (const f of fielderList()) { if (!ableFielder(f)) continue; const d = vdistXZ(f.pos, b.pos); if (d < bd) { bd = d; best = f; } }
    if (best && MAIN.debugPlays && !FLD.looseLogged) { FLD.looseLogged = true; const ch = fielderList().filter(f => f.task && f.task.k === 'chase'); console.log('LOG loose5 ' + JSON.stringify({ t: +FLD.playT.toFixed(1), b: [b.pos.map(v => +v.toFixed(1)), b.vel.map(v => +v.toFixed(2)), !!b.stopped, !!b.landed, !!b.wallHit, b.hiddenFor, !!b.invisible], best: [best.fpos, +bd.toFixed(1)], ch: ch.map(f => [f.fpos, f.pos.map(v => +v.toFixed(1)), f.task.p.map(v => +v.toFixed(1)), f.anim.k, f.catchCD, +(f.runSpeed).toFixed(1), f.vel && f.vel.map(v => +v.toFixed(1))]), all: fielderList().map(f => f.fpos + ':' + (f.task ? f.task.k : '-') + ':' + f.pos.map(v => v.toFixed(0)).join(',') + (f.petrify > 0 ? ':PET' : '') + (f.stun > 0 ? ':STUN' : '')) })); }
    if (best) {
      b.vel = [0, 0, 0]; b.stopped = true;
      if (bd < 1.6) { if (MAIN.debugPlays) console.log('LOG grab ' + best.fpos); b.state = 'held'; b.holder = best; best.hasBall = true; best.decided = false; best.thinkT = 0.1; best.task = null; FLD.looseT = 0; }
      else { best.task = { k: 'chase', p: vcopy(b.pos), t: 0 }; }
    }
  }
  // stall breaker: ball settled in a fielder's glove but a runner is frozen between bases
  const frozen = FLD.runners.filter(r => r.state !== 'out' && r.state !== 'scored' && !r.moving && r.s > 0.01 && r.s < SEG - 0.01);
  if (frozen.length && b.state === 'held' && b.holder && b.holder.decided && !FLD.throwSel) {
    FLD.stallT = (FLD.stallT || 0) + dt;
    if (FLD.stallT > 1.5) { FLD.stallT = 0; for (const r of frozen) { r.wait = null; r.mustReturn = false; if (r.s < SEG * 0.5) { r.dir = -1; r.tgt = r.base; } else { r.dir = 1; r.tgt = r.base + 1; } r.state = 'run'; } }
  } else FLD.stallT = 0;
  if (MAIN.debugPlays && FLD.playT > 22 && Math.floor(FLD.playT * 2) !== FLD.lastDbg) {
    FLD.lastDbg = Math.floor(FLD.playT * 2);
    const ch = fielderList().filter(f => f.task && f.task.k === 'chase')[0];
    console.log('LOG dbg ' + JSON.stringify({ t: +FLD.playT.toFixed(2), b: [b.state, b.pos.map(v => +v.toFixed(2)), b.vel.map(v => +v.toFixed(2)), !!b.stopped, !!b.landed, b.hiddenFor, b.dead, b.fairDecided], ch: ch ? [ch.fpos, ch.pos.map(v => +v.toFixed(2)), ch.vel && ch.vel.map(v => +v.toFixed(2)), ch.task.p.map(v => +v.toFixed(2)), ch.anim.k, ch.catchCD, ch.lift, ch.flyVel, ch.knock, ch.slow] : null, others: fielderList().map(f => f.fpos + ':' + (f.task ? f.task.k : '-') + ':' + f.pos.map(v => v.toFixed(1)).join(',')) }));
  }
  if (FLD.playT > 25) { if (MAIN.debugPlays) console.log('LOG longplay ' + JSON.stringify({ ball: [FLD.ball.state, FLD.ball.pos.map(v => +v.toFixed(1)), FLD.ball.holder && FLD.ball.holder.fpos], runners: FLD.runners.map(r => [r.pl.hero.name, r.base, +r.s.toFixed(1), r.dir, r.state, r.mustReturn, r.wait]), sel: !!FLD.throwSel, settle: FLD.settle, fielders: fielderList().map(f => [f.fpos, f.task && f.task.k, f.hasBall, f.decided, f.runTo, f.stun, f.petrify, f.thinkT]), holderInfo: FLD.ball.holder ? [FLD.ball.holder.fpos, FLD.ball.holder.ko, FLD.ball.holder.hasBall, FLD.ball.holder.decided, FLD.ball.holder.hero.name] : null, phase: G.phase, ts: G.timeScale, slow: G.slowmo, holdT: FLD.holdT, settle2: FLD.settle, chaser: fielderList().filter(f => f.task && f.task.k === 'chase').map(f => ({ pos: f.pos.map(v => +v.toFixed(1)), tp: f.task.p.map(v => +v.toFixed(1)), stun: f.stun, pet: f.petrify, cd: f.catchCD, spd: f.runSpeed, lift: f.lift, anim: f.anim.k })), bv: FLD.ball.vel.map(v => +v.toFixed(2)), stopped: FLD.ball.stopped, predT: FLD.predT })); G.endPlay(); }
}
