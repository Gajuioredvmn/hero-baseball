// swing filmstrip for look-dev: ?who=wukong,zeus&n=10&yv=..&el=..&up=0
const out = document.getElementById('gl');
for (const el of document.body.children) if (el !== out && el.tagName !== 'SCRIPT') el.style.display = 'none';
Object.assign(out.style, { position: 'fixed', left: 0, top: 0, width: innerWidth + 'px', height: innerHeight + 'px', zIndex: 99, display: 'block' });
const Q0 = new URLSearchParams(location.search); out.width = +Q0.get('W') || innerWidth; out.height = +Q0.get('H') || innerHeight;
const g2 = out.getContext('2d'); g2.imageSmoothingEnabled = false;
g2.fillStyle = '#4e6a52'; g2.fillRect(0, 0, out.width, out.height);
function renderLook(look, pose, yawView, elev, ppm) {
  buildLook(look);
  const v = [Math.sin(yawView) * Math.cos(elev), Math.sin(elev), Math.cos(yawView) * Math.cos(elev)];
  const rr = [-Math.cos(yawView), 0, Math.sin(yawView)];
  const V = { r: rr, u: [-Math.sin(elev) * Math.sin(yawView), Math.cos(elev), -Math.sin(elev) * Math.cos(yawView)], v };
  const W = Math.ceil(SPR_EXT.side * 2 * ppm), H = Math.ceil((SPR_EXT.top + SPR_EXT.bot) * ppm);
  rasEnsure(W, H);
  const ox = W / 2, oy = H - SPR_EXT.bot * ppm;
  look._t = 0.7;
  const J = solveSkeleton(pose, look);
  const parts = buildParts(J, pose, look);
  rasterParts(parts, V, ppm, ox, oy);
  composite(parts, look);
  drawFace(parts, V, ppm, ox, oy, look, pose);
  const id = new ImageData(new Uint8ClampedArray(RAS.out.slice(0, W * H * 4)), W, H);
  const c = document.createElement('canvas'); c.width = W; c.height = H; c.getContext('2d').putImageData(id, 0, 0);
  return c;
}
const q = new URLSearchParams(location.search);
const ppm = +q.get('ppm') || 26, sc = +q.get('sc') || 1, n = +q.get('n') || 10, up = +(q.get('up') || 0);
const views = (q.get('views') || '0:0.15,1.57:0.15').split(',').map(s => s.split(':').map(Number));
const who = (q.get('who') || 'wukong').split(',');
g2.font = '12px monospace';
let y = 2;
for (const id of who) {
  const h = HEROES.find(x => x.id === id) || { stance: {}, look: {}, team: 'E', bats: 'R' };
  for (const [yv, el] of views) {
    let x = 2, rowH = 0;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let pose = batSwing(h.stance || {}, t, up, 0);
      if (h.bats === 'L') pose = mirrorPose(pose);
      const c = renderLook(heroLook(h), pose, yv, el, ppm);
      g2.drawImage(c, x, y, c.width * sc, c.height * sc);
      g2.fillStyle = '#fff'; g2.fillText(t.toFixed(2), x + 4, y + 12);
      x += c.width * sc * 0.7; rowH = Math.max(rowH, c.height * sc);
    }
    g2.fillText(id + ' yv' + yv, 4, y + rowH - 4);
    y += rowH * 0.95;
  }
}
if (q.get('save')) fetch('/save?name=' + q.get('save'), { method: 'POST', body: out.toDataURL('image/png') }).then(() => { document.title = 'saved'; });
else document.title = 'ready';
