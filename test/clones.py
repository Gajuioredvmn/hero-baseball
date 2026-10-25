import sys, asyncio, time
from playwright.async_api import async_playwright
OUT = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        await pg.goto("file:///home/claude/hb/dist/index.html?auto=1&team=E&first=1&inn=3&pdb=1", wait_until='commit')
        await pg.wait_for_function("window.__hb && __hb.G && __hb.G.phase === 'pre' && __hb.G.isUserOffense()", timeout=120000)
        await pg.evaluate("""(() => { const G = __hb.G, T = G.fld, L = T.rp; const old = T.pos.P;
          old.sprite.visible = false; L.sprite.visible = true; L.inGame = true; T.pos.P = L; T.pitcher = L; L.fpos = 'P'; L.pos = [0, 0.25, -18.25]; L.yaw = 0; L.setAnim('pstand');
          T.armed = { id: 'shadowTrick', kind: 'pitch', by: L }; G.aiPitchT = 0.3; })()""")
        for i, frac in enumerate([0.45, 0.8]):
            t0 = time.time()
            while time.time() - t0 < 60:
                st = await pg.evaluate("(() => { const G = __hb.G; return [G.phase, G.pitch ? G.pitch.t / G.pitch.T : 0, G.pitch && G.pitch.special]; })()")
                if st[0] == 'flight' and st[1] >= frac: break
                await asyncio.sleep(0.01)
            await pg.evaluate("__hb.MAIN.frozen = true"); await asyncio.sleep(0.25)
            await pg.screenshot(path=f"{OUT}_{i}.png")
            print(await pg.evaluate("(() => { const p = __hb.G.pitch; return [p.special, Math.round(p.kmh), p.clones ? p.clones.length : 0, +(p.t / p.T).toFixed(2)]; })()"))
            await pg.evaluate("__hb.MAIN.frozen = false; __hb.MAIN.last = 0; requestAnimationFrame(t => __hb.MAIN.loop(t))")
        await b.close()
asyncio.run(main())
