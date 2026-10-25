import sys, os
ORDER = ['math.js','gl.js','stadium.js','post.js','pixel.js','anim.js','heroes.js','fx.js','audio.js','physics.js','field.js','abilities.js','ai.js','input.js','game.js','ui.js','main.js']
def build(entry=None, out='dist/index.html', extra=None):
    src = ''
    for f in ORDER:
        p = os.path.join('src', f)
        if f == 'main.js' and entry: p = entry
        if os.path.exists(p):
            src += f'\n// ---- {f} ----\n' + open(p, encoding='utf-8').read()
    if extra:
        for e in extra: src += f'\n// ---- {e} ----\n' + open(e, encoding='utf-8').read()
    css = open('src/style.css', encoding='utf-8').read() if os.path.exists('src/style.css') else ''
    body = open('src/body.html', encoding='utf-8').read() if os.path.exists('src/body.html') else '<canvas id="gl"></canvas>'
    head = open('src/head.html', encoding='utf-8').read() if os.path.exists('src/head.html') else '<title>英雄棒球大戰</title>'
    html = head + '\n<style>\n' + css + '\n</style>\n' + body + '\n<script>\n(function(){\n"use strict";\n' + src + '\n})();\n</script>\n'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    open(out, 'w', encoding='utf-8').write(html)
    print('built', out, len(html)//1024, 'KB')
if __name__ == '__main__':
    entry = sys.argv[1] if len(sys.argv) > 1 else None
    out = sys.argv[2] if len(sys.argv) > 2 else 'dist/index.html'
    build(entry, out)
