// ===== game.js : rules, flow, at-bats =====
const TUNE = { intimidate: 0.94, ravens: 0.06, react0: 0.28, reactK: 0.012, acc: 8, spraySign: 1 };
const SWING_LAG = 0.1;   // seconds from swing commit to bat reaching the zone
const DIFF = { easy: { win: 1.55, cpuErr: 1.35, cpuCtrl: 1.3 }, normal: { win: 1.15, cpuErr: 1.0, cpuCtrl: 1.0 }, hard: { win: 0.9, cpuErr: 0.8, cpuCtrl: 0.85 } };

let G = null;
const lineDur = s => clamp(1.3 + s.length * 0.09, 2.3, 3.8); // how long a line of dialogue stays up
const OUTS_TXT = ['無人出局', '一出局', '兩出局', '三出局'];

function makeTeam(meta, side) {
  const L = LINEUP[meta.id];
  const T = { meta, side, players: {}, order: [], idx: 0, bench: [], pos: {}, gauge: 0, line: [], runs: 0, hits: 0, kos: 0, errors: 0, armed: null, rp: null, rpUsed: false };
  for (const h of HEROES.filter(h => h.team === meta.id)) T.players[h.id] = new Player(h, side);
  T.order = L.order.map(id => T.players[id]);
  T.pitcher = T.players[L.sp];
  T.rp = T.players[L.rp];
  T.bench = L.bench.map(id => T.players[id]);
  T.pos.P = T.pitcher;
  for (const p of T.order) { const pos = p.hero.pos; if (pos !== 'DH') { T.pos[pos] = p; p.fpos = pos; } }
  T.pitcher.fpos = 'P';
  return T;
}

function newGame(opts) {
  const userSide = opts.userTeam === 'E' ? (opts.userBatsFirst ? 0 : 1) : (opts.userBatsFirst ? 0 : 1);
  const away = opts.userBatsFirst ? opts.userTeam : (opts.userTeam === 'E' ? 'W' : 'E');
  const home = away === 'E' ? 'W' : 'E';
  const teams = [makeTeam(away === 'E' ? TEAM_E : TEAM_W, 0), makeTeam(home === 'E' ? TEAM_E : TEAM_W, 1)];
  G = {
    teams, user: opts.cpuOnly ? -1 : (teams[0].meta.id === opts.userTeam ? 0 : 1), autoAll: !!opts.cpuOnly,
    diff: DIFF[opts.diff || 'normal'], diffName: opts.diff || 'normal',
    innings: opts.innings || 3, inning: 1, half: 0, outs: 0, balls: 0, strikes: 0,
    phase: 'halfStart', phaseT: 0, timeScale: 1, slowmo: 1,
    batter: null, batterRun: null, pitch: null, swing: null, aiSwing: null, aiPitchT: 0, result: null,
    playRuns: [], playLog: [], over: false, winner: -1, camMode: 'intro', msgQueue: [], koLog: [], hrCount: 0,
    strategyDelay: 0, gazeHold: null, rewindUsed: {}, rivalsDone: {}, clutchSeen: {}, cut: null, clutch: null,
    get bat() { return this.teams[this.half]; }, get fld() { return this.teams[1 - this.half]; },
  };
  Object.assign(G, GAME_API);
  G.ump = new Player(UMP_HERO, -1); G.ump.pos = [0.12, 0, 2.3]; G.ump.yaw = PI; G.ump.setAnim('stand');
  G.slowT = 0; G.camHold = 0; G.launchCam = 0; G.camPrev = null;
  FLD.ball.reset(); FLD.runners = [];
  drawScoreboard(G);
  return G;
}

