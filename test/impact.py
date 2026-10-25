import sys, asyncio, time
from playwright.async_api import async_playwright
OUT = sys.argv[1]
mode = sys.argv[2] if len(sys.argv) > 2 else 'hr'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        pg.on("console", lambda m: print("CONSOLE", m.text[:200], flush=True) if m.type == 'error' else None)
        first = '1' if mode in ('hr', 'hit') else '0'
        await pg.goto(f"file:///home/claude/hb/dist/index.html?auto=1&team=E&first={first}&inn=3&pdb=1", wait_until='commit')
        await pg.wait_for_function("window.__hb && __hb.G", timeout=60000)
        async def shot(name, delay=0.0):
            await pg.evaluate("__hb.MAIN.frozen = true")
            await asyncio.sleep(0.3)
            await pg.screenshot(path=f"{OUT}_{name}.png"); print('shot', name, flush=True)
        async def resume():
            await pg.evaluate("__hb.MAIN.frozen = false; __hb.MAIN.last = 0; requestAnimationFrame(t => __hb.MAIN.loop(t))")
        async def run_until(cond, timeout=120):
            t0 = time.time()
            while time.time() - t0 < timeout:
                if await pg.evaluate(cond): return True
                await asyncio.sleep(0.03)
            print('timeout waiting', cond); return False
        if mode in ('hr', 'hit'):
            force = "ctx.qMin = 1; ctx.la = 29; ctx.evMul = 1.32; ctx.spray = 6; ctx.auto = true;" if mode == 'hr' else "ctx.qMin = 0.9; ctx.la = 12; ctx.spray = -20; ctx.auto = true;"
            await pg.evaluate("(() => { const A = __hb.ABIL, o = A.modifyContact; A.modifyContact = function (ctx, g) { o.call(A, ctx, g); %s }; })()" % force)
            await run_until("__hb.G.phase === 'flight' && __hb.G.isUserOffense() && __hb.G.pitch.t > __hb.G.pitch.T - 0.13")
            await pg.evaluate("__hb.G.doSwing({ angle: 35, power: 1.12, user: true })")
            await run_until("__hb.G.phase === 'play'")
            await asyncio.sleep(0.05)
            await shot('1_contact'); await resume()
            await asyncio.sleep(1.2 if mode == 'hr' else 0.5)
            await shot('2_launch'); await resume()
            if mode == 'hr':
                await run_until("__hb.FLD.ball.hr")
                await asyncio.sleep(0.5)
                await shot('3_hr'); await resume()
                await asyncio.sleep(1.2)
                await shot('4_hr2'); await resume()
        else:
            await run_until("__hb.G.phase === 'pre' && __hb.G.isUserDefense() && __hb.G.phaseT > 0.5")
            await pg.evaluate("__hb.G.strikes = 2")
            # gesture pitch straight up into the middle of the zone
            await pg.evaluate("""(async () => { const z = document.querySelector('#aim .zone').getBoundingClientRect(); const t = document.getElementById('touch');
              const fire = (type, x, y) => t.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true, pointerType: 'touch', isPrimary: true }));
              const x0 = innerWidth * 0.5, y0 = innerHeight * 0.86, x1 = z.left + z.width / 2, y1 = z.top + z.height / 2;
              fire('pointerdown', x0, y0); for (let i = 1; i <= 6; i++) { await new Promise(r => setTimeout(r, 20)); fire('pointermove', x0 + (x1 - x0) * i / 6, y0 + (y1 - y0) * i / 6); } fire('pointerup', x1, y1); })()""")
            await run_until("__hb.G.phase === 'flight'")
            await pg.evaluate("__hb.G.aiSwing = null")
            await run_until("__hb.G.phase !== 'flight'")
            await asyncio.sleep(0.03)
            await shot('1_k'); await resume()
            await asyncio.sleep(0.5)
            await shot('2_k'); await resume()
        await b.close()
asyncio.run(main())
