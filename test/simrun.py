import sys, asyncio, time
from playwright.async_api import async_playwright
async def main():
    url = sys.argv[1]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780})
        pg.on("console", lambda m: print(m.text[:400000], flush=True) if m.text.startswith('LOG') or m.type == 'error' else None)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        await pg.add_init_script("window.__noBoot = true;")
        await pg.goto(url, wait_until="commit", timeout=0)
        await pg.wait_for_function("document.title==='ready'", timeout=600000)
        await b.close()
asyncio.run(main())
