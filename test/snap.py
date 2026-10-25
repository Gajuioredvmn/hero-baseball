import sys, asyncio, json
from playwright.async_api import async_playwright
# usage: snap.py url out.png w h [wait_ms]
async def main():
    url, out = sys.argv[1], sys.argv[2]
    w, h = int(sys.argv[3]), int(sys.argv[4])
    wait = int(sys.argv[5]) if len(sys.argv) > 5 else 400
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":w,"height":h}, device_scale_factor=1)
        logs=[]
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        await pg.goto(url)
        try:
            await pg.wait_for_function("document.title==='ready' || document.title.startsWith('ERR')", timeout=60000)
        except Exception as e:
            logs.append('timeout waiting ready: ' + str(e)[:100])
        await pg.wait_for_timeout(wait)
        await pg.screenshot(path=out)
        print('title:', await pg.title())
        for l in logs[:40]: print(l[:600])
        await b.close()
asyncio.run(main())
