// headless fast simulation of full CPU games for logic/balance testing
const canvas = document.getElementById('gl');
canvas.width = 64; canvas.height = 64; R.W = R.H = 64; R.cssW = 390; R.cssH = 780;
glInit(canvas); glPrograms(); postPrograms(); glParticlesInit(); glRibbonInit(); buildStadium();
FX.init(); UI.init();
ballEvent = (b, ev) => { if (b === FLD.ball && ev === 'hr') tryRobHR(b); };
const q = new URLSearchParams(location.search);
const games = +q.get('games') || 3, inn = +q.get('inn') || 9;
MAIN.debugPlays = true; MAIN.gaugeCheat = !!q.get('gauge');
for (const k of ['react0', 'reactK', 'acc', 'spraySign']) if (q.get(k)) TUNE[k] = +q.get(k);
if (q.get('intim')) TUNE.intimidate = +q.get('intim'); if (q.get('ravens')) TUNE.ravens = +q.get('ravens');
const nop = (q.get('nopass') || '').split(',').filter(Boolean); for (const h of HEROES) if (nop.includes(h.passive.id)) h.passive = Object.assign({}, h.passive, { id: 'none' });
const setSt = (q.get('st') || '').split(';').filter(Boolean); for (const e of setSt) { const [nm, k, v] = e.split(':'); const h = HEROES.find(x => x.name === nm); if (h) h.stats[k] = +v; }
const stats = { games: 0, runs: [0, 0], hits: 0, hr: 0, k: 0, bb: 0, outs: {}, kos: 0, labels: {}, plays: 0, longPlays: 0, errors: 0, pitches: 0, specials: 0, abHist: {} };
const origFlash = UI.flashCall.bind(UI);
stats.byHero = {};
UI.flashCall = (t, c) => { stats.labels[t] = (stats.labels[t] || 0) + 1; const B = G && G.batter; if (B) { const h = stats.byHero[B.hero.name] = stats.byHero[B.hero.name] || {}; h[t] = (h[t] || 0) + 1; } };
UI.banner = () => {}; UI.toast = () => {}; UI.specialBanner = () => { stats.specials++; };
FX.text3d = () => {}; FX.dmgNum = () => {}; FX.impact = () => {}; FX.mittPop = () => {}; FX.homeRun = () => {}; FX.sfxWord = () => {}; FX.shockDom = () => {};
const origOut = GAME_API.addOut;
let maxPlayT = 0;
function runGame(seedTeam) {
  newGame({ userTeam: seedTeam, innings: inn, diff: 'normal', userBatsFirst: true, cpuOnly: true });
  if (MAIN.gaugeCheat) {}
  let steps = 0;
  const dt = 1 / 60;
  while (!G.over && steps < 60 * 60 * 120) {
    G.update(dt);
    if (G.phase === 'play') { ABIL.update(dt); if (FLD.playT > maxPlayT) maxPlayT = FLD.playT; }
    FX.update(dt);
    steps++;
  }
  stats.games++;
  stats.runs[0] += G.teams[0].runs; stats.runs[1] += G.teams[1].runs;
  stats.hits += G.teams[0].hits + G.teams[1].hits; stats.hr += G.hrCount; stats.kos += G.teams[0].kos + G.teams[1].kos;
  return { steps, score: [G.teams[0].runs, G.teams[1].runs], inning: G.inning, over: G.over, ids: [G.teams[0].meta.id, G.teams[1].meta.id], lines: [G.teams[0].line, G.teams[1].line], hits: [G.teams[0].hits, G.teams[1].hits], kos: [G.teams[0].kos, G.teams[1].kos] };
}
const res = [];
const t0 = performance.now();
try {
  for (let i = 0; i < games; i++) res.push(runGame(i % 2 ? 'E' : 'W'));
} catch (e) { console.log('LOG EXC ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 4).join(' | ')); }
console.log('LOG games ' + JSON.stringify(res));
console.log('LOG stats ' + JSON.stringify(stats));
console.log('LOG maxPlayT ' + maxPlayT.toFixed(1) + ' ms ' + (performance.now() - t0).toFixed(0));
document.title = 'ready';
