import sys, asyncio, time
from playwright.async_api import async_playwright
OUT = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        await pg.goto("file:///home/claude/hb/dist/index.html?auto=1&team=E&first=1&inn=3&pdb=1", wait_until='commit')
        await pg.wait_for_function("window.__hb && __hb.G && __hb.G.isUserOffense && __hb.G.isUserOffense() && __hb.G.phase === 'pre'", timeout=120000)
        for i, frac in enumerate([0.35, 0.75, 0.95]):
            t0 = time.time()
            while time.time() - t0 < 60:
                st = await pg.evaluate("(() => { const G = __hb.G; return [G.phase, G.pitch ? G.pitch.t / G.pitch.T : 0]; })()")
                if st[0] == 'flight' and st[1] >= frac: break
                await asyncio.sleep(0.01)
            await pg.evaluate("__hb.MAIN.frozen = true"); await asyncio.sleep(0.25)
            await pg.screenshot(path=f"{OUT}_{i}.png")
            print(await pg.evaluate("(() => { const p = __hb.G.pitch; const c = __hb.G.pitch && [p.P1[0].toFixed(2), p.P1[1].toFixed(2)]; return [p.type, Math.round(p.kmh), +(p.t / p.T).toFixed(2), c, +p.T.toFixed(2)]; })()"))
            await pg.evaluate("__hb.MAIN.frozen = false; __hb.MAIN.last = 0; requestAnimationFrame(t => __hb.MAIN.loop(t))")
            # wait for the next pitch
            await pg.wait_for_function("__hb.G.phase !== 'flight'", timeout=60000)
        await b.close()
asyncio.run(main())
