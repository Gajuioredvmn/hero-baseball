import sys, asyncio, time, json
from playwright.async_api import async_playwright
# usage: shot2.py url out.png w h wait_s [js_before_freeze]
async def main():
    url, out = sys.argv[1], sys.argv[2]
    w, h = int(sys.argv[3]), int(sys.argv[4]); wait = float(sys.argv[5])
    js = sys.argv[6] if len(sys.argv) > 6 else None
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":w,"height":h}, device_scale_factor=1)
        logs=[]
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text[:300]}"))
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        await pg.goto(url, wait_until='commit')
        await asyncio.sleep(wait)
        if js:
            r = await pg.evaluate(js)
            if r is not None: print('js:', r)
            await asyncio.sleep(0.5)
        await pg.evaluate("window.__hb && (window.__hb.MAIN.frozen = true)")
        await asyncio.sleep(0.3)
        await pg.screenshot(path=out, timeout=60000)
        for l in logs[-25:]:
            if not l.startswith('[log] frame '): print(l)
        await b.close()
asyncio.run(main())
