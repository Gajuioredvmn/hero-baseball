import sys, asyncio, time
from playwright.async_api import async_playwright
OUT = sys.argv[1]
TYPE = sys.argv[2] if len(sys.argv) > 2 else 'SL'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        pg.on("console", lambda m: print("CONSOLE", m.text[:300], flush=True) if m.type == 'error' and 'TUNNEL' not in m.text else None)
        await pg.goto("file:///home/claude/hb/dist/index.html?auto=1&team=E&first=0&inn=3&pdb=1", wait_until='commit')
        await pg.wait_for_function("window.__hb && __hb.G && __hb.G.phase === 'pre' && __hb.G.isUserDefense() && __hb.G.phaseT > 0.4", timeout=120000)
        await asyncio.sleep(0.5)
        await pg.evaluate("__hb.MAIN.frozen = true"); await asyncio.sleep(0.25)
        await pg.screenshot(path=f"{OUT}_1_pre.png")
        await pg.evaluate("__hb.MAIN.frozen = false; __hb.MAIN.last = 0; requestAnimationFrame(t => __hb.MAIN.loop(t))")
        await pg.click(f'#pitchMenu button[data-t="{TYPE}"]')
        await asyncio.sleep(0.2)
        # draw a curve: start low-center, bulge right, end at the zone's lower-left corner
        z = await pg.evaluate("(() => { const r = document.querySelector('#aim .zone').getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        print('zone rect', z)
        ex, ey = z[0] + z[2] * 0.25, z[1] + z[3] * 0.7
        sx, sy = 195, 640
        await pg.evaluate("""(async ([sx, sy, ex, ey]) => { const t = document.getElementById('touch');
          const fire = (type, x, y) => t.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, pointerType: 'touch', isPrimary: true }));
          fire('pointerdown', sx, sy);
          for (let i = 1; i <= 24; i++) { const u = i / 24; const x = sx + (ex - sx) * u + Math.sin(u * Math.PI) * 90; const y = sy + (ey - sy) * u; await new Promise(r => setTimeout(r, 12)); fire('pointermove', x, y); }
          fire('pointerup', ex, ey); })""", [sx, sy, ex, ey])
        await asyncio.sleep(0.3)
        await pg.evaluate("__hb.MAIN.frozen = true"); await asyncio.sleep(0.25)
        await pg.screenshot(path=f"{OUT}_2_windup.png")
        await pg.evaluate("__hb.MAIN.frozen = false; __hb.MAIN.last = 0; requestAnimationFrame(t => __hb.MAIN.loop(t))")
        t0 = time.time()
        while time.time() - t0 < 30:
            st = await pg.evaluate("(() => { const G = __hb.G; return [G.phase, G.pitch ? G.pitch.t / G.pitch.T : 0]; })()")
            if st[0] == 'flight' and st[1] > 0.55: break
            await asyncio.sleep(0.02)
        await pg.evaluate("__hb.MAIN.frozen = true"); await asyncio.sleep(0.25)
        await pg.screenshot(path=f"{OUT}_3_flight.png")
        info = await pg.evaluate("(() => { const p = __hb.G.pitch; return { type: p.type, kmh: Math.round(p.kmh), B: p.B, P1: p.P1, shape: !!p.shape }; })()")
        print(info)
        await b.close()
asyncio.run(main())
