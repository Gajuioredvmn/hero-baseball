// ===== ui.js : DOM overlay, menus, HUD =====
const $ = s => document.querySelector(s);
const UI = {
  opts: { team: 'E', innings: 3, diff: 'normal', first: 1 },
  portraits: {}, hintT: 0, strokeCtx: null, baseBtns: [], mode: null,
  init() {
    // menus
    $('#btnPlay').onclick = () => { SFX.init(); SFX.click(); this.show('scrSetup'); this.fillTeamFaces(); };
    $('#btnRoster').onclick = () => { SFX.init(); SFX.click(); this.show('scrRoster'); this.renderRoster('E'); };
    $('#btnHow').onclick = () => { SFX.init(); SFX.click(); this.show('scrHow'); this.howFrom = 'scrTitle'; };
    $('#setupBack').onclick = () => this.show('scrTitle');
    $('#rosterBack').onclick = () => this.show('scrTitle');
    $('#howBack').onclick = () => this.show(this.howFrom || 'scrTitle');
    document.querySelectorAll('.teamcard').forEach(b => b.onclick = () => { SFX.click(); this.opts.team = b.dataset.team; document.querySelectorAll('.teamcard').forEach(x => x.classList.toggle('on', x === b)); });
    document.querySelector('.teamcard.e').classList.add('on');
    document.querySelectorAll('.seg').forEach(seg => seg.querySelectorAll('button').forEach(b => b.onclick = () => { SFX.click(); seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); const k = seg.dataset.opt; this.opts[k] = k === 'diff' ? b.dataset.v : +b.dataset.v; }));
    document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => { document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b)); this.renderRoster(b.dataset.t); });
    $('#btnStart').onclick = () => { SFX.init(); SFX.click(); MAIN.startGame(this.opts); };
    $('#pauseBtn').onclick = () => { SFX.click(); MAIN.pause(true); };
    $('#btnResume').onclick = () => { SFX.click(); MAIN.pause(false); };
    $('#btnQuality').onclick = () => { R.quality = R.quality === 'high' ? 'low' : 'high'; $('#btnQuality').textContent = '畫質：' + (R.quality === 'high' ? '高' : '低'); MAIN.resize(); try { localStorage.setItem('hb_q', R.quality); } catch (e) { } };
    $('#btnSound').onclick = () => { SFX.setMuted(!SFX.muted); $('#btnSound').textContent = '音效：' + (SFX.muted ? '關' : '開'); };
    $('#btnMusic').onclick = () => { MUSIC.setEnabled(!MUSIC.enabled); $('#btnMusic').textContent = '音樂：' + (MUSIC.enabled ? '開' : '關'); };
    try { if (localStorage.getItem('hb_music') === '0') { MUSIC.enabled = false; $('#btnMusic').textContent = '音樂：關'; } } catch (e) { }
    $('#btnHow2').onclick = () => { this.howFrom = 'scrPause'; this.show('scrHow'); };
    $('#btnQuit').onclick = () => { MAIN.toTitle(); };
    $('#btnAgain').onclick = () => { SFX.click(); MAIN.startGame(this.opts); };
    $('#btnHome').onclick = () => { MAIN.toTitle(); };
    $('#skillBtn').onclick = () => this.openPad();
    document.querySelectorAll('#pitchMenu button').forEach(b => b.onclick = () => {
      SFX.click(); this.pitchType = b.dataset.t; this.showPitchMenu(true);
      if (!this.seenDrawHint || this.seenDrawHint < 2) { this.seenDrawHint = (this.seenDrawHint || 0) + 1; this.hint('從下往上畫出球路，手指放開處就是進壘點', 2.4); }
    });
    $('#padCancel').onclick = () => this.closePad();
    $('#cutSkip').onclick = () => { if (G && G.cut) { SFX.click(); G.advanceCut(true); } };
    document.querySelectorAll('#mini .mb').forEach(b => b.onclick = () => this.miniTap(+b.dataset.b));
    // stroke canvas
    const sc = $('#stroke'); this.strokeCtx = sc.getContext('2d');
    this.initPad();
    try { const q = localStorage.getItem('hb_q'); if (q) { R.quality = q; $('#btnQuality').textContent = '畫質：' + (q === 'high' ? '高' : '低'); } } catch (e) { }
  },
  show(id, overlay) {
    for (const s of document.querySelectorAll('.screen')) { if (s.id === id) s.hidden = false; else if (!overlay || s.id !== 'scrPause') s.hidden = true; }
  },
  hideScreens() { for (const s of document.querySelectorAll('.screen')) s.hidden = true; },

  // ---------- portraits ----------
  portrait(h, ppm = 36, front = true) {
    const key = h.id + ppm + front;
    if (this.portraits[key]) return this.portraits[key];
    const look = buildLook(heroLook(h));
    look._t = 0.6;
    const pose = h.delivery ? POSE.stand(0) : batStance(h.stance || {}, 0.6);
    if (h.delivery) { pose.glove = h.throws === 'L' ? 'R' : 'L'; pose.hR = [0.12, 0.45, 0.18]; pose.hL = [-0.12, 0.45, 0.18]; }
    const yv = front ? 0.35 : 1.2, el = 0.12;
    const v = [Math.sin(yv) * Math.cos(el), Math.sin(el), Math.cos(yv) * Math.cos(el)];
    const V = { r: [-Math.cos(yv), 0, Math.sin(yv)], u: [-Math.sin(el) * Math.sin(yv), Math.cos(el), -Math.sin(el) * Math.cos(yv)], v };
    const s = h.look.scale || 1;
    const p = ppm * Math.max(s, 0.75);
    const W = Math.ceil(2.2 * p), H = Math.ceil(2.3 * p);
    rasEnsure(W, H);
    const J = solveSkeleton(pose, look);
    const parts = buildParts(J, pose, look);
    rasterParts(parts, V, p, W / 2, H - 0.12 * p);
    composite(parts, look);
    drawFace(parts, V, p, W / 2, H - 0.12 * p, look, pose);
    const c = mkCanvas(W, H);
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(RAS.out.slice(0, W * H * 4)), W, H), 0, 0);
    const url = c.toDataURL();
    this.portraits[key] = url;
    return url;
  },
  fillTeamFaces() {
    const pick = { E: ['wukong', 'susanoo', 'nezha', 'kitsune'], W: ['zeus', 'heracles', 'thor', 'athena'] };
    for (const t of ['E', 'W']) {
      const el = document.querySelector(`.teamcard.${t.toLowerCase()} .tc-faces`);
      if (el.childElementCount) continue;
      for (const id of pick[t]) { const img = new Image(); img.src = this.portrait(HERO[id], 24); img.alt = HERO[id].name; el.appendChild(img); }
    }
  },
  symbolSvg(key, col = '#f2cf73') {
    const pts = SYMBOLS[key];
    const d = pts.map((p, i) => (i ? 'L' : 'M') + (3 + p[0] * 22).toFixed(1) + ' ' + (3 + p[1] * 22).toFixed(1)).join(' ');
    return `<svg viewBox="0 0 28 28" aria-hidden="true"><path d="${d}" fill="none" stroke="${col}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  },
  renderRoster(team) {
    const list = $('#rosterList');
    list.innerHTML = '';
    for (const h of HEROES.filter(x => x.team === team)) {
      const st = h.stats;
      const isP = !!h.delivery;
      const bars = isP ? [['球速', (st.velo - 120) / 4], ['控球', st.ctrl], ['變化', st.brk], ['體力', st.sta / 11], ['守備', st.fld]] : [['力量', st.pow], ['巧打', st.con], ['速度', st.spd], ['守備', st.fld], ['肩力', st.arm]];
      const el = document.createElement('div');
      el.className = 'hero';
      el.innerHTML = `<div class="por"><img alt="${h.name}" src="${this.portrait(h, 30)}"></div>
        <div class="info"><div class="hn"><b>${h.name}</b><span>#${h.num} · ${POS_NAME[h.pos]} · ${isP ? (h.throws === 'L' ? '左投' : '右投') : (h.bats === 'L' ? '左打' : '右打')}</span></div>
        <span class="tag">${h.myth}</span>
        <div class="bio">${h.bio}</div>
        <div class="stats">${bars.map(([n, v]) => `<div class="st">${n}<i><b style="width:${clamp(v, 0, 10) * 10}%"></b></i></div>`).join('')}</div>
        <div class="ab">${this.symbolSvg(h.active.sym)}<div><div class="an"><span class="k">${isP ? '魔球' : '必殺'}</span>${h.active.name}</div><div class="ad">${h.active.desc}</div></div></div>
        <div class="ab pas"><svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="9" fill="none" stroke="#9ad0ff" stroke-width="2.4"/></svg><div><div class="an"><span class="k">被動</span>${h.passive.name}</div><div class="ad">${h.passive.desc}</div></div></div></div>`;
      list.appendChild(el);
    }
  },

  // ---------- HUD ----------
  startHud() {
    $('#hud').hidden = false;
    this.sayClear(); this.cutEnd(); this.weatherChip(null);
    const [a, h] = G.teams;
    const t0 = document.querySelector('#scorebar .t0 .tn'), t1 = document.querySelector('#scorebar .t1 .tn');
    t0.textContent = a.meta.short; t0.style.background = a.meta.color;
    t1.textContent = h.meta.short; t1.style.background = h.meta.color;
    this.updateHud(); this.updateGauges();
  },
  updateHud() {
    if (!G) return;
    const [a, h] = G.teams;
    document.querySelector('#scorebar .t0 .runs').textContent = a.runs;
    document.querySelector('#scorebar .t1 .runs').textContent = h.runs;
    document.querySelector('#scorebar .inn .arrow').textContent = G.half ? '▼' : '▲';
    document.querySelector('#scorebar .inn .num').textContent = G.inning;
    const rows = document.querySelectorAll('#scorebar .count .row');
    const set = (row, n) => row.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < n));
    set(rows[0], G.balls); set(rows[1], G.strikes); set(rows[2], G.outs);
  },
  updateGauges() {
    if (!G) return;
    const me = G.user >= 0 ? G.teams[G.user] : G.teams[0], op = G.user >= 0 ? G.teams[1 - G.user] : G.teams[1];
    document.querySelector('#gaugeWrap .bar i').style.width = me.gauge + '%';
    $('#gaugeWrap').classList.toggle('full', me.gauge >= 100);
    document.querySelector('#oppGauge .bar i').style.width = op.gauge + '%';
    $('#oppGauge').classList.toggle('full', op.gauge >= 100);
  },
  batterCard(B, P) {
    const bc = $('#bcard'), pc = $('#pcard');
    const bt = G.teams[B.side].meta, pt = G.teams[P.side].meta;
    bc.querySelector('.nm').innerHTML = `<span style="color:${bt.color}">■</span>${B.hero.name}<small>#${B.hero.num}</small>`;
    bc.querySelector('.sub').textContent = `${POS_NAME[B.hero.pos] || ''} · ${B.hero.bats === 'L' ? '左打' : '右打'}`;
    bc.querySelector('.abl').textContent = `必殺：${B.hero.active.name}`;
    pc.querySelector('.nm').innerHTML = `${P.hero.name}<small>#${P.hero.num}</small><span style="color:${pt.color}">■</span>`;
    pc.querySelector('.sub').textContent = P.hero.delivery ? `魔球：${P.hero.active.name}` : '代打投手';
    this.cardB = B; this.cardP = P;
  },
  banner(t1, t2, color, dur = 1.6) {
    const b = $('#banner');
    b.querySelector('.b1').textContent = t1; b.querySelector('.b1').style.color = color || '#fff';
    b.querySelector('.b2').textContent = t2 || ''; b.querySelector('.b2').hidden = !t2;
    b.style.setProperty('--bd', dur + 's');
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  },
  specialBanner(pl, a) {
    const b = $('#sbanner');
    b.querySelector('.sb-name').textContent = `${pl.hero.name}的${pl.hero.delivery ? '魔球' : '必殺技'}`;
    b.querySelector('.sb-move').textContent = a.name;
    b.querySelector('.sb-desc').textContent = a.desc;
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on');
  },
  flashCall(text, color, cls, sub) {
    const c = $('#call');
    c.innerHTML = '';
    const a = document.createElement('span'); a.className = 'c1'; a.textContent = text; c.appendChild(a);
    if (sub) { const b2 = document.createElement('span'); b2.className = 'c2'; b2.textContent = sub; c.appendChild(b2); }
    c.style.color = color || '#fff';
    c.className = cls || '';
    void c.offsetWidth; c.classList.add('on');
  },
  hrBanner(title, sub) {
    const el = $('#hrBanner');
    el.querySelector('.hr1').textContent = title; el.querySelector('.hr2').textContent = sub;
    el.hidden = false; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(this._hrT); this._hrT = setTimeout(() => { el.classList.remove('on'); el.hidden = true; }, 2700);
  },
  toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('on'); void t.offsetWidth; t.classList.add('on'); },
  // ---------- live commentary ticker ----------
  // pri: 0 filler, 1 normal, 2 big moment (gold); a newer line can push out queued lower-priority ones
  say(text, pri = 1) {
    if (!G || G.autoAll || !text) return;
    const q = this.sayQ || (this.sayQ = []);
    while (q.length >= 2) { const k = q.findIndex(x => x.pri <= pri); if (k < 0) return; q.splice(k, 1); }
    q.push({ text, pri, t: 0 });
    if (!this.sayCur || (pri >= 2 && this.sayCur.pri < 2 && this.sayCur.t > 0.6)) this.sayNext();
  },
  sayNext() {
    const el = $('#caption'), it = (this.sayQ || []).shift();
    if (!it) { this.sayCur = null; el.classList.remove('on'); return; }
    this.sayCur = it;
    el.querySelector('.cpT').textContent = it.text;
    el.classList.toggle('hot', it.pri >= 2);
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  },
  sayClear() { this.sayQ = []; this.sayCur = null; $('#caption').classList.remove('on'); },
  // ---------- cinematic cuts (rival showdown, awakening, special move cut-in) ----------
  cutShot(s) {
    const box = $('#cutBox'), vs = $('#vs'), ci = $('#cutin');
    vs.hidden = s.kind !== 'vs'; ci.hidden = s.kind !== 'cutin';
    $('#cutSkip').hidden = false;
    this.hideIntro();
    if (s.kind === 'vs') {
      const P = s.p, B = s.b, tp = G.teams[P.side].meta, tb = G.teams[B.side].meta;
      vs.style.setProperty('--c1', tp.color); vs.style.setProperty('--c1d', tp.dark); vs.style.setProperty('--c2', tb.color); vs.style.setProperty('--c2d', tb.dark);
      const top = vs.querySelector('.top'), bot = vs.querySelector('.bot');
      top.querySelector('img').src = this.portrait(P.hero, 40); top.querySelector('img').alt = P.hero.name;
      bot.querySelector('img').src = this.portrait(B.hero, 40); bot.querySelector('img').alt = B.hero.name;
      top.querySelector('.vsRole').textContent = `${tp.short}・投手`; top.querySelector('.vsName').textContent = P.hero.name;
      bot.querySelector('.vsRole').textContent = `${tb.short}・打者`; bot.querySelector('.vsName').textContent = B.hero.name;
      vs.querySelector('.vsTheme').textContent = s.theme || '';
      for (const el of vs.querySelectorAll('.vsHalf, .vsTag, .vsV, .vsTheme')) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
    }
    if (s.kind === 'cutin') {
      const pl = s.who, t = G.teams[pl.side].meta, a = pl.hero.active;
      ci.style.setProperty('--c', t.color); ci.style.setProperty('--cd', t.dark); ci.style.setProperty('--dur', (s.dur || 2) + 's');
      ci.querySelector('.ciWho').textContent = `${pl.hero.name}的${pl.hero.delivery && pl === G.fld.pos.P ? '魔球' : '必殺技'}`;
      ci.querySelector('.ciMove').textContent = a.name;
      ci.querySelector('.ciDesc').textContent = a.desc;
      const band = ci.querySelector('.ciBand'), mv = ci.querySelector('.ciMove');
      for (const el of [band, mv]) { el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
    }
    if (s.line) {
      const pl = s.who, t = pl ? G.teams[pl.side].meta : null;
      box.style.setProperty('--cc', t ? t.color : '#555');
      box.querySelector('.cbName').textContent = pl ? pl.hero.name : (s.name || '');
      this.typeFull = s.line; this.typeN = 0; this.typeT = 0;
      box.querySelector('.cbText').textContent = '';
      box.hidden = false; box.style.animation = 'none'; void box.offsetWidth; box.style.animation = '';
    } else { box.hidden = true; this.typeFull = null; }
    if (s.stamp) this.stamp(s.stamp, s.stampCol);
  },
  cutTypeDone() { return !this.typeFull || this.typeN >= this.typeFull.length; },
  cutFinishType() { if (!this.typeFull) return; this.typeN = this.typeFull.length; $('#cutBox .cbText').textContent = this.typeFull; },
  cutEnd() {
    $('#cutBox').hidden = true; $('#vs').hidden = true; $('#cutin').hidden = true; $('#cutSkip').hidden = true;
    this.typeFull = null;
  },
  stamp(text, col) {
    const el = $('#stamp'), sp = el.querySelector('span');
    sp.textContent = text; el.style.setProperty('--sc', col || '#ff4a32');
    el.hidden = false; sp.style.animation = 'none'; void sp.offsetWidth; sp.style.animation = '';
    clearTimeout(this._stT); this._stT = setTimeout(() => { el.hidden = true; }, 1750);
  },
  weatherChip(kind) {
    const el = $('#w8chip');
    if (!kind) { el.hidden = true; return; }
    const W = WEATHER[kind];
    el.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${W.icon}</svg>${W8label(true)}`;
    el.style.color = W.chip; el.hidden = false;
  },
  timing(dt, W) {
    const el = document.getElementById('timing');
    if (!el) return;
    let txt, cls;
    if (dt === null) { txt = '構不到！'; cls = 'bad'; }
    else if (Math.abs(dt) < W * 0.4) { txt = '完美時機！'; cls = 'good'; }
    else if (dt < 0) { txt = `早了 ${Math.round(-dt * 1000)} 毫秒`; cls = Math.abs(dt) > W * 1.75 ? 'bad' : 'ok'; }
    else { txt = `晚了 ${Math.round(dt * 1000)} 毫秒`; cls = Math.abs(dt) > W * 1.75 ? 'bad' : 'ok'; }
    el.textContent = txt; el.className = 'on ' + cls;
    clearTimeout(this._tmT); this._tmT = setTimeout(() => { el.className = ''; }, 1300);
  },
  hint(text, dur = 2) { const h = $('#hint'); h.textContent = text; h.classList.add('on'); this.hintT = dur; },
  hideHint() { $('#hint').classList.remove('on'); this.hintT = 0; },
  prePitch() {
    if (G.isUserDefense()) {
      $('#aim').hidden = false;
      this.showPitchMenu(true);
      if (!this.seenPitchHint || this.seenPitchHint < 3) { this.hint(this.pitchType ? '從下往上畫出球路，手指放開處就是進壘點' : '先選球種，再從下往上畫出球路', 2.6); this.seenPitchHint = (this.seenPitchHint || 0) + 1; }
    }
    if (G.isUserOffense()) {
      if (!this.seenBatHint || this.seenBatHint < 3) { this.hint('球進本壘板那一刻按下螢幕，打中後滑動瞄準、放開決定力氣', 2.8); this.seenBatHint = (this.seenBatHint || 0) + 1; }
    }
  },
  hidePitchUI() { $('#aim').hidden = true; this.showPitchMenu(false); },
  showPitchMenu(on) {
    const m = $('#pitchMenu'); if (!m) return;
    m.hidden = !on; $('#hud').classList.toggle('pitching', on);
    if (on) for (const b of m.querySelectorAll('button')) b.classList.toggle('sel', b.dataset.t === this.pitchType);
  },
  intro(b, T) {
    const el = $('#intro'), h = b.hero, meta = T.meta;
    el.style.setProperty('--tc', meta.color); el.style.setProperty('--td', meta.dark);
    el.querySelector('.inTeam').textContent = `${meta.name}　#${h.num}　${POS_NAME[h.pos] || h.pos}`;
    el.querySelector('.inName').textContent = h.name;
    el.querySelector('.inStance').textContent = STANCE_NAME[h.id] || '';
    el.querySelector('.inSkill').textContent = `必殺：${h.active.name}`;
    clearTimeout(this._inT);
    el.hidden = false; el.classList.remove('on', 'off'); void el.offsetWidth; el.classList.add('on');
    this.hideHint();
  },
  hideIntro() { const el = $('#intro'); if (el.hidden) return; el.classList.add('off'); clearTimeout(this._inT); this._inT = setTimeout(() => { el.hidden = true; el.classList.remove('on', 'off'); }, 220); },
  flashMenu() { const m = $('#pitchMenu'); m.classList.remove('flash'); void m.offsetWidth; m.classList.add('flash'); },
  showPower(on) { const el = $('#powerBar'); el.hidden = !on; if (on) this.setPower(0); },
  setPower(v) { const el = $('#powerBar'); el.querySelector('.pbf').style.width = (v * 100).toFixed(1) + '%'; el.classList.toggle('max', v >= 0.88); },
  aimRect() {
    const el = document.querySelector('#aim .zone');
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
  },
  pitchFeedback(prm) { this.toast(`${prm.typeName} ${Math.round(prm.kmh)} km/h`); },
  swingFx(pt) { this.tapRing = { x: pt[0], y: pt[1], t: 0 }; },
  drawStroke(pts, start) { this.strokePts = pts; },
  layoutAim() {
    const aim = $('#aim'); if (aim.hidden) return;
    // the real strike zone, projected from the plate onto the screen
    const sc = G.batter && G.batter.hero.passive.id === 'tinyZone' ? 0.6 : 1;
    const hw = ZONE.x * (sc < 1 ? 0.75 : 1), zc = (ZONE.bot + ZONE.top) / 2, hh = (ZONE.top - ZONE.bot) / 2 * sc;
    const a = worldToScreen([hw, zc + hh, 0]), b = worldToScreen([-hw, zc - hh, 0]);
    const x0 = Math.min(a[0], b[0]), y0 = Math.min(a[1], b[1]), w = Math.abs(a[0] - b[0]), h = Math.abs(a[1] - b[1]);
    const z = aim.querySelector('.zone');
    z.style.left = x0 + 'px'; z.style.top = y0 + 'px'; z.style.width = w + 'px'; z.style.height = h + 'px';
    const lab = aim.querySelector('.aimlabel'); lab.style.top = (y0 + h + 10) + 'px'; lab.style.left = (x0 + w / 2) + 'px';
    this.zoneWorld = { hw, zc, hh };
  },

  // ---------- base buttons (throw select / runner commands) ----------
  showThrowSelect(f, opts) {
    this.mode = 'throw'; this.throwOpts = opts;
    const rec = (() => { let best = null; for (const o of opts) if (o.runner && o.margin > 0.1 && (!best || o.margin > best.margin)) best = o; return best ? best.base : -1; })();
    this.buildBaseBtns([0, 1, 2, 3].map(b => ({ base: b, label: ['傳本壘', '傳一壘', '傳二壘', '傳三壘'][b], rec: b === rec })), b => { SFX.click(); doThrow(f, b); });
    this.hint('點壘包決定傳球', 1.4);
  },
  hideThrowSelect() { if (this.mode === 'throw') { this.mode = null; this.clearBaseBtns(); } },
  hideRunnerUI() { if (this.mode === 'run') { this.mode = null; this.clearBaseBtns(); } },
  buildBaseBtns(list, onTap) {
    this.clearBaseBtns();
    const wrap = $('#bases');
    for (const it of list) {
      const b = document.createElement('button');
      b.className = 'basebtn' + (it.rec ? ' rec' : '') + (it.cls ? ' ' + it.cls : '');
      b.innerHTML = it.label;
      b.onpointerdown = e => { e.stopPropagation(); e.preventDefault(); onTap(it.base); };
      wrap.appendChild(b);
      this.baseBtns.push({ el: b, base: it.base });
    }
    this.positionBaseBtns();
  },
  clearBaseBtns() { for (const b of this.baseBtns) b.el.remove(); this.baseBtns = []; },
  positionBaseBtns() {
    const top = 90, bot = 80;
    for (const b of this.baseBtns) {
      const s = worldToScreen(vadd(basePos(b.base), [0, 0.3, 0]));
      let x = s[0], y = s[1];
      if (s[2] <= 0) { y = innerHeight - bot; }
      x = clamp(x, 44, innerWidth - 44); y = clamp(y, top, innerHeight - bot);
      b.el.style.left = x + 'px'; b.el.style.top = y + 'px';
    }
    // spread overlapping
    for (let i = 0; i < this.baseBtns.length; i++) for (let j = i + 1; j < this.baseBtns.length; j++) {
      const a = this.baseBtns[i].el, c = this.baseBtns[j].el;
      const ax = parseFloat(a.style.left), ay = parseFloat(a.style.top), cx = parseFloat(c.style.left), cy = parseFloat(c.style.top);
      if (Math.abs(ax - cx) < 70 && Math.abs(ay - cy) < 46) { c.style.top = (cy + (cy >= ay ? 48 : -48)) + 'px'; }
    }
  },
  runnerButtons() {
    // build per-frame list of runner command targets
    const list = [];
    for (const r of FLD.runners) {
      if (r.state === 'out' || r.state === 'scored') continue;
      const next = r.base + 1;
      if (r.mustReturn) continue;
      if (r.dir <= 0 || (r.wait != null && r.s >= r.wait - 0.05)) list.push({ base: next % 4, label: '衝！', runner: r, act: 'go', cls: 'run' });
      else if (r.s > 0.5 && r.s < SEG * 0.85 && !r.isBatter) list.push({ base: r.base, label: '退回', runner: r, act: 'back', cls: 'run' });
    }
    return list;
  },
  updateRunnerUI() {
    if (!G.isUserOffense() || G.phase !== 'play' || G.outs >= 3) { this.hideRunnerUI(); return; }
    const list = this.runnerButtons();
    const sig = list.map(l => l.base + l.act).join(',');
    if (this.mode === 'run' && sig === this.runSig) { this.positionBaseBtns(); return; }
    if (this.mode === 'throw') return;
    this.runSig = sig; this.mode = list.length ? 'run' : null;
    if (!list.length) { this.clearBaseBtns(); return; }
    this.buildBaseBtns(list, base => {
      const it = list.find(l => l.base === base); if (!it) return;
      const r = it.runner; SFX.click();
      if (it.act === 'go') { r.dir = 1; r.tgt = r.base + 1; r.state = 'run'; r.wait = null; r.userHold = false; if (r.s === 0 && FLD.catchFly) r.tagged = true; }
      else { r.dir = -1; r.tgt = r.base; r.userHold = true; }
      this.runSig = '';
    });
  },
  miniTap(b) {
    if (!G || !G.isUserOffense() || (G.phase !== 'pre' && G.phase !== 'batterUp')) return;
    const r = FLD.runners.find(x => x.base === b - 1 && x.state === 'base');
    if (!r) return;
    if (FLD.runners.some(o => o.base === b)) { this.toast('前面的壘包有人'); return; }
    r.stealing = !r.stealing; SFX.click();
    this.toast(r.stealing ? `${r.pl.hero.name} 準備盜${['', '一', '二', '三', '本'][b]}壘！` : '取消盜壘');
  },
  updateMini() {
    const show = G && G.isUserOffense() && (G.phase === 'pre' || G.phase === 'batterUp') && FLD.runners.some(r => r.base < 3);
    $('#mini').hidden = !show;
    if (!show) return;
    for (const el of document.querySelectorAll('#mini .mb')) {
      const b = +el.dataset.b;
      const occ = FLD.runners.some(r => r.base === b);
      const st = FLD.runners.some(r => r.base === b - 1 && r.stealing);
      el.classList.toggle('occ', occ); el.classList.toggle('steal', st);
    }
  },

  // ---------- symbol pad ----------
  initPad() {
    const cv = $('#padCanvas'); this.padCtx = cv.getContext('2d');
    let down = false, pts = [];
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height]; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); down = true; pts = [pos(e)]; try { cv.setPointerCapture(e.pointerId); } catch (_) { } this.drawPad(pts); });
    cv.addEventListener('pointermove', e => { if (!down) return; pts.push(pos(e)); this.drawPad(pts); });
    const up = () => { if (!down) return; down = false; this.padDone(pts); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  },
  openPad() {
    if (!G || !ABIL.canUse(G, G.user)) return;
    SFX.click();
    const hero = ABIL.activeHero(G, G.user);
    this.padHero = hero;
    $('#pad').hidden = false; G.padOpen = true;
    document.querySelector('#pad .padtitle').textContent = hero.hero.active.name;
    document.querySelector('#pad .padmsg').textContent = '';
    this.drawPad([]);
  },
  closePad() { $('#pad').hidden = true; if (G) G.padOpen = false; },
  drawPad(pts) {
    const g = this.padCtx, cv = g.canvas, W = cv.width;
    g.clearRect(0, 0, W, W);
    const sym = SYMBOLS[this.padHero.hero.active.sym];
    const m = W * 0.18, s = W - m * 2;
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = 'rgba(242,207,115,0.35)'; g.lineWidth = 22; g.beginPath();
    sym.forEach((p, i) => { const x = m + p[0] * s, y = m + p[1] * s; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    g.strokeStyle = 'rgba(255,240,190,0.9)'; g.lineWidth = 3; g.setLineDash([6, 8]); g.stroke(); g.setLineDash([]);
    const st = sym[0]; g.fillStyle = '#7affa0'; g.beginPath(); g.arc(m + st[0] * s, m + st[1] * s, 9, 0, TAU); g.fill();
    if (pts.length > 1) { g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.shadowColor = '#fff2c2'; g.shadowBlur = 14; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); g.shadowBlur = 0; }
  },
  padDone(pts) {
    const sym = this.padHero.hero.active.sym;
    const score = recognize(pts, sym);
    const msg = document.querySelector('#pad .padmsg');
    if (score >= 0.72) {
      msg.style.color = 'var(--good)'; msg.textContent = '發動！';
      setTimeout(() => { this.closePad(); if (ABIL.canUse(G, G.user)) ABIL.activate(G, G.user, score); }, 180);
    } else {
      msg.style.color = 'var(--bad)'; msg.textContent = '形狀不太對，再畫一次';
      setTimeout(() => this.drawPad([]), 400);
    }
  },

  // ---------- per frame ----------
  frame(dt) {
    if (!G) return;
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) this.hideHint(); }
    this.layoutAim();
    if (this.mode === 'throw') this.positionBaseBtns();
    this.updateRunnerUI();
    this.updateMini();
    // cards
    if (this.cardB) { $('#bcard .hp i').style.width = (this.cardB.hp / this.cardB.maxHp * 100) + '%'; }
    if (this.cardP) { $('#pcard .hp i').style.width = (this.cardP.hp / this.cardP.maxHp * 100) + '%'; $('#pcard .sta i').style.width = (this.cardP.stamina * 100) + '%'; }
    const showCards = ['batterUp', 'pre', 'windup', 'flight'].includes(G.phase) && !(G.introT > 0);
    $('#bcard').hidden = !showCards; $('#pcard').hidden = !showCards;
    const hud = $('#hud');
    hud.classList.toggle('cut', !!G.cut);
    $('#aim').style.visibility = G.cut ? 'hidden' : '';
    // commentary: each line stays ~3 s, or 1.6 s when more are waiting
    if (this.sayCur) { this.sayCur.t += dt; if (this.sayCur.t > (this.sayQ && this.sayQ.length ? 1.6 : 3.2)) this.sayNext(); }
    // dialogue typewriter
    if (this.typeFull && this.typeN < this.typeFull.length) {
      this.typeT += dt; const n = Math.min(this.typeFull.length, Math.floor(this.typeT * 26) + 1);
      if (n !== this.typeN) { this.typeN = n; $('#cutBox .cbText').textContent = this.typeFull.slice(0, n); }
    }
    const can = G.user >= 0 && ABIL.canUse(G, G.user);
    $('#skillBtn').disabled = !can;
    $('#gaugeWrap').hidden = G.user < 0;
    // stroke & swing trails
    const g = this.strokeCtx, cv = g.canvas;
    if (cv.width !== innerWidth || cv.height !== innerHeight) { cv.width = innerWidth; cv.height = innerHeight; }
    g.clearRect(0, 0, cv.width, cv.height);
    if (this.strokePts && this.strokePts.length > 1) {
      g.lineCap = 'round'; g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 6; g.shadowColor = '#9ad0ff'; g.shadowBlur = 10;
      g.beginPath(); this.strokePts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); g.shadowBlur = 0;
    }
    if (this.tapRing) {
      const r = this.tapRing; r.t += 1 / 60;
      if (r.t > 0.35) this.tapRing = null;
      else { const k = r.t / 0.35; g.strokeStyle = `rgba(255,240,200,${(1 - k) * 0.9})`; g.lineWidth = 4; g.beginPath(); g.arc(r.x, r.y, 14 + k * 46, 0, TAU); g.stroke(); }
    }
    // batting aim: arrow from the ball shows where it will go
    if (G.phase === 'aim' && G.aim) {
      const A = G.aim, s = worldToScreen(FLD.ball.pos);
      const sx = clamp(A.dx / (innerWidth * 0.16), -1, 1), sy = clamp(-A.dy / (innerHeight * 0.1), -1, 1);
      const ang = (-90 + sx * 40) * DEG, len = 70 + A.power * 110;
      const ex = s[0] + Math.cos(ang) * len, ey = s[1] + Math.sin(ang) * len;
      const col = sy > 0.35 ? '#ffd25a' : sy < -0.35 ? '#7ad0ff' : '#ffffff';
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 11; g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(ex, ey); g.stroke();
      g.strokeStyle = col; g.lineWidth = 6; g.beginPath(); g.moveTo(s[0], s[1]); g.lineTo(ex, ey); g.stroke();
      const hx = Math.cos(ang), hy = Math.sin(ang);
      g.fillStyle = col; g.beginPath(); g.moveTo(ex + hx * 16, ey + hy * 16); g.lineTo(ex - hy * 11, ey + hx * 11); g.lineTo(ex + hy * 11, ey - hx * 11); g.closePath(); g.fill();
      const dir = sx < -0.33 ? '左外野' : sx > 0.33 ? '右外野' : '中間', kind = sy > 0.35 ? '高飛' : sy < -0.35 ? '滾地' : '平飛';
      g.font = '900 16px "Noto Sans TC", system-ui, sans-serif'; g.textAlign = 'center';
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.8)'; g.strokeText(dir + '・' + kind, ex + hx * 34, ey + hy * 34);
      g.fillStyle = col; g.fillText(dir + '・' + kind, ex + hx * 34, ey + hy * 34);
    }
    // pitching: preview of the path the ball will follow
    if (G.pathPreview && G.phase === 'windup' && G.isUserDefense()) {
      const pts = G.pathPreview.map(worldToScreen).filter(q => q[2] > 0);
      if (pts.length > 1) {
        g.setLineDash([3, 6]); g.lineCap = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(255,245,210,0.85)';
        g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.stroke(); g.setLineDash([]);
        const e = pts[pts.length - 1]; g.fillStyle = 'rgba(255,245,210,0.9)'; g.beginPath(); g.arc(e[0], e[1], 4, 0, TAU); g.fill();
      }
    }
  },
  gameOver(G) {
    $('#hud').hidden = true; this.clearBaseBtns(); this.closePad();
    const [a, h] = G.teams;
    const userWon = G.winner === G.user, tie = G.winner < 0;
    $('#scrOver .ov-title').textContent = tie ? '平手' : (G.koWin ? (userWon ? '擊倒勝！' : '被擊倒了…') : (userWon ? '勝利！' : '敗北…'));
    $('#scrOver .ov-score').innerHTML = `<div><small>${a.meta.name}</small><span style="color:${a.meta.color}">${a.runs}</span></div><div style="font-size:20px;color:var(--mute)">-</div><div><small>${h.meta.name}</small><span style="color:${h.meta.color}">${h.runs}</span></div>`;
    const n = Math.max(G.innings, G.inning);
    let t = '<table><tr><th></th>' + Array.from({ length: n }, (_, i) => `<th>${i + 1}</th>`).join('') + '<th>R</th><th>H</th></tr>';
    for (const T of G.teams) t += `<tr><th style="color:${T.meta.color}">${T.meta.short}</th>` + Array.from({ length: n }, (_, i) => `<td>${T.line[i] === undefined ? (i < G.inning ? 'x' : '') : T.line[i]}</td>`).join('') + `<td><b>${T.runs}</b></td><td>${T.hits}</td></tr>`;
    t += '</table>';
    $('#scrOver .ov-line').innerHTML = t;
    $('#scrOver .ov-stats').innerHTML = `擊倒數：${a.meta.short} ${a.kos}・${h.meta.short} ${h.kos}　全壘打：${G.hrCount}` + (G.koLog.length ? `<br>退場英雄：${G.koLog.join('、')}` : '');
    setTimeout(() => this.show('scrOver'), 1200);
  },
};
