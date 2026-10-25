// ===== abilities.js : actives (必殺) and passives =====
const PRE_PITCH_BAT = { charm: 1, agingBox: 1, timeSlow: 1, thiefGod: 1, petrify: 1 };
const ABIL = {
  // can this hero's active be used right now?
  canUse(G, side) {
    const T = G.teams[side];
    if (T.gauge < 100 || T.armed) return false;
    const off = G.half === side;
    if (off) { if (!(G.phase === 'pre' || G.phase === 'batterUp')) return false; return !!G.batter && !G.batter.hero.delivery; }
    if (G.phase !== 'pre' && G.phase !== 'batterUp') return false;
    const P = T.pos.P; return !!(P && P.hero.delivery && P.hero.active && !P.ko && P === T.pitcher && T.players[P.id] && ['sunArrow', 'gustBag', 'thunderZig', 'shadowTrick'].includes(P.hero.active.id));
  },
  activeHero(G, side) { return G.half === side ? G.batter : G.teams[side].pos.P; },
  activate(G, side, quality = 1) {
    const T = G.teams[side], O = G.teams[1 - side];
    const hero = this.activeHero(G, side);
    if (!hero) return false;
    const a = hero.hero.active;
    T.gauge = 0; UI.updateGauges();
    T.armed = { id: a.id, kind: G.half === side ? 'bat' : 'pitch', q: quality, by: hero };
    if (MAIN.gaugeCheat) console.log('LOG special', hero.hero.name, a.id);
    if (G.autoAll) UI.specialBanner(hero, a);
    else G.specialCut(hero, a); // camera close-up + cut-in band, the game waits a beat
    SFX.special(hero.side === 0 ? 0 : 1);
    FX.aura(hero, a.id);
    // immediate pre-pitch effects
    const P = G.fld.pos.P;
    switch (a.id) {
      case 'charm': O.armed = null; T.charmNext = true; FX.hearts(P); UI.toast(`${P.hero.name} 被迷住了！`); T.armed = null; break;
      case 'agingBox': if (P) { P.aged = true; P.stamina *= 0.5; FX.smoke(P); UI.toast(`${P.hero.name} 瞬間變老了！`); } T.armed = null; break;
      case 'timeSlow': T.slowNext = true; FX.clock(); T.armed = null; break;
      case 'thiefGod': { const st = O.gauge; O.gauge = 0; T.gaugeAfter = Math.min(100, st); UI.toast(`偷走了 ${Math.round(st)}% 必殺槽！`); T.armed = { id: 'thiefGod', kind: 'bat', by: hero }; setTimeout(() => { G.gauge(T, T.gaugeAfter || 0); }, 600); break; }
      case 'petrify': {
        const fl = fielderList().filter(f => f.fpos !== 'P' && f.fpos !== 'C' && !(f.petrify > 0));
        fl.sort(() => rand() - 0.5);
        const already = fielderList().filter(f => f.petrify > 0).length;
        for (const f of fl.slice(0, Math.max(0, 3 - already))) { f.petrify = 999; FX.stone(f); }
        UI.toast('三名野手被石化了！'); T.armed = null; break;
      }
    }
    return true;
  },
  modifyPitch(p, P, B, G) {
    const T = G.fld, O = G.bat;
    if (O.charmNext) { O.charmNext = false; T.armed = null; p.fn = null; p.shape = null; p.P1 = [rrange(-0.05, 0.05), 0.62, 0]; p.B = [0, -0.08, 0]; p.kmh = 108; p.T = vdist(p.P0, p.P1) / kmh2sim(p.kmh); FX.hearts(P); return; }
    if (T.armed && T.armed.kind === 'pitch') {
      const id = T.armed.id; T.armed = null;
      p.special = id; p.fn = null; p.shape = null; // the magic pitch takes over the drawn path
      const dir = P.hero.throws === 'L' ? -1 : 1;
      if (id === 'sunArrow') { p.kmh = 212; p.B = [0, 0.02, 0]; p.P1 = vcopy(p.P1); }
      if (id === 'thunderZig') {
        p.kmh = 176;
        const P0 = p.P0, P1 = p.P1;
        const W1 = vadd(vlerp(P0, P1, 0.33), [0.95 * dir, 0.3, 0]), W2 = vadd(vlerp(P0, P1, 0.66), [-0.95 * dir, -0.1, 0]);
        p.fn = (s) => { if (s > 1) return null; if (s < 0.33) return vlerp(P0, W1, s / 0.33); if (s < 0.66) return vlerp(W1, W2, (s - 0.33) / 0.33); return vlerp(W2, P1, (s - 0.66) / 0.34); };
      }
      if (id === 'gustBag') {
        const D = [0.6 * (rand() < 0.5 ? -1 : 1), 0.12, 0];
        const base = { P0: p.P0, P1: p.P1, B: [p.B[0] * 0.3, p.B[1] * 0.3, 0], T: 1 };
        p.fn = (s) => { if (s > 1) return null; const b = pitchPos(base, s); const k = smooth((s - 0.28) / 0.07) - 2 * smooth((s - 0.56) / 0.07) + smooth((s - 0.84) / 0.07); return vadd(b, vscale(D, k)); };
        p.kmh *= 0.95;
      }
      p.T = vdist(p.P0, p.P1) / kmh2sim(p.kmh) * (p.fn ? 1.12 : 1);
      if (id === 'shadowTrick') {
        // the ball splits into a pack of look-alikes arriving at slightly different moments; only the real one has a shadow
        const slots = [[-0.34, 0.2], [0.32, 0.24], [-0.26, -0.22], [0.28, -0.2], [0.02, 0.36]].sort(() => rand() - 0.5).slice(0, 4);
        p.clones = slots.map(o => ({ off: [o[0] + gauss() * 0.04, o[1] + gauss() * 0.04], T: p.T * (1 + rrange(-0.1, 0.1)), split: rrange(0.12, 0.22) }));
      }
    }
    if (O.slowNext) { O.slowNext = false; p.T *= 3; p.slowmo = true; if (p.clones) for (const c of p.clones) c.T *= 3; }
    if (B.hero.passive.id === 'trueSight' && p.special) p.trueSight = true;
  },
  modifyContact(ctx, G) {
    const P = ctx.P, B = ctx.B, O = G.bat;
    if (P.hero.passive.id === 'intimidate' && !P.ko) ctx.W *= TUNE.intimidate;
    if (ctx.pitch.special === 'sunArrow') ctx.W *= 0.7;
    if (ctx.pitch.special === 'thunderZig') ctx.W *= 0.85;
    if (ctx.pitch.special === 'shadowTrick' && ctx.pitch.clones && !ctx.pitch.trueSight) { ctx.W *= 0.85; }
    const A = O.armed && O.armed.kind === 'bat' ? O.armed.id : null;
    if (!A) return;
    ctx.ability = A;
    const fanSpray = () => { // gap finder
      let best = 0, bs = 0;
      for (let s = -40; s <= 40; s += 4) {
        const land = [Math.sin(s * DEG) * 60, 0, -Math.cos(s * DEG) * 60];
        let md = 1e9; for (const f of fielderList()) md = Math.min(md, vdistXZ(f.pos, land));
        if (md > best) { best = md; bs = s; }
      }
      return bs;
    };
    switch (A) {
      case 'ruyiStaff': ctx.W *= 3.2; ctx.auto = Math.abs(ctx.dt) < 0.3; ctx.evMul = 1.12; ctx.qMin = 0.78; ctx.noFoul = true; ctx.reach = true; B.sprite.look.batLen = 2.3; setTimeout(() => { B.sprite.look.batLen = 1; }, 900); break;
      case 'giantMallet': ctx.W *= 1.7; ctx.evMul = 1.8; ctx.la = 26 + gauss() * 3; ctx.qMin = 0.72; ctx.noFoul = true; B.giant = 2.6; break;
      case 'thiefGod': ctx.W *= 3; ctx.auto = Math.abs(ctx.dt) < 0.3; ctx.evMul = 0.78; ctx.la = 9; ctx.spray = fanSpray() * 0.6; ctx.qMin = 0.7; ctx.noFoul = true; break;
      case 'gungnir': ctx.W *= 1.6; ctx.qMin = 0.75; ctx.la = 14; ctx.spray = fanSpray(); ctx.evMul = 1.08; ctx.noFoul = true; break;
      case 'rakeGrounder': ctx.W *= 1.7; ctx.la = -5; ctx.evMul = 1.3; ctx.qMin = 0.75; ctx.noFoul = true; ctx.spray = gauss() * 12; break;
      case 'chainLightning': ctx.W *= 1.6; ctx.la = 7; ctx.evMul = 1.38; ctx.qMin = 0.8; ctx.noFoul = true; ctx.spray = gauss() * 18; break;
      case 'rageLiner': ctx.W *= 1.7; ctx.la = 3; ctx.evMul = 1.4; ctx.qMin = 0.85; ctx.spray = 0; ctx.noFoul = true; break;
      case 'skyHigh': ctx.W *= 1.7; ctx.la = 84; ctx.evMul = 1.2; ctx.qMin = 0.8; ctx.noFoul = true; ctx.spray = gauss() * 10; break;
      case 'tornadoFan': ctx.W *= 1.6; ctx.la = 36; ctx.evMul = 1.18; ctx.qMin = 0.75; ctx.noFoul = true; break;
      case 'iaiSplit': ctx.W *= 1.6; ctx.la = 11; ctx.evMul = 1.25; ctx.qMin = 0.8; ctx.noFoul = true; break;
      case 'sunBlind': ctx.W *= 1.5; ctx.qMin = 0.6; ctx.la = 30 + gauss() * 6; ctx.noFoul = true; break;
      case 'quicksand': case 'fireWheels': case 'sumoCharge': case 'invisBall': case 'strategy':
        ctx.W *= 1.5; ctx.qMin = 0.55; ctx.noFoul = true; break;
    }
  },
  onWhiff(G, B, P, p) {
    if (p.special === 'thunderZig') { FX.lightningStrike(B.pos); damage(B, 15, 'pitch', B.pos); }
  },
  onContact(G, B, P, b, ctx) {
    const O = G.bat;
    const A = ctx.ability;
    O.armed = null;
    if (!A) return;
    const br = () => FLD.runners.find(r => r.isBatter);
    FX.onSpecialHit(A, b);
    switch (A) {
      case 'iaiSplit': {
        const ph = new Ball(); ph.pos = vcopy(b.pos);
        const sp = Math.hypot(b.vel[0], b.vel[2]), ang = Math.atan2(b.vel[0], -b.vel[2]) + (rand() < 0.5 ? -1 : 1) * rrange(0.45, 0.7);
        ph.vel = [Math.sin(ang) * sp, b.vel[1], -Math.cos(ang) * sp]; ph.state = 'fly'; ph.liftOn = b.liftOn; ph.phantom = true;
        FLD.phantomBall = ph; b.slash = true; ph.slash = true;
        break;
      }
      case 'tornadoFan': b.tornado = true; FLD.envMul.liftMul = 1.35; break;
      case 'quicksand': FLD.quicksand = 14; FX.sandField(); break;
      case 'rakeGrounder': b.pierce = 4; b.pierceDmg = 28; b.hot = true; break;
      case 'fireWheels': setTimeout(() => { const r = br(); if (r) { r.boost = 3; r.fireTrail = true; } }, 0); break;
      case 'sumoCharge': setTimeout(() => { const r = br(); if (r) { r.noTag = true; r.bowl = true; r.boost = 1.15; } }, 0); break;
      case 'invisBall': b.invisible = true; break;
      case 'skyHigh': b.skyT = 4.2; break;
      case 'strategy': G.strategyDelay = 0.8; setTimeout(() => { for (const r of FLD.runners) if (!r.isBatter && r.state !== 'out') { r.dir = 1; r.tgt = r.base + 1; r.state = 'run'; r.wait = null; r.extra = true; } }, 0); break;
      case 'rageLiner': b.rage = P; break;
      case 'sunBlind': b.sunBlind = true; b.glow = [1, 0.9, 0.5]; break;
      case 'chainLightning': b.pierce = 3; b.pierceDmg = 18; b.chain = true; b.glow = [0.6, 0.8, 1]; break;
      case 'giantMallet': break;
    }
  },
  // per-frame special ball behaviors during play
  update(dt) {
    const b = FLD.ball;
    if (b.tornado && b.state === 'fly') { const t = b.flightT; b.wind = [Math.sin(t * 3.1) * 7, 0, Math.cos(t * 2.2) * 3]; }
    if (b.skyT > 0) {
      b.skyT -= dt;
      if (b.pos[1] > 40 || b.skyT < 3.5) { b.visible = false; b.pos[1] = Math.max(b.pos[1], 60); b.vel = [0, 0, 0]; b.liftOn = false; b.gravMul = 0; }
      if (b.skyT <= 0) {
        b.gravMul = 1; b.visible = true;
        const ang = rrange(-0.7, 0.7), r = rrange(25, 85);
        b.pos = [Math.sin(ang) * r, 55, -Math.cos(ang) * r]; b.vel = [0, -22, 0];
        FLD.predT = 0; assignDefense(true);
        FX.text3d(vadd(b.pos, [0, -50, 0]), '從天而降!', '#ffd25a');
      }
    }
    if (b.rage && b.state === 'fly') {
      const P = b.rage;
      if (vdist(b.pos, vadd(P.pos, [0, 0.8, 0])) < 1.4) {
        damage(P, 45, 'hit', P.pos); knockback(P, vnorm([b.vel[0], 0, b.vel[2]]), 7);
        FX.burst(b.pos, [1, 0.5, 0.3], 30); SFX.thud(); POST.flash = 0.4;
        const ang = rrange(-0.6, 0.6);
        b.vel = [Math.sin(ang) * 26, 9, -Math.cos(ang) * 26]; b.rage = null; FLD.predT = 0; assignDefense(true);
      }
    }
    if (b.chain && (b.state === 'fly' || b.state === 'loose')) {
      for (const f of fielderList()) { if (f.zapped) continue; if (vdist(b.pos, vadd(f.pos, [0, 0.8, 0])) < 3.2) { f.zapped = true; damage(f, 24, 'zap', f.pos); f.stun = 2.2; FX.zap(b.pos, vadd(f.pos, [0, 0.9, 0])); } }
    }
    if (b.invisible && (b.state === 'fly') && !b.revealed) { for (const f of fielderList()) if (f.task && f.task.k === 'chase' && !f.invDelay) { f.invDelay = true; f.stun = Math.max(f.stun, 0.9); } }
    // phantom ball
    const ph = FLD.phantomBall;
    if (ph && !ph.dead) {
      ballStep(ph, dt, FLD.envMul);
      if (ph.landed && ph.state === 'fly') ph.state = 'loose';
      if (ph.stopped || ph.hr || ph.dead) { FX.burst(ph.pos, [0.8, 0.9, 1], 16); FLD.phantomBall = null; }
      else {
        // nearest non-chasing fielder chases it
        let best = null, bd = 1e9;
        for (const f of fielderList()) { if (f.hasBall || (f.task && f.task.k === 'chase')) continue; const d = vdistXZ(f.pos, ph.pos); if (d < bd) { bd = d; best = f; } }
        if (best) { moveToward(best, ph.pos, best.runSpeed, dt, 0.5); best.setAnim('run'); if (bd < 1.2 && ph.pos[1] < 2.2) { FX.burst(ph.pos, [0.8, 0.9, 1], 18); FX.text3d(ph.pos, '假球!', '#c8e0ff'); FLD.phantomBall = null; } }
      }
    }
  },
};
