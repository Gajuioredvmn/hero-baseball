import sys, asyncio, time
from playwright.async_api import async_playwright
OUT = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        await pg.goto("file:///home/claude/hb/dist/index.html?auto=1&team=E&first=0&inn=3&pdb=1", wait_until='commit')
        await pg.wait_for_function("window.__hb && __hb.G && __hb.G.phase === 'pre' && __hb.G.isUserDefense()", timeout=120000)
        # zoom camera on home plate from the pitcher's side
        await pg.evaluate("__hb.MAIN.camOverride = { eye: [0, 1.6, -7], tgt: [0, 0.8, 1.5], fov: 34, focus: [8, 6], snap: 1 }")
        for k, t in [('umpSet', 0.3), ('umpStrike', 0.42), ('umpK', 0.4), ('umpK', 0.6), ('umpHR', 0.5), ('umpFoul', 0.4)]:
            await pg.evaluate(f"(() => {{ const U = __hb.G.ump; U.setAnim('{k}'); U.anim.t = {t}; U.poseKeyRaw = null; }})()")
            await asyncio.sleep(0.6)
            await pg.evaluate("__hb.MAIN.frozen = true")
            await asyncio.sleep(0.25)
            await pg.evaluate(f"(() => {{ const U = __hb.G.ump; return U.anim.k + ' ' + U.anim.t.toFixed(2); }})()")
            await pg.screenshot(path=f"{OUT}_{k}_{t}.png", clip={'x': 60, 'y': 200, 'width': 270, 'height': 330})
            await pg.evaluate("__hb.MAIN.frozen = false; __hb.MAIN.last = 0; requestAnimationFrame(t => __hb.MAIN.loop(t))")
        await b.close()
asyncio.run(main())
