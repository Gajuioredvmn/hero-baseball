// ===== gl.js : tiny WebGL2 renderer core =====
const R = {
  gl: null, canvas: null, W: 1, H: 1, cssW: 1, cssH: 1, dpr: 1, scale: 1,
  quality: 'high', // 'high' | 'low'
  view: m4(), proj: m4(), vp: m4(), invView: m4(),
  camPos: [0, 2, 8], camRight: [1, 0, 0], camUp: [0, 1, 0], camFwd: [0, 0, -1], fovy: 30 * DEG, near: 0.3, far: 900,
  lights: { n: 0, pos: new Float32Array(24), col: new Float32Array(18) },
  env: { sunDir: vnorm([-0.4, 0.8, 0.45]), sunCol: [0.18, 0.17, 0.25], sky: [0.42, 0.42, 0.62], gnd: [0.16, 0.12, 0.16], fogCol: [0.42, 0.33, 0.45], fog: [140, 700] },
  time: 0,
};

function glInit(canvas) {
  const pdb = /[?&]pdb/.test(location.search);
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, premultipliedAlpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: pdb });
  if (!gl) return false;
  R.gl = gl; R.canvas = canvas;
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  R.quadBuf = glBuffer(new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]));
  R.quadVAO = gl.createVertexArray();
  gl.bindVertexArray(R.quadVAO);
  gl.bindBuffer(gl.ARRAY_BUFFER, R.quadBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  R.white = glTexture(null, 1, 1, { data: new Uint8Array([255, 255, 255, 255]) });
  return true;
}

function glBuffer(data, target, usage) {
  const gl = R.gl, b = gl.createBuffer();
  target = target || gl.ARRAY_BUFFER;
  gl.bindBuffer(target, b); gl.bufferData(target, data, usage || gl.STATIC_DRAW);
  return b;
}

function glShader(type, src) {
  const gl = R.gl, s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const lines = src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n');
    console.error('Shader error:', log, '\n', lines.slice(0, 4000));
    throw new Error('shader compile: ' + log);
  }
  return s;
}
const GLSL_HEAD = '#version 300 es\nprecision highp float;\nprecision highp int;\n';
function glProgram(vs, fs, attribs) {
  const gl = R.gl, p = gl.createProgram();
  gl.attachShader(p, glShader(gl.VERTEX_SHADER, GLSL_HEAD + vs));
  gl.attachShader(p, glShader(gl.FRAGMENT_SHADER, GLSL_HEAD + fs));
  (attribs || []).forEach((a, i) => gl.bindAttribLocation(p, i, a));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

function glTexture(src, w, h, o = {}) {
  const gl = R.gl, t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  else gl.texImage2D(gl.TEXTURE_2D, 0, o.internal || gl.RGBA, w, h, 0, o.format || gl.RGBA, o.type || gl.UNSIGNED_BYTE, o.data || null);
  const mag = o.linear ? gl.LINEAR : gl.NEAREST;
  let min = o.linear ? gl.LINEAR : gl.NEAREST;
  if (o.mips) { gl.generateMipmap(gl.TEXTURE_2D); min = gl.LINEAR_MIPMAP_LINEAR; }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, min);
  const wrap = o.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, o.repeatT === false ? gl.CLAMP_TO_EDGE : wrap);
  if (o.mips && R.anisoExt === undefined) R.anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
  if (o.mips && R.anisoExt) gl.texParameterf(gl.TEXTURE_2D, R.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, 4);
  return t;
}

function glTarget(w, h, withDepth) {
  const gl = R.gl;
  const fb = gl.createFramebuffer();
  const tex = glTexture(null, w, h, { linear: true });
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let depth = null;
  if (withDepth) {
    depth = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depth);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
  }
  const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (st !== gl.FRAMEBUFFER_COMPLETE) console.warn('FBO incomplete', st);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, depth, w, h };
}
function glFreeTarget(t) { if (!t) return; const gl = R.gl; gl.deleteFramebuffer(t.fb); gl.deleteTexture(t.tex); if (t.depth) gl.deleteTexture(t.depth); }

