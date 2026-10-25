import sys, asyncio, json
from playwright.async_api import async_playwright
# start user game batting, wait until 'pre', then try camera configs
CFGS = json.loads(sys.argv[2])
async def main():
    out = sys.argv[1]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=1)
        pg.on("pageerror", lambda e: print("PAGEERROR", e))
        await pg.goto("file:///home/claude/hb/dist/index.html?pdb=1&auto=1&team=" + (sys.argv[3] if len(sys.argv)>3 else 'E'), wait_until='commit')
        for _ in range(60):
            await asyncio.sleep(0.5)
            ph = await pg.evaluate("__hb.G ? __hb.G.phase : ''")
            if ph == 'pre': break
        await pg.evaluate("__hb.G.aiPitchT = 999")
        for i, c in enumerate(CFGS):
            await pg.evaluate(f"__hb.MAIN.camOverride = {json.dumps(c)}")
            await asyncio.sleep(1.2)
            await pg.screenshot(path=f"{out}_{i}.png")
        await b.close()
asyncio.run(main())
