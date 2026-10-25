import sys, asyncio
from playwright.async_api import async_playwright
async def main(url, out, w, h):
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":w,"height":h}, device_scale_factor=1)
        logs=[]
        pg.on("console", lambda m: logs.append(f"[{m.type}] {m.text}"))
        pg.on("pageerror", lambda e: logs.append(f"[pageerror] {e}"))
        await pg.goto(url)
        await pg.wait_for_timeout(1500)
        print("TITLE:", await pg.title())
        await pg.screenshot(path=out)
        for l in logs[:30]: print(l)
        await b.close()
asyncio.run(main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv)>3 else 400, int(sys.argv[4]) if len(sys.argv)>4 else 800))
