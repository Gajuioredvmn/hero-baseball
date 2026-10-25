import sys, asyncio, time, json
from playwright.async_api import async_playwright
# screenshots of cinematic cuts (rival VS card, dialogue shots, special cut-ins) + caption log
# usage: events.py OUT "query" seconds [maxShots]
OUT = sys.argv[1]; Q = sys.argv[2]; SECS = float(sys.argv[3]) if len(sys.argv) > 3 else 60; MAXS = int(sys.argv[4]) if len(sys.argv) > 4 else 8
INIT = sys.argv[5] if len(sys.argv) > 5 else None
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        pg.on("console", lambda m: print("CONSOLE", m.text[:300], flush=True) if (m.type == 'error' and 'ERR_TUNNEL' not in m.text) or m.text.startswith('LOG story') else None)
        await pg.goto("file:///home/claude/hb/dist/index.html?" + Q, wait_until='commit')
        await pg.wait_for_function("window.__hb && __hb.G", timeout=60000)
        if INIT: await pg.evaluate(INIT)
        t0 = time.time(); seen = set(); shots = 0; caps = []; lastCap = ''
        while time.time() - t0 < SECS and shots < MAXS:
            await asyncio.sleep(0.05)
            st = await pg.evaluate("""(() => { const G = __hb.G; if (!G) return null; const c = G.cut;
              const cap = document.querySelector('#caption .cpT').textContent;
              return { cut: c ? { i: c.i, t: c.t, kind: c.shots[c.i].kind, n: c.shots.length, id: c.shots.map(s => s.kind).join('+') + ':' + (G.batter ? G.batter.hero.name : '') } : null, cap, ph: G.phase, w8: __hb.W8 ? __hb.W8.kind : null, inn: G.inning, half: G.half }; })()""")
            if not st: continue
            if st['cap'] != lastCap: lastCap = st['cap']; caps.append(lastCap); print('CAP', lastCap, flush=True)
            c = st['cut']
            if c and c['t'] > 0.75:
                key = (c['id'], c['i'], st['inn'], st['half'])
                if key in seen: continue
                seen.add(key)
                await pg.evaluate("__hb.MAIN.frozen = true")
                await asyncio.sleep(0.25)
                shots += 1
                fn = f"{OUT}_{shots}_{c['kind']}.png"
                await pg.screenshot(path=fn); print('shot', fn, c, flush=True)
                await pg.evaluate("__hb.MAIN.frozen = false; __hb.MAIN.last = 0; requestAnimationFrame(t => __hb.MAIN.loop(t))")
        await b.close()
asyncio.run(main())
