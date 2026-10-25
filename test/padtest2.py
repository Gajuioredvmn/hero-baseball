import sys, asyncio
from playwright.async_api import async_playwright
URL = "file:///home/claude/hb/dist/index.html"
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path="/opt/google/chrome/chrome", args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":390,"height":780})
        pg.on("pageerror", lambda e: print("PAGEERROR", e, flush=True))
        await pg.goto(URL + "?q=low")
        await pg.wait_for_function("window.__hb && window.__hb.SYMBOLS", timeout=60000)
        res = await pg.evaluate("""() => {
          const {SYMBOLS, recognize} = window.__hb;
          function gauss(){ let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }
          function arcSample(pts, step){ const out=[pts[0].slice()]; let carry=0; for(let i=1;i<pts.length;i++){ const a=pts[i-1], b=pts[i]; const d=Math.hypot(b[0]-a[0], b[1]-a[1]); let t=step-carry; while(t<=d){ out.push([a[0]+(b[0]-a[0])*t/d, a[1]+(b[1]-a[1])*t/d]); t+=step; } carry = d-(t-step); } out.push(pts[pts.length-1].slice()); return out; }
          // realistic finger trace: affine distortion, smooth low-frequency wobble, corner rounding, ~8px spacing
          function human(sym, wob){
            const size=150+Math.random()*90, rot=gauss()*0.1, sx=1+gauss()*0.1, sy=1+gauss()*0.1, c=Math.cos(rot), s=Math.sin(rot);
            const base = sym.map(q=>{ const x=(q[0]-0.5)*sx*size, y=(q[1]-0.5)*sy*size; return [x*c-y*s+200, x*s+y*c+200]; });
            let pts = arcSample(base, 3);
            // corner rounding (moving average)
            const sm=[]; const K=3; for(let i=0;i<pts.length;i++){ let x=0,y=0,n=0; for(let j=-K;j<=K;j++){ const q=pts[Math.min(pts.length-1,Math.max(0,i+j))]; x+=q[0]; y+=q[1]; n++; } sm.push([x/n,y/n]); }
            pts = arcSample(sm, 8);
            const f1=0.02+Math.random()*0.03, f2=0.05+Math.random()*0.05, p1=Math.random()*6, p2=Math.random()*6, A=wob*size;
            return pts.map((q,i)=>[q[0]+A*Math.sin(i*8*f1+p1)+A*0.4*Math.sin(i*8*f2+p2)+gauss()*0.6, q[1]+A*Math.cos(i*8*f1*1.3+p2)+A*0.4*Math.cos(i*8*f2*0.8+p1)+gauss()*0.6]);
          }
          const keys = Object.keys(SYMBOLS); const out = {};
          for (const k of keys) {
            let r={};
            for (const w of [0.02, 0.04, 0.07]) { let pass=0, sum=0; for (let i=0;i<80;i++){ const sc=recognize(human(SYMBOLS[k],w),k); sum+=sc; if (sc>=0.72) pass++; } r['w'+w]=pass+'/80 avg'+(sum/80).toFixed(2); }
            let scr=0; for(let i=0;i<40;i++){ const pts=[]; let x=200,y=200,vx=0,vy=0; for(let j=0;j<50;j++){ vx=vx*0.8+gauss()*6; vy=vy*0.8+gauss()*6; x+=vx; y+=vy; pts.push([x,y]); } scr=Math.max(scr, recognize(pts,k)); }
            r.scribbleMax = scr.toFixed(2);
            out[k]=r;
          }
          return out;
        }""")
        for k,v in res.items(): print(f"{k:10s}", v)
        await b.close()
asyncio.run(main())
