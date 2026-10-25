import sys, asyncio, time, json
from playwright.async_api import async_playwright
# usage: autoplay.py url secs [shotdir] [shot_every]
async def main():
    url = sys.argv[1]; secs = float(sys.argv[2]); shotdir = sys.argv[3] if len(sys.argv)>3 else None; every = float(sys.argv[4]) if len(sys.argv)>4 else 0
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        errs = []
        t0 = time.time()
        pg.on("console", lambda m: (errs.append(m.text) if m.type in ('error','warning') else None) or ((print(f"{time.time()-t0:5.1f} {m.text[:300]}", flush=True)) if (m.type in ('error','warning') or m.text.startswith('LOG')) else None))
        pg.on("pageerror", lambda e: print(f"{time.time()-t0:5.1f} PAGEERROR {e}", flush=True))
        await pg.goto(url, wait_until='commit')
        n = 0; last = time.time()
        while time.time() - t0 < secs:
            await asyncio.sleep(1.0)
            st = await pg.evaluate("(() => { const G = __hb.G; if (!G) return 'noG'; return [G.inning, G.half, G.phase, G.outs, G.balls, G.strikes, G.teams[0].runs, G.teams[1].runs, __hb.FLD.runners.map(r => r.base + ':' + r.state + ':' + (r.s|0)).join(','), __hb.FLD.ball.state, G.over].join(' | '); })()")
            print(f"{time.time()-t0:5.1f} {st}", flush=True)
            if shotdir and every and time.time() - last >= every:
                last = time.time(); n += 1
                await pg.screenshot(path=f"{shotdir}/auto_{n:02d}.png", timeout=60000)
        await b.close()
asyncio.run(main())
