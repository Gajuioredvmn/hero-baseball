import json, sys
for fn in sys.argv[1:]:
    games = None
    for line in open(fn, encoding='utf-8'):
        if line.startswith('LOG games '): games = json.loads(line[len('LOG games '):])
        if line.startswith('LOG stats '): stats = json.loads(line[len('LOG stats '):])
    if not games: print(fn, 'no games yet'); continue
    n = len(games); home = sum(1 for g in games if g['score'][1] > g['score'][0])
    ties = sum(1 for g in games if g['score'][1] == g['score'][0])
    ew = {'E':0,'W':0}; runs = {'E':0,'W':0}; hits={'E':0,'W':0}; kos={'E':0,'W':0}
    top = bot = 0; topN = botN = 0
    for g in games:
        if g['score'][0] != g['score'][1]:
            w = 0 if g['score'][0] > g['score'][1] else 1
            ew[g['ids'][w]] += 1
        for s in (0,1):
            runs[g['ids'][s]] += g['score'][s]; hits[g['ids'][s]] += g['hits'][s]; kos[g['ids'][s]] += g['kos'][s]
        inn = len(g['lines'][0])
        full = min(len(g['lines'][0]), len(g['lines'][1]))
        for i in range(full - 1):  # exclude last inning (bottom may be truncated)
            top += g['lines'][0][i] or 0; bot += g['lines'][1][i] or 0; topN += 1; botN += 1
    print(fn.split('/')[-1], 'games', n, 'homeWins', home, 'ties', ties, 'wins', ew, 'runs', runs, 'hits', hits, 'kos(suffered?)', kos)
    print('   runs/half-inning excl last: top %.2f bottom %.2f (n=%d)' % (top/max(1,topN), bot/max(1,botN), topN))
    print('   scores', [tuple(g['score']) for g in games])
    if 'byHero' in stats:
        print('   per hero: name PA H HR K')
        for nm, h in sorted(stats['byHero'].items(), key=lambda kv: kv[0]):
            hits = sum(v for k, v in h.items() if '安打' in k or '全壘打' in k)
            hr = sum(v for k, v in h.items() if '全壘打' in k)
            k_ = sum(v for k, v in h.items() if '三振' in k)
            pa = sum(v for k, v in h.items() if k not in ('好球!', '壞球', '揮空!', '界外球'))
            print('     %-6s PA %4d  H %4d  AVG %.3f  HR %3d  K %3d' % (nm, pa, hits, hits / max(1, pa), hr, k_))
    L = stats['labels']; print('   labels', {k: L[k] for k in sorted(L, key=lambda k: -L[k])})
