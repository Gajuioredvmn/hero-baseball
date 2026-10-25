// ===== math.js : small vector / matrix / random helpers =====
const PI = Math.PI, TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => (v - a) / (b - a);
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeIn = t => t * t;
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const sign = v => v < 0 ? -1 : 1;
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };

// seeded RNG (mulberry32)
function makeRng(seed) {
  let s = seed >>> 0;
  const r = () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.gauss = () => { let u = 0, v = 0; while (u === 0) u = r(); while (v === 0) v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };
  return r;
}
const RNG = makeRng((Date.now() ^ 0x5eed) >>> 0);
const rand = () => RNG();
const rrange = (a, b) => RNG.range(a, b);
const gauss = () => RNG.gauss();
function hash2(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

// ---- vec3 as plain arrays [x,y,z]
const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vscale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vmad = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vlen = a => Math.hypot(a[0], a[1], a[2]);
const vnorm = a => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vlerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const vdist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const vdistXZ = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const vcopy = a => [a[0], a[1], a[2]];
const vset = (o, a) => { o[0] = a[0]; o[1] = a[1]; o[2] = a[2]; return o; };

// ---- mat4 column-major Float32Array
const m4 = () => { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; };
function m4mul(a, b, out = new Float32Array(16)) {
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
    out[i * 4 + j] = s;
  }
  return out;
}
function m4persp(fovy, aspect, near, far, out = new Float32Array(16)) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  out.fill(0); out[0] = f / aspect; out[5] = f; out[10] = (far + near) * nf; out[11] = -1; out[14] = 2 * far * near * nf;
  return out;
}
function m4lookAt(eye, target, up, out = new Float32Array(16)) {
  let z = vnorm(vsub(eye, target));
  let x = vcross(up, z); if (vlen(x) < 1e-6) x = [1, 0, 0]; x = vnorm(x);
  const y = vcross(z, x);
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
  out[12] = -vdot(x, eye); out[13] = -vdot(y, eye); out[14] = -vdot(z, eye); out[15] = 1;
  return out;
}
function m4trs(pos, rotY = 0, scale = [1, 1, 1], out = new Float32Array(16)) {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  out.fill(0);
  out[0] = c * scale[0]; out[2] = -s * scale[0];
  out[5] = scale[1];
  out[8] = s * scale[2]; out[10] = c * scale[2];
  out[12] = pos[0]; out[13] = pos[1]; out[14] = pos[2]; out[15] = 1;
  return out;
}
function m4xform(m, p) { // transform point
  const x = p[0], y = p[1], z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w];
}
// rotate point around Y axis
const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; };
