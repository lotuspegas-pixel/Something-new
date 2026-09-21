# -*- coding: utf-8 -*-
"""Bouwt serverless/security.html uit losse onderdelen.

De vertalingen staan in tr_*.py-bestanden (één of meer talen per bestand),
zodat ze in stukken geschreven kunnen worden zonder één gigantisch bestand.
"""
import io, json, os, re, sys, glob, importlib.util

SP = os.path.dirname(os.path.abspath(__file__))
REPO = '/home/user/Something-new'

def laad(pad):
    return io.open(pad, encoding='utf-8').read()

# --- vertalingen verzamelen -------------------------------------------------
vert = {}
for f in sorted(glob.glob(os.path.join(SP, 'tr_*.py'))):
    spec = importlib.util.spec_from_file_location('tr_' + os.path.basename(f), f)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    for k, v in mod.T.items():
        vert[k] = v

# --- talenlijst overnemen uit blog.html ------------------------------------
blog = laad(os.path.join(REPO, 'serverless/blog.html'))
langs = re.search(r'var LANGS = (\[.*?\]);', blog, re.S).group(1)

css = laad(os.path.join(SP, 'blog.css')) + laad(os.path.join(SP, 'security-extra.css'))
body = laad(os.path.join(SP, 'security-body.html'))

en = vert['en']

# Alle talen waarvoor een échte vertaling bestaat krijgen een hreflang-variant.
# Een taal aankondigen die daarna Engels blijkt te zijn is voor zoekmachines
# erger dan hem weglaten, dus dit volgt de vertaaltabel en niet een handlijst.
TALEN = [json.loads(langs)[i]['code'] for i in range(len(json.loads(langs)))]
HREF = ''.join(
    '\n    <link rel="alternate" hreflang="%s" href="https://babyphone.online/security.html?lang=%s" />' % (c, c)
    for c in TALEN if c != 'en' and c in vert
)

JSONLD = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "headline": en['h1'],
    "description": en['desc'],
    "inLanguage": "en",
    "datePublished": "2026-08-25",
    "dateModified": "2026-08-25",
    "author": {"@type": "Organization", "name": "BabyPhone.online", "legalName": "Arcana Synthetica"},
    "publisher": {
        "@type": "Organization", "name": "BabyPhone.online", "legalName": "Arcana Synthetica",
        "email": "info@babyphone.online",
        "address": {"@type": "PostalAddress", "addressLocality": "Harlingen", "addressCountry": "NL"},
        "logo": {"@type": "ImageObject", "url": "https://babyphone.online/icon-512.png"},
    },
    "mainEntityOfPage": {"@type": "WebPage", "@id": "https://babyphone.online/security.html"},
    "keywords": "baby monitor security, babyfoon beveiliging, webrtc encryption, private baby monitor, baby monitor privacy",
}
FAQLD = {
    "@context": "https://schema.org", "@type": "FAQPage",
    "@id": "https://babyphone.online/security.html#faq", "inLanguage": "en",
    "mainEntity": [
        {"@type": "Question", "name": f['n'],
         "acceptedAnswer": {"@type": "Answer", "text": f['d']}}
        for f in en['faq']
    ],
}

