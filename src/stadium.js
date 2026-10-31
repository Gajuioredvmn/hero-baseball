// ===== stadium.js : field, stands, crowd, sky, lights =====
const FIELD = {
  base1: [19.4, 0, -19.4], base2: [0, 0, -38.8], base3: [-19.4, 0, -19.4], home: [0, 0, 0],
  rubber: [0, 0, -18.44], moundH: 0.25,
  fenceH: 3.2,
};
FIELD.bases = [FIELD.home, FIELD.base1, FIELD.base2, FIELD.base3];
const fenceR = ang => 98 + 24 * Math.cos(2 * ang); // ang: radians from CF line, |ang|<=45deg
const fieldAng = (x, z) => Math.atan2(x, -z);
const isFair = (x, z) => -z >= Math.abs(x);
// boundary of playable ground (front of stands) as distance from home for any angle
function boundaryR(ang) {
  const a = Math.abs(ang);
  if (a <= PI / 4) return fenceR(ang);
  const s = Math.sin(a - PI / 4);
  return Math.min(14 / Math.max(s, 1e-3), 98);
}
// same dirt/grass layout as the ground shader (for dust colour)
function groundDirt(x, z) {
  const d = Math.hypot(x, z), fz = -z, ax = Math.abs(x);
  const fair = fz >= ax;
  const s = (x - z) * 0.70710678, t = (-x - z) * 0.70710678;
  const inGrass = s > 1 && t > 1 && s < 26.4 && t < 26.4;
  const dr = Math.hypot(x, z + 18.44);
  if (dr < 29 && fz > ax - 2.5 && !inGrass) return true;
  const seg = (bx, bz) => { const h = clamp((x * bx + z * bz) / (bx * bx + bz * bz), 0, 1); return Math.hypot(x - bx * h, z - bz * h); };
  if (seg(19.4, -19.4) < 0.95 || seg(-19.4, -19.4) < 0.95) return true;
  if (d < 4 || dr < 2.74) return true;
  if (Math.hypot(x - 19.4, z + 19.4) < 2.6 || Math.hypot(x + 19.4, z + 19.4) < 2.6) return true;
  if (fair && d > fenceR(clamp(Math.atan2(x, -z), -PI / 4, PI / 4)) - 4.5) return true;
  if (!fair && (ax - fz) * 0.70710678 > 11.5) return true;
  return false;
}
const moundY = (x, z) => { const d = Math.hypot(x, z + 18.44); return d < 2.9 ? FIELD.moundH * smooth(1 - d / 2.9) * 1.15 : 0; };
const groundY = (x, z) => Math.min(moundY(x, z), FIELD.moundH);

const ST = { meshes: [], crowd: null, ground: null, mound: null, sky: null, towers: [], scoreTex: null, scoreCanvas: null, cheer: 0, cheerTarget: 0 };

