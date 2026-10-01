# -*- coding: utf-8 -*-
"""Zet de vertaaltabel van serverless/blog.html opnieuw samen.

De blog bood 30 talen aan in de kiezer maar had er zeven vertaald; de rest
viel terug op het Engels. Een taal aanbieden die daarna Engels blijkt te
zijn is erger dan hem weglaten, dus staan alle 30 nu in tr_*.py-bestanden
en worden ze hier ingevoegd.

    python3 tools/blog-page/bouw.py      (vanuit de hoofdmap)
"""
import glob
import importlib.util
import io
import json
import os
import re

HIER = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HIER, '..', '..'))
PAGINA = os.path.join(REPO, 'serverless', 'blog.html')

vert = {}
for f in sorted(glob.glob(os.path.join(HIER, 'tr_*.py'))):
    spec = importlib.util.spec_from_file_location('blogtr_' + os.path.basename(f), f)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for k, v in mod.T.items():
        vert[k] = v

html = io.open(PAGINA, encoding='utf-8').read()
langs = [l['code'] for l in json.loads(re.search(r'var LANGS = (\[.*?\]);', html, re.S).group(1))]

# Controle vooraf: dezelfde sleutels en dezelfde lijstlengtes als het Engels.
ref = vert['en']
fouten = []
for code in langs:
    if code not in vert:
        fouten.append('%s: ontbreekt' % code)
        continue
    v = vert[code]
    mist = [k for k in ref if k not in v]
    if mist:
        fouten.append('%s: mist %s' % (code, ', '.join(mist)))
    for k, r in ref.items():
        if isinstance(r, list) and len(v.get(k, [])) != len(r):
            fouten.append('%s: %s heeft %d in plaats van %d' % (code, k, len(v.get(k, [])), len(r)))
        if isinstance(r, list) and r and isinstance(r[0], dict):
            for i, p in enumerate(v.get(k, [])):
                if not isinstance(p, dict) or 'n' not in p or 'd' not in p:
                    fouten.append('%s: %s[%d] mist n of d' % (code, k, i))
# Verdwaalde tekens uit een ander schrift. Bij het typen van lange vertalingen
# is er tweemaal een los CJK-teken midden in een Russische zin beland; dat valt
# bij nalezen niet op maar staat wel op de pagina. Alleen Chinees, Japans en
# Koreaans mogen Han-tekens bevatten.
HAN = re.compile('[㐀-鿿]')
for code in langs:
    if code in ('zh', 'ja', 'ko') or code not in vert:
        continue
    for k, v in vert[code].items():
        stukken = []
        if isinstance(v, str):
            stukken = [v]
        elif isinstance(v, list):
            for p in v:
                stukken.extend([p['n'], p['d']] if isinstance(p, dict) else [p])
        for t in stukken:
            m = HAN.search(t)
            if m:
                fouten.append('%s: %s bevat een teken uit een ander schrift (%r) — %s'
                              % (code, k, m.group(0), t[max(0, m.start() - 30):m.start() + 30]))

if fouten:
    raise SystemExit('NIET GEBOUWD:\n' + '\n'.join(fouten))

nieuw = 'var BLOG = ' + json.dumps(vert, ensure_ascii=False, separators=(',', ':')) + ';'
html2 = re.sub(r'var BLOG = \{.*?\};', lambda m: nieuw, html, count=1, flags=re.S)
if html2 == html:
    raise SystemExit('NIET GEBOUWD: de tabel in blog.html is niet gevonden')
io.open(PAGINA, 'w', encoding='utf-8').write(html2)
print('blog.html bijgewerkt: %d talen, %d KB' % (len(vert), len(html2.encode('utf-8')) // 1024))
