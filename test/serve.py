# dev server for look-dev pages: serves the repo, and POST /save?name=x.png writes a data-URL body to test/out/
import http.server, os, sys, base64, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'test', 'out')
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        name = os.path.basename(q.get('name', ['shot.png'])[0])
        body = self.rfile.read(int(self.headers['Content-Length'])).decode()
        os.makedirs(OUT, exist_ok=True)
        open(os.path.join(OUT, name), 'wb').write(base64.b64decode(body.split(',', 1)[1]))
        self.send_response(200); self.end_headers(); self.wfile.write(b'ok')
    def guess_type(self, p):
        t = super().guess_type(p)
        return t + '; charset=utf-8' if t.startswith('text/') or t.endswith('javascript') else t
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1]) if len(sys.argv) > 1 else 8765), H).serve_forever()