function stadiumPrograms() {
  PROG.ground = glProgram(`
in vec3 aPos; in vec3 aNor; in vec2 aUV; in vec4 aCol;
uniform mat4 uVP; out vec3 vP; out vec3 vN;
void main(){ vP = aPos; vN = aNor; gl_Position = uVP*vec4(aPos,1.0); }`,
  GLSL_LIGHT + `
in vec3 vP; in vec3 vN; uniform float uPx; out vec4 o;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float fenceR(float a){ return 98.0 + 24.0*cos(2.0*a); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0); return length(pa-ba*h); }
float rectLine(vec2 p, vec2 lo, vec2 hi, float w){
  vec2 c = (lo+hi)*0.5, e = (hi-lo)*0.5; vec2 d = abs(p-c) - e;
  float outside = length(max(d,0.0)) + min(max(d.x,d.y),0.0);
  return abs(outside) - w;
}
void main(){
  vec2 P = vP.xz;
  vec2 fw = fwidth(P); float foot = max(fw.x, fw.y);
  float px = uPx;
  vec2 cell = floor(P/px);
  vec2 q = (cell + 0.5)*px;
  float detail = 1.0 - smoothstep(px*0.6, px*1.6, foot);
  if(detail < 0.01) q = P;
  float h = h21(cell);
  float d = length(q);
  float ang = atan(q.x, -q.y);
  float fz = -q.y;
  bool fair = fz >= abs(q.x);
  float s = (q.x - q.y)*0.70710678, t = (-q.x - q.y)*0.70710678;
  vec3 gA = vec3(0.27,0.52,0.22), gB = vec3(0.33,0.61,0.27);
  vec3 dirt = vec3(0.72,0.49,0.31), dirtD = vec3(0.62,0.41,0.26);
  vec3 col;
  // grass mowing
  float band;
  if(fair && d > 29.0) band = mod(floor(d/6.0) + floor((ang+1.0)*5.0), 2.0);
  else { vec2 r = vec2(s,t)/3.4; band = mod(floor(r.x)+floor(r.y), 2.0); }
  col = mix(gA, gB, band);
  col *= 0.94 + 0.10*h*detail;
  if(h > 0.965) col *= mix(1.0, 1.18, detail);
  bool isDirt = false;
  // infield
  bool inGrass = s > 1.0 && t > 1.0 && s < 26.4 && t < 26.4;
  float dr = length(q - vec2(0.0,-18.44));
  if(dr < 29.0 && fz > abs(q.x) - 2.5 && !inGrass) isDirt = true;
  if(sdSeg(q, vec2(0.0), vec2(19.4,-19.4)) < 0.95 || sdSeg(q, vec2(0.0), vec2(-19.4,-19.4)) < 0.95) isDirt = true;
  if(d < 4.0) isDirt = true;
  if(dr < 2.74) isDirt = true;
  if(length(q - vec2(19.4,-19.4)) < 2.6 || length(q - vec2(-19.4,-19.4)) < 2.6) isDirt = true;
  // warning track
  float bR = fair ? fenceR(clamp(ang,-0.7854,0.7854)) : 0.0;
  if(fair && d > bR - 4.5) isDirt = true;
  float perp = (abs(q.x) - fz)*0.70710678; // distance beyond foul line (foul side positive)
  if(!fair && perp > 11.5) isDirt = true;
  if(d > 17.0 && !fair && fz < -abs(q.x)*0.0 - 5.0 && perp < 0.0) isDirt = false;
  if(isDirt){
    col = mix(dirt, dirtD, step(0.6, h)*0.5);
    col *= 0.94 + 0.08*h*detail;
    if(h > 0.985) col *= mix(1.0, 0.75, detail);
    if(fair && d > bR - 4.5) col = vec3(0.56,0.37,0.25)*(0.94+0.08*h*detail);
    if(!fair && perp > 11.5) col = vec3(0.56,0.37,0.25)*(0.94+0.08*h*detail);
    // wear near home and mound
    float wear = exp(-d*d/6.0)*0.25 + exp(-dr*dr/3.0)*0.2;
    col *= 1.0 - wear;
  }
  // chalk
  float lw = 0.055;
  bool chalk = false;
  if(fz > 0.3 && abs(abs(q.x) - fz)*0.70710678 < lw && d < (fair? 200.0: 200.0)) chalk = true;
  if(rectLine(q, vec2(0.37,-0.91), vec2(1.59,0.91), 0.035) < 0.0 || rectLine(q, vec2(-1.59,-0.91), vec2(-0.37,0.91), 0.035) < 0.0) chalk = true;
  if(abs(abs(q.x)-0.55) < 0.035 && q.y > 0.91 && q.y < 2.9) chalk = true;
  if(abs(q.y-2.9) < 0.035 && abs(q.x) < 0.55) chalk = true;
  // on-deck circles
  if(abs(length(q - vec2(-11.0, 5.0)) - 0.8) < 0.05 || abs(length(q - vec2(11.0, 5.0)) - 0.8) < 0.05) chalk = true;
  if(chalk) col = vec3(0.93,0.92,0.88)*(0.96+0.04*h);
  // AO near walls
  float wallD;
  if(fair) wallD = bR - d; else wallD = 14.0 - perp;
  col *= 0.72 + 0.28*smoothstep(0.0, 6.0, wallD);
  vec3 n = normalize(vN);
  vec3 lit = col * lightAt(vP, n);
  o = vec4(applyFog(lit, vP), 1.0);
}`, ['aPos', 'aNor', 'aUV', 'aCol']);

  PROG.crowd = glProgram(`
in vec3 aPos; in vec3 aNor; in vec2 aUV; in vec4 aCol;
uniform mat4 uVP; out vec3 vP; out vec2 vUV; out vec4 vC;
void main(){ vP = aPos; vUV = aUV; vC = aCol; gl_Position = uVP*vec4(aPos,1.0); }`,
  GLSL_LIGHT + `
in vec3 vP; in vec2 vUV; in vec4 vC; uniform float uTime, uCheer; out vec4 o;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
void main(){
  // vUV.x: meters along row, vUV.y: meters up from quad bottom (0..1.1); vC.r: side (-1 east,1 west,0 mixed), vC.g: row id
  float cw = 0.55;
  float ci = floor(vUV.x / cw);
  float lx = (vUV.x - ci*cw)/cw;          // 0..1
  float id = h21(vec2(ci, vC.g*17.0+3.0));
  float id2 = h21(vec2(ci*1.7+5.0, vC.g*3.1));
  float occupied = step(0.12, id);
  float ph = id2*6.2831;
  float bounce = uCheer * max(0.0, sin(uTime*11.0 + ph)) * 0.16 + 0.02*sin(uTime*2.0+ph);
  float y = vUV.y - bounce;
  // pixelate
  float pxs = 0.045;
  float qx = (floor(lx*cw/pxs)+0.5)*pxs/cw;
  float qy = (floor(y/pxs)+0.5)*pxs;
  vec3 shirt;
  float side = vC.r;
  float k = h21(vec2(ci*3.3, vC.g+11.0));
  if(side < -0.5) shirt = k < 0.45 ? vec3(0.78,0.12,0.14) : (k < 0.75 ? vec3(0.95,0.75,0.2) : vec3(0.92,0.9,0.86));
  else if(side > 0.5) shirt = k < 0.45 ? vec3(0.15,0.3,0.78) : (k < 0.75 ? vec3(0.9,0.92,0.96) : vec3(0.55,0.75,0.95));
  else shirt = k < 0.33 ? vec3(0.78,0.12,0.14) : (k < 0.66 ? vec3(0.15,0.3,0.78) : vec3(0.85,0.8,0.7));
  vec3 skin = mix(vec3(0.96,0.78,0.6), vec3(0.62,0.42,0.3), h21(vec2(ci, 9.0)));
  vec3 hair = mix(vec3(0.1,0.08,0.08), vec3(0.45,0.3,0.15), step(0.7, h21(vec2(ci, 4.0))));
  float a = 0.0; vec3 col = vec3(0.0);
  if(occupied > 0.5){
    vec2 hc = vec2(0.5, 0.78);
    float headR = 0.13;
    vec2 dq = vec2((qx-hc.x)*cw, qy-hc.y);
    if(length(dq) < headR){ a = 1.0; col = skin; if(dq.y > 0.04 || (abs(dq.x) > 0.09 && dq.y > -0.02)) col = hair; }
    else if(qy < 0.66 && qy > 0.0 && abs((qx-0.5)*cw) < 0.2 - max(0.0, (0.66-qy)-0.5)*0.3){ a = 1.0; col = shirt; }
    // arms up when cheering
    float arm = uCheer * step(0.5, id2);
    if(arm > 0.5 && qy > 0.6 && qy < 1.05 && abs(abs((qx-0.5)*cw) - 0.2) < 0.035){ a = 1.0; col = skin; }
  }
  if(a < 0.5) discard;
  vec3 lit = col * lightAt(vP, vec3(0.0,0.3,1.0)) * 0.95;
  o = vec4(applyFog(lit, vP), 1.0);
}`, ['aPos', 'aNor', 'aUV', 'aCol']);

  PROG.sky = glProgram(`
in vec3 aPos; in vec3 aNor; in vec2 aUV; in vec4 aCol;
uniform mat4 uVP; uniform vec3 uCam; out vec3 vD;
void main(){ vD = aPos; vec4 p = uVP*vec4(aPos + uCam, 1.0); gl_Position = p.xyww; }`,
  `in vec3 vD; uniform float uTime; out vec4 o;
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float n1(float x){ float i=floor(x), f=fract(x); return mix(h21(vec2(i,1.0)), h21(vec2(i+1.0,1.0)), f*f*(3.0-2.0*f)); }
void main(){
  vec3 d = normalize(vD);
  float el = d.y;
  float az = atan(d.x, -d.z);
  vec3 zen = vec3(0.07,0.07,0.2), mid = vec3(0.32,0.2,0.45), hor = vec3(1.0,0.55,0.38), low = vec3(0.95,0.42,0.42);
  vec3 col = mix(hor, mid, smoothstep(0.02, 0.22, el));
  col = mix(col, zen, smoothstep(0.2, 0.75, el));
  col = mix(low, col, smoothstep(-0.05, 0.04, el));
  // warm glow toward sunset (behind home plate, +z)
  float sunA = max(0.0, dot(normalize(vec3(d.x, 0.0, d.z)), vec3(0.3,0.0,1.0)));
  col += vec3(0.45,0.2,0.05) * pow(sunA, 6.0) * (1.0 - smoothstep(0.0, 0.35, el));
  // stars
  vec2 sp = floor(vec2(az*120.0, el*120.0));
  float st = h21(sp);
  if(st > 0.992 && el > 0.18){ float tw = 0.6+0.4*sin(uTime*2.0+st*50.0); col += vec3(0.9,0.9,1.0)*tw*smoothstep(0.18,0.45,el); }
  // pixel clouds band
  float cy = el*40.0;
  float cl = n1(az*6.0 + 3.0) * 0.7 + n1(az*17.0)*0.3;
  float band = smoothstep(2.0, 3.2, cy) * (1.0 - smoothstep(4.0+cl*3.0, 5.0+cl*3.0, cy));
  float cmask = step(0.45, cl + 0.25*n1(floor(az*60.0)));
  vec3 cc = mix(vec3(0.98,0.62,0.55), vec3(0.55,0.35,0.6), smoothstep(2.5, 6.0, cy));
  col = mix(col, cc, band*cmask*0.85);
  // distant mountains silhouette
  float mh = 0.03 + 0.05*n1(az*4.0+7.0) + 0.02*n1(az*13.0);
  if(el < mh && el > -0.2) col = mix(vec3(0.2,0.12,0.28), vec3(0.32,0.18,0.35), smoothstep(-0.02, mh, el));
  o = vec4(col, 1.0);
}`, ['aPos', 'aNor', 'aUV', 'aCol']);
}

