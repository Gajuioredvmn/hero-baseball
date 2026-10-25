// ===== main.js : boot, camera, render loop =====
const MAIN = {
  paused: false, last: 0, cam: { eye: [0, 30, 60], tgt: [0, 0, -30], fov: 45 }, camVel: 0, titleT: 0, demo: [], ballTex: null, shadowOK: true,
  auto: false, speed: 1, frameN: 0,
  boot() {
    const canvas = document.getElementById('gl');
    if (!glInit(canvas)) { document.getElementById('nogl').hidden = false; document.getElementById('loading').hidden = true; return; }
    glPrograms(); postPrograms(); glParticlesInit(); glRibbonInit();
    buildStadium();
    this.resize();
    addEventListener('resize', () => this.resize());
    // leaving the tab: the game pauses itself and the music goes quiet
    document.addEventListener('visibilitychange', () => { if (document.hidden) { if (G && !G.over && !this.paused && !this.auto) this.pause(true); else MUSIC.pause(true); } else if (!this.paused) MUSIC.pause(false); });
    FX.init(); INPUT.init(); UI.init();
    this.makeBallTex();
    ballEvent = (b, ev) => this.onBallEvent(b, ev);
    this.setupDemo();
    document.getElementById('loading').hidden = true;
    const q = new URLSearchParams(location.search);
    this.debug = !!q.get('debug'); this.gaugeCheat = !!q.get('gauge');
    if (q.get('w8') !== null) this.forceW8 = q.get('w8'); // test hook: force a weather every half inning ('' = none)
    if (q.get('auto')) { this.auto = true; this.speed = +q.get('speed') || 1; UI.hideScreens(); this.startGame({ team: q.get('team') || 'E', innings: +q.get('inn') || 3, diff: 'normal', first: q.get('first') === '0' ? 0 : 1, cpuOnly: q.get('auto') === 'cpu' }); }
    requestAnimationFrame(t => this.loop(t));
    window.__hb = { get G() { return G; }, FLD, MAIN, UI, ABIL, R, POST, ST, FX, PROG, INPUT, newGame, SYMBOLS, recognize, AI, W8, W8set, MUSIC, SFX, tryRobHR, fielderList };
  },
  resize() {
    const dprCap = R.quality === 'high' ? 2 : 1.25;
    const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
    let W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    const maxPix = R.quality === 'high' ? 2.4e6 : 1.0e6;
    if (W * H > maxPix) { const k = Math.sqrt(maxPix / (W * H)); W = Math.round(W * k); H = Math.round(H * k); }
    const canvas = R.canvas;
    canvas.width = W; canvas.height = H;
    R.W = W; R.H = H; R.cssW = innerWidth; R.cssH = innerHeight; R.dpr = W / innerWidth;
    postResize();
  },
  makeBallTex() {
    const c = mkCanvas(8, 8), g = c.getContext('2d');
    g.fillStyle = '#1a1420'; g.fillRect(2, 0, 4, 8); g.fillRect(0, 2, 8, 4); g.fillRect(1, 1, 6, 6);
    g.fillStyle = '#fbf8f0'; g.fillRect(2, 1, 4, 6); g.fillRect(1, 2, 6, 4);
    g.fillStyle = '#d8d0c8'; g.fillRect(5, 3, 1, 3); g.fillRect(3, 5, 2, 1);
    g.fillStyle = '#ffffff'; g.fillRect(2, 2, 2, 1);
    this.ballTex = glTexture(c, 0, 0, {});
  },
  setupDemo() {
    const ids = ['wukong', 'zeus', 'thor', 'nezha', 'kitsune', 'heracles', 'tengu', 'medusa'];
    this.demo = ids.map((id, i) => {
      const p = new Player(HERO[id], HERO[id].team === 'E' ? 0 : 1);
      const a = i / ids.length * TAU;
      p.pos = [Math.sin(a) * 2.6, 0, -10.5 + Math.cos(a) * 2.6];
      p.yaw = Math.atan2(p.pos[0], p.pos[2] + 10.5);
      p.setAnim(HERO[id].delivery ? 'pstand' : 'bat');
      p.sprite.visible = true;
      return p;
    });
  },
  startGame(opts) {
    this.paused = false;
    UI.hideScreens();
    for (const p of this.demo) p.sprite.visible = false;
    newGame({ userTeam: opts.team, innings: opts.innings, diff: opts.diff, userBatsFirst: !!opts.first, cpuOnly: opts.cpuOnly });
    UI.startHud();
    ST.cheerTarget = 0.4;
  },
  pause(on) {
    if (!G || G.over) return;
    this.paused = on;
    MUSIC.pause(on);
    UI.show(on ? 'scrPause' : null);
    if (!on) UI.hideScreens();
  },
  toTitle() {
    G = null; this.paused = false; MUSIC.stop(); W8set(null);
    document.getElementById('hud').hidden = true;
    UI.clearBaseBtns(); UI.closePad();
    for (const t of FX.texts) t.el.remove(); FX.texts = [];
    for (const p of this.demo) p.sprite.visible = true;
    UI.show('scrTitle');
  },
  onBallEvent(b, ev) {
    if (b !== FLD.ball) return;
    if (ev === 'hr') { if (tryRobHR(b)) return; FX.homeRun(b); }
    if (ev === 'wall') { SFX.thud(); FX.burst(b.pos, [0.9, 0.85, 0.7], 10, 3); }
    if (ev === 'land' && b.pos[2] < -5) FX.burst(b.pos, [0.75, 0.6, 0.45], 6, 2, 0.06);
  },

  // ---------------- camera ----------------
  desiredCam() {
    if (this.camOverride) return this.camOverride;
    const asp = R.cssW / R.cssH;
    const vfovFor = (hfov, vmin, vmax) => clamp(2 * Math.atan(Math.tan(hfov * DEG / 2) / asp) / DEG, vmin, vmax);
    if (!G) { // title orbit
      this.titleT += 1 / 60;
      const a = this.titleT * 0.08;
      return { eye: [Math.sin(a) * 8.5, 2.3 + Math.sin(this.titleT * 0.13) * 0.4, -10.5 + Math.cos(a) * 8.5], tgt: [0, 1.25, -10.5], fov: vfovFor(44, 32, 50), focus: [8.5, 4], snap: 1 };
    }
    const mode = this.viewMode();
    const B = G.batter;
    // batter close-up from the front (k: 0..1 push-in)
    const batterShot = (Bt, k) => {
      const side = Bt.hero.bats === 'L' ? -1 : 1, sc = Bt.sprite.scale || 1, e = k * k * (3 - 2 * k);
      const eye = [Bt.pos[0] + side * (2.15 - 0.45 * e) * Math.max(0.7, sc), 0.55 + 0.55 * sc, Bt.pos[2] - (1.55 - 0.25 * e) * Math.max(0.7, sc)];
      const tgt = [Bt.pos[0] + side * 0.05, 0.66 * sc + 0.05, Bt.pos[2]];
      return { eye, tgt, fov: vfovFor(44, 34, 62), focus: [vdist(eye, tgt), 1.6], snap: 14 };
    };
    if (mode === 'intro') return batterShot(B, clamp(1 - G.introT / 1.7, 0, 1)); // at-bat intro: slow push-in on the batter, crowd behind him
    if (mode.startsWith('cut')) {
      const s = G.cut.shots[G.cut.i], who = s.who || G.batter, k = clamp(G.cut.t / (s.dur || 2), 0, 1);
      if (s.kind === 'vs') return { eye: [9, 3.2, -4], tgt: [0, 1.2, -10], fov: vfovFor(64, 44, 66), focus: [12, 30], snap: 14 };
      if (who === G.batter && G.phase !== 'play') return batterShot(who, k);
      // anybody else: from the front, a little off to the side, slow push-in
      const sc = who.sprite.scale || 1, e = k * k * (3 - 2 * k), yw = who.yaw;
      const fw = [Math.sin(yw), 0, Math.cos(yw)], rt = [Math.cos(yw), 0, -Math.sin(yw)], d = (2.1 - 0.4 * e) * Math.max(0.75, sc);
      const base = [who.pos[0], who.pos[1] + (who.lift || 0), who.pos[2]];
      const eye = [base[0] + fw[0] * d + rt[0] * 0.6 * sc, base[1] + 0.95 * sc + 0.12, base[2] + fw[2] * d + rt[2] * 0.6 * sc];
      const tgt = [base[0], base[1] + 0.82 * sc, base[2]];
      return { eye, tgt, fov: vfovFor(42, 32, 58), focus: [vdist(eye, tgt), 1.8], snap: 14 };
    }
    if (mode === 'launch') { // home run: low shot from behind the batter, watching the ball fly
      const side = B && B.hero.bats === 'L' ? -1 : 1;
      const bp = B ? B.pos : [-0.95 * side, 0, 0];
      const b = FLD.ball;
      const eye = [bp[0] - side * 1.7, 0.75, bp[2] + 3.3];
      const tgt = vlerp([bp[0] * 0.5, 1.6, -6], b.pos, 0.8);
      return { eye, tgt, fov: vfovFor(60, 46, 70), focus: [Math.min(60, vdist(eye, b.pos)), 40], snap: 14 };
    }
    if (mode === 'bat') {
      // low, close view from behind the plate on the batter's side: the batter is big and his stance reads in profile
      const side = B && B.hero.bats === 'L' ? -1 : 1; // RHB stands at -x
      const sc = B ? (B.sprite.scale || 1) : 1;
      return { eye: [-0.35 * side, 1.0 + 0.3 * sc, 3.8], tgt: [-0.42 * side, 0.95, -8], fov: vfovFor(40, 46, 74), focus: [8, 22], snap: 10 };
    }
    if (mode === 'pitch') {
      const P = G.fld.pos.P;
      const s = P && P.hero.throws === 'L' ? -1 : 1;
      return { eye: [-0.62 * s, 2.7, -26.2], tgt: [0, 0.92, 0], fov: vfovFor(12, 17, 28), focus: [26, 8], snap: 10 };
    }
    if (mode === 'field' && G.phase === 'play' && FLD.ball.hr && FX.hrAt) { // home run: look up at the stands and the fireworks
      const a = FX.hrAt;
      const eye = [a[0] * 0.06, 9, 16];
      const tgt = [a[0] * 0.7, 22, a[2] * 0.75];
      return { eye, tgt, fov: vfovFor(68, 44, 70), focus: [vdist(eye, tgt), 70] };
    }
    if (mode === 'field' || mode === 'overview') {
      const b = FLD.ball;
      let f = (b.state !== 'none' && b.visible !== false && b.pos[1] > -1) ? vcopy(b.pos) : [0, 0, -22];
      if (mode === 'overview') f = [0, 0, -24];
      if (b.skyT > 0) f = [b.pos[0], 0, b.pos[2]];
      const dxz = Math.hypot(f[0], f[2]);
      const h = Math.min(f[1], 40);
      const tgt = [f[0] * 0.75, h * 0.55, f[2] * 0.8 - 6];
      const back = 20 + dxz * 0.18;
      const eye = [f[0] * 0.25, 13 + dxz * 0.26 + h * 0.35, back];
      return { eye, tgt, fov: vfovFor(62, 40, 64), focus: [vdist(eye, tgt), 18 + dxz * 0.2] };
    }
    return { eye: [0, 14, 24], tgt: [0, 0, -24], fov: vfovFor(62, 40, 64), focus: [40, 20] };
  },
  // which camera is actually on screen (holds the batting view for a beat after contact, HR launch shot)
  viewMode() {
    if (!G) return 'title';
    if (G.cut) return 'cut' + G.cut.i; // every shot of a cut is its own camera (snaps)
    if (G.introT > 0 && G.phase === 'batterUp' && G.batter) return 'intro';
    if (G.launchCam > 0 && G.phase === 'play') return 'launch';
    if (G.camHold > 0 && G.camPrev && G.phase === 'play') return G.camPrev;
    return G.camMode;
  },
  updateCam(dt) {
    const d = this.desiredCam();
    const c = this.cam;
    const vm = this.viewMode();
    const rate = d.snap && this.lastMode !== vm ? 1 : 1 - Math.exp(-dt * (d.snap ? 9 : vm === 'field' && this.lastMode === 'launch' ? 2.2 : 3.2));
    if (vm !== this.lastMode) this.prevMode = this.lastMode;
    this.lastMode = vm;
    c.eye = vlerp(c.eye, d.eye, rate); c.tgt = vlerp(c.tgt, d.tgt, rate); c.fov = lerp(c.fov, d.fov, rate);
    POST.focus = [lerp(POST.focus[0], d.focus[0], rate), lerp(POST.focus[1], d.focus[1], rate)];
    let eye = c.eye;
    if (FX.shake > 0) { const s = FX.shake * 0.15; eye = vadd(eye, vadd(vscale(R.camRight, gauss() * s), vscale(R.camUp, gauss() * s))); }
    this.aimZoom = lerp(this.aimZoom || 1, G && G.phase === 'aim' ? 0.84 : 1, 1 - Math.exp(-dt * 12));
    glSetCamera(eye, c.tgt, c.fov * (1 - 0.09 * FX.punch) * this.aimZoom * DEG, R.cssW / R.cssH);
  },

  // ---------------- loop ----------------
  loop(t) {
    if (this.frozen) { this.frozenLoop = true; return; }
    requestAnimationFrame(tt => this.loop(tt));
    let dt = Math.min(0.05, (t - (this.last || t)) / 1000);
    this.last = t;
    // automatic quality fallback on slow devices
    if (G && !this.auto && !this.paused) {
      this.perfT = (this.perfT || 0) + dt; this.perfAvg = this.perfAvg === undefined ? dt : this.perfAvg * 0.97 + dt * 0.03;
      if (!this.perfChecked && this.perfT > 5) { this.perfChecked = true; if (this.perfAvg > 0.034 && R.quality === 'high') { R.quality = 'low'; this.resize(); UI.toast('畫面有點卡，已自動切換成低畫質（可在暫停選單調整）'); const qb = document.getElementById('btnQuality'); if (qb) qb.textContent = '畫質：低'; } }
    }
    if (this.auto) dt = 1 / 30 * this.speed;
    this.frameN++;
    R.time += dt;
    const realDt = dt;
    if (FX.hitstop > 0) { FX.hitstop -= dt; dt *= 0.08; }
    if (G && !this.paused) {
      const steps = this.auto ? Math.max(1, Math.round(this.speed)) : 1;
      for (let i = 0; i < steps; i++) { G.update(this.auto ? 1 / 30 : dt); if (G && G.phase === 'play') ABIL.update(this.auto ? 1 / 30 : dt * G.timeScale * G.slowmo); }
    } else if (!G) for (const p of this.demo) animatePlayerDemo(p, dt);
    ST.cheer = lerp(ST.cheer, ST.cheerTarget, 1 - Math.exp(-dt * 3)); ST.cheerTarget = Math.max(0, ST.cheerTarget - dt * 0.25);
    FX.update(dt);
    this.updateCam(dt);
    const _t0 = performance.now();
    this.render();
    const _t1 = performance.now();
    UI.frame(dt);
    FX.drawLines(realDt);
    if (this.debug && this.frameN % 20 === 0) console.log('frame', this.frameN, 'render ms', (_t1 - _t0).toFixed(1), 'total', (performance.now() - t).toFixed(1));
  },
  allSprites() {
    const out = [];
    if (G) {
      // batting view = the catcher's eyes: leave the catcher and umpire out so nobody stands beside the batter
      const batCam = this.viewMode() === 'bat', C = G.fld && G.fld.pos.C;
      for (const T of G.teams) for (const id in T.players) { const p = T.players[id]; if (p.sprite.visible && !(batCam && p === C)) out.push(p); }
      if (G.ump && !batCam) out.push(G.ump);
    }
    else for (const p of this.demo) if (p.sprite.visible) out.push(p);
    return out;
  },
  render() {
    const gl = R.gl;
    postBegin();
    drawStadium();
    const players = this.allSprites();
    // shadows
    const pr = PROG.decal;
    gl.useProgram(pr.p); gl.uniformMatrix4fv(pr.u.uVP, false, R.vp);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
    gl.bindVertexArray(R.quadVAO);
    for (const p of players) {
      const s = p.sprite.scale * (1 - Math.min(0.5, p.lift * 0.15));
      gl.uniform3f(pr.u.uPos, p.pos[0], groundY(p.pos[0], p.pos[2]) + 0.03, p.pos[2]);
      gl.uniform2f(pr.u.uSize, 0.95 * s, 0.7 * s); gl.uniform1f(pr.u.uRot, 0); gl.uniform1f(pr.u.uShape, 0); gl.uniform4f(pr.u.uCol, 0.05, 0.03, 0.1, 0.42);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    const b = FLD.ball;
    const ballVisible = G && b.state !== 'none' && b.pos[1] > -1;
    if (ballVisible) {
      const gy = groundY(b.pos[0], b.pos[2]) + 0.03;
      const hgt = Math.max(0, b.pos[1] - gy);
      const a = (G.pitch && G.pitch.clones && G.phase === 'flight') ? 0.62 : 0.45 / (1 + hgt * 0.08); // clone pitch: only the real ball casts this shadow
      gl.uniform3f(pr.u.uPos, b.pos[0], gy, b.pos[2]); gl.uniform2f(pr.u.uSize, 0.32, 0.32); gl.uniform1f(pr.u.uShape, 0); gl.uniform4f(pr.u.uCol, 0.02, 0.02, 0.05, a);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    // landing marker for fly balls
    if (G && G.phase === 'play' && b.state === 'fly' && FLD.pred && !b.sunBlind && !b.invisible && !(b.skyT > 0) && !W8.fog) {
      const land = FLD.pred.find(pt => !pt.air);
      if (land) {
        const pulse = 0.8 + 0.2 * Math.sin(R.time * 10);
        gl.uniform3f(pr.u.uPos, land.p[0], groundY(land.p[0], land.p[2]) + 0.05, land.p[2]); gl.uniform2f(pr.u.uSize, 2.2 * pulse, 2.2 * pulse); gl.uniform1f(pr.u.uShape, 1); gl.uniform4f(pr.u.uCol, 1, 0.95, 0.6, 0.75);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    }
    // batter's aura ring on the ground
    if (G && G.batter && ['batterUp', 'pre', 'windup', 'flight', 'aim'].includes(G.phase) && AURA[G.batter.hero.id]) {
      const B = G.batter, c = AURA[B.hero.id].c, sc = B.sprite.scale || 1, pulse = 0.85 + 0.15 * Math.sin(R.time * 4);
      gl.uniform3f(pr.u.uPos, B.pos[0], groundY(B.pos[0], B.pos[2]) + 0.04, B.pos[2]); gl.uniform2f(pr.u.uSize, 1.5 * sc * pulse, 1.5 * sc * pulse); gl.uniform1f(pr.u.uShape, 1); gl.uniform4f(pr.u.uCol, c[0], c[1], c[2], 0.55);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.depthMask(true); gl.disable(gl.BLEND);
    // sprites
    const batView = G && this.viewMode() === 'bat' && ['pre', 'windup', 'flight', 'batterUp', 'result', 'play', 'aim'].includes(G.phase);
    for (const p of players) { p.sprite.dither = false; this.updateSpriteLOD(p); }
    beginSprites();
    for (const p of players) drawSprite(p.sprite, p.sprite.tint && p.petrify > 0 ? [0.7, 0.7, 0.72] : [1, 1, 1]);
    // ball
    if (ballVisible) this.drawBall();
    FX.zoneFrame = batView && ['pre', 'windup', 'flight'].includes(G.phase) ? (G.batter && G.batter.hero.passive.id === 'tinyZone' ? 0.6 : 1) : 0;
    FX.draw();
    postEnd();
  },
  drawBall() {
    const gl = R.gl, pr = PROG.sprite, b = FLD.ball;
    gl.useProgram(pr.p);
    gl.bindTexture(gl.TEXTURE_2D, this.ballTex);
    const draw = (pos, sz, tint) => {
      gl.uniform3f(pr.u.uPos, pos[0], pos[1], pos[2]); gl.uniform2f(pr.u.uSize, sz, sz); gl.uniform2f(pr.u.uAnchor, 0.5, 0.5);
      gl.uniform4f(pr.u.uUVRect, 0, 0, 1, 1); gl.uniform4fv(pr.u.uTint, tint || [1, 1, 1, 1]); gl.uniform3f(pr.u.uFlash, 0.15, 0.15, 0.15); gl.uniform3f(pr.u.uEnv, 1, 1, 1); gl.uniform1f(pr.u.uDither, 0);
      gl.bindVertexArray(R.quadVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    const dist = vdist(R.camPos, b.pos);
    const sz = clamp(0.2 * (dist / 12), 0.2, 0.6) * (b.size || 1);
    const p = G.pitch;
    if (G.phase === 'flight' && p && p.clones) { // clone pitch: the pack looks identical (true sight dims the fakes)
      for (const c of p.clones) if (p.t / c.T <= 1.02) draw(clonePos(p, c, p.t), sz, p.trueSight ? [1, 1, 1, 0.3] : null);
      draw(b.pos, sz, p.trueSight ? [0.6, 1, 0.6, 1] : null);
    }
    else if (b.visible !== false && !(b.invisible && G.phase === 'play' && FLD.playT < 1.5)) draw(b.pos, sz);
    const ph = FLD.phantomBall;
    if (ph && !ph.dead) draw(ph.pos, sz);
  },
  updateSpriteLOD(p) {
    const sp = p.sprite;
    const hgt = 1.45 * sp.scale;
    const a = worldToScreen([sp.pos[0], sp.pos[1] + sp.lift, sp.pos[2]]), c = worldToScreen([sp.pos[0], sp.pos[1] + sp.lift + hgt, sp.pos[2]]);
    if (a[2] <= 0) return;
    const hCss = Math.abs(a[1] - c[1]);
    const K = 2.8;
    let px = hCss / K;
    let ppm = clamp(Math.round(px / 1.45 / 4) * 4, 12, 96);
    sp.render(ppm);
  },
};
function animatePlayerDemo(p, dt) {
  p.anim.t += dt; p.animT += dt;
  p.sprite.pos = p.pos; p.sprite.yaw = p.yaw; p.sprite.scale = p.hero.look.scale || 1;
  const f = Math.floor(p.anim.t * ANIM_FPS);
  const key = p.anim.k + ':' + f;
  if (key !== p.poseKeyRaw) { p.poseKeyRaw = key; p.sprite.look._t = p.animT; p.sprite.pose = playerPose(p, p.animT); p.sprite.poseKey = key; }
}
if (!window.__noBoot) window.addEventListener('load', () => MAIN.boot());