const GAME_API = {
  isUserOffense() { return !this.autoAll && this.half === this.user; },
  isUserDefense() { return !this.autoAll && this.half !== this.user; },
  ravensActive(side) { const T = this.teams[side]; return Object.values(T.pos).some(p => p && !p.ko && p.hero.passive.id === 'ravens'); },
  batterRunner() { return FLD.runners.find(r => r.isBatter); },
  setPhase(p) { this.phase = p; this.phaseT = 0; },

  // ---------------- update ----------------
  update(dtReal) {
    // cinematic cut playing: the game waits, everybody keeps breathing
    if (this.cut) {
      for (const T of this.teams) for (const id in T.players) animatePlayer(T.players[id], dtReal);
      if (this.ump) animatePlayer(this.ump, dtReal);
      this.uCut(dtReal);
      return;
    }
    // cinematic timers run on real (hitstop-scaled) time
    if (this.camHold > 0) this.camHold -= dtReal;
    if (this.launchCam > 0) this.launchCam -= dtReal;
    if (this.introT > 0) { this.introT -= dtReal; if (this.introT <= 0) UI.hideIntro(); }
    if (this.slowT > 0) { this.slowT -= dtReal; this.slowmo = this.slowT <= 0 ? 1 : this.slowT < 0.4 ? lerp(1, 0.3, this.slowT / 0.4) : 0.3; }
    const dt = dtReal * this.timeScale * this.slowmo;
    this.phaseT += dt;
    for (const T of this.teams) for (const id in T.players) animatePlayer(T.players[id], dt);
    if (this.ump) {
      const U = this.ump;
      if (this.phase === 'play' && FLD.ball.state !== 'none' && !/^ump/.test(U.anim.k)) { const b = FLD.ball; const want = Math.atan2(b.pos[0] - U.pos[0], b.pos[2] - U.pos[2]); let d = want - U.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); U.yaw += d * Math.min(1, dt * 6); }
      else if (this.phase !== 'play') U.yaw = PI;
      animatePlayer(U, dt);
    }
    if (FLD.quicksand > 0) FLD.quicksand -= dt;
    switch (this.phase) {
      case 'halfStart': return this.uHalfStart(dt);
      case 'batterUp': return this.uBatterUp(dt);
      case 'pre': return this.uPre(dt);
      case 'windup': return this.uWindup(dt);
      case 'flight': return this.uFlight(dt);
      case 'aim': return this.uAim(dtReal);
      case 'play': fieldUpdate(dt); return;
      case 'result': return this.uResult(dt);
      case 'halfEnd': return this.uHalfEnd(dt);
      case 'gameOver': return;
    }
  },

  uHalfStart(dt) {
    if (this.phaseT === dt || this.phaseT <= dt + 1e-6) {
      FLD.fielders = this.fld.pos; FLD.runners = []; FLD.ball.reset();
      this.outs = 0; this.balls = 0; this.strikes = 0;
      for (const T of this.teams) for (const id in T.players) { const p = T.players[id]; p.sprite.visible = false; p.task = null; p.hasBall = false; p.aegis = true; }
      placeDefense();
      // healer passive
      for (const T of this.teams) for (const id in T.players) { const p = T.players[id]; if (p.hero.passive.id === 'healer' && !p.ko && isActive(T, p)) for (const k in T.players) { const q = T.players[k]; if (!q.ko) q.hp = Math.min(q.maxHp, q.hp + 10); } }
      this.camMode = 'overview';
      UI.banner(`${this.inning}局${this.half ? '下' : '上'}`, `${this.bat.meta.name} 進攻`, this.bat.meta.color, 1.7);
      SFX.horn();
      UI.say(`${this.inning}局${this.half ? '下' : '上'}，${this.bat.meta.name}進攻。` + (this.inning > 1 || this.half ? `比數 ${this.scoreLine()}` : `比賽開始！`), 1);
      this.rollWeather();
      if (!this.autoAll) MUSIC.play(this.bat.meta.id);
      this.fld.line[this.inning - 1] = this.fld.line[this.inning - 1] || 0;
      this.bat.line[this.inning - 1] = this.bat.line[this.inning - 1] || 0;
      drawScoreboard(this);
      UI.updateHud();
    }
    if (this.phaseT > 1.9) this.setPhase('batterUp');
  },

  nextBatter() {
    const T = this.bat;
    for (let k = 0; k < 9; k++) {
      const p = T.order[T.idx % 9]; T.idx = (T.idx + 1) % 9;
      if (p && !p.ko) return p;
    }
    return null;
  },
  uBatterUp(dt) {
    if (this.phaseT <= dt + 1e-6) {
      const T = this.bat;
      const b = this.nextBatter();
      if (!b) { this.endGameKO(this.half); return; }
      this.batter = b; this.balls = 0; this.strikes = 0;
      this.clearStatus();
      if (T.armed && T.armed.kind === 'bat') { T.armed = null; T.gauge = 100; UI.updateGauges(); }
      const L = b.hero.bats === 'L';
      b.pos = [L ? 0.95 : -0.95, 0, 0.08]; b.yaw = L ? -PI / 2 : PI / 2;
      b.sprite.visible = true; b.setAnim('bat'); b.out = false;
      this.hideIdleBatters();
      if (this.ump) { this.ump.pos = [L ? -0.48 : 0.48, 0, 2.25]; this.ump.yaw = PI; this.ump.setAnim('stand'); }
      // pitcher on mound
      const P = this.fld.pos.P; P.pos = vcopy(DEF_POS.P); P.yaw = 0; P.setAnim('pstand');
      this.camMode = this.isUserOffense() ? 'bat' : (this.isUserDefense() ? 'pitch' : 'bat');
      UI.batterCard(b, P);
      UI.updateHud();
      // ---- story beats: rival showdown, awakening ----
      for (const T2 of this.teams) for (const id in T2.players) T2.players[id].awake = false;
      this.clutch = null; if (!this.autoAll) MUSIC.clutch(false);
      const shots = [];
      const rv = this.rivalFor(P, b);
      this.rival = rv;
      if (rv) {
        this.rivalsDone[rv.key] = true;
        this.gauge(this.teams[0], 20); this.gauge(this.teams[1], 20);
        shots.push({ kind: 'vs', p: P, b, theme: rv.theme, dur: 2.1, sfx: () => { SFX.rival(); MUSIC.duck(1.6); } },
          { kind: 'face', who: P, line: rv.lp, dur: lineDur(rv.lp) },
          { kind: 'bat', who: b, line: rv.lb, dur: lineDur(rv.lb) });
        UI.say(`宿敵對決！${P.hero.name}對上${b.hero.name}，雙方必殺槽 +20%`, 2);
      }
      if (b.awakeNext) {
        const why = b.awakeNext; b.awakeNext = null; b.awake = true;
        const pool = AWAKE_LINES[why.kind], line = pool[Math.floor(rand() * pool.length)].replace('{n}', why.n || '');
        shots.push({ kind: 'bat', who: b, line, stamp: '覺醒', dur: lineDur(line) + 0.3, sfx: () => { SFX.awaken(); FX.awaken(b); } });
        UI.say(`${b.hero.name}覺醒了！這個打席力量與擊球時機都提升`, 2);
      }
      if (MAIN.debug && (rv || b.awake)) console.log('LOG story', rv ? rv.key : '', b.awake ? 'awake ' + b.hero.name : '');
      if (shots.length && !this.autoAll) this.startCut(shots);
      // at-bat intro: front close-up of the batter with name and batting style (tap to skip)
      else if (!this.autoAll) { this.introT = 1.7; UI.intro(b, T); UI.say(this.batterLine(b), 0); }
    }
    if (this.phaseT > 1.0 && !(this.introT > 0)) { this.setPhase('pre'); this.aiPitchT = 0.8 + rand() * 0.9; this.checkClutch('start'); }
  },
  skipIntro() { if (this.introT > 0) { this.introT = 0; UI.hideIntro(); } },
  scoreLine() { const [a, h] = this.teams; return `${a.meta.short} ${a.runs}：${h.runs} ${h.meta.short}`; },
  contactLine(B, la, spray, ev, hr) {
    const nm = B.hero.name;
    if (hr) return `${nm}擊中了！這一球很高、很遠——！`;
    const dir = spray < -28 ? '左外野' : spray < -10 ? '左中間' : spray <= 10 ? '中外野' : spray <= 28 ? '右中間' : '右外野';
    const gdir = spray < -14 ? '三游間' : spray < 0 ? '游擊方向' : spray <= 14 ? '二壘方向' : '一二壘間';
    if (la < 8) return `${nm}打成${ev > 38 ? '強勁的' : ''}滾地球，往${gdir}！`;
    if (la < 24) return `${nm}${ev > 40 ? '一記強勁的' : '擊出'}平飛球，往${dir}飛去！`;
    if (la > 55) return `${nm}打成高高的內野飛球……`;
    return `${nm}擊出高飛球，往${dir}！`;
  },
  // weather for the half inning: from the 2nd half inning on, 25% of the time
  rollWeather() {
    const first = this.inning === 1 && this.half === 0;
    let kind = null;
    if (!first && rand() < 0.25) { const r = rand(); kind = r < 0.3 ? 'rain' : r < 0.6 ? 'wind' : r < 0.82 ? 'fog' : 'storm'; }
    if (MAIN.forceW8 !== undefined) kind = MAIN.forceW8 || null;
    W8set(kind);
    if (!kind) return;
    const W = WEATHER[kind];
    if (!this.autoAll) setTimeout(() => { if (G === this && W8.kind === kind && !this.cut) { UI.banner('天候異變', `${W8label()}：${W8desc()}`, W.chip, 2.3); if (kind === 'storm') SFX.thunder(); else if (kind === 'wind') SFX.wind(); } }, 1900);
    UI.say(`天候異變！${W8label()}，${W8desc()}。`, 2);
  },
  batterLine(b) {
    const T = this.bat, n = T.order.indexOf(b) + 1;
    const on = [1, 2, 3].filter(k => FLD.runners.some(r => r.base === k && r.state !== 'out' && r.state !== 'scored'));
    const bases = on.length === 3 ? '滿壘' : on.length ? on.map(k => '一二三'[k - 1]).join('、') + '壘有人' : '壘上無人';
    return `${OUTS_TXT[this.outs] || ''}${bases}，${n > 0 ? `第${n}棒` : ''}${b.hero.name}上場打擊。`;
  },
  rivalFor(P, B) {
    if (!P || !B) return null;
    for (const r of RIVALS) if (r.p === P.id && r.b === B.id) { const key = r.p + '-' + r.b; if (!this.rivalsDone[key]) return Object.assign({ key }, r); }
    return null;
  },
  // ---------------- cinematic cuts ----------------
  // shot: { kind: 'vs' | 'face' | 'bat' | 'cutin', who, line, stamp, dur, sfx }
  startCut(shots, done) {
    if (this.autoAll || !shots || !shots.length) { if (done) done(); return false; }
    this.skipIntro();
    this.cut = { shots, i: 0, t: 0, done };
    UI.cutShot(shots[0]); if (shots[0].sfx) shots[0].sfx();
    return true;
  },
  advanceCut(all) {
    const c = this.cut; if (!c) return;
    if (!all && !UI.cutTypeDone()) { UI.cutFinishType(); return; }
    c.i++; c.t = 0;
    if (all || c.i >= c.shots.length) {
      this.cut = null; UI.cutEnd();
      if (c.done) c.done();
      if (this.deferredPitch) { const prm = this.deferredPitch; this.deferredPitch = null; this.beginPitch(prm); }
      return;
    }
    const s = c.shots[c.i]; UI.cutShot(s); if (s.sfx) s.sfx();
  },
  uCut(dt) {
    const c = this.cut, s = c.shots[c.i];
    c.t += dt;
    if (c.t >= (s.dur || 2.4)) { UI.cutFinishType(); this.advanceCut(); }
  },
  // special move cut-in (replaces the old banner); pauses the game for a beat
  specialCut(pl, a) {
    UI.say(`${pl.hero.name}發動${pl.hero.delivery && pl === this.fld.pos.P ? '魔球' : '必殺技'}「${a.name}」！`, 2);
    if (this.autoAll) return;
    this.startCut([{ kind: 'cutin', who: pl, dur: 2.0, sfx: () => { FX.cutinFx(pl); } }]);
  },
  // 關鍵時刻: bases loaded / last inning, behind (or tied at home) / two outs, full count
  checkClutch(when) {
    if (this.clutch) return;
    const T = this.bat, O = this.fld, key = this.inning + '-' + this.half;
    const on = k => FLD.runners.some(r => r.base === k && r.state !== 'out' && r.state !== 'scored');
    let why = null, id = null;
    if (when === 'count') { if (this.outs === 2 && this.balls === 3 && this.strikes === 2) { why = '兩出局・滿球數'; id = 'full' + key + '-' + T.idx; } }
    else if (on(1) && on(2) && on(3)) { why = '滿壘！'; id = 'loaded' + key; }
    else if (this.inning >= this.innings && ((T.runs < O.runs && O.runs - T.runs <= 3) || (this.half === 1 && T.runs === O.runs))) { why = T.runs < O.runs ? `最終局・落後 ${O.runs - T.runs} 分` : '最終局・同分'; id = 'last' + key; }
    if (!why || this.clutchSeen[id]) return;
    this.clutchSeen[id] = true;
    this.clutch = { why };
    if (this.autoAll) return;
    const show = () => { if (!G || G !== this) return; UI.banner('關鍵時刻', why, '#ff5a3a', 1.9); SFX.taiko(); SFX.cheer(1.4); ST.cheerTarget = 1; MUSIC.clutch(true); };
    if (when === 'count') setTimeout(show, 950); else show();
    UI.say(`關鍵時刻！${why}，${this.batter.hero.name}站上打擊區，全場沸騰！`, 2);
  },
  // put-out batters / runners walk off: only the batter and the runners stay on the field
  hideIdleBatters() {
    const T = this.bat;
    const onBase = new Set(FLD.runners.filter(r => r.state !== 'out' && r.state !== 'scored').map(r => r.pl));
    for (const id in T.players) { const p = T.players[id]; if (p !== this.batter && !onBase.has(p)) p.sprite.visible = false; }
  },

  // ---------------- pre-pitch ----------------
  uPre(dt) {
    const P = this.fld.pos.P;
    if (!P || P.ko) { this.replacePitcher(); return; }
    P.setAnim('pstand');
    if (this.phaseT <= dt + 1e-6) {
      if (MAIN.gaugeCheat) { for (const T of this.teams) T.gauge = 100; }
      UI.prePitch();
      if (!this.isUserOffense()) AI.preBatting(this);
      if (!this.isUserDefense()) AI.preRunning(this);
    }
    if (!this.isUserDefense() && !this.padOpen) {
      this.aiPitchT -= dt;
      if (this.aiPitchT <= 0) { const prm = AI.choosePitch(this); this.beginPitch(prm); }
    }
  },
  beginPitch(prm) {
    if (this.phase !== 'pre') return;
    if (this.cut) { this.deferredPitch = prm; return; } // a cut-in is playing: pitch right after it
    this.pendingPitch = prm;
    const P = this.fld.pos.P;
    P.setAnim('pitch'); P.anim.dur = (P.hero.delivery && P.hero.delivery.type === 'tornado') ? 1.25 : 1.05;
    if (this.ump) this.ump.setAnim('umpSet');
    this.pathPreview = null;
    if (prm.shape) {
      const pose = playerPose(P, P.anim.dur * PITCH_REL_T), J = solveSkeleton(pose, P.sprite.look);
      const P0 = P.sprite.localToWorld(P.hero.throws === 'L' ? J.haL : J.haR), P1 = [prm.target[0], prm.target[1], 0];
      this.pathPreview = Array.from({ length: 21 }, (_, i) => { const s = i / 20, o = shapeOffset(prm.shape, s); return [P0[0] + (P1[0] - P0[0]) * s + o[0], P0[1] + (P1[1] - P0[1]) * s + o[1], P0[2] + (P1[2] - P0[2]) * s]; });
    }
    this.setPhase('windup');
    UI.hidePitchUI();
    // steals take off
    for (const r of FLD.runners) if (r.stealing) { r.dir = 1; r.tgt = r.base + 1; r.state = 'run'; r.stealStart = true; }
  },
  uWindup(dt) {
    const P = this.fld.pos.P;
    // runners on steal move
    for (const r of FLD.runners) if (r.stealing) runnerUpdate(r, dt);
    if (P.anim.t >= P.anim.dur * PITCH_REL_T) this.releasePitch();
  },
  releasePitch() {
    const P = this.fld.pos.P, B = this.batter;
    const prm = this.pendingPitch;
    // release point from hand
    const pose = playerPose(P, P.anim.dur * PITCH_REL_T);
    const J = solveSkeleton(pose, P.sprite.look);
    const hand = P.hero.throws === 'L' ? J.haL : J.haR;
    let P0 = P.sprite.localToWorld(hand);
    P0[1] = Math.max(0.6, P0[1]);
    if (P.hero.passive.id === 'shiftyRelease') P0 = vadd(P0, [rrange(-0.5, 0.5), rrange(-0.3, 0.4), 0]);
    let kmh = prm.kmh * (P.aged ? 0.78 : 1) * (0.9 + 0.1 * P.stamina);
    const tgt = vcopy(prm.target);
    const p = { P0, P1: [tgt[0], tgt[1], 0], B: [prm.brk[0], prm.brk[1], 0], kmh, special: prm.special || null, type: prm.type };
    if (prm.shape) { // the user's drawn path: straight line plus the drawn bends
      const sh = prm.shape, A0 = vcopy(P0), A1 = vcopy(p.P1);
      p.shape = sh;
      p.fn = (s) => { if (s > 1) return null; const o = shapeOffset(sh, s); return [A0[0] + (A1[0] - A0[0]) * s + o[0], Math.max(0.06, A0[1] + (A1[1] - A0[1]) * s + o[1]), A0[2] + (A1[2] - A0[2]) * s]; };
      const pk = a => a.reduce((m, v) => Math.abs(v) > Math.abs(m) ? v : m, 0);
      p.B = [pk(sh.ox), pk(sh.oy), 0]; // how much it moves (makes it harder for the CPU batter)
    }
    p.T = vdist(P0, p.P1) / kmh2sim(kmh);
    ABIL.modifyPitch(p, P, B, this);
    p.t = 0;
    this.pitch = p;
    const b = FLD.ball; b.reset(); b.state = 'pitch'; b.pos = vcopy(P0); b.special = p.special;
    P.pitches++; P.stamina = Math.max(0, P.stamina - 1 / (P.hero.stats.sta || 60) * (prm.effort || 1));
    this.swing = null;
    this.setPhase('flight');
    SFX.whoosh(0.6 + kmh / 400);
    FX.onPitchRelease(p, P0);
    // only CPU batters get a swing plan (a leftover plan used to make the user's batter swing by itself)
    this.aiSwing = this.isUserOffense() ? null : AI.planSwing(this, p);
    if (this.isUserOffense()) UI.hideHint(); // keep the zone clear while the ball is coming
  },

  // ---------------- flight ----------------
  uFlight(dt) {
    const p = this.pitch, b = FLD.ball;
    p.t += dt;
    b.pos = pitchPos(p, p.t);
    for (const r of FLD.runners) if (r.stealing) runnerUpdate(r, dt);
    // AI swing commit
    if (this.aiSwing && !this.swing && p.t >= this.aiSwing.commitT) this.doSwing(this.aiSwing);
    // contact moment
    if (this.swing && !this.swing.done && p.t >= this.swing.contactT) { this.swing.done = true; if (this.resolveContact()) return; }
    // HBP check near batter plane
    const B = this.batter;
    if (!p.hbpChecked && b.pos[2] > B.pos[2] - 0.05) {
      p.hbpChecked = true;
      const dx = Math.abs(b.pos[0] - B.pos[0]) / (B.sprite.scale || 1);
      if (dx < 0.3 && b.pos[1] < 1.3 * (B.sprite.scale || 1) && !(this.swing && this.swing.done && this.swing.hit)) { this.hitByPitch(); return; }
    }
    // reached catcher
    if (b.pos[2] >= 0.95 || p.t > p.T + 0.5) this.callPitch();
  },
  doSwing(sw) {
    if (this.swing || this.phase !== 'flight' && this.phase !== 'windup') return;
    const p = this.pitch;
    const t0 = this.phase === 'flight' ? Math.max(0, p.t - (sw.early || 0)) : -0.05;
    // the player's press IS the moment of contact (what you see is what you hit); CPU swings still take the bat's travel time
    this.swing = { commitT: t0, contactT: t0 + (sw.user ? 0 : SWING_LAG * (sw.lagMul || 1)), angle: sw.angle, power: sw.power, user: !!sw.user };
    const B = this.batter;
    B.setAnim('swing', { dur: 0.36, up: clamp(sw.angle / 45, -1, 1), pre: batterLoadAmt(B) });
    SFX.swing();
  },
  resolveContact() {
    const p = this.pitch, B = this.batter, P = this.fld.pos.P, b = FLD.ball;
    const plate = pitchPos(p, p.T);
    const dtT = this.swing.contactT - p.T; // + late
    let W = 0.062 * this.diff.win * (this.swing.user ? 1.2 : 1) * (0.85 + B.st.con * 0.032);
    const ctx = { W, dt: dtT, plate, power: this.swing.power, angle: this.swing.angle, B, P, pitch: p, auto: false, reach: true };
    ABIL.modifyContact(ctx, this);
    if (B.awake) ctx.W *= 1.12; // awakened batter: a wider timing window
    W = ctx.W;
    let dtE = ctx.dt;
    // reach check
    const L = B.hero.bats === 'L';
    const user = this.swing.user;
    // the user's bat locks onto the ball: strike or ball, only the timing decides (CPU batters still struggle with bad pitches)
    if (!user && !ctx.auto && (Math.abs(plate[0]) > 0.72 || plate[1] < 0.05 || plate[1] > 1.45)) ctx.reach = false;
    if (ctx.auto) dtE = clamp(dtE, -W * 0.5, W * 0.5);
    const lim = W * 1.75;
    if (this.swing.user) UI.timing(ctx.reach ? dtE : null, W);
    if (!ctx.reach || Math.abs(dtE) > lim) { this.swing.hit = false; ABIL.onWhiff(this, B, P, p); return false; }
    // contact!
    let q = 1 - Math.abs(dtE) / lim;
    if (!user) q = clamp(q * (1 - Math.max(0, Math.abs(plate[0]) - 0.3) * 0.9) * (1 - Math.max(0, plate[1] - 1.0) * 0.8) * (1 - Math.max(0, 0.3 - plate[1]) * 1.2), 0, 1);
    if (ctx.qMin) q = Math.max(q, ctx.qMin);
    this.swing.hit = true;
    const C = { q, dtE, lim, plate, ctx, hs: L ? -1 : 1 };
    if (this.swing.user) {
      // still holding the screen: slow motion + power bar, slide to aim, let go to hit
      if (INPUT.down && INPUT.mode === 'swing' && !this.swing.released) { this.beginAim(C); return true; }
      // tapped and let go too early: a weak poke, timing decides the direction
      this.launchContact(C, { power: 0.38 });
      if (!this.tapHint || this.tapHint < 3) { this.tapHint = (this.tapHint || 0) + 1; UI.hint('按住不放：打中後滑動瞄準，放開那一刻決定力氣', 2.4); }
      return true;
    }
    this.launchContact(C, null);
    return true;
  },
  // ---------- user batting: aim + power after contact ----------
  beginAim(C) {
    const B = this.batter;
    const SW = sweetOf(B.hero);
    this.aim = { C, t: 0, dx: 0, dy: 0, power: 0, origin: INPUT.last(), speed: SW.spd, sw: SW };
    this.setPhase('aim');
    this.slowmo = 0.05; this.slowT = 0;
    const b = FLD.ball; b.pos = vcopy(C.plate); b.pos[2] = -0.25;
    if (B.anim.k === 'swing') { B.anim.t = (B.anim.dur || 0.36) * 0.5; B.poseKeyRaw = null; } // freeze on the bat meeting the ball
    UI.showPower(true, SW);
    FX.aimStart(vcopy(b.pos), C.q);
    SFX.contactTick(C.q);
  },
  uAim(dtReal) {
    const A = this.aim; if (!A) return;
    A.t += dtReal;
    const k = (A.t * A.speed) % 2;
    A.power = k < 1 ? k : 2 - k; // sweeps 0 -> 1 -> 0 ...
    UI.setPower(A.power);
    if (A.t > 2.4) this.releaseAim(); // finger held too long
  },
  releaseAim() {
    if (this.phase !== 'aim' || !this.aim) return;
    const A = this.aim; this.aim = null;
    UI.showPower(false);
    this.slowmo = 1;
    // the sweet spot is full power; the further off it, the weaker
    const SW = A.sw, d = Math.max(0, Math.abs(A.power - SW.c) - SW.w / 2), sweet = d === 0;
    const eff = sweet ? 1 : clamp(0.85 - d * 1.5, 0.2, 0.85);
    UI.timingWord(sweet ? '甜蜜點！' : d < 0.08 ? '差一點' : '力道偏了', sweet ? 'good' : d < 0.08 ? 'ok' : 'bad');
    this.launchContact(A.C, { power: eff, raw: A.power, sweet, dx: A.dx, dy: A.dy });
  },
  launchContact(C, U) {
    const p = this.pitch, B = this.batter, P = this.fld.pos.P, b = FLD.ball;
    const { q, dtE, lim, plate, ctx, hs } = C;
    const evBase = 21 + B.st.pow * 2.15;
    let ev, la, spray;
    if (U) {
      // swinging after the ball reaches the plate eats into the power; a little early costs a little
      const late = clamp(dtE / lim, 0, 1), early = clamp(-dtE / lim, 0, 1);
      const pe = clamp(U.power - 0.55 * late - 0.15 * early, 0, 1);
      ev = evBase * (0.45 + 0.72 * pe) * (0.85 + 0.15 * q) + p.kmh * 0.03;
      const sx = U.dx !== undefined ? clamp(U.dx / (innerWidth * 0.16), -1, 1) : null;
      const sy = U.dy !== undefined ? clamp(-U.dy / (innerHeight * 0.1), -1, 1) : null;
      // up/down slide: fly ball / grounder; left/right slide: field direction (timing nudges pull / push a little)
      la = (sy === null ? 6 + (plate[1] - 0.62) * 22 : 10 + sy * 24 + (plate[1] - 0.62) * 8) + gauss() * (3 + (1 - q) * 9);
      spray = (sx === null ? (dtE / lim) * 60 * hs : sx * 40 + (dtE / lim) * 16 * hs) + gauss() * (4 + (1 - q) * 9);
      B.anim.up = clamp(la / 40, -0.6, 1);
      if (U.sweet) { ev *= 1.06; if (sy !== null && sy > 0.35) ev *= 1.08; } // sweet spot; a sweet fly ball carries extra
    } else {
      ev = evBase * ctx.power * (0.42 + 0.58 * Math.pow(q, 0.8)) + p.kmh * 0.03;
      la = 4 + ctx.angle * 0.5 + (plate[1] - 0.62) * 22 + gauss() * (4 + (1 - q) * 16);
      spray = (TUNE.spraySign || 1) * (dtE / lim) * 78 * hs + gauss() * 8; // early = pull side, late = opposite field
    }
    if (B.hero.passive.id === 'strengthBelt') ev *= 1.05;
    if (B.awake) ev *= 1.12;
    ev *= ctx.evMul || 1;
    if (ctx.la !== undefined) la = ctx.la;
    if (ctx.spray !== undefined) spray = ctx.spray;
    // foul tips
    const foulBack = q < 0.32 && rand() < 0.7 && !ctx.noFoul;
    if (foulBack) { ev *= 0.6; la = 35 + rand() * 40; spray = 180 + gauss() * 30; }
    // launch
    const dirH = [Math.sin(spray * DEG), 0, -Math.cos(spray * DEG)];
    const v = [dirH[0] * Math.cos(la * DEG) * ev, Math.sin(la * DEG) * ev, dirH[2] * Math.cos(la * DEG) * ev];
    b.reset(); b.pos = vcopy(plate); b.pos[2] = -0.25; b.vel = v; b.state = 'fly'; b.liftOn = la > 8; b.special = null;
    this.contact = { ev, la, spray, q, kmh: ev * 3.6, power: U ? U.power : null };
    this.lastCatch = null;
    ST.cheerTarget = q > 0.5 ? 0.6 : 0.2;
    // env
    FLD.envMul = { dragMul: W8.drag || 1, liftMul: 1, roll: W8.roll || 1, wind: W8.kind === 'wind' ? [W8.wind[0], 0, W8.wind[1]] : null };
    if (B.hero.passive.id === 'stormWind') FLD.envMul.dragMul *= 0.82;
    if (P.hero.passive.id === 'headwind' && !P.ko) FLD.envMul.dragMul *= 1.25;
    FLD.quicksand = 0; this.strategyDelay = 0; this.gazeHold = null; FLD.settle = false; FLD.foul = false; FLD.phantomBall = null;
    for (const f of fielderList()) { f.burnHit = false; f.bowled = false; f.decided = false; f.runTo = null; f.onBase = null; f.hasBall = false; f.zapped = false; f.invDelay = false; f.catchCD = 0; f.killHit = false; }
    // batter becomes runner
    const br = { pl: B, base: 0, s: 0, dir: 1, tgt: 1, forced: true, isBatter: true, state: 'run', startBase: 0, delay: 0.3 }; // a beat to show the follow-through
    FLD.runners.push(br);
    B.setAnim('swing', { dur: 0.36, up: B.anim.up, t: Math.max(B.anim.t, U ? 0.18 : 0), pre: B.anim.pre || 0 });
    ABIL.onContact(this, B, P, b, ctx);
    // 殺人球: a sweet-spot liner or grounder that hurts whoever it hits (CPU batters get one on their best contact)
    const sweetHit = U ? U.sweet : (q > 0.86 && rand() < sweetOf(B.hero).w * 2.2);
    this.contact.sweet = sweetHit;
    if (sweetHit && !foulBack && !b.special && la < 22 && ev > 30) { b.killer = { hits: 0, dmg: Math.round(14 + ev * 0.45) }; b.glow = [1, 0.3, 0.15]; }
    if (sweetHit && !foulBack && la >= 22) b.glow = [1, 0.85, 0.3];
    // ---- impact feel: tiered hitstop / flash / speed lines / sound / haptics ----
    const hrBound = !b.special && !b.phantom && !(b.skyT > 0) && predictHR(b, FLD.envMul);
    const strong = U ? (U.sweet || U.power >= 0.75) : true;
    const tier = hrBound ? 3 : ((q >= 0.8 && strong) || ev >= 42) ? 2 : q >= 0.45 ? 1 : 0;
    this.contact.tier = tier; this.contact.hrBound = hrBound;
    if (!foulBack) UI.say(this.contactLine(B, la, spray, ev, hrBound), hrBound ? 2 : 1);
    FX.impact(vcopy(b.pos), tier, q, ev, !!b.special);
    SFX.crack(q, ev, tier);
    this.camPrev = this.camMode;
    this.camHold = [0.08, 0.18, 0.32, 0][tier];
    if (hrBound) { this.launchCam = 1.35; this.slowmo = 0.3; this.slowT = 1.35; br.delay = 0.6; ST.cheerTarget = 1; }
    this.camMode = 'field';
    this.setPhase('play');
    startBallInPlay(this.contact);
  },
  callPitch() {
    const p = this.pitch, B = this.batter, b = FLD.ball;
    const plate = pitchPos(p, p.T);
    const sc = (B.hero.passive.id === 'tinyZone') ? 0.6 : 1;
    const zc = (ZONE.bot + ZONE.top) / 2, zh = (ZONE.top - ZONE.bot) / 2 * sc;
    const inZone = Math.abs(plate[0]) <= ZONE.x * (sc < 1 ? 0.75 : 1) && Math.abs(plate[1] - zc) <= zh;
    const swung = this.swing && !this.swing.hit;
    b.state = 'held'; const C = this.fld.pos.C; b.holder = C;
    if (C) { C.setAnim('catchP'); }
    let call;
    if (swung || inZone) { call = 'strike'; this.strikes++; }
    else { call = 'ball'; this.balls++; }
    this.lastCall = call;
    // ---- catch feel: mitt pop, dust, umpire call ----
    const k3 = call === 'strike' && this.strikes >= 3 && !(B.hero.passive.id === 'rewind' && !this.rewindUsed[B.id]);
    const mitt = C ? vadd(C.pos, [0, 0.62, -0.3]) : vcopy(plate);
    FX.mittPop(mitt, p.kmh, call === 'ball' ? 0 : k3 ? 2 : 1, this.isUserDefense(), this.isUserOffense());
    SFX.mittPop(p.kmh, call === 'ball' ? 0 : k3 ? 2 : 1);
    if (this.ump) this.ump.setAnim(call === 'ball' ? 'stand' : k3 ? 'umpK' : 'umpStrike');
    this.gauge(this.fld, call === 'strike' ? 4 : 0); this.gauge(this.bat, call === 'ball' ? 4 : 0);
    // stealing play
    const stealing = FLD.runners.some(r => r.stealing && r.state === 'run');
    if (this.strikes >= 3) {
      if (B.hero.passive.id === 'rewind' && !this.rewindUsed[B.id]) { this.rewindUsed[B.id] = true; this.strikes = 2; UI.banner('時光倒流', '這一球不算！', '#e8d080', 1.2); FX.rewind(); this.toNextPitch(1.2); return; }
      UI.flashCall('三振！', '#ff5a48', 'k', swung ? '揮棒落空' : '站著不動');
      SFX.ump('strike3'); SFX.kSting(this.isUserDefense() || this.autoAll);
      { const Pn = this.fld.pos.P ? this.fld.pos.P.hero.name : '投手', pn = p.special ? '魔球' : `${Math.round(p.kmh)}公里的${PITCH_TYPES[p.type] ? PITCH_TYPES[p.type].name : '球'}`;
        UI.say(swung ? `三振！${Pn}一記${pn}，${B.hero.name}揮棒落空！` : `三振！${B.hero.name}看著${Pn}的${pn}進壘，站著不動。`, 1); }
      this.gauge(this.fld, 10);
      const br = { pl: B, base: 0, s: 0, dir: 0, isBatter: true, state: 'base' };
      FLD.runners.push(br); recordOut(br, 'k');
      FLD.runners = FLD.runners.filter(r => r !== br);
      B.setAnim('sad');
      if (stealing && this.outs < 3) { this.startStealPlay(true); return; }
      this.toResult(1.4);
      return;
    }
    if (this.balls >= 4) {
      UI.flashCall('四壞球保送', '#9ad0ff'); SFX.ump('ball');
      UI.say(`四壞球，${B.hero.name}保送上一壘。`, 0);
      this.gauge(this.bat, 8);
      this.walk(B);
      return;
    }
    const spd = Math.round(p.kmh) + ' km/h';
    if (call === 'strike') UI.flashCall(swung ? '揮空！' : '好球！', '#ffd25a', 'strike', spd);
    else UI.flashCall('壞球', '#9ad0ff', 'ball', spd);
    SFX.ump(call);
    this.checkClutch('count');
    if (stealing) { this.startStealPlay(); return; }
    this.toNextPitch(0.85);
  },
  startStealPlay(afterK) {
    // catcher throws on steal
    const C = this.fld.pos.C && !this.fld.pos.C.ko ? this.fld.pos.C : (this.fld.pos.P || null), b = FLD.ball;
    this.stealPlay = afterK ? 'k' : 'pitch';
    if (!C) { for (const r of FLD.runners) if (r.stealing) { r.base = Math.min(3, r.base + 1); r.s = 0; } this.toNextPitch(1); this.stealPlay = null; return; }
    this.camMode = 'field';
    FLD.playT = 0; FLD.endT = 0; FLD.catchFly = false; FLD.throwSel = null; FLD.settle = false;
    for (const r of FLD.runners) { r.startBase = r.base; r.forced = false; r.mustReturn = false; }
    for (const f of fielderList()) { f.task = null; f.decided = false; f.runTo = null; }
    coverBases();
    b.state = 'held'; b.holder = C; C.hasBall = true; C.decided = false; C.thinkT = 0.15;
    // runner speed advantage
    this.setPhase('play');
  },
  walk(B) {
    // forced advances
    const at = k => FLD.runners.find(r => r.base === k && r.state !== 'out' && r.state !== 'scored');
    const r1 = at(1), r2 = at(2), r3 = at(3);
    if (r1) { if (r2) { if (r3) this.forceScore(r3); r2.base = 3; } r1.base = 2; }
    FLD.runners = FLD.runners.filter(r => r.state !== 'scored');
    for (const r of FLD.runners) { r.s = 0; r.dir = 0; r.state = 'base'; r.stealing = false; r.pl.pos = basePos(r.base); }
    FLD.runners.push({ pl: B, base: 1, s: 0, dir: 0, state: 'base', tgt: 1 });
    B.pos = vcopy(basePos(1)); B.setAnim('stand');
    this.toResult(1.2, true);
  },
  forceScore(r) { r.state = 'scored'; r.pl.sprite.visible = false; this.addRun(r); },
  hitByPitch() {
    const p = this.pitch, B = this.batter;
    FLD.ball.state = 'none'; FLD.ball.visible = false;
    let dmg = 9 + p.kmh / 14;
    if (p.special) dmg = p.special === 'sunArrow' ? 48 : 32;
    const kind = FLD.ball.pos[1] < 0.18 ? 'low' : 'pitch';
    knockback(B, [B.hero.bats === 'L' ? 1 : -1, 0, 0.2], 3);
    UI.flashCall('觸身球!', '#ff9a4a');
    FX.burst(vadd(B.pos, [0, 1, 0]), [1, 0.6, 0.3], 24); SFX.thud();
    const took = damage(B, dmg, kind, B.pos);
    this.gauge(this.bat, 12);
    UI.say(took ? `觸身球！${B.hero.name}被${Math.round(p.kmh)}公里的球砸中，受到 ${took} 點傷害。` : `觸身球！還好${B.hero.name}毫髮無傷。`, 1);
    if (!B.ko && took) B.awakeNext = { kind: 'hbp' }; // he'll come back angry next time up
    if (B.ko) { // pinch runner
      const sub = this.bat.bench.find(p => !p.ko && !p.inGame);
      if (sub) { this.subIn(this.bat, B, sub); this.walk(sub); }
      else this.toResult(1.4, true);
      return;
    }
    this.walk(B);
  },
  toNextPitch(delay) { this.nextDelay = delay; this.setPhase('result'); this.resultKind = 'pitch'; },
  toResult(delay, newBatter = true) { this.nextDelay = delay; this.setPhase('result'); this.resultKind = 'batter'; },
  uResult(dt) {
    if (this.phaseT < this.nextDelay) return;
    UI.updateHud();
    if (this.outs >= 3) { this.setPhase('halfEnd'); return; }
    if (this.checkWalkoff()) return;
    placeDefense();
    for (const r of FLD.runners) { r.pl.pos = vcopy(basePos(r.base)); r.pl.sprite.visible = true; }
    this.hideIdleBatters();
    if (this.resultKind === 'pitch') {
      // reset positions & next pitch
      for (const r of FLD.runners) { if (r.stealing) r.stealing = false; }
      const B = this.batter; B.setAnim('bat');
      const C = this.fld.pos.C; if (C) C.setAnim(C.hero.stance && C.hero.stance.style === 'sumo' ? 'sumo' : 'squat');
      FLD.ball.state = 'none';
      this.setPhase('pre'); this.aiPitchT = 0.6 + rand() * 0.8;
    } else this.setPhase('batterUp');
  },

  // ---------------- play results ----------------
  clearStatus() {
    for (const T of this.teams) for (const id in T.players) { const p = T.players[id]; p.petrify = 0; p.stun = 0; p.sprite.tint = [1, 1, 1, 1]; p.flyVel = null; p.lift = 0; p.liftV = 0; p.giant = 0; }
  },
  endPlay() {
    if (this.phase !== 'play') return;
    this.clearStatus();
    const b = FLD.ball;
    FLD.throwSel = null; this.timeScale = 1; UI.hideThrowSelect(); UI.hideRunnerUI();
    const B = this.batter;
    const br = this.batterRunner();
    let label = '', col = '#ffffff';
    if (this.stealPlay) {
      const kind = this.stealPlay; this.stealPlay = null;
      { const st = FLD.runners.filter(r => r.stealStart); const nm = st.map(r => r.pl.hero.name).join('、');
        if (nm) UI.say(FLD.outsThisPlay ? `盜壘失敗！捕手一傳刺殺${nm}。` : `盜壘成功！${nm}的腳程太快了。`, 1); }
      FLD.runners = FLD.runners.filter(r => r.state !== 'out' && r.state !== 'scored');
      for (const r of FLD.runners) { r.s = 0; r.dir = 0; r.state = 'base'; r.mustReturn = false; r.stealing = false; r.pl.pos = vcopy(basePos(r.base)); r.pl.setAnim('stand'); }
      this.subsAfterPlay(); this.playRuns = []; FLD.ball.state = 'none';
      UI.updateHud(); drawScoreboard(this);
      this.camMode = this.isUserOffense() ? 'bat' : (this.isUserDefense() ? 'pitch' : 'bat');
      placeDefense();
      if (kind === 'k') this.toResult(1.0); else this.toNextPitch(1.0);
      return;
    }
    if (FLD.foul && !b.caughtFly) {
      // foul ball: remove batter-runner, runners go back
      FLD.runners = FLD.runners.filter(r => !r.isBatter);
      for (const r of FLD.runners) { r.base = r.startBase !== undefined ? r.startBase : r.base; r.s = 0; r.dir = 0; r.state = 'base'; r.pl.pos = basePos(r.base); r.pl.sprite.visible = true; }
      if (this.strikes < 2) this.strikes++;
      UI.flashCall('界外球', '#c8d0e0', 'ball'); SFX.ump('foul');
      UI.say(`界外球，${this.strikes}好${this.balls}壞。`, 0);
      if (this.ump) this.ump.setAnim('umpFoul');
      this.gauge(this.bat, 3);
      B.pos = [B.hero.bats === 'L' ? 0.95 : -0.95, 0, 0.08]; B.yaw = B.hero.bats === 'L' ? -PI / 2 : PI / 2;
      this.camMode = this.isUserOffense() ? 'bat' : (this.isUserDefense() ? 'pitch' : 'bat');
      placeDefense();
      this.toNextPitch(0.9);
      return;
    }
    if (b.hr) {
      // all runners + batter score
      for (const r of FLD.runners) if (r.state !== 'out' && r.state !== 'scored') { r.state = 'scored'; this.addRun(r); }
      label = this.playRuns.length >= 4 ? '滿貫全壘打!!' : '全壘打!!'; col = '#ffd25a';
      this.bat.hits++; this.hrCount++;
      this.gauge(this.bat, 25);
      if (!b.hrShown) { SFX.homer(); FX.fireworks(); }
      ST.cheerTarget = 1;
    } else if (b.gr) {
      label = '場地規則二壘打'; col = '#ffd25a';
      for (const r of FLD.runners) if (r.state !== 'out' && r.state !== 'scored') { const nb = r.isBatter ? 2 : Math.min(4, r.startBase + 2); if (nb >= 4) { r.state = 'scored'; this.addRun(r); } else { r.base = nb; r.s = 0; r.dir = 0; r.state = 'base'; } }
      this.bat.hits++;
    } else if (br && br.state === 'out') {
      label = { fly: '接殺出局', force: '封殺出局', tag: '觸殺出局', double: '雙殺!' }[br.outHow] || '出局'; col = '#ff6a5a';
      if (FLD.outsThisPlay >= 2) label = FLD.outsThisPlay >= 3 ? '三殺!!!' : '雙殺!!';
    } else if (br) {
      const nb = br.state === 'scored' ? 4 : br.base;
      label = ['', '一壘安打', '二壘安打', '三壘安打', '場內全壘打!!'][nb] || '安打'; col = '#7affa0';
      if (b.error && nb <= 1) label = '失誤上壘';
      else { this.bat.hits++; this.gauge(this.bat, nb >= 2 ? 14 : 8); }
      if (FLD.outsThisPlay >= 1) label = '野手選擇';
    } else label = '';
    // clean runners list
    FLD.runners = FLD.runners.filter(r => r.state !== 'out' && r.state !== 'scored');
    for (const r of FLD.runners) { r.isBatter = false; r.s = 0; r.dir = 0; r.state = 'base'; r.mustReturn = false; r.stealing = false; r.boost = 1; r.fireTrail = false; r.bowl = false; r.noTag = false; r.pl.pos = vcopy(basePos(r.base)); r.pl.setAnim('stand'); }
    if (label && !(b.hr && b.hrShown)) UI.flashCall(label, col, b.hr ? 'k' : col === '#ff6a5a' ? 'out' : 'hit');
    // play-by-play
    if (label && !this.autoAll) {
      const n = this.playRuns.length, nm = B.hero.name, outsT = OUTS_TXT[Math.min(3, this.outs)];
      let line = '';
      if (b.hr) line = `${['', '陽春', '兩分', '三分', '滿貫'][Math.min(4, n)]}全壘打！${nm}這一棒飛了 ${b.hrDist || Math.round(hrDistance(b, FLD.envMul))} 公尺！`;
      else if (b.gr) line = `${nm}的球落地後彈進看台，場地規則二壘打。`;
      else if (br && br.state === 'out') {
        if (FLD.outsThisPlay >= 2) line = `${label.replace(/[!！]+/g, '')}！${this.fld.meta.name}的守備太漂亮了！`;
        else if (br.outHow === 'fly' && this.lastCatch) line = `${POS_NAME[this.lastCatch.fpos] || ''}${this.lastCatch.hero.name}${this.lastCatch.dove === 'rob' ? '沒收全壘打' : this.lastCatch.dove ? '飛身撲接' : '穩穩接殺'}，${outsT}。`;
        else line = `${nm}${label}，${outsT}。`;
      } else if (br) line = label === '失誤上壘' ? `${nm}趁對方失誤上壘。` : `${label.replace(/[!！]+/g, '')}！${nm}上壘。`;
      if (n && !b.hr) line += `${this.playRuns.map(r => r.pl.hero.name).join('、')}跑回本壘得分！`;
      if (n) line += `比數 ${this.scoreLine()}`;
      UI.say(line, b.hr || n ? 2 : 1);
    }
    if (MAIN.gaugeCheat || MAIN.debug) console.log('LOG result', this.inning, this.half, B.hero.name, label, 'outs', this.outs, 'score', this.teams[0].runs, this.teams[1].runs, this.contact ? ('ev ' + this.contact.ev.toFixed(1) + ' la ' + this.contact.la.toFixed(0) + ' spray ' + this.contact.spray.toFixed(0)) : '');
    this.subsAfterPlay();
    this.playRuns = [];
    FLD.ball.state = 'none';
    this.camMode = 'overview';
    UI.updateHud();
    drawScoreboard(this);
    this.toResult(b.hr ? 2.6 : 1.5);
  },
  addRun(r) {
    this.playRuns.push(r);
    const T = this.bat;
    T.runs++; T.line[this.inning - 1] = (T.line[this.inning - 1] || 0) + 1;
    FX.text3d([0, 2.5, 0], '得分!', this.bat.meta.color);
    SFX.score();
    drawScoreboard(this); UI.updateHud();
  },
  addOut(r, how) {
    r.outHow = how;
    this.outs++;
    this.gauge(this.fld, how === 'k' ? 0 : 5);
    // remove force for runners ahead of this one
    const sb = r.isBatter ? 0 : (r.startBase || 0);
    for (const o of FLD.runners) if (o !== r && (o.startBase || 0) > sb) o.forced = false;
    if (this.outs >= 3) {
      // cancel runs on force outs / batter out before first
      if (how === 'force' || (r.isBatter && how !== 'fly' && how !== 'k')) {
        for (const rr of this.playRuns) { this.bat.runs--; this.bat.line[this.inning - 1]--; }
        this.playRuns = [];
      }
      if (this.phase === 'play') { FLD.endT = 0; }
    }
    UI.updateHud();
  },
  gauge(T, amt) { if (!amt) return; T.gauge = clamp(T.gauge + amt, 0, 100); UI.updateGauges(); },
  checkWalkoff() {
    if (this.half === 1 && this.inning >= this.innings && this.teams[1].runs > this.teams[0].runs) { this.finish(); return true; }
    return false;
  },
  uHalfEnd(dt) {
    if (this.phaseT <= dt + 1e-6) {
      // hide runners
      for (const r of FLD.runners) r.pl.sprite.visible = false;
      FLD.runners = [];
      drawScoreboard(this);
      if (W8.kind) { UI.say({ rain: '雨停了。', storm: '雷雨停了。', wind: '風勢減弱了。', fog: '濃霧散了。' }[W8.kind], 0); W8set(null); } // weather lasts one half inning
    }
    if (this.phaseT < 0.6) return;
    const [a, h] = [this.teams[0].runs, this.teams[1].runs];
    if (this.half === 0) {
      if (this.inning >= this.innings && h > a) { this.finish(); return; }
      this.half = 1;
    } else {
      if (this.inning >= this.innings && a !== h) { this.finish(); return; }
      if (this.inning >= this.innings + 3) { this.finish(); return; }
      this.half = 0; this.inning++;
    }
    this.setPhase('halfStart');
  },
  finish() {
    const [a, h] = [this.teams[0].runs, this.teams[1].runs];
    this.winner = a > h ? 0 : h > a ? 1 : -1;
    this.over = true; this.setPhase('gameOver'); this.camMode = 'overview';
    MUSIC.stop(); W8set(null);
    UI.gameOver(this);
    SFX.end(this.winner === this.user);
  },
  endGameKO(loserSide) {
    this.winner = 1 - loserSide; this.koWin = true; this.over = true; this.setPhase('gameOver'); MUSIC.stop(); W8set(null); UI.gameOver(this);
  },

  // ---------------- substitutions ----------------
  subIn(T, out, sub) {
    sub.inGame = true;
    const i = T.order.indexOf(out);
    if (i >= 0) T.order[i] = sub;
    if (out.fpos && T.pos[out.fpos] === out) { T.pos[out.fpos] = sub; sub.fpos = out.fpos; }
    if (T.pitcher === out) { T.pitcher = sub; T.pos.P = sub; sub.fpos = 'P'; }
    out.sprite.visible = false;
    if (sub.hero.passive.id === 'gaugeGift') { this.gauge(T, 50); UI.toast(`${sub.hero.name}「龍宮之禮」必殺槽 +50%`); }
    UI.toast(`換人：${sub.hero.name} 代替 ${out.hero.name}`);
  },
  subsAfterPlay() {
    for (const T of this.teams) {
      for (const pos of Object.keys(T.pos)) {
        const p = T.pos[pos];
        if (p && p.ko && !p.subbed) {
          p.subbed = true;
          if (pos === 'P') { this.replacePitcher(T); continue; }
          const sub = T.bench.find(s => !s.ko && !s.inGame);
          if (sub) this.subIn(T, p, sub);
          else { T.pos[pos] = null; p.sprite.visible = false; }
        }
      }
      for (let i = 0; i < 9; i++) { const p = T.order[i]; if (p && p.ko && !p.subbed && !p.fpos) { p.subbed = true; const sub = T.bench.find(s => !s.ko && !s.inGame); if (sub) this.subIn(T, p, sub); } }
      const healthy = Object.values(T.players).filter(p => !p.ko && (T.order.includes(p) || T.pos.P === p)).length;
      if (healthy < 6 && !this.over) { this.endGameKO(T.side); return; }
    }
    // tired pitcher
    const F = this.fld;
    if (F.pitcher && F.pitcher.stamina < 0.2 && F.rp && !F.rpUsed) this.replacePitcher(F, true);
  },
  replacePitcher(T, tired) {
    T = T || this.fld;
    const old = T.pitcher;
    let np = null;
    if (T.rp && !T.rpUsed && !T.rp.ko) { np = T.rp; T.rpUsed = true; }
    else {
      np = T.bench.find(s => !s.ko && !s.inGame);
      if (np) np.inGame = true;
      else { // a position player pitches
        const cand = ['SS', '2B', '3B', 'CF', 'RF', 'LF', '1B'].map(k => T.pos[k]).find(p => p && !p.ko);
        if (!cand) { this.endGameKO(T.side); return; }
        T.pos[cand.fpos] = null; np = cand;
      }
    }
    np.fpos = 'P'; T.pitcher = np; T.pos.P = np; np.stamina = 1;
    if (old) old.sprite.visible = false;
    np.pos = vcopy(DEF_POS.P); np.yaw = 0; np.sprite.visible = true;
    UI.toast(`${tired ? '換投' : '投手退場'}：${np.hero.name} 登板`);
    UI.say(`${T.meta.name}換投，${np.hero.name}登上投手丘。`, 1);
    if (this.phase === 'pre') this.aiPitchT = 1.2;
  },

  // ---------------- hooks ----------------
  onFielded(f, fly) { f.gotT = FLD.playT; if (fly) this.lastCatch = f; },
  onDamaged(pl, amt, kind) {
    const T = this.teams[pl.side];
    this.gauge(T, Math.min(15, amt * 0.4));
  },
  onKO(pl) {
    const T = this.teams[pl.side], O = this.teams[1 - pl.side];
    O.kos++;
    if (MAIN.gaugeCheat || MAIN.debug) console.log('LOG KO', pl.hero.name);
    this.koLog.push(pl.hero.name);
    UI.banner('K.O.!!', `${pl.hero.name} 被擊倒了！`, '#ff4a3a', 1.6);
    SFX.ko(); FX.koFx(pl);
    UI.say(`${pl.hero.name}被擊倒退場了！${T.meta.name}的下一棒怒火中燒！`, 2);
    // the team's next batter wakes up
    for (let k = 0; k < 9; k++) { const nb = T.order[(T.idx + k) % 9]; if (nb && !nb.ko && nb !== pl) { nb.awakeNext = { kind: 'ko', n: pl.hero.name }; break; } }
    for (const id in O.players) { const p = O.players[id]; if (p.hero.passive.id === 'soulHarvest' && !p.ko && isActive(O, p)) { this.gauge(O, 40); UI.toast('冥王收魂：必殺槽 +40%'); } }
    this.gauge(O, 10);
  },
};
function isActive(T, p) { return T.order.includes(p) || T.pos.P === p || Object.values(T.pos).includes(p); }

