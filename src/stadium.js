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
