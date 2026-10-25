import sys, asyncio, time, json
from playwright.async_api import async_playwright
# Simulates a human: swipe-swings, gesture pitches, taps throw buttons, uses specials via pad
BOT = r"""
(() => {
  const H = window.__hb;
  const touch = document.getElementById('touch');
  const fire = (type, x, y) => touch.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, pointerType: 'touch', isPrimary: true }));
  let swung = null, pitched = null, log = [];
  window.__botlog = log;
  const W = innerWidth, Hh = innerHeight;
  async function swipe(x0, y0, x1, y1, ms, steps = 6) {
    fire('pointerdown', x0, y0);
    for (let i = 1; i <= steps; i++) { await new Promise(r => setTimeout(r, ms / steps)); fire('pointermove', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); }
    fire('pointerup', x1, y1);
  }
  setInterval(async () => {
    const G = H.G; if (!G || G.over) return;
    // batting
    if (G.isUserOffense() && G.phase === 'flight' && G.pitch && swung !== G.pitch) {
      const p = G.pitch; const lead = p.T - p.t;
      if (lead < 0.125 + (Math.random() - 0.5) * 0.08) { swung = p; const up = Math.random() < 0.5; swipe(W * 0.3, Hh * 0.7, W * 0.75, Hh * (up ? 0.6 : 0.7), 60); log.push('swing ' + G.balls + '-' + G.strikes); }
    }
    // pitching
    if (G.isUserDefense() && G.phase === 'pre' && G.phaseT > 0.6 && pitched !== G.phaseT) {
      pitched = G.phaseT;
      const z = document.querySelector('#aim .zone').getBoundingClientRect();
      const tx = z.left + z.width * (0.25 + Math.random() * 0.5), ty = z.top + z.height * (0.25 + Math.random() * 0.5);
      const kind = Math.random();
      if (kind < 0.5) await swipe(W * 0.5, Hh * 0.85, tx, ty, 150);
      else await swipe(W * 0.5, Hh * 0.85, tx, ty, 260, 12);
      log.push('pitch');
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
