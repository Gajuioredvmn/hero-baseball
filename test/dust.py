import sys, asyncio, time
from playwright.async_api import async_playwright
# screenshots of running dust, slides; counts dust particles
OUT = sys.argv[1]
N = int(sys.argv[2]) if len(sys.argv) > 2 else 4
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        pg.on("console", lambda m: print("CONSOLE", m.text[:300], flush=True) if m.type == 'error' else None)
        await pg.goto("file:///home/claude/hb/dist/index.html?auto=cpu&team=E&first=1&inn=9&speed=1", wait_until='commit')
        await pg.wait_for_function("window.__hb && __hb.G", timeout=60000)
        shots = 0; slides = 0; t0 = time.time(); maxDust = 0; lastPlay = -1; playN = 0
        while time.time() - t0 < 200 and shots < N:
            await asyncio.sleep(0.05)
            st = await pg.evaluate("""(() => { const G = __hb.G, F = __hb.FLD; if (!G) return null;
              return { ph: G.phase, pt: F.playT, dust: __hb.FX.dust.length, slide: F.runners.some(r => r.slide), slideT: F.runners.some(r => r.slideT > 0), inn: G.inning }; })()""")
            if not st: continue
            maxDust = max(maxDust, st['dust'])
            if st['slide']: slides += 1
            want = None
            if st['ph'] == 'play' and st['slide']: want = 'slide'
            elif st['ph'] == 'play' and 1.6 < st['pt'] < 2.4 and st['dust'] > 25: want = 'run'
            if want:
                key = (want, st['inn'], round(st['pt']))
                if key == lastPlay: continue
                lastPlay = key
                await pg.evaluate("__hb.MAIN.frozen = true")
                await asyncio.sleep(0.25)
                shots += 1
                await pg.screenshot(path=f"{OUT}_{shots}_{want}.png"); print('shot', shots, want, st, flush=True)
                await pg.evaluate("__hb.MAIN.frozen = false; __hb.MAIN.last = 0; requestAnimationFrame(t => __hb.MAIN.loop(t))")
                await asyncio.sleep(1.5)
        print('maxDust', maxDust, 'slideFrames', slides)
        await b.close()
asyncio.run(main())