// ---- static mesh: interleaved pos(3) nor(3) uv(2) col(4)
function glMesh(geo) {
  const gl = R.gl;
  const n = geo.pos.length / 3;
  const data = new Float32Array(n * 12);
  for (let i = 0; i < n; i++) {
    const o = i * 12;
    data[o] = geo.pos[i * 3]; data[o + 1] = geo.pos[i * 3 + 1]; data[o + 2] = geo.pos[i * 3 + 2];
    data[o + 3] = geo.nor ? geo.nor[i * 3] : 0; data[o + 4] = geo.nor ? geo.nor[i * 3 + 1] : 1; data[o + 5] = geo.nor ? geo.nor[i * 3 + 2] : 0;
    data[o + 6] = geo.uv ? geo.uv[i * 2] : 0; data[o + 7] = geo.uv ? geo.uv[i * 2 + 1] : 0;
    data[o + 8] = geo.col ? geo.col[i * 4] : 1; data[o + 9] = geo.col ? geo.col[i * 4 + 1] : 1; data[o + 10] = geo.col ? geo.col[i * 4 + 2] : 1; data[o + 11] = geo.col ? geo.col[i * 4 + 3] : 1;
  }
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  glBuffer(data);
  const S = 48;
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, S, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, S, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, S, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, S, 32);
  let count = n, indexed = false, idxType = gl.UNSIGNED_SHORT;
  if (geo.idx) {
    const big = n > 65535;
    glBuffer(big ? new Uint32Array(geo.idx) : new Uint16Array(geo.idx), gl.ELEMENT_ARRAY_BUFFER);
    count = geo.idx.length; indexed = true; idxType = big ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  }
  gl.bindVertexArray(null);
  return { vao, count, indexed, idxType };
}
function glDrawMesh(m) {
  const gl = R.gl;
  gl.bindVertexArray(m.vao);
  if (m.indexed) gl.drawElements(gl.TRIANGLES, m.count, m.idxType, 0);
  else gl.drawArrays(gl.TRIANGLES, 0, m.count);
}

// ---- geometry builder
function Geo() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
Geo.prototype.v = function (p, n, uv, c) {
  this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]);
  this.uv.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
  this.col.push(c ? c[0] : 1, c ? c[1] : 1, c ? c[2] : 1, c && c.length > 3 ? c[3] : 1);
  return this.pos.length / 3 - 1;
};
// quad a,b,c,d counter-clockwise (as seen from front)
Geo.prototype.quad = function (a, b, c, d, col, uvs) {
  const n = vnorm(vcross(vsub(b, a), vsub(d, a)));
  uvs = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
  const i0 = this.v(a, n, uvs[0], col), i1 = this.v(b, n, uvs[1], col), i2 = this.v(c, n, uvs[2], col), i3 = this.v(d, n, uvs[3], col);
  this.idx.push(i0, i1, i2, i0, i2, i3);
};
Geo.prototype.box = function (c, s, col, rot = 0, uvScale) {
  // c center, s half-size [x,y,z]
  const P = (x, y, z) => vadd(c, rotY([x * s[0], y * s[1], z * s[2]], rot));
  const u = uvScale || 1;
  const sx = s[0] * 2 * u, sy = s[1] * 2 * u, sz = s[2] * 2 * u;
  this.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), col, [[0, 0], [sx, 0], [sx, sy], [0, sy]]); // front +z
  this.quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), col, [[0, 0], [sx, 0], [sx, sy], [0, sy]]); // back
  this.quad(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), col, [[0, 0], [sz, 0], [sz, sy], [0, sy]]); // +x
  this.quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), col, [[0, 0], [sz, 0], [sz, sy], [0, sy]]); // -x
  this.quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), col, [[0, 0], [sx, 0], [sx, sz], [0, sz]]); // top
  this.quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), col, [[0, 0], [sx, 0], [sx, sz], [0, sz]]); // bottom
};
Geo.prototype.cyl = function (c, r, h, seg, col, r2, capTop = true) {
  r2 = r2 === undefined ? r : r2;
  for (let i = 0; i < seg; i++) {
    const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
    const p0 = [Math.cos(a0), Math.sin(a0)], p1 = [Math.cos(a1), Math.sin(a1)];
    const A = [c[0] + p0[0] * r, c[1], c[2] + p0[1] * r], B = [c[0] + p1[0] * r, c[1], c[2] + p1[1] * r];
    const C = [c[0] + p1[0] * r2, c[1] + h, c[2] + p1[1] * r2], D = [c[0] + p0[0] * r2, c[1] + h, c[2] + p0[1] * r2];
    this.quad(B, A, D, C, col, [[i / seg, 0], [(i + 1) / seg, 0], [(i + 1) / seg, 1], [i / seg, 1]].reverse());
    if (capTop && r2 > 0) {
      const top = [c[0], c[1] + h, c[2]];
      const n = [0, 1, 0];
      const a = this.v(top, n, [0.5, 0.5], col), b = this.v(D, n, [0, 0], col), d = this.v(C, n, [1, 0], col);
      this.idx.push(a, d, b);
    }
  }
};
Geo.prototype.build = function () { return glMesh(this); };

