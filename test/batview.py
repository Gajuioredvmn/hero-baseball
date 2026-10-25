import sys, asyncio, time
from playwright.async_api import async_playwright
OUT = sys.argv[1]
DX = float(sys.argv[2]) if len(sys.argv) > 2 else -70
DY = float(sys.argv[3]) if len(sys.argv) > 3 else -60
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        pg.on("console", lambda m: print("CONSOLE", m.text[:300], flush=True) if m.type == 'error' and 'TUNNEL' not in m.text else None)
        await pg.goto("file:///home/claude/hb/dist/index.html?auto=1&team=E&first=1&inn=3&pdb=1", wait_until='commit')
        await pg.wait_for_function("window.__hb && __hb.G && __hb.G.isUserOffense && __hb.G.isUserOffense()", timeout=120000)
        # make sure the bat finds the ball for this test
        await pg.evaluate("(() => { const A = __hb.ABIL, o = A.modifyContact; A.modifyContact = function (ctx, g) { o.call(A, ctx, g); ctx.auto = true; ctx.qMin = 0.85; }; })()")
        # in-page: press just before the ball arrives and keep holding
        await pg.evaluate("""(() => { const t = document.getElementById('touch');
          window.__fire = (type, x, y) => t.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, pointerType: 'touch', isPrimary: true }));
          const loop = () => { const G = __hb.G; if (G && G.phase === 'flight' && G.pitch && !G.swing && G.pitch.T - G.pitch.t < 0.09) { __fire('pointerdown', 200, 560); window.__pressed = true; return; } requestAnimationFrame(loop); };
          requestAnimationFrame(loop); })()""")
        t0 = time.time()
        while time.time() - t0 < 90:
            ph = await pg.evaluate("__hb.G.phase")
            if ph in ('aim', 'play'): break
            await asyncio.sleep(0.02)
        print('phase', ph)
        await asyncio.sleep(0.15)
        await pg.evaluate(f"(() => {{ for (let i = 1; i <= 6; i++) __fire('pointermove', 200 + {DX} * i / 6, 560 + {DY} * i / 6); }})()")
        await asyncio.sleep(0.3)
        await pg.evaluate("__hb.MAIN.frozen = true"); await asyncio.sleep(0.25)
        await pg.screenshot(path=f"{OUT}_1_aim.png")
        print(await pg.evaluate("(() => { const A = __hb.G.aim; return A ? { p: A.power.toFixed(2), dx: A.dx, dy: A.dy } : null; })()"))
        await pg.evaluate("__hb.MAIN.frozen = false; __hb.MAIN.last = 0; requestAnimationFrame(t => __hb.MAIN.loop(t))")
        # release near the top of the bar
        t0 = time.time()
        while time.time() - t0 < 10:
            pw = await pg.evaluate("__hb.G.aim ? __hb.G.aim.power : -1")
            if pw < 0 or pw > 0.8: break
            await asyncio.sleep(0.01)
        await pg.evaluate(f"__fire('pointerup', 200 + {DX}, 560 + {DY})")
        await asyncio.sleep(0.05)
        print(await pg.evaluate("(() => { const c = __hb.G.contact; return c ? { ev: c.ev.toFixed(1), la: c.la.toFixed(0), spray: c.spray.toFixed(0), q: c.q.toFixed(2), power: c.power && c.power.toFixed(2), tier: c.tier } : null; })()"))
        await pg.evaluate("__hb.MAIN.frozen = true"); await asyncio.sleep(0.25)
        await pg.screenshot(path=f"{OUT}_2_hit.png")
        await pg.evaluate("__hb.MAIN.frozen = false; __hb.MAIN.last = 0; requestAnimationFrame(t => __hb.MAIN.loop(t))")
        f0 = await pg.evaluate("__hb.MAIN.frameN")
        await pg.wait_for_function(f"__hb.MAIN.frameN > {f0} + 14", timeout=60000)
        await pg.evaluate("__hb.MAIN.frozen = true"); await asyncio.sleep(0.25)
        await pg.screenshot(path=f"{OUT}_3_after.png")
        print(await pg.evaluate("[__hb.G.phase, __hb.MAIN.viewMode()]"))
        await b.close()
asyncio.run(main())