// ---------------- animation driver ----------------
function playerPose(pl, t) {
  const a = pl.anim, h = pl.hero;
  const L = (h.bats === 'L');
  const TL = (h.throws === 'L');
  let pose;
  switch (a.k) {
    case 'bat': { pose = batStance(h.stance || {}, t); const ld = batterLoadAmt(pl); if (ld > 0) pose = lerpPose(pose, batLoad(h.stance || {}, batStance(h.stance || {}, 0)), ld); if (L) pose = mirrorPose(pose); break; }
    case 'swing': pose = batSwing(h.stance || {}, clamp(a.t / (a.dur || 0.36), 0, 1), a.up || 0, a.pre || 0); if (L) pose = mirrorPose(pose); break;
    case 'pitch': { const d = h.delivery || { type: 'over', kick: 0.3 }; pose = pitchDelivery(d, clamp(t / (a.dur || 1.05), 0, 1)); if (TL) pose = mirrorPose(pose); break; }
    case 'pstand': { pose = POSE.stand(t); pose.glove = 'L'; pose.yaw = 0; pose.hR = [0.05, 0.55, 0.15]; pose.hL = [-0.05, 0.56, 0.16]; if (TL) pose = mirrorPose(pose); break; }
    case 'run': pose = POSE.run(t * (pl.runSpeed * 1.25), a.runner ? null : pl.gloveHand, 1); break;
    case 'ready': pose = POSE.ready(t, pl.gloveHand); break;
    case 'squat': pose = POSE.squat(t, pl.gloveHand); break;
    case 'sumo': pose = POSE.sumo(t, pl.gloveHand); break;
    case 'catchP': { pose = (h.stance && h.stance.style === 'sumo') ? POSE.sumo(t, pl.gloveHand) : POSE.squat(t, pl.gloveHand); pose.hL = [-0.05, 0.62, 0.32]; break; }
    case 'catch': { const tg = a.tgt ? worldToLocal(pl, a.tgt) : [0, 0.8, 0.3]; pose = POSE.catchAt(tg, pl.gloveHand); break; }
    case 'jump': pose = POSE.jumpCatch(pl.gloveHand); break;
    case 'throw': pose = POSE.throwPose(clamp(t / 0.4, 0, 1), pl.gloveHand); if (h.throws === 'L') pose = mirrorPose(pose); break;
    case 'hurt': pose = POSE.hurt(clamp(t * 3, 0, 1)); break;
    case 'ko': pose = t < 0.5 ? POSE.hurt(1) : POSE.lying(t); break;
    case 'slide': pose = POSE.slide(t); break;
    case 'dive': pose = POSE.dive(pl.gloveHand, a.side || -1); break;
    case 'cheer': pose = POSE.cheer(t); break;
    case 'fist': pose = POSE.fistPump(t); break;
    case 'sad': pose = POSE.sad(t); break;
    case 'lead': pose = POSE.lead(t); break;
    case 'sit': pose = POSE.sit(t); break;
    case 'umpSet': pose = POSE.umpSet(t); break;
    case 'umpStrike': pose = POSE.umpStrike(t); if (pl.pos[0] < 0) pose = mirrorPose(pose); break; // gesture away from the catcher
    case 'umpK': pose = POSE.umpK(t); if (pl.pos[0] < 0) pose = mirrorPose(pose); break;
    case 'umpHR': pose = POSE.umpHR(t); if (pl.pos[0] < 0) pose = mirrorPose(pose); break;
    case 'umpFoul': pose = POSE.umpFoul(t); break;
    default: pose = POSE.stand(t);
  }
  return pose;
}
// the batter sinks into his load as the pitch comes in (timing step), and eases out if he lets it go
function batterLoadAmt(pl) {
  if (!G || pl !== G.batter) return 0;
  if (G.phase === 'windup') { const P = G.fld.pos.P; return P ? clamp(P.anim.t / (P.anim.dur * PITCH_REL_T) - 0.55, 0, 0.45) : 0; }
  if (G.phase === 'flight' && G.pitch) return clamp(0.45 + (G.pitch.t / G.pitch.T) * 0.7, 0, 0.9);
  return 0;
}
function worldToLocal(pl, w) { const d = vsub(w, [pl.pos[0], pl.pos[1] + pl.lift, pl.pos[2]]); const r = rotY(d, -pl.yaw); return [-r[0] / pl.sprite.scale, r[1] / pl.sprite.scale, r[2] / pl.sprite.scale]; }

