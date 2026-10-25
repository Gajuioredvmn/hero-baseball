// render sample characters to a 2D canvas for look-dev
const out = document.getElementById('gl');
out.width = innerWidth; out.height = innerHeight;
const g2 = out.getContext('2d'); g2.imageSmoothingEnabled = false;
g2.fillStyle = '#5a6a5a'; g2.fillRect(0,0,out.width,out.height);
function renderLook(look, pose, yawView, elev, ppm){
  buildLook(look);
  // view vectors in local frame: camera looking at character from direction yawView (0 = front), elevation elev
  const v = [Math.sin(yawView)*Math.cos(elev), Math.sin(elev), Math.cos(yawView)*Math.cos(elev)]; // toward viewer
  const r = vnorm(vcross([0,1,0], v)).map(x=>-x);
  // r should be viewer's right: for front view (v=[0,0,1]) viewer's right = character's left = -s
  const rr = [-Math.cos(yawView), 0, Math.sin(yawView)];
  const u = vcross(v, rr).map(x=>-x);
  const V = { r: rr, u: vnorm(vcross(rr, v)).map(x=>-x), v };
  V.u = [-Math.sin(elev)*Math.sin(yawView), Math.cos(elev), -Math.sin(elev)*Math.cos(yawView)];
  const W = Math.ceil(SPR_EXT.side*2*ppm), H = Math.ceil((SPR_EXT.top+SPR_EXT.bot)*ppm);
  rasEnsure(W,H);
  const ox=W/2, oy=H-SPR_EXT.bot*ppm;
  const J = solveSkeleton(pose, look);
  const parts = buildParts(J, pose, look);
  rasterParts(parts, V, ppm, ox, oy);
  composite(parts, look);
  drawFace(parts, V, ppm, ox, oy, look, pose);
  const id = new ImageData(new Uint8ClampedArray(RAS.out.slice(0, W*H*4)), W, H);
  const c = document.createElement('canvas'); c.width=W; c.height=H; c.getContext('2d').putImageData(id,0,0);
  return c;
}
window.renderLook = renderLook;
const team = { jersey:'#c8302c', trim:'#e8b33a', pants:'#ece6da', socks:'#c8302c' };
const looks = {
  wukong: { colors:Object.assign({}, team, { skin:'#f3d6b4', hair:'#b8742e', acc:'#c48a4a', wpn:'#e8b830', wpn2:'#c8302c' }), hairStyle:'spiky', acc:[{t:'circlet'},{t:'monkey'},{t:'tail'}], bat:{t:'staff'} },
  zeus: { colors:{ jersey:'#2d5bd1', trim:'#e9eef8', pants:'#dfe4ee', socks:'#2d5bd1', skin:'#f0c8a4', hair:'#f4f4f0', acc:'#e8c040', beard:'#f4f4f0' }, hairStyle:'long', acc:[{t:'laurel'},{t:'beard', len:1.6}], bat:{t:'bat'} },
  pig: { colors:Object.assign({}, team, { skin:'#f2b6b0', hair:'#2a2224', acc:'#f0a0a0', wpn:'#c0c0c8', wpn2:'#6b4a2a' }), body:{w:1.3, belly:1.2, chest:1.1}, hairStyle:'short', acc:[{t:'pig'}], bat:{t:'rake'} },
  fox: { colors:Object.assign({}, team, { skin:'#f7e2d4', hair:'#eef0f8', acc:'#f4f0ea', acc2:'#f2c25a', bat:'#b8302c' }), hairStyle:'long', acc:[{t:'foxEars'},{t:'tails9'}], facePaint:'#d83a4a' },
  heracles: { colors:{ jersey:'#2d5bd1', trim:'#e9eef8', pants:'#dfe4ee', socks:'#2d5bd1', skin:'#d9a074', hair:'#5a3820', acc:'#d89a3a', acc2:'#a8642a', wpn:'#7a5030', wpn2:'#5a3a20', beard:'#5a3820' }, body:{arm:1.35, chest:1.2, w:1.15}, hairStyle:'short', acc:[{t:'hood'},{t:'beard',len:0.8}], bat:{t:'club'} },
  tengu: { colors:Object.assign({}, team, { skin:'#d8473a', hair:'#e8e4dc', acc2:'#2a2630', wpn:'#3a3a3a', wpn2:'#7a4a2a' }), hairStyle:'long', acc:[{t:'tengu'},{t:'wings'}], bat:{t:'fan'} },
};
const poses = [
  ['stand', () => POSE.stand(0)],
  ['ready', () => POSE.ready(0)],
  ['run', () => POSE.run(1.2, 'L')],
  ['bat', () => batStance({}, 0)],
  ['swing', () => batSwing({}, 0.5)],
  ['finish', () => batSwing({}, 0.95)],
  ['pitch', () => pitchDelivery({type:'over'}, 0.3)],
  ['rel', () => pitchDelivery({type:'over'}, 0.78)],
];
const ppm = +new URLSearchParams(location.search).get('ppm') || 30;
let y = 4;
const names = (new URLSearchParams(location.search).get('who') || 'wukong,zeus,pig').split(',');
const views = [[0,0.25],[PI/2,0.25],[PI,0.25],[-PI/2, 0.5]];
for (const nm of names) {
  let x = 4, rowH = 0;
  for (const [pn, pf] of poses.slice(0, +new URLSearchParams(location.search).get('np') || 8)) {
    const vw = views[(+new URLSearchParams(location.search).get('view')) || 0];
    const c = renderLook(JSON.parse(JSON.stringify(looks[nm])), pf(), vw[0], vw[1], ppm);
    const sc = +new URLSearchParams(location.search).get('sc') || 1;
    g2.drawImage(c, x, y, c.width*sc, c.height*sc);
    x += c.width*sc*0.62; rowH = Math.max(rowH, c.height*sc);
  }
  y += rowH*0.92;
}
document.title = 'ready';
