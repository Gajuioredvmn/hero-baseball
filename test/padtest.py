import sys, asyncio, json, math, random
from playwright.async_api import async_playwright
URL = "file:///home/claude/hb/dist/index.html"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780}, device_scale_factor=2, has_touch=True)
        logs = []
        pg.on("console", lambda m: logs.append(m.text) if m.text.startswith('LOG') or m.type=='error' else None)
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        # 1) offline recognizer robustness for every symbol
        await pg.goto(URL + "?q=low")
        await pg.wait_for_function("window.__hb && window.__hb.SYMBOLS", timeout=60000)
        res = await pg.evaluate("""() => {
          const {SYMBOLS, recognize} = window.__hb;
          function gauss(){ let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
          function densify(pts, n){ const out=[]; for(let i=1;i<pts.length;i++){ for(let k=0;k<n;k++){ const t=k/n; out.push([pts[i-1][0]+(pts[i][0]-pts[i-1][0])*t, pts[i-1][1]+(pts[i][1]-pts[i-1][1])*t]); } } out.push(pts[pts.length-1]); return out; }
          function human(sym, noise){ // jitter + wobble + random affine
            const rot=gauss()*0.12, sx=1+gauss()*0.12, sy=1+gauss()*0.12, size=180+Math.random()*80;
            const c=Math.cos(rot), s=Math.sin(rot);
            let ph=Math.random()*6, amp=noise*(0.5+Math.random());
            return densify(sym, 6).map((q,i)=>{ let x=(q[0]-0.5)*sx, y=(q[1]-0.5)*sy; let X=x*c-y*s, Y=x*s+y*c; X+=gauss()*noise*0.5+Math.sin(i*0.35+ph)*amp; Y+=gauss()*noise*0.5+Math.cos(i*0.29+ph)*amp; return [X*size+200, Y*size+200]; });
          }
          const keys = Object.keys(SYMBOLS); const out = {};
          for (const k of keys) {
            let pass=0, passHard=0, worstOther=0, worstName='';
            for (let i=0;i<60;i++){ if (recognize(human(SYMBOLS[k],0.03),k)>=0.72) pass++; if (recognize(human(SYMBOLS[k],0.07),k)>=0.72) passHard++; }
            for (const o of keys) { if (o===k) continue; let sc=0; for(let i=0;i<8;i++) sc=Math.max(sc, recognize(human(SYMBOLS[o],0.03),k)); if (sc>worstOther){worstOther=sc; worstName=o;} }
            // scribble
            let scr=0; for(let i=0;i<20;i++){ const pts=[]; let x=200,y=200; for(let j=0;j<40;j++){ x+=gauss()*25; y+=gauss()*25; pts.push([x,y]); } scr=Math.max(scr, recognize(pts,k)); }
            out[k] = {pass, passHard, worstOther: +worstOther.toFixed(2), worstName, scribble: +scr.toFixed(2)};
          }
          return out;
        }""")
        for k,v in res.items(): print(k, v)
        await b.close()
asyncio.run(main())
