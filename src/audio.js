// ===== audio.js : procedural sound effects =====
const SFX = {
  ctx: null, master: null, noise: null, muted: false, crowdGain: null, crowdFilter: null,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.8; this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
      // crowd ambience
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
      const g = this.ctx.createGain(); g.gain.value = 0.05;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      this.crowdGain = g; this.crowdFilter = f;
    } catch (e) { this.ctx = null; }
  },
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.8; },
  t() { return this.ctx ? this.ctx.currentTime : 0; },
  nb(o) { // noise burst
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = o.rate || 1;
    const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur); f.Q.value = o.q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.g || 0.5, t + (o.a || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 1.5); s.stop(t + o.dur + 0.05);
  },
  tone(o) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t); if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.g || 0.2, t + (o.a || 0.005)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node = osc;
    if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(this.master); osc.start(t); osc.stop(t + o.dur + 0.05);
  },
  // bat on ball: tier 0 weak, 1 solid, 2 sweet spot, 3 home run
  crack(q = 1, ev = 40, tier = 1) {
    const hard = clamp((ev - 25) / 25, 0, 1);
    // sharp transient
    this.nb({ type: 'highpass', f: 3200, dur: 0.03, g: 0.75 + hard * 0.35, a: 0.001, q: 0.7 });
    // wooden body (two damped partials)
    this.tone({ type: 'triangle', f: 1300 - hard * 300, f2: 620, dur: 0.07 + tier * 0.025, g: 0.38 + q * 0.28, a: 0.001 });
    this.tone({ type: 'sine', f: 2700 - hard * 400, f2: 1700, dur: 0.05 + tier * 0.02, g: 0.14 + q * 0.12, a: 0.001 });
    this.nb({ type: 'bandpass', f: 1000, dur: 0.1, g: 0.3 * q, q: 2.2, a: 0.001 });
    // weight
    if (tier >= 1) this.tone({ type: 'sine', f: 150, f2: 52, dur: 0.14 + tier * 0.06, g: 0.3 + tier * 0.14, a: 0.002 });
    if (tier >= 2) { // ringing sweet spot + stadium slap-back echo
      this.tone({ type: 'sine', f: 3150, dur: 0.32, g: 0.05, a: 0.002 });
      [0.11, 0.23].forEach((d, i) => { this.nb({ type: 'highpass', f: 2800, dur: 0.03, g: 0.28 / (i + 1), a: 0.001, delay: d }); this.tone({ type: 'triangle', f: 1150, f2: 640, dur: 0.07, g: 0.12 / (i + 1), a: 0.001, delay: d }); });
      this.nb({ type: 'bandpass', f: 2400, f2: 700, dur: 0.45, g: 0.12, q: 1.5, delay: 0.03 }); // ball whoosh away
    }
    if (tier >= 3) { this.tone({ type: 'sine', f: 95, f2: 32, dur: 1.1, g: 0.55, a: 0.003 }); this.nb({ type: 'lowpass', f: 1100, f2: 70, dur: 1.2, g: 0.42, a: 0.002 }); }
    this.cheer([0.35, 0.6, 1.0, 1.5][tier]);
  },
  // bat touches the ball (the full crack comes when the hit is released)
  contactTick(q = 1) {
    this.nb({ type: 'bandpass', f: 1400, dur: 0.05, g: 0.35 + q * 0.2, q: 2, a: 0.001 });
    this.tone({ type: 'sine', f: 520, f2: 260, dur: 0.12, g: 0.18, a: 0.001 });
    this.nb({ type: 'highpass', f: 5000, f2: 1500, dur: 0.5, g: 0.06, a: 0.05 });
  },
  // catcher's mitt: level 0 ball, 1 strike, 2 strikeout
  mittPop(kmh = 140, level = 1) {
    const k = clamp((kmh - 100) / 80, 0, 1);
    this.nb({ type: 'highpass', f: 2600, dur: 0.022, g: 0.45 + k * 0.4 + level * 0.1, a: 0.001 });
    this.nb({ type: 'bandpass', f: 620, dur: 0.07, g: 0.55 + k * 0.35, q: 1.3, a: 0.001 });
    this.tone({ type: 'sine', f: 170, f2: 58, dur: 0.1 + level * 0.04, g: 0.3 + k * 0.25 + level * 0.08, a: 0.001 });
    if (level >= 1) this.nb({ type: 'highpass', f: 2400, dur: 0.025, g: 0.18, a: 0.001, delay: 0.1 });
  },
  // strike three sting (taiko hits + bright ring)
  kSting(cheer = true) {
    [0, 0.13].forEach((d, i) => { this.tone({ type: 'sine', f: 128, f2: 46, dur: 0.32, g: 0.55 - i * 0.12, a: 0.002, delay: d }); this.nb({ type: 'lowpass', f: 700, f2: 120, dur: 0.22, g: 0.35, a: 0.002, delay: d }); });
    this.tone({ type: 'triangle', f: 1760, dur: 0.5, g: 0.06, a: 0.004, delay: 0.13 });
    this.tone({ type: 'triangle', f: 2637, dur: 0.4, g: 0.035, a: 0.004, delay: 0.13 });
    if (cheer) this.cheer(1.1);
  },
  hrRoar() {
    this.cheer(2.2);
    this.nb({ type: 'bandpass', f: 900, f2: 1300, dur: 2.8, g: 0.22, q: 0.6, a: 0.25 });
  },
  mitt(v = 1) { this.nb({ type: 'lowpass', f: 600, dur: 0.07, g: 0.5 * v }); this.tone({ type: 'sine', f: 220, f2: 90, dur: 0.08, g: 0.3 * v }); },
  whoosh(v = 1) { this.nb({ type: 'bandpass', f: 700, f2: 2600, dur: 0.22, g: 0.18 * v, q: 1.4 }); },
  swing() { this.nb({ type: 'bandpass', f: 500, f2: 1800, dur: 0.14, g: 0.22, q: 1.2 }); },
  out() { this.tone({ type: 'square', f: 330, f2: 220, dur: 0.18, g: 0.06, lp: 1400 }); },
  // rival showdown sting: gong + brass stab
  rival() {
    [98, 147, 196].forEach((f, i) => this.tone({ type: 'sine', f, dur: 2.0, g: 0.22 / (i + 1), a: 0.01 }));
    this.nb({ type: 'bandpass', f: 380, dur: 1.4, g: 0.16, q: 4 });
    [0, 0.16].forEach(d => { [220, 277, 330].forEach(f => this.tone({ type: 'sawtooth', f, dur: 0.32, g: 0.05, lp: 2200, delay: d + 0.2 })); });
    this.tone({ type: 'sine', f: 70, f2: 38, dur: 0.6, g: 0.5, delay: 0.2 });
    this.cheer(1.2);
  },
  // awakening: rising roar + heavy hit
  awaken() {
    this.nb({ type: 'bandpass', f: 300, f2: 2400, dur: 0.7, g: 0.3, q: 1.2, a: 0.3 });
    this.tone({ type: 'sawtooth', f: 110, f2: 330, dur: 0.6, g: 0.08, lp: 1400, a: 0.2 });
    this.tone({ type: 'sine', f: 90, f2: 34, dur: 0.8, g: 0.6, delay: 0.55 });
    this.nb({ type: 'lowpass', f: 900, f2: 80, dur: 0.6, g: 0.45, delay: 0.55 });
  },
  // 關鍵時刻: three taiko hits
  taiko() {
    [0, 0.2, 0.4].forEach((d, i) => { this.tone({ type: 'sine', f: 120 - i * 6, f2: 44, dur: 0.42, g: 0.6, a: 0.002, delay: d }); this.nb({ type: 'lowpass', f: 600, f2: 90, dur: 0.25, g: 0.4, a: 0.002, delay: d }); });
    this.nb({ type: 'highpass', f: 2600, dur: 0.05, g: 0.25, delay: 0.62 });
  },
  slide() { this.nb({ type: 'bandpass', f: 1800, f2: 500, dur: 0.5, g: 0.32, q: 0.8, a: 0.02 }); this.nb({ type: 'lowpass', f: 500, dur: 0.3, g: 0.2, a: 0.01 }); },
  thud() { this.tone({ type: 'sine', f: 140, f2: 50, dur: 0.22, g: 0.5 }); this.nb({ type: 'lowpass', f: 400, dur: 0.18, g: 0.5 }); },
  horn() { [0, 0.18].forEach((d, i) => { this.tone({ type: 'sawtooth', f: i ? 392 : 294, dur: 0.32, g: 0.07, lp: 1600, delay: d }); this.tone({ type: 'sawtooth', f: i ? 494 : 370, dur: 0.32, g: 0.05, lp: 1600, delay: d }); }); },
  ump(call) {
    if (call === 'strike' || call === 'strike3') { this.tone({ type: 'square', f: 880, dur: 0.07, g: 0.05, lp: 2500 }); this.tone({ type: 'square', f: call === 'strike3' ? 660 : 990, dur: 0.12, g: 0.05, lp: 2500, delay: 0.08 }); }
    else if (call === 'ball') this.tone({ type: 'sine', f: 520, dur: 0.12, g: 0.07 });
    else if (call === 'foul') this.tone({ type: 'triangle', f: 600, f2: 400, dur: 0.15, g: 0.08 });
  },
  special(side) {
    if (side === 0) { // gong-ish
      [110, 163, 247, 311].forEach((f, i) => this.tone({ type: 'sine', f, dur: 2.2, g: 0.16 / (i + 1), a: 0.01 }));
      this.nb({ type: 'bandpass', f: 300, dur: 1.2, g: 0.1, q: 3 });
    } else {
      [262, 330, 392, 523].forEach((f, i) => this.tone({ type: 'sawtooth', f, dur: 1.2, g: 0.05, lp: 2400, a: 0.08, delay: i * 0.04 }));
    }
    this.nb({ type: 'highpass', f: 3000, f2: 8000, dur: 0.6, g: 0.12 });
  },
  homer() { this.cheer(1.6); [523, 659, 784, 1046].forEach((f, i) => this.tone({ type: 'square', f, dur: 0.22, g: 0.05, lp: 3000, delay: 0.1 + i * 0.12 })); },
  score() { [784, 1046].forEach((f, i) => this.tone({ type: 'triangle', f, dur: 0.25, g: 0.12, delay: i * 0.1 })); },
  ko() { this.tone({ type: 'sine', f: 90, f2: 35, dur: 0.7, g: 0.6 }); this.nb({ type: 'lowpass', f: 900, f2: 120, dur: 0.6, g: 0.6 }); this.tone({ type: 'square', f: 600, f2: 120, dur: 0.6, g: 0.05, lp: 1500, delay: 0.1 }); },
  end(win) { (win ? [523, 659, 784, 1046, 1318] : [392, 349, 311, 262]).forEach((f, i) => this.tone({ type: 'square', f, dur: 0.3, g: 0.06, lp: 2400, delay: i * 0.16 })); this.cheer(win ? 1.5 : 0.6); },
  boom() { this.nb({ type: 'lowpass', f: 500, f2: 60, dur: 0.8, g: 0.35 }); },
  thunder() { this.nb({ type: 'lowpass', f: 1800, f2: 90, dur: 1.4, g: 0.7, a: 0.002 }); this.nb({ type: 'highpass', f: 2500, dur: 0.12, g: 0.4 }); },
  zap() { this.tone({ type: 'square', f: 1800, f2: 400, dur: 0.12, g: 0.06 }); },
  wind() { this.nb({ type: 'bandpass', f: 400, f2: 1600, dur: 0.9, g: 0.22, q: 2 }); },
  slash() { this.nb({ type: 'highpass', f: 6000, f2: 1500, dur: 0.25, g: 0.4 }); this.tone({ type: 'sine', f: 2400, f2: 1200, dur: 0.3, g: 0.08 }); },
  tick() { for (let i = 0; i < 6; i++) this.tone({ type: 'square', f: i % 2 ? 1800 : 1400, dur: 0.03, g: 0.05, delay: i * 0.33 }); },
  click() { this.tone({ type: 'square', f: 1200, dur: 0.03, g: 0.04, lp: 3000 }); },
  cheer(level = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime, g = this.crowdGain.gain, f = this.crowdFilter.frequency;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.05 + 0.18 * level, t + 0.15); g.linearRampToValueAtTime(0.05, t + 1.2 + level * 1.5);
    f.cancelScheduledValues(t); f.setValueAtTime(f.value, t); f.linearRampToValueAtTime(900 + level * 400, t + 0.15); f.linearRampToValueAtTime(700, t + 2);
  },
};