const ANIM_FPS = 14;
function animatePlayer(pl, dt) {
  pl.anim.t += dt; pl.animT += dt;
  if (pl.sprite.flash > 0) pl.sprite.flash = Math.max(0, pl.sprite.flash - dt * 4);
  if (pl.flyVel) {
    pl.pos[0] += pl.flyVel[0] * dt; pl.pos[2] += pl.flyVel[2] * dt;
    pl.flyVel = vscale(pl.flyVel, Math.max(0, 1 - dt * 3));
    if (vlen(pl.flyVel) < 0.3) pl.flyVel = null;
  }
  if ((pl.lift > 0 || pl.liftV) && G.phase !== 'play') { pl.liftV -= 18 * dt; pl.lift += pl.liftV * dt; if (pl.lift <= 0) { pl.lift = 0; pl.liftV = 0; } }
  if (pl.ko && pl.anim.k !== 'ko') pl.setAnim('ko');
  pl.sprite.lift = pl.lift;
  pl.sprite.pos = pl.pos; pl.sprite.yaw = pl.yaw;
  pl.sprite.scale = (pl.hero.look.scale || 1) * (pl.giant ? 2.4 : 1);
  if (pl.giant > 0) { pl.giant -= dt; if (pl.giant < 0) pl.giant = 0; }
  // quantized pose time
  const f = Math.floor(pl.anim.t * (pl.anim.k === 'swing' ? 60 : ANIM_FPS)); // the swing is fast: every frame of it is drawn
  const key = pl.anim.k + ':' + f;
  if (key !== pl.poseKeyRaw) {
    pl.poseKeyRaw = key;
    const tq = f / ANIM_FPS;
    pl.sprite.look._t = pl.animT;
    pl.sprite.pose = playerPose(pl, pl.anim.k === 'bat' || pl.anim.k === 'swing' || pl.anim.k === 'ready' || pl.anim.k === 'squat' || pl.anim.k === 'sumo' || pl.anim.k === 'pstand' || pl.anim.k === 'lead' || pl.anim.k === 'umpSet' ? pl.animT : tq);
    pl.sprite.poseKey = key + ':' + (pl.ko ? 1 : 0);
  }
}
