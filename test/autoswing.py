import sys, asyncio, time
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        # user pitches first (CPU bats -> CPU swing plans exist), then bats without touching anything
        await pg.goto("file:///home/claude/hb/dist/index.html?auto=1&team=E&first=0&inn=3&speed=3&q=low", wait_until='commit')
        await pg.wait_for_function("window.__hb && __hb.G", timeout=60000)
        # quick CPU half: let the AI pitch for the user too
        await pg.evaluate("""(() => { const G = __hb.G; setInterval(() => { if (G.isUserDefense() && G.phase === 'pre' && G.phaseT > 0.3) { const prm = __hb.AI.choosePitch(G); G.beginPitch(prm); } if (G.introT > 0) G.skipIntro(); if (G.cut) G.advanceCut(true); }, 50); })()""")
        t0 = time.time(); swings = 0; pitches = 0; seen = set()
        while time.time() - t0 < 200:
            st = await pg.evaluate("(() => { const G = __hb.G; return [G.half, G.isUserOffense(), G.phase, !!G.swing, G.pitch ? G.pitch.t.toFixed(2) : null, G.inning, G.outs]; })()")
            if st[1] and st[2] == 'flight':
                key = (st[5], st[6], st[4] is not None)
                pitches += 1
                if st[3]: swings += 1; print('SWING without input', st)
            if st[1] and st[5] >= 1 and st[0] == 1 and pitches > 60: break
            await asyncio.sleep(0.05)
        print('flight samples while user batting', pitches, 'auto swings', swings)
        await b.close()
asyncio.run(main())