RENDER = r"""
    var STORE_KEY = 'babyfoon.lang';
    var current = 'en';

    function detect() {
      try { var q = new URLSearchParams(location.search).get('lang'); if (q && LANGS.some(function(l){return l.code===q;})) return q; } catch (e) {}
      var saved = null; try { saved = localStorage.getItem(STORE_KEY); } catch (e) {}
      if (saved && LANGS.some(function(l){return l.code===saved;})) return saved;
      var nav = (navigator.language || 'en').slice(0,2).toLowerCase();
      return LANGS.some(function(l){return l.code===nav;}) ? nav : 'en';
    }
    function T(key) {
      var c = TXT[current] || {};
      return (c[key] != null) ? c[key] : TXT.en[key];
    }
    function leeg(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }
    // Regels met een merkteken ervoor (vinkje of uitroepteken).
    function vulTeken(id, key, klasse) {
      var box = document.getElementById(id); if (!box) return;
      leeg(box);
      (T(key) || []).forEach(function (tekst) {
        var li = document.createElement('li');
        var m = document.createElement('span'); m.className = klasse;
        m.textContent = klasse === 'ok' ? '✓' : '!';
        var sp = document.createElement('span'); sp.textContent = tekst;
        li.appendChild(m); li.appendChild(sp); box.appendChild(li);
      });
    }
    // Regels met een vetgedrukte kop en uitleg.
    function vulPaar(id, key) {
      var box = document.getElementById(id); if (!box) return;
      leeg(box);
      (T(key) || []).forEach(function (p) {
        var li = document.createElement('li');
        var b = document.createElement('b'); b.textContent = p.n;
        var sp = document.createElement('span'); sp.textContent = p.d;
        li.appendChild(b); li.appendChild(sp); box.appendChild(li);
      });
    }
    function render() {
      var meta = LANGS.filter(function(l){return l.code===current;})[0] || {};
      var vertaald = !!TXT[current];
      document.documentElement.setAttribute('lang', current);
      document.documentElement.setAttribute('dir', (vertaald && meta.rtl) ? 'rtl' : 'ltr');
      document.title = T('title');
      var md = document.querySelector('meta[name="description"]'); if (md) md.setAttribute('content', T('desc'));

      var nodes = document.querySelectorAll('[data-b]');
      for (var i = 0; i < nodes.length; i++) nodes[i].textContent = T(nodes[i].getAttribute('data-b'));

      vulTeken('cardList', 'cardList', 'ok');
      vulTeken('does', 'does', 'ok');
      vulTeken('you', 'you', 'no');
      vulPaar('layers', 'layers');
      vulPaar('faq', 'faq');

      var ol = document.getElementById('steps');
      if (ol) { leeg(ol); (T('steps') || []).forEach(function (s) { var li = document.createElement('li'); li.textContent = s; ol.appendChild(li); }); }

      // De opmerking begint met een vetgedrukte aanhef.
      var nt = document.getElementById('notice');
      if (nt) {
        leeg(nt);
        var b = document.createElement('strong'); b.textContent = T('noticeLead');
        nt.appendChild(b); nt.appendChild(document.createTextNode(T('notice')));
      }

      // Links binnen de site houden de gekozen taal vast.
      var q = current === 'en' ? './' : ('./?lang=' + current);
      ['brandLink', 'backLink', 'ctaLink'].forEach(function (id) { var el = document.getElementById(id); if (el) el.setAttribute('href', q); });
      var bl = document.getElementById('blogLink');
      if (bl) bl.setAttribute('href', current === 'en' ? 'blog.html' : ('blog.html?lang=' + current));
    }
    function setLang(code) {
      if (!LANGS.some(function(l){return l.code===code;})) code = 'en';
      current = code;
      try { localStorage.setItem(STORE_KEY, code); } catch (e) {}
      try {
        var u = new URL(location.href);
        if (code === 'en') u.searchParams.delete('lang'); else u.searchParams.set('lang', code);
        history.replaceState(null, '', u);
      } catch (e) {}
      render();
    }
    var sel = document.createElement('select');
    sel.className = 'lang-select';
    sel.setAttribute('aria-label', 'Language');
    LANGS.forEach(function (l) { var o = document.createElement('option'); o.value = l.code; o.textContent = l.name; sel.appendChild(o); });
    document.getElementById('langSel').appendChild(sel);
    sel.addEventListener('change', function () { setLang(sel.value); });

    current = detect();
    sel.value = current;
    render();
"""

HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>%(title)s</title>
  <meta name="description" content="%(desc)s" />
  <link rel="canonical" href="https://babyphone.online/security.html" />
    <link rel="alternate" hreflang="en" href="https://babyphone.online/security.html" />%(href)s
    <link rel="alternate" hreflang="x-default" href="https://babyphone.online/security.html" />
  <meta name="robots" content="index,follow,max-image-preview:large" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="BabyPhone.online" />
  <meta property="og:title" content="%(title)s" />
  <meta property="og:description" content="%(desc)s" />
  <meta property="og:url" content="https://babyphone.online/security.html" />
  <meta property="og:image" content="https://babyphone.online/og-image.jpg" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png" />
  <link rel="icon" type="image/png" sizes="192x192" href="icon-192.png" />
  <link rel="apple-touch-icon" href="apple-touch-icon.png" />
  <script type="application/ld+json">
%(jsonld)s
  </script>
  <script type="application/ld+json">
%(faqld)s
  </script>
  <style>%(css)s</style>
  <link rel="stylesheet" href="assets/brand-theme.css" />
</head>
<body class="content-page">
  <div class="wrap">
    <header>
      <a class="brand bp-brand-lockup" href="./" id="brandLink" aria-label="BabyPhone.online"><img class="bp-brand-icon" src="assets/brand/babyphone-icon.png" alt="" width="293" height="341" /><span class="bp-wordmark" aria-hidden="true"><span>Babyphone</span><span>.Online</span></span></a>
      <div class="head-right">
        <span class="lang-pill"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" stroke="currentColor" stroke-width="1.7"/></svg><span id="langSel"></span></span>
        <a class="back" href="./" id="backLink" data-b="backToApp">%(back)s</a>
      </div>
    </header>

%(body)s

    <footer>
      <p>&copy; BabyPhone.online</p>
    </footer>
  </div>

  <script>
  (function () {
    var LANGS = %(langs)s;
    var TXT = %(txt)s;
%(render)s
  })();
  </script>
</body>
</html>
"""

uit = HTML % {
    'title': en['title'], 'desc': en['desc'], 'href': HREF,
    'jsonld': json.dumps(JSONLD, ensure_ascii=False, indent=2),
    'faqld': json.dumps(FAQLD, ensure_ascii=False, indent=2),
    'css': css, 'body': body, 'back': en['backToApp'],
    'langs': langs,
    'txt': json.dumps(vert, ensure_ascii=False, separators=(',', ':')),
    'render': RENDER,
}

pad = os.path.join(REPO, 'serverless/security.html')
io.open(pad, 'w', encoding='utf-8').write(uit)
print('geschreven: %s (%d KB, %d talen)' % (pad, len(uit.encode('utf-8')) // 1024, len(vert)))