// ---------- canvas helpers ----------
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function wallTexture() {
  const W = 2048, H = 128, c = mkCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#1f3d39'; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 28) { g.fillStyle = '#183230'; g.fillRect(x, 0, 2, H); }
  g.fillStyle = '#e8c547'; g.fillRect(0, 0, W, 6);
  g.fillStyle = '#b8962e'; g.fillRect(0, 6, W, 2);
  const ads = [
    ['天庭快遞', '#c8322f', '#fff1c9'], ['雷霆電力', '#1d3f8a', '#ffe36b'], ['龍宮海鮮', '#0e6b6b', '#ffffff'], ['冥府保險', '#2b1a3a', '#c9a7ff'],
    ['月宮年糕', '#f3e6c8', '#a33b2d'], ['蜂蜜酒館', '#7a4a12', '#ffd27a'], ['筋斗雲航空', '#f2f2f2', '#d63b2a'], ['奧林帕斯健身', '#22224a', '#f5d36a'],
    ['九尾茶屋', '#5a1f2c', '#ffd7e1'], ['神鍛鐵工', '#333338', '#ff9a3c'],
  ];
  let x = 40, i = 0;
  while (x < W - 100) {
    const [txt, bg, fg] = ads[i % ads.length];
    const w = 150 + (i * 37) % 60;
    g.fillStyle = bg; g.fillRect(x, 26, w, 70);
    g.fillStyle = fg; g.fillRect(x, 26, w, 4); g.fillRect(x, 92, w, 4);
    g.font = 'bold 30px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, x + w / 2, 62, w - 16);
    x += w + 46; i++;
  }
  // threshold to crisp pixels
  const id = g.getImageData(0, 0, W, H), d = id.data;
  for (let k = 0; k < d.length; k += 4) d[k + 3] = 255;
  g.putImageData(id, 0, 0);
  return c;
}

function netTexture() {
  const c = mkCanvas(64, 64), g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(30,30,36,1)';
  for (let i = 0; i < 64; i += 8) { g.fillRect(i, 0, 1, 64); g.fillRect(0, i, 64, 1); }
  return c;
}

function stoneTexture(base, line, seed) {
  const c = mkCanvas(64, 64), g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 64);
  const r = makeRng(seed);
  const id = g.getImageData(0, 0, 64, 64), d = id.data;
  for (let k = 0; k < d.length; k += 4) { const v = 0.9 + r() * 0.16; d[k] *= v; d[k + 1] *= v; d[k + 2] *= v; }
  g.putImageData(id, 0, 0);
  g.fillStyle = line;
  for (let y = 0; y < 64; y += 16) { g.fillRect(0, y, 64, 1); const off = (y / 16) % 2 ? 16 : 0; for (let x = off; x < 64; x += 32) g.fillRect(x, y, 1, 16); }
  return c;
}