// ===== cheer songs: a tiny step sequencer (each team's song plays while it bats) =====
// notation: one token per eighth note, '-' holds the previous note, '.' is a rest, '|' is ignored
const SONGS = {
  // 東方神將隊: pentatonic flute melody over taiko
  E: {
    bpm: 132, lead: 'flute', bass: 'tri', kit: 'taiko',
    mel: 'A4 - D5 - E5 - F#5 - | A5 - - - F#5 - E5 - | D5 - E5 - F#5 - B4 - | A4 - - - - - . . | A4 - D5 - E5 - F#5 - | B5 - A5 - F#5 - A5 - | E5 - F#5 E5 D5 - B4 - | D5 - - - - - . .',
    bass: 'D2 . D2 A2 D2 . A2 D2 | D2 . D2 A2 D2 . A2 D2 | G2 . G2 D3 G2 . D3 G2 | A2 . A2 E3 A2 . E3 A2 | D2 . D2 A2 D2 . A2 D2 | B1 . B1 F#2 B1 . F#2 B1 | G2 . G2 D3 A2 . E3 A2 | D2 . D2 A2 D2 - - .',
    drum: 'K . r k K r k r', fill: 'K k K k K K K r',
  },
  // 西方神祇隊: brass march over bass drum and snare
  W: {
    bpm: 144, lead: 'brass', bass: 'saw', kit: 'march',
    mel: 'G4 - C5 - E5 - G5 - | A5 - G5 - E5 - C5 - | D5 - E5 - F5 - D5 - | G5 - - - - - . . | G4 - C5 - E5 - G5 - | C6 - B5 - A5 - G5 - | F5 - A5 - G5 - B4 - | C5 - - - - - . .',
    bass: 'C2 . G2 . C2 . G2 . | F2 . C3 . A1 . E2 . | D2 . A2 . G1 . D2 . | G1 . D2 . G1 . B1 . | C2 . G2 . C2 . G2 . | A1 . E2 . F2 . C3 . | F2 . C3 . G2 . D3 . | C2 . G2 . C2 - - .',
    drum: 'B h S h B B S h', fill: 'B . S S S S S S',
  },
};
const MUSIC = {
  on: false, team: null, step: 0, nextT: 0, timer: null, gain: null, clutchOn: false, vol: 0.34, want: null, parsed: {}, enabled: true,
  midi(n) { const m = /^([A-G])([#b]?)(-?\d)$/.exec(n); if (!m) return null; return 12 * (+m[3] + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); },
  parse(id) {
    if (this.parsed[id]) return this.parsed[id];
    const S = SONGS[id], tok = s => s.split(/\s+/).filter(t => t && t !== '|');
    const notes = line => { const t = tok(line), out = []; for (let i = 0; i < t.length; i++) { const m = this.midi(t[i]); if (m === null) { out.push(null); continue; } let d = 1; while (t[i + d] === '-') d++; out.push({ m, d }); } return out; };
    const P = { mel: notes(S.mel), bass: notes(S.bass), drum: tok(S.drum), fill: tok(S.fill) };
    P.len = P.mel.length;
    return (this.parsed[id] = P);
  },
  ensure() {
    if (!SFX.ctx) return false;
    if (!this.gain) { this.gain = SFX.ctx.createGain(); this.gain.gain.value = 0.0001; this.gain.connect(SFX.master); }
    return true;
  },
  unlock() { if (this.want && !this.on) this.play(this.want); },
  play(team) {
    this.want = team;
    if (!this.enabled || !this.ensure()) return;
    if (this.on && this.team === team) return;
    const c = SFX.ctx, t = c.currentTime;
    this.team = team; this.song = this.parse(team); this.step = 0; this.nextT = t + 0.35; this.on = true;
    const g = this.gain.gain; g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t); g.linearRampToValueAtTime(this.vol, t + 0.8);
    if (!this.timer) this.timer = setInterval(() => this.tick(), 40);
  },
  setEnabled(on) {
    this.enabled = on;
    try { localStorage.setItem('hb_music', on ? '1' : '0'); } catch (e) { }
    if (on) { if (this.want) { const w = this.want; this.want = null; this.play(w); } }
    else { const w = this.want; this.stop(); this.want = w; }
  },
  stop() {
    this.want = null; this.on = false; this.clutchOn = false;
    if (this.gain && SFX.ctx) { const t = SFX.ctx.currentTime, g = this.gain.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.0001, t + 0.5); }
    clearInterval(this.timer); this.timer = null;
  },
  clutch(on) { this.clutchOn = !!on; },
  pause(p) { if (!this.gain || !SFX.ctx) return; const t = SFX.ctx.currentTime, g = this.gain.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(p ? 0.0001 : this.vol, t + 0.25); },
  duck(sec = 2) { if (!this.gain || !SFX.ctx || !this.on) return; const t = SFX.ctx.currentTime, g = this.gain.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(this.vol * 0.2, t + 0.15); g.setValueAtTime(this.vol * 0.2, t + sec); g.linearRampToValueAtTime(this.vol, t + sec + 1); },
  tick() {
    if (!this.on || !SFX.ctx || SFX.ctx.state !== 'running') return;
    const c = SFX.ctx, S = this.song, st = 60 / (SONGS[this.team].bpm * (this.clutchOn ? 1.12 : 1)) / 2;
    if (this.nextT < c.currentTime - 0.3) this.nextT = c.currentTime + 0.05; // tab was asleep
    while (this.nextT < c.currentTime + 0.18) { this.playStep(this.step, this.nextT, st); this.step = (this.step + 1) % S.len; this.nextT += st; }
  },
  playStep(i, t, st) {
    const S = this.song, def = SONGS[this.team], up = this.clutchOn ? 2 : 0, bar = Math.floor(i / 8), k = i % 8;
    const n = S.mel[i]; if (n) this.lead(def.lead, n.m + up, t, n.d * st);
    const b = S.bass[i]; if (b) this.bassNote(def.bass, b.m + up, t, Math.min(b.d, 2) * st);
    const d = (bar % 8 === 7 ? S.fill : S.drum)[k]; if (d && d !== '.') this.drum(d, t);
    if (i === 0) this.drum(def.kit === 'taiko' ? 'G' : 'C', t);
    if (this.clutchOn) { if (k % 2 === 0) this.drum('X', t); if (def.kit === 'march') this.drum('h', t + st / 2); else this.drum('r', t + st / 2); }
  },
  hz: m => 440 * Math.pow(2, (m - 69) / 12),
  env(g, t, a, peak, dur, rel = 0.06) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.setValueAtTime(peak, t + Math.max(a, dur - rel)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel); },
  lead(kind, m, t, dur) {
    const c = SFX.ctx, f = this.hz(m), g = c.createGain(), d = Math.max(0.08, dur * 0.92);
    if (kind === 'flute') {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, t);
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.25, d)); lfo.connect(lg); lg.connect(o.frequency);
      const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(f * 2, t); const g2 = c.createGain(); g2.gain.value = 0.18; o2.connect(g2); g2.connect(g);
      o.connect(g); this.env(g, t, 0.03, 0.2, d); g.connect(this.gain);
      for (const x of [o, o2, lfo]) { x.start(t); x.stop(t + d + 0.1); }
      SFX.nb({ type: 'bandpass', f: 2400, dur: 0.06, g: 0.025, q: 1.5, delay: Math.max(0, t - c.currentTime) });
    } else { // brass: two detuned saws through an opening filter
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2; lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(2800, t + 0.05); lp.frequency.exponentialRampToValueAtTime(1600, t + 0.25);
      for (const det of [-7, 7]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + d + 0.1); }
      lp.connect(g); this.env(g, t, 0.025, 0.11, d); g.connect(this.gain);
    }
  },
  bassNote(kind, m, t, dur) {
    const c = SFX.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = kind === 'saw' ? 'sawtooth' : 'triangle'; o.frequency.setValueAtTime(this.hz(m), t);
    lp.type = 'lowpass'; lp.frequency.value = kind === 'saw' ? 520 : 900;
    o.connect(lp); lp.connect(g); this.env(g, t, 0.01, kind === 'saw' ? 0.2 : 0.3, Math.max(0.08, dur * 0.8), 0.05); g.connect(this.gain);
    o.start(t); o.stop(t + dur + 0.1);
  },
  drum(k, t) {
    const c = SFX.ctx, out = this.gain;
    const thump = (f0, f1, dur, gain) => { const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.02); };
    const noise = (type, f, dur, gain, q = 1) => { const s = c.createBufferSource(); s.buffer = SFX.noise; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02); };
    switch (k) {
      case 'K': thump(105, 46, 0.4, 0.9); noise('lowpass', 380, 0.12, 0.35); break;       // big taiko
      case 'k': thump(190, 110, 0.16, 0.5); break;                                         // small taiko
      case 'r': noise('highpass', 3200, 0.03, 0.22); thump(1700, 1500, 0.02, 0.08); break; // rim
      case 'G': thump(82, 70, 1.6, 0.25); noise('bandpass', 420, 1.0, 0.08, 6); break;     // gong at the top of the loop
      case 'B': thump(120, 44, 0.28, 0.9); break;                                          // bass drum
      case 'S': noise('bandpass', 1900, 0.13, 0.5, 0.8); thump(200, 160, 0.07, 0.25); break; // snare
      case 'h': noise('highpass', 7600, 0.035, 0.16); break;                               // hi-hat
      case 'C': noise('highpass', 5200, 0.9, 0.12); break;                                 // crash
      case 'X': for (let j = 0; j < 3; j++) { const s = c.createBufferSource(); s.buffer = SFX.noise; const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 1300 + j * 300; const g = c.createGain(); const tj = t + j * 0.012; g.gain.setValueAtTime(0.28, tj); g.gain.exponentialRampToValueAtTime(0.0001, tj + 0.07); s.connect(fl); fl.connect(g); g.connect(out); s.start(tj, Math.random()); s.stop(tj + 0.09); } break; // crowd clap
    }
  },
};
