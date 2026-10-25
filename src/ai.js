// ===== ai.js : CPU pitching, batting, running =====
const PITCH_TYPES = {
  FB: { name: '直球', v: 1.0, bx: 0.06, by: -0.1 },
  SL: { name: '滑球', v: 0.88, bx: 0.36, by: -0.22 },
  CB: { name: '曲球', v: 0.78, bx: 0.24, by: -0.62 },
  CH: { name: '變速球', v: 0.82, bx: -0.14, by: -0.32 },
  SF: { name: '指叉球', v: 0.88, bx: 0.0, by: -0.58 },
};
function pitchParams(P, typeKey, target, opts = {}) {
  const T = PITCH_TYPES[typeKey];
  const st = P.hero.stats;
  const velo = st.velo || 128;
  const brkF = 0.55 + (st.brk || 4) * 0.065;
  const away = (P.hero.throws === 'L') ? -1 : 1;
  const kmh = velo * T.v * (opts.vMul || rrange(0.97, 1.0));
  const brk = [T.bx * away * brkF, T.by * (typeKey === 'FB' ? 1 : brkF)];
  // control error
  let sig = (0.05 + (10 - (st.ctrl || 5)) * 0.016) * (opts.ctrlMul || 1) * (1 + (1 - P.stamina) * 1.2) * (P.aged ? 1.8 : 1);
  if (P.hero.passive.id === 'perfectAim') sig = 0;
  const tg = [target[0] + gauss() * sig, target[1] + gauss() * sig * 0.8];
  return { target: tg, kmh, brk, type: typeKey, typeName: T.name };
}

const AI = {
  choosePitch(G) {
    const P = G.fld.pos.P, B = G.batter;
    const T = G.fld;
    // special?
    if (!G.isUserDefense() || G.autoAll) {
      if (ABIL.canUse(G, T.side) && (G.strikes === 2 || rand() < 0.35 || G.bat.runs >= T.runs)) ABIL.activate(G, T.side);
    }
    const st = P.hero.stats;
    const arsenal = ['FB', 'FB', 'SL', 'CH'];
    if ((st.brk || 4) >= 7) arsenal.push('CB', 'SL', 'SF');
    else arsenal.push('CB');
    let type = arsenal[Math.floor(rand() * arsenal.length)];
    if (G.balls === 3) type = 'FB';
    // location
    const ahead = G.strikes > G.balls;
    const zc = (ZONE.bot + ZONE.top) / 2;
    let tx, ty;
    const corner = rand() < 0.5;
    if (G.balls >= 3) { tx = rrange(-0.15, 0.15); ty = rrange(zc - 0.18, zc + 0.18); }
    else if (ahead && rand() < 0.55) { tx = (rand() < 0.5 ? -1 : 1) * rrange(0.27, 0.36); ty = rand() < 0.5 ? rrange(0.15, 0.32) : rrange(0.7, 1.0); }
    else if (corner) { tx = (rand() < 0.5 ? -1 : 1) * rrange(0.12, 0.24); ty = rrange(ZONE.bot + 0.05, ZONE.top - 0.05); }
    else { tx = rrange(-0.18, 0.18); ty = rrange(ZONE.bot + 0.08, ZONE.top - 0.1); }
    if (B && B.hero.passive.id === 'tinyZone') ty = clamp(ty, 0.35, 0.8);
    // beanball when killing intent (rare)
    if (rand() < 0.015 && G.fld.gauge > 50) { tx = (B.hero.bats === 'L' ? 0.85 : -0.85); ty = 0.8; }
    return pitchParams(P, type, [tx, ty], { ctrlMul: G.diff.cpuCtrl });
  },
  planSwing(G, p) {
    const B = G.batter, st = B.hero.stats;
    const plate = pitchPos(p, p.T);
    // clone pitch: without true sight the batter times one ball of the pack at random
    let cloneSeen = null;
    if (p.clones && !p.trueSight) { const k = Math.floor(rand() * (p.clones.length + 1)); if (k < p.clones.length) cloneSeen = p.clones[k]; }
    const decoyPlate = cloneSeen ? [plate[0] + cloneSeen.off[0], plate[1] + cloneSeen.off[1], 0] : null;
    const seeTrue = !cloneSeen;
    let locNoise = 0.05 + (10 - st.con) * 0.012 + (p.special ? 0.08 : 0) + Math.abs(p.B[0]) * 0.08;
    const perceived = seeTrue ? plate : decoyPlate;
    const px = perceived[0] + gauss() * locNoise, py = perceived[1] + gauss() * locNoise;
    const sc = B.hero.passive.id === 'tinyZone' ? 0.6 : 1;
    const zc = (ZONE.bot + ZONE.top) / 2;
    const inZone = Math.abs(px) <= ZONE.x * (sc < 1 ? 0.75 : 1) && Math.abs(py - zc) <= (ZONE.top - ZONE.bot) / 2 * sc;
    let pSwing = inZone ? (G.strikes === 2 ? 0.9 : 0.66) : (G.strikes === 2 ? 0.45 : 0.27) - st.con * 0.012;
    if (G.balls === 3 && !inZone) pSwing *= 0.6;
    const armed = G.bat.armed && G.bat.armed.kind === 'bat';
    if (armed) pSwing = inZone ? 1 : 0.6;
    if (rand() > pSwing) return null;
    let sigT = (0.058 + (10 - st.con) * 0.0095) * G.diff.cpuErr * (1 + Math.abs(p.B[1]) * 0.25 + Math.abs(p.B[0]) * 0.2);
    if (p.special) sigT *= 1.7;
    if (W8.fog) sigT *= 1.15;
    if (G.fld.pos.P && G.fld.pos.P.hero.passive.id === 'shiftyRelease') sigT *= 1.2;
    let arrive = p.T;
    if (cloneSeen) arrive = cloneSeen.T;
    const err = gauss() * sigT;
    const angle = clamp(st.pow * 2.0 + (0.62 - py) * 18 + gauss() * 10, -20, 42);
    return { commitT: arrive + err - SWING_LAG, angle, power: 0.95 + st.pow * 0.012 };
  },
  preBatting(G) {
    const side = G.half;
    if (ABIL.canUse(G, side) && (rand() < 0.55 || G.strikes === 2)) ABIL.activate(G, side);
  },
  preRunning(G) {
    // steal attempts by fast runners
    for (const r of FLD.runners) {
      if (r.base >= 3 || r.state !== 'base') continue;
      if (FLD.runners.some(o => o.base === r.base + 1)) continue;
      const sp = r.pl.hero.stats.spd + (r.pl.hero.passive.id === 'wingedFeet' ? 6 : 0);
      if (sp >= 8 && rand() < 0.12 + (sp - 8) * 0.06 && G.outs < 2) { r.stealing = true; }
    }
  },
};
