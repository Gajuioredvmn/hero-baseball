const out = document.getElementById('gl');
out.width = innerWidth; out.height = innerHeight;
const g2 = out.getContext('2d'); g2.imageSmoothingEnabled = false;
g2.fillStyle = '#4e6a52'; g2.fillRect(0,0,out.width,out.height);
function renderLook(look, pose, yawView, elev, ppm){
  buildLook(look);
  const v = [Math.sin(yawView)*Math.cos(elev), Math.sin(elev), Math.cos(yawView)*Math.cos(elev)];
  const rr = [-Math.cos(yawView), 0, Math.sin(yawView)];
  const V = { r: rr, u: [-Math.sin(elev)*Math.sin(yawView), Math.cos(elev), -Math.sin(elev)*Math.cos(yawView)], v };
  const W = Math.ceil(SPR_EXT.side*2*ppm), H = Math.ceil((SPR_EXT.top+SPR_EXT.bot)*ppm);
  rasEnsure(W,H);
  const ox=W/2, oy=H-SPR_EXT.bot*ppm;
  look._t = 0.7;
  const J = solveSkeleton(pose, look);
  const parts = buildParts(J, pose, look);
  rasterParts(parts, V, ppm, ox, oy);
  composite(parts, look);
  drawFace(parts, V, ppm, ox, oy, look, pose);
  const id = new ImageData(new Uint8ClampedArray(RAS.out.slice(0, W*H*4)), W, H);
  const c = document.createElement('canvas'); c.width=W; c.height=H; c.getContext('2d').putImageData(id,0,0);
  return c;
}
const q = new URLSearchParams(location.search);
const ppm = +q.get('ppm') || 34, sc = +q.get('sc') || 2, mode = q.get('mode') || 'stance';
const yv = +(q.get('yv') || 1.45), el = +(q.get('el') || 0.2);
const team = q.get('team') || 'E';
let x = 0, y = 0, col = 0;
const list = HEROES.filter(h => h.team === team);
for (const h of list) {
  const look = heroLook(h);
  let pose;
  const t = +(q.get('t') || 0.4);
  if (mode === 'stance') pose = h.delivery ? pitchDelivery(h.delivery, t) : batStance(h.stance || {}, 0.6);
  else if (mode === 'swing') pose = h.delivery ? pitchDelivery(h.delivery, PITCH_REL_T) : batSwing(h.stance || {}, t);
  else pose = POSE.ready(0.5);
  if (h.bats === 'L' && !h.delivery && mode !== 'ready') pose = mirrorPose(pose);
  if (h.delivery && h.throws === 'L') pose = mirrorPose(pose);
  const c = renderLook(look, pose, h.delivery ? (+q.get('pyv') || 0.2) : (h.bats === 'L' ? -yv : yv), el, ppm * (h.look.scale || 1));
  const cw = Math.ceil(SPR_EXT.side*2*ppm), ch = Math.ceil((SPR_EXT.top+SPR_EXT.bot)*ppm);
  g2.drawImage(c, x + (cw - c.width)/2*sc, y + (ch - c.height)*sc, c.width*sc, c.height*sc);
  g2.fillStyle = '#fff'; g2.font = '14px sans-serif'; g2.fillText(h.name, x + cw*sc*0.3, y + ch*sc - 4);
  x += cw*sc*0.62; col++;
  if (col === 6) { col = 0; x = 0; y += ch*sc*0.95; }
}
document.title = 'ready';