// ---- shared lighting GLSL
const GLSL_LIGHT = `
uniform vec3 uSunDir, uSunCol, uSkyAmb, uGndAmb, uFogCol, uCam;
uniform vec2 uFog;
uniform int uNPL;
uniform vec4 uPL[6];
uniform vec3 uPLC[6];
vec3 lightAt(vec3 p, vec3 n){
  vec3 c = mix(uGndAmb, uSkyAmb, n.y*0.5+0.5);
  c += uSunCol * max(dot(n, uSunDir), 0.0);
  for(int i=0;i<6;i++){
    if(i>=uNPL) break;
    vec3 d = uPL[i].xyz - p; float L = length(d);
    float att = clamp(1.0 - L/uPL[i].w, 0.0, 1.0); att *= att;
    c += uPLC[i] * att * (0.35 + 0.65*max(dot(n, d/L), 0.0));
  }
  return c;
}
vec3 applyFog(vec3 col, vec3 p){
  float d = length(p - uCam);
  float f = clamp((d - uFog.x)/(uFog.y - uFog.x), 0.0, 1.0);
  return mix(col, uFogCol, f*f*0.85);
}
`;
function glSetLightUniforms(pr) {
  const gl = R.gl, u = pr.u, e = R.env;
  if (u.uSunDir) gl.uniform3fv(u.uSunDir, e.sunDir);
  if (u.uSunCol) gl.uniform3fv(u.uSunCol, e.sunCol);
  if (u.uSkyAmb) gl.uniform3fv(u.uSkyAmb, e.sky);
  if (u.uGndAmb) gl.uniform3fv(u.uGndAmb, e.gnd);
  if (u.uFogCol) gl.uniform3fv(u.uFogCol, e.fogCol);
  if (u.uFog) gl.uniform2fv(u.uFog, e.fog);
  if (u.uCam) gl.uniform3fv(u.uCam, R.camPos);
  if (u.uNPL) gl.uniform1i(u.uNPL, R.lights.n);
  if (u.uPL) gl.uniform4fv(u.uPL, R.lights.pos);
  if (u.uPLC) gl.uniform3fv(u.uPLC, R.lights.col);
}

