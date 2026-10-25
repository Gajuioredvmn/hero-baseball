import sys, asyncio, time
from playwright.async_api import async_playwright
async def main():
    url = sys.argv[1]; secs = float(sys.argv[2]) if len(sys.argv)>2 else 6
    w = int(sys.argv[3]) if len(sys.argv)>3 else 390; h = int(sys.argv[4]) if len(sys.argv)>4 else 780
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":w,"height":h}, device_scale_factor=1)
        t0=time.time()
        pg.on("console", lambda m: print(f"{time.time()-t0:6.1f} [{m.type}] {m.text[:400]}", flush=True))
        pg.on("pageerror", lambda e: print(f"{time.time()-t0:6.1f} [pageerror] {e}", flush=True))
        await pg.goto(url, wait_until='commit')
        await asyncio.sleep(secs)
        await b.close()
asyncio.run(main())
