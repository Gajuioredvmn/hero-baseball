import sys, asyncio
from playwright.async_api import async_playwright
async def main():
    out = sys.argv[1]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        await pg.goto("file:///home/claude/hb/dist/index.html?pdb=1", wait_until='commit')
        await asyncio.sleep(3)
        await pg.click('#btnPlay'); await asyncio.sleep(1.5)
        await pg.screenshot(path=f"{out}_setup.png")
        await pg.click('#setupBack'); await asyncio.sleep(0.5)
        await pg.click('#btnRoster'); await asyncio.sleep(2.5)
        await pg.screenshot(path=f"{out}_roster.png")
        await pg.click('#rosterBack'); await asyncio.sleep(0.5)
        await pg.click('#btnHow'); await asyncio.sleep(1)
        await pg.screenshot(path=f"{out}_how.png")
        await b.close()
asyncio.run(main())
