import sys, asyncio, time, json
from playwright.async_api import async_playwright
# Simulates a human: swipe-swings, gesture pitches, taps throw buttons, uses specials via pad
BOT = r"""
(() => {
  const H = window.__hb;
  const touch = document.getElementById('touch');
  const fire = (type, x, y) => touch.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, pointerType: 'touch', isPrimary: true }));
  let swung = null, pitched = null, log = [], padBusy = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function arcSample(pts, step){ const out=[pts[0].slice()]; let carry=0; for(let i=1;i<pts.length;i++){ const a=pts[i-1], b=pts[i]; const d=Math.hypot(b[0]-a[0], b[1]-a[1]); let t=step-carry; while(t<=d){ out.push([a[0]+(b[0]-a[0])*t/d, a[1]+(b[1]-a[1])*t/d]); t+=step; } carry = d-(t-step); } out.push(pts[pts.length-1].slice()); return out; }
  async function usePad(G) {
    padBusy = true;
    document.getElementById('skillBtn').click();
    await sleep(350);
    const cv = document.getElementById('padCanvas'); const r = cv.getBoundingClientRect();
    const key = H.UI.padHero.hero.active.sym; const sym = H.SYMBOLS[key];
    const ph = Math.random() * 6, A = r.width * 0.025;
    const pts = arcSample(sym.map(p => [r.left + (0.18 + 0.64 * p[0]) * r.width, r.top + (0.18 + 0.64 * p[1]) * r.height]), 9).map((q, i) => [q[0] + A * Math.sin(i * 0.2 + ph), q[1] + A * Math.cos(i * 0.17 + ph)]);
    const fireC = (type, q) => cv.dispatchEvent(new PointerEvent(type, { clientX: q[0], clientY: q[1], pointerId: 2, bubbles: true, pointerType: 'touch', isPrimary: true }));
    fireC('pointerdown', pts[0]);
    for (const q of pts.slice(1)) { await sleep(6); fireC('pointermove', q); }
    fireC('pointerup', pts[pts.length - 1]);
    await sleep(120);
    const msg = document.querySelector('#pad .padmsg').textContent;
    await sleep(400);
    log.push('pad ' + H.UI.padHero.hero.name + ' ' + key + ' ' + (G.teams[G.user].armed ? 'OK' : 'FAIL') + ' ' + msg);
    if (!document.getElementById('pad').hidden) document.getElementById('padCancel').click();
    padBusy = false;
  }
  window.__botlog = log;
  const W = innerWidth, Hh = innerHeight;
  async function swipe(x0, y0, x1, y1, ms, steps = 6) {
    fire('pointerdown', x0, y0);
    for (let i = 1; i <= steps; i++) { await new Promise(r => setTimeout(r, ms / steps)); fire('pointermove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); }
    fire('pointerup', x1, y1);
  }
  setInterval(async () => {
    const G = H.G; if (!G || G.over || padBusy) return;
    if (G.phase === 'pre' && G.phaseT > 0.2 && H.ABIL.canUse(G, G.user) && document.getElementById('pad').hidden && !document.getElementById('skillBtn').disabled && Math.random() < 0.08) { usePad(G); return; }
    // batting: press near arrival, hold, aim, release on the power bar
    if (G.isUserOffense() && G.phase === 'flight' && G.pitch && swung !== G.pitch) {
      const p = G.pitch; const lead = p.T - p.t;
      if (lead < 0.08 + (Math.random() - 0.5) * 0.08) { swung = p; fire('pointerdown', W * 0.5, Hh * 0.72); log.push('press ' + G.balls + '-' + G.strikes); window.__holding = true; window.__aimDone = false; }
    }
    if (window.__holding && G.phase === 'aim' && G.aim) {
      if (!window.__aimMoved) { window.__aimMoved = true; const dx = (Math.random() - 0.5) * 220, dy = (Math.random() - 0.5) * 160; fire('pointermove', W * 0.5 + dx, Hh * 0.72 + dy); }
      if (G.aim.power > 0.55 + Math.random() * 0.4) { fire('pointerup', W * 0.5, Hh * 0.72); window.__holding = false; window.__aimMoved = false; log.push('hit'); }
    } else if (window.__holding && G.phase !== 'flight' && G.phase !== 'aim') { fire('pointerup', W * 0.5, Hh * 0.72); window.__holding = false; window.__aimMoved = false; }
    // pitching: choose a type, draw a path into the zone
    if (G.isUserDefense() && G.phase === 'pre' && G.phaseT > 0.6 && pitched !== G.phaseT && !padBusy) {
      pitched = G.phaseT;
      const types = ['FB', 'SL', 'CB', 'CH', 'SF'];
      const t = types[Math.floor(Math.random() * types.length)];
      document.querySelector('#pitchMenu button[data-t="' + t + '"]').click();
      const z = document.querySelector('#aim .zone').getBoundingClientRect();
      const tx = z.left + z.width * (0.1 + Math.random() * 0.8), ty = z.top + z.height * (0.1 + Math.random() * 0.8);
      const x0 = W * (0.3 + Math.random() * 0.4), y0 = Hh * 0.8, bend = (Math.random() - 0.5) * 200;
      fire('pointerdown', x0, y0);
      for (let i = 1; i <= 16; i++) { const u = i / 16; await new Promise(r => setTimeout(r, 12)); fire('pointermove', x0 + (tx - x0) * u + Math.sin(u * Math.PI) * bend, y0 + (ty - y0) * u); }
      fire('pointerup', tx, ty);
      log.push('pitch ' + t);
    }
    // throw select
    const rb = document.querySelector('.basebtn.rec') || document.querySelector('.basebtn');
    if (rb && H.UI.mode === 'throw' && Math.random() < 0.5) { rb.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); log.push('throw-tap'); }
  }, 16);
})();
"""
async def main():
    url = sys.argv[1]; secs = float(sys.argv[2])
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        t0 = time.time()
        pg.on("console", lambda m: print(f"{time.time()-t0:5.1f} {m.text[:300]}", flush=True) if (m.type in ('error','warning') or m.text.startswith('LOG')) else None)
        pg.on("pageerror", lambda e: print(f"{time.time()-t0:5.1f} PAGEERROR {e}", flush=True))
        await pg.goto(url, wait_until='commit')
        await asyncio.sleep(2)
        await pg.evaluate(BOT)
        while time.time() - t0 < secs:
            await asyncio.sleep(3)
            st = await pg.evaluate("(() => { const G = __hb.G; if (!G) return 'noG'; return [G.inning, G.half, G.phase, 'outs', G.outs, 'cnt', G.balls+'-'+G.strikes, 'R', G.teams[0].runs+':'+G.teams[1].runs, 'user', G.user, 'bot', (window.__botlog||[]).slice(-4).join(';')].join(' '); })()")
            print(f"{time.time()-t0:5.1f} {st}", flush=True)
        await b.close()
asyncio.run(main())