// ---------- build ----------
function buildStadium() {
  stadiumPrograms();
  const gl = R.gl;
  // ground: big polar grid out to boundary + margin
  {
    const g = new Geo();
    const NA = 180, NR = 60;
    const rows = [];
    for (let j = 0; j <= NR; j++) rows.push(j / NR);
    for (let i = 0; i <= NA; i++) {
      const a = -PI + i / NA * TAU;
      const rb = boundaryR(a) + 3;
      for (let j = 0; j <= NR; j++) {
        const rr = Math.pow(rows[j], 1.6) * rb;
        const x = Math.sin(a) * rr, z = -Math.cos(a) * rr;
        g.v([x, 0, z], [0, 1, 0], [0, 0], [1, 1, 1, 1]);
      }
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NR; j++) {
      const a = i * (NR + 1) + j, b = (i + 1) * (NR + 1) + j;
      g.idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
    ST.ground = g.build();
    // mound dome
    const m = new Geo();
    const MS = 32, MR = 8;
    for (let i = 0; i <= MS; i++) for (let j = 0; j <= MR; j++) {
      const a = i / MS * TAU, rr = j / MR * 2.95;
      const x = Math.cos(a) * rr, z = -18.44 + Math.sin(a) * rr;
      m.v([x, moundY(x, z) + 0.004, z], [0, 1, 0], [0, 0], [1, 1, 1, 1]);
    }
    for (let i = 0; i < MS; i++) for (let j = 0; j < MR; j++) {
      const a = i * (MR + 1) + j, b = (i + 1) * (MR + 1) + j;
      m.idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
    // fix normals roughly
    ST.mound = m.build();
  }
  // bases, plate, rubber
  {
    const g = new Geo();
    const W = [0.97, 0.96, 0.92, 1];
    g.box([19.4 - 0.15, 0.05, -19.4 + 0.15], [0.19, 0.05, 0.19], W, PI / 4);
    g.box([0, 0.05, -38.8], [0.19, 0.05, 0.19], W, PI / 4);
    g.box([-19.4 + 0.15, 0.05, -19.4 + 0.15], [0.19, 0.05, 0.19], W, PI / 4);
    g.box([0, FIELD.moundH + 0.03, -18.44], [0.3, 0.03, 0.075], W);
    // home plate pentagon
    const y = 0.015, pts = [[-0.216, -0.216], [0.216, -0.216], [0.216, 0], [0, 0.216], [-0.216, 0]];
    const c = g.v([0, y, -0.05], [0, 1, 0], [0, 0], W);
    const ids = pts.map(p => g.v([p[0], y, p[1] - 0.05], [0, 1, 0], [0, 0], W));
    for (let i = 0; i < 5; i++) g.idx.push(c, ids[i], ids[(i + 1) % 5]);
    ST.meshes.push({ mesh: g.build(), tex: R.white });
  }
  // outfield wall
  {
    const g = new Geo();
    const N = 96, a0 = -PI / 4 - 0.06, a1 = PI / 4 + 0.06;
    let arc = 0, prev = null;
    const H = FIELD.fenceH;
    for (let i = 0; i < N; i++) {
      const aa = lerp(a0, a1, i / N), ab = lerp(a0, a1, (i + 1) / N);
      const ra = fenceR(clamp(aa, -PI / 4, PI / 4)) + (Math.abs(aa) > PI / 4 ? 0 : 0), rb = fenceR(clamp(ab, -PI / 4, PI / 4));
      const A = [Math.sin(aa) * ra, 0, -Math.cos(aa) * ra], B = [Math.sin(ab) * rb, 0, -Math.cos(ab) * rb];
      const len = vdistXZ(A, B);
      const u0 = arc / 170, u1 = (arc + len) / 170; arc += len;
      g.quad(A, B, [B[0], H, B[2]], [A[0], H, A[2]], [1, 1, 1, 1], [[u0, 1], [u1, 1], [u1, 0], [u0, 0]]);
      // top cap
      const oA = vscale(vnorm([A[0], 0, A[2]]), 0.5), oB = vscale(vnorm([B[0], 0, B[2]]), 0.5);
      g.quad([A[0], H, A[2]], [B[0], H, B[2]], [B[0] + oB[0], H, B[2] + oB[2]], [A[0] + oA[0], H, A[2] + oA[2]], [0.9, 0.75, 0.25, 1], [[0, 0.02], [0, 0.02], [0, 0.02], [0, 0.02]]);
    }
    const tex = glTexture(wallTexture(), 0, 0, { mips: true, repeat: true });
    ST.meshes.push({ mesh: g.build(), tex, flipV: true });
  }
  // foul poles
  {
    const g = new Geo();
    for (const sx of [-1, 1]) {
      const a = sx * PI / 4, r = fenceR(a) + 0.3;
      g.cyl([Math.sin(a) * r, 0, -Math.cos(a) * r], 0.18, 26, 8, [1, 0.85, 0.15, 1]);
    }
    ST.meshes.push({ mesh: g.build(), tex: R.white, emis: 0.35 });
  }
  // stands: terraces + crowd quads
  buildStands();
  // light towers
  buildTowers();
  // scoreboard
  buildScoreboard();
  // mythic landmarks beyond the outfield: East gate + pagoda (left field), West temple + colossus (right field)
  buildLandmarks();
  // backstop net
  {
    const g = new Geo();
    const N = 24;
    for (let i = 0; i < N; i++) {
      const aa = PI * 0.62 + (i / N) * PI * 0.76, ab = PI * 0.62 + ((i + 1) / N) * PI * 0.76;
      const ra = boundaryR(aa) + 0.2, rb = boundaryR(ab) + 0.2;
      const A = [Math.sin(aa) * ra, 1.3, -Math.cos(aa) * ra], B = [Math.sin(ab) * rb, 1.3, -Math.cos(ab) * rb];
      const len = vdistXZ(A, B);
      g.quad(A, B, [B[0], 9, B[2]], [A[0], 9, A[2]], [1, 1, 1, 1], [[0, 0], [len / 1.2, 0], [len / 1.2, 7.7 / 1.2], [0, 7.7 / 1.2]]);
    }
    ST.meshes.push({ mesh: g.build(), tex: glTexture(netTexture(), 0, 0, { repeat: true }), net: true });
  }
  // sky dome
  {
    const g = new Geo();
    const NA = 32, NE = 16;
    for (let i = 0; i <= NA; i++) for (let j = 0; j <= NE; j++) {
      const a = i / NA * TAU, e = -0.3 + j / NE * (PI / 2 + 0.3);
      g.v([Math.cos(a) * Math.cos(e) * 500, Math.sin(e) * 500, Math.sin(a) * Math.cos(e) * 500], [0, 1, 0]);
    }
    for (let i = 0; i < NA; i++) for (let j = 0; j < NE; j++) {
      const a = i * (NE + 1) + j, b = (i + 1) * (NE + 1) + j;
      g.idx.push(a, b + 1, b, a, a + 1, b + 1);
    }
    ST.sky = g.build();
  }
}

function standProfileFor(ang) {
  const a = Math.abs(ang);
  const fair = a <= PI / 4;
  return fair ? { y0: FIELD.fenceH + 0.3, r0: fenceR(clamp(ang, -PI / 4, PI / 4)) + 1.5, rows: 10, tread: 1.0, rise: 0.55 }
    : { y0: 1.25, r0: boundaryR(ang) + 0.4, rows: 16, tread: 0.95, rise: 0.5 };
}

function buildStands() {
  const g = new Geo(), cg = new Geo();
  const N = 200;
  const concrete = [0.55, 0.5, 0.56, 1], seatE = [0.62, 0.2, 0.22, 1], seatW = [0.2, 0.3, 0.6, 1], seatN = [0.4, 0.38, 0.44, 1];
  // precompute boundary points
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const ang = -PI + i / N * TAU;
    pts.push(ang);
  }
  let arcLen = 0;
  for (let i = 0; i < N; i++) {
    const aa = pts[i], ab = pts[i + 1];
    // skip the gap at the poles where the two profiles differ: use per-segment profile of midpoint
    const am = (aa + ab) / 2;
    const P = standProfileFor(am);
    const fair = Math.abs(am) <= PI / 4;
    const side = am < -0.25 ? -1 : (am > 0.25 ? 1 : 0); // x<0 east(3B), x>0 west(1B)
    const seat = Math.abs(am) < 0.25 ? seatN : (side < 0 ? seatE : seatW);
    const pa = standProfileFor(aa), pb = standProfileFor(ab);
    const ra0 = (Math.abs(aa) <= PI / 4) === fair ? pa.r0 : P.r0, rb0 = (Math.abs(ab) <= PI / 4) === fair ? pb.r0 : P.r0;
    const da = [Math.sin(aa), 0, -Math.cos(aa)], db = [Math.sin(ab), 0, -Math.cos(ab)];
    const segLen = Math.abs(ab - aa) * (ra0 + rb0) / 2;
    // front wall
    const A0 = vscale(da, ra0), B0 = vscale(db, rb0);
    g.quad([A0[0], 0, A0[2]], [B0[0], 0, B0[2]], [B0[0], P.y0, B0[2]], [A0[0], P.y0, A0[2]], [0.18, 0.3, 0.28, 1]);
    for (let r = 0; r < P.rows; r++) {
      const y = P.y0 + r * P.rise;
      const rA = ra0 + r * P.tread, rB = rb0 + r * P.tread;
      const A = vscale(da, rA), B = vscale(db, rB), A2 = vscale(da, rA + P.tread), B2 = vscale(db, rB + P.tread);
      // tread
      g.quad([A[0], y, A[2]], [A2[0], y, A2[2]], [B2[0], y, B2[2]], [B[0], y, B[2]], r % 2 ? seat : vscale(seat, 0.85).concat([1]));
      // riser
      g.quad([A2[0], y, A2[2]], [B2[0], y, B2[2]], [B2[0], y + P.rise, B2[2]], [A2[0], y + P.rise, A2[2]], concrete);
      // crowd quad (vertical, slightly in front of riser)
      const cA = vscale(da, rA + P.tread * 0.62), cB = vscale(db, rB + P.tread * 0.62);
      const sideV = fair ? 0 : side;
      cg.quad([cA[0], y, cA[2]], [cB[0], y, cB[2]], [cB[0], y + 1.1, cB[2]], [cA[0], y + 1.1, cA[2]], [sideV, r + i * 0.013, 0, 1],
        [[arcLen, 0], [arcLen + segLen, 0], [arcLen + segLen, 1.1], [arcLen, 1.1]]);
    }
    // top rim + back wall
    const top = P.y0 + P.rows * P.rise;
    const rT = ra0 + P.rows * P.tread, rTb = rb0 + P.rows * P.tread;
    const At = vscale(da, rT), Bt = vscale(db, rTb);
    g.quad([At[0], top, At[2]], [Bt[0], top, Bt[2]], [Bt[0], top + 2.2, Bt[2]], [At[0], top + 2.2, At[2]], [0.3, 0.26, 0.34, 1]);
    g.quad([At[0], 0, At[2]], [Bt[0], 0, Bt[2]], [Bt[0], top, Bt[2]], [At[0], top, At[2]], [0.24, 0.2, 0.28, 1]);
    arcLen += segLen;
  }
  ST.meshes.push({ mesh: g.build(), tex: R.white });
  ST.crowd = cg.build();
  // decorations: East pagoda roofs (x<0 side), West colonnade (x>0)
  const d = new Geo();
  const stoneW = [0.86, 0.84, 0.8, 1], roofE = [0.55, 0.12, 0.12, 1], goldE = [0.85, 0.65, 0.2, 1];
  for (let k = 0; k < 7; k++) {
    // east (3B side): angles from -165deg to -60deg
    const ang = -PI * (0.36 + k * 0.085);
    const P = standProfileFor(ang);
    const r = boundaryR(ang) + 0.4 + P.rows * P.tread + 1.0, top = P.y0 + P.rows * P.rise + 2.2;
    const c = [Math.sin(ang) * r, top, -Math.cos(ang) * r];
    const rot = -ang;
    d.box(vadd(c, [0, 2.2, 0]), [0.35, 2.2, 0.35], [0.5, 0.1, 0.1, 1], rot);
    d.box(vadd(c, [0, 4.6, 0]), [3.4, 0.25, 2.0], roofE, rot);
    d.box(vadd(c, [0, 5.1, 0]), [2.4, 0.3, 1.4], roofE, rot);
    d.box(vadd(c, [0, 5.6, 0]), [1.3, 0.35, 0.8], goldE, rot);
    // west (1B side)
    const angW = -ang;
    const PW = standProfileFor(angW);
    const rW = boundaryR(angW) + 0.4 + PW.rows * PW.tread + 1.0, topW = PW.y0 + PW.rows * PW.rise + 2.2;
    const cW = [Math.sin(angW) * rW, topW, -Math.cos(angW) * rW];
    d.cyl(cW, 0.55, 6, 10, stoneW, 0.5);
    d.box(vadd(cW, [0, 6.3, 0]), [0.9, 0.3, 0.9], stoneW, -angW);
  }
  // west architrave connecting columns (approx as boxes between)
  ST.meshes.push({ mesh: d.build(), tex: R.white });
}

function buildTowers() {
  const g = new Geo(), lamps = new Geo();
  const angs = [-0.95, 0.95, -2.2, 2.2, -0.35, 0.35];
  R.lights.n = 0;
  const pos = R.lights.pos, col = R.lights.col;
  angs.forEach((ang, i) => {
    const P = standProfileFor(ang);
    const r = boundaryR(ang) + P.rows * P.tread + 6;
    const base = [Math.sin(ang) * r, 0, -Math.cos(ang) * r];
    const H = 46;
    g.cyl(base, 0.9, H, 8, [0.22, 0.2, 0.26, 1], 0.6);
    // lamp bank faces field center
    const toC = vnorm(vsub([0, H, -40], [base[0], H, base[2]]));
    const right = vnorm(vcross([0, 1, 0], toC));
    const c = vadd(base, [0, H + 2, 0]);
    const w = 5, h = 3.4;
    const A = vadd(vadd(c, vscale(right, -w)), [0, -h, 0]), B = vadd(vadd(c, vscale(right, w)), [0, -h, 0]);
    const C = vadd(vadd(c, vscale(right, w)), [0, h, 0]), D = vadd(vadd(c, vscale(right, -w)), [0, h, 0]);
    const off = vscale(toC, 0.6);
    g.box(vadd(c, vscale(toC, -0.4)), [w * 0.5 + 0.4, h * 0.5 + 0.4, 0.3], [0.15, 0.14, 0.18, 1], Math.atan2(toC[0], toC[2]));
    lamps.quad(vadd(A, off), vadd(B, off), vadd(C, off), vadd(D, off), [2.6, 2.45, 2.1, 1], [[0, 0], [4, 0], [4, 3], [0, 3]]);
    if (R.lights.n < 6) {
      const k = R.lights.n++;
      const lp = vadd(c, vscale(toC, 2));
      pos[k * 4] = lp[0]; pos[k * 4 + 1] = lp[1]; pos[k * 4 + 2] = lp[2]; pos[k * 4 + 3] = 210;
      const warm = i < 4 ? [1.0, 0.92, 0.78] : [0.95, 0.95, 1.0];
      const s = i < 4 ? 0.55 : 0.42;
      col[k * 3] = warm[0] * s; col[k * 3 + 1] = warm[1] * s; col[k * 3 + 2] = warm[2] * s;
    }
    ST.towers.push({ pos: vadd(c, vscale(toC, 1)), dir: toC });
  });
  ST.meshes.push({ mesh: g.build(), tex: R.white });
  // lamp texture: grid of bulbs
  const lc = mkCanvas(16, 16), lg = lc.getContext('2d');
  lg.fillStyle = '#3a3530'; lg.fillRect(0, 0, 16, 16);
  for (let y = 1; y < 16; y += 4) for (let x = 1; x < 16; x += 4) { lg.fillStyle = '#fff6dc'; lg.fillRect(x, y, 3, 3); }
  ST.meshes.push({ mesh: lamps.build(), tex: glTexture(lc, 0, 0, { repeat: true }), emis: 1.0 });
}

// ---------- landmarks ----------
// each one stands on a stone terrace behind the outfield stands and faces home plate;
// local frame: x right (as seen from home), y up, z toward home
function lmFrame(ang, r) {
  const base = [Math.sin(ang) * r, 0, -Math.cos(ang) * r];
  return { base, rot: -ang, at: p => vadd(base, rotY(p, -ang)) };
}
function geoTri(g, a, b, c, col) {
  const n = vnorm(vcross(vsub(b, a), vsub(c, a)));
  g.idx.push(g.v(a, n, [0, 0], col), g.v(b, n, [0, 0], col), g.v(c, n, [0, 0], col));
}
// square beam of half-width w from a to b (arms, dragon coils, lightning)
function geoBeam(g, a, b, w, col) {
  const d = vnorm(vsub(b, a));
  const s = vnorm(vcross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0])), t = vcross(d, s);
  const c = (p, i, j) => vadd(p, vadd(vscale(s, i * w), vscale(t, j * w)));
  const k = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < 4; i++) { const [i0, j0] = k[i], [i1, j1] = k[(i + 1) % 4]; g.quad(c(a, i0, j0), c(a, i1, j1), c(b, i1, j1), c(b, i0, j0), col); }
  g.quad(c(b, -1, -1), c(b, 1, -1), c(b, 1, 1), c(b, -1, 1), col);
}
// tiered Chinese roof: slabs that step in as they rise, eaves wider than the body
function geoRoof(g, F, y, w, d, col, ridge) {
  const steps = [[1.0, 0.5], [0.86, 0.55], [0.7, 0.6], [0.52, 0.55]];
  let yy = y;
  for (const [k, h] of steps) { g.box(F.at([0, yy + h / 2, 0]), [w * k, h / 2, d * k], col, F.rot); yy += h; }
  if (ridge) g.box(F.at([0, yy + 0.3, 0]), [w * 0.6, 0.3, 0.35], ridge, F.rot);
  return yy;
}
function textTexture(w, h, bg, fg, txt, font) {
  const c = mkCanvas(w, h), x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = fg; x.lineWidth = 3; x.strokeRect(4, 4, w - 8, h - 8);
  x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(txt, w / 2, h / 2 + 2);
  return glTexture(c, 0, 0, {});
}
function buildLandmarks() {
  const S = new Geo(), Gw = new Geo(); // S: lit structure, Gw: glowing trim (gold, lanterns, lightning)
  const terrace = [0.26, 0.22, 0.3, 1], stoneD = [0.38, 0.34, 0.4, 1];
  const red = [0.66, 0.14, 0.11, 1], redD = [0.45, 0.09, 0.08, 1], jade = [0.14, 0.42, 0.38, 1], tileY = [0.86, 0.6, 0.16, 1], tileG = [0.16, 0.4, 0.34, 1];
  const marble = [0.9, 0.88, 0.82, 1], marbleD = [0.74, 0.72, 0.68, 1], bronze = [0.42, 0.52, 0.48, 1];
  const gold = [1.0, 0.78, 0.3, 1], lantern = [1.0, 0.38, 0.2, 1], pearl = [1.0, 0.45, 0.35, 1], bolt = [1.0, 0.95, 0.6, 1];
  const plaques = [];
  const TH = 10; // terrace height: hides the gap behind the stands
  const terraceAt = (F, w, d) => { S.box(F.at([0, TH / 2, 0]), [w, TH / 2, d], terrace, F.rot); S.box(F.at([0, TH + 0.4, 0]), [w - 0.6, 0.4, d - 0.6], stoneD, F.rot); };
  const A = 0.25, R0 = 170; // gate / temple bearing from the CF line, distance from home

  // ===== East: 牌樓 gate flanked by 蟠龍柱 =====
  {
    const F = lmFrame(-A, R0);
    terraceAt(F, 29, 7);
    const y0 = TH + 0.8;
    const posts = [[-15, 15], [-5.5, 21], [5.5, 21], [15, 15]];
    for (const [x, h] of posts) {
      S.box(F.at([x, y0 + 1, 0]), [1.6, 1, 1.6], marble, F.rot);
      S.cyl(F.at([x, y0 + 2, 0]), 0.95, h - 2, 10, red);
    }
    // centre bay: lintels, plaque, big roof
    S.box(F.at([0, y0 + 17, 0]), [6.6, 0.7, 0.8], jade, F.rot);
    S.box(F.at([0, y0 + 19.6, 0]), [6.9, 0.8, 0.9], red, F.rot);
    plaques.push({ F, c: [0, y0 + 14.6, 0.95], w: 4.6, h: 2.4, tex: textTexture(160, 84, '#1c3a8a', '#ffd25a', '東天門', 'bold 46px "Noto Serif TC", serif') });
    S.box(F.at([0, y0 + 14.6, 0.5]), [2.6, 1.5, 0.35], [0.85, 0.65, 0.22, 1], F.rot);
    const top = geoRoof(S, F, y0 + 20.4, 9.5, 2.8, tileY, redD);
    Gw.box(F.at([0, top + 1.1, 0]), [0.5, 0.8, 0.5], gold, F.rot);
    for (const s of [-1, 1]) {
      Gw.box(F.at([s * 6.8, top + 0.5, 0]), [0.45, 0.9, 0.35], gold, F.rot); // ridge-end beasts
      // side bays
      S.box(F.at([s * 10.25, y0 + 11.5, 0]), [4.9, 0.6, 0.7], jade, F.rot);
      S.box(F.at([s * 10.25, y0 + 13.6, 0]), [5.1, 0.7, 0.8], red, F.rot);
      geoRoof(S, F, y0 + 14.3, 6.4, 2.4, tileG, redD);
      // lanterns under the lintels
      for (const x of [s * 8, s * 12.5]) { Gw.box(F.at([x, y0 + 9.6, 0.4]), [0.6, 0.85, 0.6], lantern, F.rot); S.box(F.at([x, y0 + 10.8, 0.4]), [0.1, 0.35, 0.1], redD, F.rot); }
      Gw.box(F.at([s * 2.6, y0 + 15.6, 0.6]), [0.8, 1.1, 0.8], lantern, F.rot);
      // 蟠龍柱: marble column with a gold dragon coiling up it, cloud board and pearl on top
      const cx = s * 23.5, ch = 30, cr = 1.5;
      S.box(F.at([cx, y0 + 1.2, 0]), [2.6, 1.2, 2.6], marble, F.rot);
      S.cyl(F.at([cx, y0 + 2.4, 0]), cr, ch, 12, marble);
      S.box(F.at([cx, y0 + 2.4 + ch * 0.78, 0]), [3.6, 0.45, 0.5], marble, F.rot);
      S.box(F.at([cx, y0 + 2.4 + ch + 0.5, 0]), [2.0, 0.5, 2.0], marble, F.rot);
      let prev = null;
      const N = 54, turns = 3.2, ph = s > 0 ? 0 : PI;
      for (let i = 0; i <= N; i++) {
        const u = i / N, a = ph + s * u * turns * TAU;
        const p = F.at([cx + Math.cos(a) * (cr + 0.5), y0 + 3 + u * (ch - 3), Math.sin(a) * (cr + 0.5)]);
        if (prev) geoBeam(Gw, prev, p, 0.5 - u * 0.12, gold);
        prev = p;
      }
      Gw.box(vadd(prev, [0, 0.9, 0]), [0.9, 0.9, 0.9], gold, F.rot); // head
      Gw.box(F.at([cx, y0 + 2.4 + ch + 2.0, 0]), [0.8, 0.8, 0.8], pearl, F.rot);
    }
  }
  // ===== East: 七層寶塔 =====
  {
    const F = lmFrame(-0.27, 228);
    terraceAt(F, 11, 11);
    let y = TH + 0.8, w = 6.4;
    for (let k = 0; k < 7; k++) {
      const h = k === 0 ? 7 : 5.2;
      S.box(F.at([0, y + h / 2, 0]), [w, h / 2, w], k % 2 ? redD : red, F.rot);
      Gw.box(F.at([0, y + h * 0.5, w + 0.05]), [w * 0.32, h * 0.22, 0.1], [1.0, 0.7, 0.35, 1], F.rot); // lit window
      const ry = y + h;
      S.box(F.at([0, ry + 0.3, 0]), [w + 2.2, 0.3, w + 2.2], tileG, F.rot);
      S.box(F.at([0, ry + 0.8, 0]), [w + 1.1, 0.25, w + 1.1], tileG, F.rot);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) Gw.box(F.at([sx * (w + 2.0), ry - 0.5, sz * (w + 2.0)]), [0.35, 0.5, 0.35], lantern, F.rot);
      y = ry + 1.05; w *= 0.84;
    }
    S.cyl(F.at([0, y, 0]), 0.6, 7, 8, stoneD, 0.15);
    for (let k = 0; k < 5; k++) Gw.cyl(F.at([0, y + 1 + k * 1.2, 0]), 1.1 - k * 0.15, 0.35, 8, gold);
  }

  // ===== West: Olympian temple =====
  {
    const F = lmFrame(A, R0);
    terraceAt(F, 22, 11);
    let y = TH + 0.8;
    for (let k = 0; k < 3; k++) { S.box(F.at([0, y + 0.45, 0]), [21 - k * 1.2, 0.45, 9.5 - k * 1.2], marbleD, F.rot); y += 0.9; } // stylobate steps
    const colH = 16, cols = 8, span = 14;
    S.box(F.at([0, y + colH / 2, -2.5]), [span - 1, colH / 2, 4.2], marbleD, F.rot); // cella
    Gw.box(F.at([0, y + colH * 0.32, 1.75]), [2.2, colH * 0.32, 0.1], [1.0, 0.72, 0.36, 1], F.rot); // glowing doorway
    for (const z of [3.6, -8.4]) for (let i = 0; i < cols; i++) {
      const x = -span + i * (2 * span / (cols - 1));
      S.cyl(F.at([x, y, z]), 1.05, colH, 10, marble, 0.86);
      S.box(F.at([x, y + colH + 0.3, z]), [1.35, 0.3, 1.35], marble, F.rot);
    }
    y += colH + 0.6;
    S.box(F.at([0, y + 1.0, -2.4]), [span + 1.6, 1.0, 6.9], marble, F.rot); // architrave
    plaques.push({ F, c: [0, y + 1.0, 4.55], w: 2 * span, h: 1.9, tex: textTexture(512, 32, '#e4ddcc', '#8a6a2a', 'Ο Λ Υ Μ Π Ο Σ', 'bold 24px serif') });
    S.box(F.at([0, y + 2.4, -2.4]), [span + 2.0, 0.4, 7.3], marbleD, F.rot); // cornice
    y += 2.8;
    // pediment: front and back triangles, two roof slopes
    const pw = span + 2.0, ph = 5.2, z0 = 4.9, z1 = -9.7;
    for (const z of [z0, z1]) geoTri(S, F.at([-pw, y, z]), F.at([pw, y, z]), F.at([0, y + ph, z]), marble);
    S.quad(F.at([-pw, y, z0]), F.at([0, y + ph, z0]), F.at([0, y + ph, z1]), F.at([-pw, y, z1]), [0.62, 0.32, 0.24, 1]);
    S.quad(F.at([pw, y, z1]), F.at([0, y + ph, z1]), F.at([0, y + ph, z0]), F.at([pw, y, z0]), [0.62, 0.32, 0.24, 1]);
    // gold disc in the pediment, acroteria on the corners and peak
    Gw.cyl(F.at([0, y + 1.9, z0 + 0.05]), 1.3, 0.2, 10, gold);
    for (const x of [-pw, 0, pw]) Gw.box(F.at([x, y + (x ? 0.8 : ph + 0.8), z0 - 0.4]), [0.6, 0.8, 0.4], gold, F.rot);
    // braziers on the steps
    for (const s of [-1, 1]) { S.cyl(F.at([s * 20, TH + 0.8, 7]), 0.9, 3.6, 8, bronze, 0.5); Gw.box(F.at([s * 20, TH + 5, 7]), [1.1, 0.9, 1.1], lantern, F.rot); }
  }
  // ===== West: colossus of the sky father, thunderbolt raised =====
  {
    const F = lmFrame(0.27, 228);
    terraceAt(F, 10, 10);
    const y = TH + 0.8;
    S.box(F.at([0, y + 9, 0]), [6.5, 9, 6.5], marbleD, F.rot); // pedestal, tall enough to clear the temple roof
    S.box(F.at([0, y + 18.4, 0]), [7.2, 0.4, 7.2], marble, F.rot);
    const b = y + 18.8;
    S.cyl(F.at([0, b, 0]), 4.4, 17, 12, marble, 3.0);                 // robe
    S.box(F.at([0, b + 21, 0]), [3.6, 4.4, 2.3], marble, F.rot);       // torso
    S.box(F.at([1.6, b + 20.5, 0.6]), [2.4, 5.5, 2.5], marbleD, F.rot); // drape over one shoulder
    S.cyl(F.at([0, b + 25.4, 0]), 1.2, 1.4, 8, marble);                // neck
    S.box(F.at([0, b + 28.6, 0]), [2.2, 2.4, 2.2], marble, F.rot);     // head
    S.box(F.at([0, b + 26.6, 1.9]), [1.7, 1.9, 0.6], marbleD, F.rot);  // beard
    for (let k = 0; k < 7; k++) Gw.box(F.at([-2.2 + k * 0.73, b + 31.0 + Math.sin(k / 6 * PI) * 0.5, 0]), [0.3, 0.3, 1.9], gold, F.rot); // laurel
    // right arm raised high with the bolt, left arm down holding an orb
    const shR = F.at([-4.2, b + 24.2, 0]), elR = F.at([-6.4, b + 29.6, 0.8]), haR = F.at([-6.9, b + 35.2, 0.6]);
    geoBeam(S, shR, elR, 1.25, marble); geoBeam(S, elR, haR, 1.1, marble);
    S.box(haR, [1.4, 1.4, 1.4], marble, F.rot);
    const zz = [[-6.0, 33], [-8.8, 37.5], [-6.4, 38.5], [-9.2, 44], [-6.9, 44.5], [-9.6, 50]];
    for (let i = 0; i < zz.length - 1; i++) geoBeam(Gw, F.at([zz[i][0], b + zz[i][1], 0.6]), F.at([zz[i + 1][0], b + zz[i + 1][1], 0.6]), 0.55, bolt);
    const shL = F.at([4.2, b + 24.2, 0]), elL = F.at([5.6, b + 18.6, 1.2]), haL = F.at([5.4, b + 13.8, 2.6]);
    geoBeam(S, shL, elL, 1.25, marble); geoBeam(S, elL, haL, 1.1, marble);
    Gw.box(vadd(haL, [0, -1.4, 0]), [1.5, 1.5, 1.5], [0.6, 0.85, 1.0, 1], F.rot);
  }

  ST.meshes.push({ mesh: S.build(), tex: R.white, emis: 0.18 });
  ST.meshes.push({ mesh: Gw.build(), tex: R.white, emis: 0.9 });
  for (const p of plaques) {
    const g = new Geo(), [cx, cy, cz] = p.c, hw = p.w / 2, hh = p.h / 2;
    g.quad(p.F.at([cx - hw, cy - hh, cz]), p.F.at([cx + hw, cy - hh, cz]), p.F.at([cx + hw, cy + hh, cz]), p.F.at([cx - hw, cy + hh, cz]), [1, 1, 1, 1], [[0, 1], [1, 1], [1, 0], [0, 0]]);
    ST.meshes.push({ mesh: g.build(), tex: p.tex, emis: 0.75 });
  }
}