// ---- programs
let PROG = {};
function glPrograms() {
  PROG.mesh = glProgram(`
in vec3 aPos; in vec3 aNor; in vec2 aUV; in vec4 aCol;
uniform mat4 uVP, uM;
out vec3 vP; out vec3 vN; out vec2 vUV; out vec4 vC;
void main(){ vec4 wp = uM*vec4(aPos,1.0); vP = wp.xyz; vN = mat3(uM)*aNor; vUV = aUV; vC = aCol; gl_Position = uVP*wp; }`,
  GLSL_LIGHT + `
in vec3 vP; in vec3 vN; in vec2 vUV; in vec4 vC;
uniform sampler2D uTex; uniform vec4 uTint; uniform float uEmis; uniform vec2 uUVScale;
out vec4 o;
void main(){
  vec4 b = vC * uTint * texture(uTex, vUV*uUVScale);
  if(b.a < 0.5) discard;
  vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
  vec3 col = mix(b.rgb * lightAt(vP, n), b.rgb, uEmis);
  o = vec4(applyFog(col, vP), 1.0);
}`, ['aPos', 'aNor', 'aUV', 'aCol']);

  PROG.sprite = glProgram(`
layout(location=0) in vec2 aCorner;
uniform vec3 uPos, uRight, uUp; uniform vec2 uSize, uAnchor; uniform mat4 uVP; uniform vec4 uUVRect;
out vec2 vUV; out vec3 vP;
void main(){ vec2 c = (aCorner - uAnchor) * uSize; vec3 wp = uPos + uRight*c.x + uUp*c.y; vP = wp;
  vUV = uUVRect.xy + vec2(aCorner.x, 1.0 - aCorner.y) * uUVRect.zw; gl_Position = uVP*vec4(wp,1.0); }`,
  GLSL_LIGHT + `
in vec2 vUV; in vec3 vP;
uniform sampler2D uTex; uniform vec4 uTint; uniform vec3 uFlash; uniform vec3 uEnv; uniform float uLit; uniform float uDither;
out vec4 o;
void main(){
  vec4 c = texture(uTex, vUV);
  if(c.a < 0.5) discard;
  if(uDither > 0.5 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
  vec3 env = mix(uEnv, min(lightAt(vP + vec3(0.0,0.0,0.0), normalize(uCam - vP)), vec3(1.15)), uLit);
  vec3 col = c.rgb * env * uTint.rgb + uFlash;
  o = vec4(applyFog(col, vP), 1.0);
}`, ['aCorner']);

  PROG.decal = glProgram(`
layout(location=0) in vec2 aCorner;
uniform vec3 uPos; uniform vec2 uSize; uniform float uRot; uniform mat4 uVP;
out vec2 vQ;
void main(){ vec2 c = (aCorner-0.5)*uSize; float cs=cos(uRot), sn=sin(uRot);
  vec2 r = vec2(c.x*cs - c.y*sn, c.x*sn + c.y*cs);
  vQ = aCorner-0.5; gl_Position = uVP*vec4(uPos + vec3(r.x, 0.0, r.y), 1.0); }`,
  `in vec2 vQ; uniform vec4 uCol; uniform float uShape; out vec4 o;
void main(){
  float a;
  if(uShape < 0.5){ float d = length(vQ)*2.0; a = 1.0 - smoothstep(0.55, 1.0, d); }
  else if(uShape < 1.5){ float d = length(vQ)*2.0; a = smoothstep(0.7,0.85,d)*(1.0-smoothstep(0.9,1.0,d)); }
  else { float d = length(vQ)*2.0; a = (1.0-smoothstep(0.0,1.0,d)); a*=a; }
  o = vec4(uCol.rgb, uCol.a*a);
}`, ['aCorner']);

  PROG.particle = glProgram(`
layout(location=0) in vec2 aCorner; layout(location=1) in vec4 aPS; layout(location=2) in vec4 aCol;
uniform mat4 uVP; uniform vec3 uRight, uUp;
out vec4 vC; out vec2 vQ;
void main(){ vec2 c = (aCorner-0.5)*aPS.w; vec3 wp = aPS.xyz + uRight*c.x + uUp*c.y; vC = aCol; vQ = aCorner-0.5; gl_Position = uVP*vec4(wp,1.0); }`,
  `in vec4 vC; in vec2 vQ; uniform float uSoft; out vec4 o;
void main(){ float a = 1.0; if(uSoft > 0.5){ float d = length(vQ)*2.0; a = 1.0 - smoothstep(0.0, 1.0, d); a *= a; }
  o = vec4(vC.rgb*vC.a*a, vC.a*a); }`, ['aCorner', 'aPS', 'aCol']);

  PROG.ribbon = glProgram(`
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol;
uniform mat4 uVP; out vec4 vC;
void main(){ vC = aCol; gl_Position = uVP*vec4(aPos,1.0); }`,
  `in vec4 vC; out vec4 o; void main(){ o = vec4(vC.rgb*vC.a, vC.a); }`, ['aPos', 'aCol']);
}

