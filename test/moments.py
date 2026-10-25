import sys, asyncio, time, json
from playwright.async_api import async_playwright
# capture screenshots at key moments of a CPU game: pitch near plate, ball in play, throw select etc.
async def main():
    out = sys.argv[1]; url = sys.argv[2]; n = int(sys.argv[3]) if len(sys.argv)>3 else 6; want = sys.argv[4].split(',') if len(sys.argv)>4 else ['pitch','play','sel']
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        await pg.goto(url, wait_until='commit')
        shots = 0; t0 = time.time(); lastKind = None
        while shots < n and time.time() - t0 < 240:
            await asyncio.sleep(0.05)
            st = await pg.evaluate("""(() => { if (!window.__hb) return null; const G = __hb.G; if (!G) return null; const p = G.pitch;
              return { ph: G.phase, pt: p ? p.t / p.T : 0, playT: __hb.FLD.playT, bs: __hb.FLD.ball.state, sel: !!__hb.FLD.throwSel }; })()""")
            if not st: continue
            kind = None
            if st['ph'] == 'flight' and st['pt'] > 0.75: kind = 'pitch'
            elif st['ph'] == 'play' and 0.6 < st['playT'] < 1.2: kind = 'play'
            elif st['sel']: kind = 'sel'
            if kind and kind not in want: kind = None
            if kind and kind != lastKind:
                await pg.evaluate("__hb.MAIN.frozen = true")
                await asyncio.sleep(0.25)
                shots += 1
                await pg.screenshot(path=f"{out}_{shots}_{kind}.png")
                print('shot', shots, kind, flush=True)
                await pg.evaluate("__hb.MAIN.frozen = false; __hb.MAIN.last = 0; requestAnimationFrame(t => __hb.MAIN.loop(t))")
                lastKind = kind
            if not kind: lastKind = None if st['ph'] not in ('flight','play') else lastKind
        await b.close()
asyncio.run(main())