function buildScoreboard() {
  const g = new Geo();
  const c = [0, 26, -150], w = 30, h = 13;
  g.box([0, 13, -152], [w / 2 + 2, 13, 1.5], [0.2, 0.17, 0.24, 1]);
  g.box([0, 27.5, -151.5], [w / 2 + 3, 1.2, 2], [0.55, 0.45, 0.25, 1]);
  ST.meshes.push({ mesh: g.build(), tex: R.white });
  const s = new Geo();
  s.quad([-w / 2, c[1] - h / 2, -150.4], [w / 2, c[1] - h / 2, -150.4], [w / 2, c[1] + h / 2, -150.4], [-w / 2, c[1] + h / 2, -150.4], [1, 1, 1, 1], [[0, 1], [1, 1], [1, 0], [0, 0]]);
  ST.scoreCanvas = mkCanvas(320, 140);
  ST.scoreTex = glTexture(ST.scoreCanvas, 0, 0, {});
  ST.scoreMesh = { mesh: s.build(), tex: ST.scoreTex, emis: 0.85 };
  ST.meshes.push(ST.scoreMesh);
  drawScoreboard(null);
}

function drawScoreboard(game) {
  const cv = ST.scoreCanvas, g = cv.getContext('2d');
  g.fillStyle = '#0b0b14'; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#1a1a2a'; for (let y = 0; y < cv.height; y += 2) g.fillRect(0, y, cv.width, 1);
  g.font = 'bold 18px "Noto Sans TC", "PingFang TC", sans-serif';
  g.textBaseline = 'middle';
  g.fillStyle = '#ffd25a'; g.textAlign = 'center';
  g.fillText('英雄棒球大戰', cv.width / 2, 16);
  const inn = game ? Math.max(game.innings, game.inning) : 9;
  const cols = Math.min(Math.max(inn, 3), 12);
  const x0 = 60, cw = (cv.width - x0 - 60) / cols;
  g.font = 'bold 14px monospace';
  g.fillStyle = '#9aa0c0';
  for (let i = 0; i < cols; i++) g.fillText(String(i + 1), x0 + cw * i + cw / 2, 42);
  g.fillText('R', cv.width - 30, 42);
  const teams = game ? game.teams : [{ short: '東', color: '#e0483e', line: [] }, { short: '西', color: '#4a7be0', line: [] }];
  teams.forEach((t, ti) => {
    const y = 72 + ti * 32;
    const m = t.meta || t;
    g.fillStyle = m.color; g.textAlign = 'left'; g.font = 'bold 18px "Noto Sans TC", sans-serif';
    g.fillText(m.short, 14, y);
    g.font = 'bold 16px monospace'; g.textAlign = 'center';
    for (let i = 0; i < cols; i++) { const v = t.line[i]; g.fillStyle = '#f0f0f0'; if (v !== undefined) g.fillText(String(v), x0 + cw * i + cw / 2, y); }
    g.fillStyle = '#ffd25a'; g.fillText(String(t.line.reduce((a, b) => a + b, 0)), cv.width - 30, y);
  });
  const gl = R.gl;
  gl.bindTexture(gl.TEXTURE_2D, ST.scoreTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
}

function drawStadium() {
  const gl = R.gl;
  // sky
  gl.disable(gl.DEPTH_TEST);
  let pr = PROG.sky; gl.useProgram(pr.p);
  gl.uniformMatrix4fv(pr.u.uVP, false, R.vp); gl.uniform3fv(pr.u.uCam, R.camPos); gl.uniform1f(pr.u.uTime, R.time);
  glDrawMesh(ST.sky);
  gl.enable(gl.DEPTH_TEST);
  // ground
  pr = PROG.ground; gl.useProgram(pr.p);
  gl.uniformMatrix4fv(pr.u.uVP, false, R.vp); gl.uniform1f(pr.u.uPx, 0.075);
  glSetLightUniforms(pr);
  glDrawMesh(ST.ground);
  glDrawMesh(ST.mound);
  // meshes
  pr = PROG.mesh; gl.useProgram(pr.p);
  gl.uniformMatrix4fv(pr.u.uVP, false, R.vp);
  gl.uniformMatrix4fv(pr.u.uM, false, m4());
  glSetLightUniforms(pr);
  gl.uniform2f(pr.u.uUVScale, 1, 1);
  gl.activeTexture(gl.TEXTURE0);
  for (const m of ST.meshes) {
    gl.bindTexture(gl.TEXTURE_2D, m.tex);
    gl.uniform1i(pr.u.uTex, 0);
    gl.uniform4f(pr.u.uTint, 1, 1, 1, 1);
    gl.uniform1f(pr.u.uEmis, m.emis || 0);
    glDrawMesh(m.mesh);
  }
  // crowd
  pr = PROG.crowd; gl.useProgram(pr.p);
  gl.uniformMatrix4fv(pr.u.uVP, false, R.vp);
  gl.uniform1f(pr.u.uTime, R.time); gl.uniform1f(pr.u.uCheer, ST.cheer);
  glSetLightUniforms(pr);
  glDrawMesh(ST.crowd);
}
