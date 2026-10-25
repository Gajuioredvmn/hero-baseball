// test entry: render stadium from preset cameras
const canvas = document.getElementById('gl');
function fit(){ R.dpr = 1; R.cssW = innerWidth; R.cssH = innerHeight; canvas.width = R.W = innerWidth; canvas.height = R.H = innerHeight; canvas.style.width = innerWidth+'px'; canvas.style.height = innerHeight+'px'; }
fit();
if(!glInit(canvas)) { document.title = 'nogl'; }
glPrograms(); postPrograms(); glParticlesInit(); glRibbonInit();
buildStadium(); postResize();
const cams = {
  bat: { eye:[0.0,2.3,9.5], tgt:[0,1.4,-18.4], fov:24, focus:[16,10] },
  pitch: { eye:[0.6,3.4,-26.5], tgt:[0,0.9,0], fov:26, focus:[20,8] },
  field: { eye:[0,26,22], tgt:[0,0,-45], fov:50, focus:[50,25] },
  high: { eye:[60,70,60], tgt:[0,0,-40], fov:55, focus:[90,40] },
  of: { eye:[0,6,-40], tgt:[0,3,-120], fov:50, focus:[70,30] },
};
const q = new URLSearchParams(location.search);
const c = cams[q.get('cam') || 'bat'];
R.quality = q.get('q') || 'high';
R.time = 3.0; ST.cheer = q.get('cheer') ? 1 : 0;
glSetCamera(c.eye, c.tgt, c.fov*DEG, R.W/R.H);
POST.focus = c.focus;
postBegin(); drawStadium(); postEnd();
document.title = 'ready';
