// ===== post.js : tilt-shift depth of field, bloom, grading =====
const POST = { main: null, q1: null, q2: null, b1: null, b2: null, focus: [25, 6], dof: 1, bloom: 0.7, bloomThr: 0.8, vig: 0.9, sat: 1.12,
  lift: [0.03, 0.01, 0.06], gain: [1.04, 1.0, 0.97], flash: 0, flashCol: [1, 1, 1] };

function postPrograms() {
  const VS = `layout(location=0) in vec2 aCorner; out vec2 vUV; void main(){ vUV = aCorner; gl_Position = vec4(aCorner*2.0-1.0, 0.0, 1.0); }`;
  PROG.down = glProgram(VS, `in vec2 vUV; uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThr; out vec4 o;
void main(){
  vec3 c = texture(uTex, vUV + uTexel*vec2(-1.0,-1.0)).rgb + texture(uTex, vUV + uTexel*vec2(1.0,-1.0)).rgb
         + texture(uTex, vUV + uTexel*vec2(-1.0,1.0)).rgb + texture(uTex, vUV + uTexel*vec2(1.0,1.0)).rgb;
  c *= 0.25;
  if(uThr > 0.0){ float l = max(c.r, max(c.g, c.b)); c *= smoothstep(uThr, uThr + 0.25, l); }
  o = vec4(c, 1.0);
}`, ['aCorner']);
  PROG.blur = glProgram(VS, `in vec2 vUV; uniform sampler2D uTex; uniform vec2 uDir; out vec4 o;
void main(){
  vec3 c = texture(uTex, vUV).rgb * 0.2270270270;
  c += texture(uTex, vUV + uDir*1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUV - uDir*1.3846153846).rgb * 0.3162162162;
  c += texture(uTex, vUV + uDir*3.2307692308).rgb * 0.0702702703;
  c += texture(uTex, vUV - uDir*3.2307692308).rgb * 0.0702702703;
  o = vec4(c, 1.0);
}`, ['aCorner']);
  PROG.comp = glProgram(VS, `in vec2 vUV; uniform sampler2D uScene, uBlur, uBloomT, uDepth;
uniform vec2 uFocus; uniform float uNear, uFar, uBloom, uDof, uVig, uSat, uFlash; uniform vec3 uLift, uGain, uFlashCol; uniform int uFull;
out vec4 o;
float linZ(float d){ float z = d*2.0-1.0; return 2.0*uNear*uFar/(uFar+uNear - z*(uFar-uNear)); }
void main(){
  vec3 s = texture(uScene, vUV).rgb;
  vec3 c = s;
  if(uFull == 1){
    vec3 b = texture(uBlur, vUV).rgb;
    float z = linZ(texture(uDepth, vUV).r);
    float coc = clamp((abs(z - uFocus.x) - uFocus.y) / (uFocus.y*2.0 + z*0.35), 0.0, 1.0);
    float ts = smoothstep(0.22, 0.0, vUV.y)*0.7 + smoothstep(0.8, 1.0, vUV.y)*0.8;
    coc = clamp(max(coc, ts), 0.0, 1.0) * uDof;
    c = mix(s, b, coc);
    c += texture(uBloomT, vUV).rgb * uBloom;
  }
  c = c*uGain + uLift*(1.0-c);
  float l = dot(c, vec3(0.299,0.587,0.114));
  c = mix(vec3(l), c, uSat);
  vec2 q = vUV - 0.5; c *= 1.0 - dot(q,q)*uVig;
  c = mix(c, uFlashCol, uFlash);
  c += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453) - 0.5)/255.0;
  o = vec4(c, 1.0);
}`, ['aCorner']);
}

function postResize() {
  const W = R.W, H = R.H;
  [POST.main, POST.q1, POST.q2, POST.b1, POST.b2].forEach(glFreeTarget);
  POST.main = glTarget(W, H, true);
  const qw = Math.max(8, W >> 2), qh = Math.max(8, H >> 2);
  POST.q1 = glTarget(qw, qh); POST.q2 = glTarget(qw, qh);
  const bw = Math.max(4, W >> 3), bh = Math.max(4, H >> 3);
  POST.b1 = glTarget(bw, bh); POST.b2 = glTarget(bw, bh);
}

function postBegin() {
  const gl = R.gl;
  gl.bindFramebuffer(gl.FRAMEBUFFER, POST.main.fb);
  gl.viewport(0, 0, POST.main.w, POST.main.h);
  gl.clearColor(0.1, 0.08, 0.15, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
}

function postPass(prog, src, dst, setup) {
  const gl = R.gl;
  if (POST.debug) POST.log.push(['pre', gl.getError()]);
  gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.fb : null);
  gl.viewport(0, 0, dst ? dst.w : R.W, dst ? dst.h : R.H);
  gl.useProgram(prog.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex);
  if (prog.u.uTex) gl.uniform1i(prog.u.uTex, 0);
  setup && setup(prog.u);
  gl.bindVertexArray(R.quadVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (POST.debug) POST.log.push([dst ? dst.w : 'screen', gl.getError(), gl.checkFramebufferStatus(gl.FRAMEBUFFER)]);
}

function postEnd() {
  const gl = R.gl;
  gl.disable(gl.DEPTH_TEST);
  const full = R.quality === 'high';
  if (full) {
    const m = POST.main;
    postPass(PROG.down, m, POST.q1, u => { gl.uniform2f(u.uTexel, 1 / m.w, 1 / m.h); gl.uniform1f(u.uThr, 0); });
    postPass(PROG.blur, POST.q1, POST.q2, u => gl.uniform2f(u.uDir, 1.25 / POST.q1.w, 0));
    postPass(PROG.blur, POST.q2, POST.q1, u => gl.uniform2f(u.uDir, 0, 1.25 / POST.q1.h));
    postPass(PROG.down, POST.q1, POST.b1, u => { gl.uniform2f(u.uTexel, 1 / POST.q1.w, 1 / POST.q1.h); gl.uniform1f(u.uThr, POST.bloomThr); });
    postPass(PROG.blur, POST.b1, POST.b2, u => gl.uniform2f(u.uDir, 1.5 / POST.b1.w, 0));
    postPass(PROG.blur, POST.b2, POST.b1, u => gl.uniform2f(u.uDir, 0, 1.5 / POST.b1.h));
  }
  const pr = PROG.comp;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, R.W, R.H);
  gl.useProgram(pr.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, POST.main.tex); gl.uniform1i(pr.u.uScene, 0);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, POST.q1.tex); gl.uniform1i(pr.u.uBlur, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, POST.b1.tex); gl.uniform1i(pr.u.uBloomT, 2);
  gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, POST.main.depth); gl.uniform1i(pr.u.uDepth, 3);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform2fv(pr.u.uFocus, POST.focus);
  gl.uniform1f(pr.u.uNear, R.near); gl.uniform1f(pr.u.uFar, R.far);
  gl.uniform1f(pr.u.uBloom, POST.bloom); gl.uniform1f(pr.u.uDof, POST.dof);
  gl.uniform1f(pr.u.uVig, POST.vig); gl.uniform1f(pr.u.uSat, POST.sat);
  gl.uniform3fv(pr.u.uLift, POST.lift); gl.uniform3fv(pr.u.uGain, POST.gain);
  gl.uniform1f(pr.u.uFlash, POST.flash); gl.uniform3fv(pr.u.uFlashCol, POST.flashCol);
  gl.uniform1i(pr.u.uFull, full ? 1 : 0);
  gl.bindVertexArray(R.quadVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
}