// ---- camera
function glSetCamera(eye, target, fovy, aspect) {
  R.camPos = vcopy(eye); R.fovy = fovy;
  m4lookAt(eye, target, [0, 1, 0], R.view);
  m4persp(fovy, aspect, R.near, R.far, R.proj);
  m4mul(R.proj, R.view, R.vp);
  const v = R.view;
  R.camRight = [v[0], v[4], v[8]]; R.camUp = [v[1], v[5], v[9]]; R.camFwd = [-v[2], -v[6], -v[10]];
}
// world -> css pixel coords
function worldToScreen(p) {
  const m = R.vp, x = p[0], y = p[1], z = p[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  const cx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w, cy = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
  return [(cx * 0.5 + 0.5) * R.cssW, (1 - (cy * 0.5 + 0.5)) * R.cssH, w];
}

// ---- dynamic particle buffer
const PARTS = { max: 4000, n: 0, data: null, buf: null, vao: null, nSoft: 0 };
function glParticlesInit() {
  const gl = R.gl;
  PARTS.data = new Float32Array(PARTS.max * 8);
  PARTS.vao = gl.createVertexArray();
  gl.bindVertexArray(PARTS.vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, R.quadBuf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  PARTS.buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, PARTS.buf);
  gl.bufferData(gl.ARRAY_BUFFER, PARTS.data.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 0); gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 32, 16); gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);
}
function glDrawParticles(list, soft, additive) {
  if (!list.length) return;
  const gl = R.gl, d = PARTS.data;
  const n = Math.min(list.length, PARTS.max);
  for (let i = 0; i < n; i++) {
    const p = list[i], o = i * 8;
    d[o] = p.x; d[o + 1] = p.y; d[o + 2] = p.z; d[o + 3] = p.size;
    d[o + 4] = p.r; d[o + 5] = p.g; d[o + 6] = p.b; d[o + 7] = p.fa ? p.a * Math.min(1, p.life / (p.max * 0.65)) : p.a;
  }
  const pr = PROG.particle;
  gl.useProgram(pr.p);
  gl.uniformMatrix4fv(pr.u.uVP, false, R.vp);
  gl.uniform3fv(pr.u.uRight, R.camRight); gl.uniform3fv(pr.u.uUp, R.camUp);
  gl.uniform1f(pr.u.uSoft, soft ? 1 : 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, PARTS.buf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n * 8);
  gl.enable(gl.BLEND);
  if (additive) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.bindVertexArray(PARTS.vao);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  gl.bindVertexArray(null);
  gl.depthMask(true); gl.disable(gl.BLEND);
}

// ---- ribbons (triangle list, pos3 + col4)
const RIB = { max: 6000, data: null, buf: null, vao: null };
function glRibbonInit() {
  const gl = R.gl;
  RIB.data = new Float32Array(RIB.max * 7);
  RIB.vao = gl.createVertexArray();
  gl.bindVertexArray(RIB.vao);
  RIB.buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, RIB.buf);
  gl.bufferData(gl.ARRAY_BUFFER, RIB.data.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
  gl.bindVertexArray(null);
}
// verts: flat array of [x,y,z,r,g,b,a] per vertex (triangles)
function glDrawRibbons(verts, nVerts, additive) {
  if (!nVerts) return;
  const gl = R.gl, pr = PROG.ribbon;
  nVerts = Math.min(nVerts, RIB.max);
  gl.useProgram(pr.p);
  gl.uniformMatrix4fv(pr.u.uVP, false, R.vp);
  gl.bindBuffer(gl.ARRAY_BUFFER, RIB.buf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts, 0, nVerts * 7);
  gl.enable(gl.BLEND);
  if (additive) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.bindVertexArray(RIB.vao);
  gl.drawArrays(gl.TRIANGLES, 0, nVerts);
  gl.bindVertexArray(null);
  gl.depthMask(true); gl.disable(gl.BLEND);
}
