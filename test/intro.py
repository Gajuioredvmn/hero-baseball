import sys, asyncio
from playwright.async_api import async_playwright
OUT = sys.argv[1]
TEAM = sys.argv[2] if len(sys.argv) > 2 else 'E'
PICK = sys.argv[3].split(',') if len(sys.argv) > 3 else None
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        await pg.goto(f"file:///home/claude/hb/dist/index.html?auto=1&team={TEAM}&first=1&inn=3&pdb=1", wait_until='commit')
        await pg.wait_for_function("window.__hb && __hb.G && __hb.G.phase === 'pre' && __hb.G.isUserOffense()", timeout=120000)
        ids = PICK or await pg.evaluate("__hb.G.bat.order.map(p => p.id)")
        for i, id in enumerate(ids):
            await pg.evaluate("""(id) => { const G = __hb.G; const T = G.bat; const h = T.players[id];
              for (const T2 of G.teams) for (const k in T2.players) { const q = T2.players[k]; if (q !== h && q.side === G.half) q.sprite.visible = false; }
              G.batter = h; const L = h.hero.bats === 'L'; h.pos = [L ? 0.95 : -0.95, 0, 0.08]; h.yaw = L ? -Math.PI / 2 : Math.PI / 2; h.sprite.visible = true; h.setAnim('bat');
              G.phase = 'batterUp'; G.phaseT = 1.2; G.introT = 1.7; __hb.UI.intro(h, T); }""", id)
            await pg.wait_for_function("__hb.G.introT < 1.0", timeout=60000)
            await pg.evaluate("__hb.MAIN.frozen = true"); await asyncio.sleep(0.3)
            await pg.screenshot(path=f"{OUT}_{id}_intro.png")
            await pg.evaluate("__hb.MAIN.frozen = false; __hb.MAIN.last = 0; requestAnimationFrame(t => __hb.MAIN.loop(t))")
            await pg.evaluate("(() => { __hb.G.skipIntro(); })()")
            await pg.wait_for_function("__hb.G.phase === 'pre'", timeout=60000)
            await pg.evaluate("__hb.G.aiPitchT = 9999")
            f0 = await pg.evaluate("__hb.MAIN.frameN")
            await pg.wait_for_function(f"__hb.MAIN.frameN > {f0} + 10", timeout=60000)
            await pg.evaluate("__hb.MAIN.frozen = true"); await asyncio.sleep(0.25)
            await pg.screenshot(path=f"{OUT}_{id}_bat.png")
            await pg.evaluate("__hb.MAIN.frozen = false; __hb.MAIN.last = 0; requestAnimationFrame(t => __hb.MAIN.loop(t))")
        print(ids)
        await b.close()
asyncio.run(main())
