'use strict';

/**
 * End-to-end AGENT-GEREEDHEID: kan een AI-assistent of crawler deze site
 * lezen, begrijpen en er (veilig) mee werken?
 *
 *   npm run test:agent
 *
 * Wat hier bewaakt wordt, en waarom het een eigen suite heeft: dit zijn dingen
 * die niemand opmerkt zolang je zelf met een browser kijkt. Ze breken stil
 * (een tweede <h1> erbij, een link in llms.txt die niet meer klopt, een
 * .htaccess-regel die verdwijnt) en de eerste die het merkt is een crawler.
 *
 *   A. Koppen:       precies één <h1>, en de koppen zien er nog steeds hetzelfde uit
 *   B. robots.txt:   Content-Signal verklaard
 *   C. llms.txt:     titel, samenvatting, secties, echte markdown-links naar
 *                    pagina's die bestaan
 *   D. Over ons:     about.html bestaat en is bereikbaar vanaf de homepage
 *   E. Markdown:     index.md bestaat; .htaccess serveert hem op verzoek
 *   F. Echte Apache: de .htaccess-regels draaien tegen een echte Apache
 *                    (overgeslagen, met melding, als die er niet is)
 *   G. WebMCP:       de pagina registreert tools, en uitdrukkelijk GEEN tool die
 *                    een camera start of een kamercode kan lezen of invullen
 *
 * APP_ROOT wijst naar een andere map (bv. dist/), standaard serverless/.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(process.env.APP_ROOT || path.join(__dirname, '..', 'serverless'));
const WEB_PORT = Number(process.env.WEB_PORT || 8805);
const APACHE_PORT = Number(process.env.APACHE_PORT || 8806);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Een bestand dat er niet is leest als leeg: de controle erop faalt dan netjes
// (en met een naam), in plaats van de hele suite te laten crashen.
const lees = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return ''; } };

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.md': 'text/markdown', '.woff2': 'font/woff2', '.xml': 'application/xml' };
const web = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); }
    else { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); }
  });
});

function findExecutable() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base)) {
      if (!d.startsWith('chromium-')) continue;
      for (const sub of ['chrome-linux64', 'chrome-linux']) {
        const p = path.join(base, d, sub, 'chrome');
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (e) { /* geen map: laat Playwright zelf zoeken */ }
  return undefined;
}

// Eén HTTP-verzoek met eigen headers; geeft status, headers en tekst terug.
function haal(port, pad, headers) {
  return new Promise((ok, af) => {
    const r = http.request({ host: '127.0.0.1', port, path: pad, method: 'GET', headers: headers || {} }, (res) => {
      let d = ''; res.setEncoding('utf8');
      res.on('data', (c) => { d += c; });
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, body: d }));
    });
    r.on('error', af); r.setTimeout(8000, () => r.destroy(new Error('time-out'))); r.end();
  });
}

let fail = false;
const check = (n, c, extra) => { console.log((c ? '✅' : '❌') + ' ' + n + (extra ? '  — ' + extra : '')); if (!c) fail = true; };

// ---------------------------------------------------------------- Apache
function zoekApache() {
  for (const bin of ['apache2', '/usr/sbin/apache2', 'httpd', '/usr/sbin/httpd']) {
    const r = spawnSync(bin, ['-v'], { encoding: 'utf8' });
    if (r.status === 0) return bin;
  }
  return null;
}
async function metApache(bin) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bp-apache-'));
  const doc = path.join(dir, 'site');
  // De muziek (48 MB) is voor deze controle niet nodig.
  fs.cpSync(ROOT, doc, { recursive: true, filter: (s) => path.basename(s) !== 'music' });
  spawnSync('chmod', ['-R', 'a+rX', dir]);
  const modules = '/usr/lib/apache2/modules';
  const root = process.getuid && process.getuid() === 0;
  const conf = [
    'ServerRoot "/usr/lib/apache2"',
    'PidFile "' + path.join(dir, 'apache.pid') + '"',
    'Listen 127.0.0.1:' + APACHE_PORT,
    'ServerName localhost',
    root ? 'User www-data\nGroup www-data' : '',
    ...['mpm_event', 'authz_core', 'dir', 'mime', 'rewrite', 'headers', 'deflate', 'filter', 'expires', 'alias', 'negotiation', 'setenvif']
      .map((m) => 'LoadModule ' + m + '_module ' + modules + '/mod_' + m + '.so'),
    'TypesConfig /etc/mime.types',
    'DocumentRoot "' + doc + '"',
    'DirectoryIndex index.html',
    'ErrorLog "' + path.join(dir, 'error.log') + '"',
    '<Directory "' + doc + '">\n  AllowOverride All\n  Require all granted\n</Directory>',
  ].join('\n');
  const cf = path.join(dir, 'httpd.conf');
  fs.writeFileSync(cf, conf);
  const t = spawnSync(bin, ['-f', cf, '-t'], { encoding: 'utf8' });
  if (t.status !== 0) return { fout: 'configuratie niet geldig: ' + (t.stderr || t.stdout).trim().split('\n').pop(), dir, bin, cf };
  const s = spawnSync(bin, ['-f', cf, '-k', 'start'], { encoding: 'utf8' });
  if (s.status !== 0) return { fout: 'start mislukt: ' + (s.stderr || s.stdout).trim().split('\n').pop(), dir, bin, cf };
  for (let i = 0; i < 30; i++) {
    try { await haal(APACHE_PORT, '/', { 'X-Forwarded-Proto': 'https' }); break; } catch (e) { await sleep(150); }
  }
  return { dir, bin, cf };
}

(async () => {
  // ================================================================ A. koppen
  console.log('\n--- A: koppen ---');
  const index = lees('index.html');
  const h1s = (index.match(/<h1\b/gi) || []).length;
  check('A1: index.html heeft precies één <h1>', h1s === 1, h1s + ' gevonden');
  const heroH1 = /<h1[^>]*data-i18n="heroTitle"/.test(index);
  check('A2: en dat is de hoofdkop van de landingspagina', heroH1);
  // Tokenbudget: een AI-assistent die de pagina als tekst leest betaalt voor elk teken.
  // Bij 1,6 MB (alles inline) was dat ruim 375.000 tokens. Dit is de grens waar de
  // bouw ook op faalt (160 KB), hier nog eens vanuit de uitgeleverde pagina.
  check('A4: index.html is klein genoeg voor een agent (onder 160 KB, ongeveer 40.000 tokens)', index.length > 1000 && index.length < 160 * 1024, Math.round(index.length / 1024) + ' KB');
  const inlineGroot = [...index.matchAll(/<(script|style)\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/\1>/gi)].filter((m) => m[2].length > 12000).map((m) => m[1] + ' ' + Math.round(m[2].length / 1024) + ' KB');
  check('A5: geen inline script of stijl groter dan 12 KB (de code staat in aparte bestanden)', inlineGroot.length === 0, inlineGroot.join(', ') || 'alles klein');
  for (const f of ['about.html', 'how-it-works.html', 'privacy.html', 'terms.html', 'contact.html', 'accessibility.html', 'blog.html', 'security.html']) {
    const n = (lees(f).match(/<h1\b/gi) || []).length;
    check('A3: ' + f + ' heeft precies één <h1>', n === 1, n + ' gevonden');
  }

  // ======================================================== B. robots.txt
  console.log('\n--- B: robots.txt ---');
  const robots = lees('robots.txt');
  const cs = robots.split('\n').filter((r) => /^content-signal\s*:/i.test(r.trim()));
  check('B1: robots.txt verklaart een Content-Signal', cs.length === 1, cs.join(' | '));
  const waarden = {};
  (cs[0] || '').replace(/^[^:]+:/, '').split(',').forEach((p) => { const [k, v] = p.split('=').map((x) => x && x.trim()); if (k) waarden[k] = v; });
  check('B2: met search, ai-input en ai-train, elk yes of no',
    ['search', 'ai-input', 'ai-train'].every((k) => waarden[k] === 'yes' || waarden[k] === 'no'), JSON.stringify(waarden));
  // Voor de huidige keuze: zoeken en live gebruik mag, trainen niet. Wil de
  // eigenaar dat anders, dan hoort deze controle mee te veranderen.
  check('B3: huidige keuze: trainen niet toegestaan', waarden['ai-train'] === 'no');
  const inGroep = robots.indexOf('User-agent: *') < robots.search(/^content-signal/im);
  check('B4: de regel staat ná "User-agent: *", dus in die groep', inGroep);
  check('B5: Sitemap blijft verwezen', /^Sitemap:\s*https:\/\/babyphone\.online\/sitemap\.xml/im.test(robots));

  // ========================================================= C. llms.txt
  console.log('\n--- C: llms.txt ---');
  const llms = lees('llms.txt');
  const regels = llms.split('\n');
  const eerste = regels.find((r) => r.trim());
  check('C1: begint met een "# "-titel', /^# \S/.test(eerste), eerste);
  check('C2: heeft een "> "-samenvatting', regels.some((r) => /^> \S/.test(r)));
  const secties = regels.filter((r) => /^## \S/.test(r));
  check('C3: heeft secties met "## "', secties.length >= 3, secties.length + ' secties');
  const links = [...llms.matchAll(/\[([^\]]+)\]\((https:\/\/babyphone\.online\/[^)\s]*)\)/g)];
  check('C4: heeft markdown-links naar de eigen pagina\'s', links.length >= 8, links.length + ' links');
  const dood = [];
  links.forEach((m) => {
    const u = new URL(m[2]);
    const rel = decodeURIComponent(u.pathname) === '/' ? 'index.html' : decodeURIComponent(u.pathname).slice(1);
    if (!fs.existsSync(path.join(ROOT, rel))) dood.push(m[2]);
  });
  check('C5: elke link wijst naar een bestand dat bestaat', dood.length === 0, dood.join(', ') || 'geen dode links');
  const genoemd = ['about.html', 'index.md', 'security.html', 'how-it-works.html', 'privacy.html', 'contact.html'];
  const mist = genoemd.filter((g) => !links.some((m) => m[2].endsWith('/' + g)));
  check('C6: de belangrijkste pagina\'s staan erin', mist.length === 0, mist.length ? 'ontbreekt: ' + mist.join(', ') : '');
  check('C7: geen kale URL-lijst meer in "Key pages"', !/^- https:\/\/babyphone\.online\/\S* —/m.test(llms));
  const sitemap = lees('sitemap.xml');
  check('C8: about.html staat in de sitemap', sitemap.includes('<loc>https://babyphone.online/about.html</loc>'));

  // ========================================================== D. Over ons
  console.log('\n--- D: over ons ---');
  check('D1: de homepage linkt naar about.html', /<a [^>]*href="about\.html"/.test(index));
  const zonder = ['accessibility', 'terms', 'privacy', 'contact', 'how-it-works', 'blog'].filter((f) => !/href="about\.html"/.test(lees(f + '.html')));
  check('D2: de andere pagina\'s linken er ook naar', zonder.length === 0, zonder.join(', '));
  const about = lees('about.html');
  check('D3: about.html noemt de uitgever en het adres',
    /Arcana Synthetica/.test(about) && /Harlingen/.test(about));
  check('D4: en bevat geen verzonnen telefoonnummer', about.length > 500 && !/\+?\d[\d\s().-]{8,}\d/.test(about.replace(/42115786/g, '')));
  check('D5: JSON-LD in about.html is aanwezig en geldige JSON',
    [...about.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].length > 0 &&
    [...about.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].every((m) => { try { JSON.parse(m[1]); return true; } catch (e) { return false; } }));
  // In de bron staan de vertalingen in js/i18n.js; in de uitgeleverde dist/ heet dat
  // bestand assets/i18n.<hash>.js (de hash is een vingerafdruk van de inhoud).
  let i18n = lees('js/i18n.js');
  if (!i18n) {
    try {
      const f = fs.readdirSync(path.join(ROOT, 'assets')).find((n) => /^i18n\.[0-9a-f]{10}\.js$/.test(n));
      if (f) i18n = lees('assets/' + f);
    } catch (e) { /* geen assets/-map */ }
  }
  check('D6: voettekstlink heeft een vertaling voor alle 30 talen', (i18n.match(/const OVER = \{[\s\S]*?\};/) || [''])[0].split(/\w+:\s*'/).length - 1 === 30);

  // ========================================================== E. Markdown
  console.log('\n--- E: Markdown ---');
  const md = lees('index.md');
  check('E1: index.md begint met de titel', /^# BabyPhone\.online/.test(md));
  check('E2: bestaat en is klein (500 tot 10.240 tekens)', md.length > 500 && md.length < 10240, md.length + ' tekens');
  check('E3: zegt dat https nodig is en noemt de beperkingen', /https/.test(md) && /iPhone and iPad/.test(md));
  check('E4: noemt de naam "Luna Unit" nergens', !/Luna Unit/i.test(md + index));
  check('E5: de homepage wijst met <link rel="alternate"> naar de Markdown',
    /<link rel="alternate" type="text\/markdown" href="https:\/\/babyphone\.online\/index\.md"/.test(index));
  const ht = lees('.htaccess');
  check('E6: .htaccess serveert index.md bij Accept: text/markdown',
    /RewriteCond %\{HTTP:Accept\} text\/markdown/.test(ht) && /RewriteRule \^\(\?:index\\\.html\)\?\$ index\.md \[L\]/.test(ht));
  check('E7: .htaccess zet een Link-header met alternate en describedby',
    /Header set Link .*rel=\\"alternate\\".*text\/markdown.*rel=\\"describedby\\"/.test(ht));
  check('E8: en Vary: Accept', /Header merge Vary "Accept"/.test(ht));

  // ====================================================== F. echte Apache
  console.log('\n--- F: echte Apache ---');
  const bin = zoekApache();
  if (!bin && process.env.VERPLICHT_APACHE) {
    // In de CI staat Apache verplicht aan: stilzwijgend overslaan zou precies de
    // controle weghalen die laat zien dat de .htaccess-regels werken.
    check('F0: Apache is aanwezig (VERPLICHT_APACHE=1)', false, 'geen apache2 of httpd gevonden');
  } else if (!bin) {
    console.log('⏭️  F: overgeslagen: geen apache2 of httpd gevonden. De regels in .htaccess zijn dan alleen op tekst gecontroleerd (E6-E8), niet in werking gezien.');
  } else {
    const A = await metApache(bin);
    try {
      if (A.fout) {
        check('F0: Apache start met de .htaccess van de site', false, A.fout);
      } else {
        const H = { 'X-Forwarded-Proto': 'https' };
        const browser = await haal(APACHE_PORT, '/', Object.assign({ Accept: 'text/html,application/xhtml+xml,*/*;q=0.8' }, H));
        check('F1: een browser krijgt de HTML', browser.status === 200 && /text\/html/.test(browser.headers['content-type']) && /<!DOCTYPE html>/i.test(browser.body));
        const link = browser.headers.link || '';
        check('F2: met een Link-header naar de Markdown en llms.txt',
          /<\/index\.md>; rel="alternate"; type="text\/markdown"/.test(link) && /<\/llms\.txt>; rel="describedby"/.test(link), link);
        check('F3: en Vary: Accept (de losse waarde, niet alleen Accept-Encoding)', /(^|,\s*)Accept\s*(,|$)/i.test(browser.headers.vary || ''), browser.headers.vary);
        const agent = await haal(APACHE_PORT, '/', Object.assign({ Accept: 'text/markdown' }, H));
        check('F4: een agent met Accept: text/markdown krijgt Markdown',
          agent.status === 200 && /^text\/markdown/.test(agent.headers['content-type']) && /^# BabyPhone\.online/.test(agent.body), agent.headers['content-type']);
        const cc = agent.headers['cache-control'] || '';
        check('F4b: het Markdown-antwoord mag door geen enkele cache (of CDN) onthouden worden', /no-store/.test(cc) && /private/.test(cc) && !/max-age/.test(cc), 'Cache-Control: ' + cc);
        check('F5: en dat is kleiner dan de HTML', agent.body.length * 10 < browser.body.length, agent.body.length + ' tegenover ' + browser.body.length + ' tekens');
        check('F6: met UTF-8 als tekenset', /charset=utf-8/i.test(agent.headers['content-type']));
        const idx = await haal(APACHE_PORT, '/index.html', Object.assign({ Accept: 'text/markdown' }, H));
        check('F7: /index.html werkt hetzelfde', /^text\/markdown/.test(idx.headers['content-type']));
        const priv = await haal(APACHE_PORT, '/privacy.html', Object.assign({ Accept: 'text/markdown' }, H));
        check('F8: andere pagina\'s negeren de header en blijven HTML', /text\/html/.test(priv.headers['content-type']) && !priv.headers.link);
        const llm = await haal(APACHE_PORT, '/llms.txt', H);
        check('F9: llms.txt komt als tekst met UTF-8', /^text\/plain; charset=utf-8/i.test(llm.headers['content-type']));
        // Bestanden met een hash in de naam mogen een jaar bewaard worden; zonder hash niet.
        const hashJs = (browser.body.match(/src="(assets\/app\.[0-9a-f]{10}\.js)"/) || [])[1];
        const hashCss = (browser.body.match(/href="(assets\/site\.[0-9a-f]{10}\.css)"/) || [])[1];
        if (hashJs && hashCss) {
          const js = await haal(APACHE_PORT, '/' + hashJs, H);
          const cs = await haal(APACHE_PORT, '/' + hashCss, H);
          check('F11: de JavaScript met hash in de naam wordt als JavaScript geserveerd en een jaar bewaard',
            js.status === 200 && /javascript/.test(js.headers['content-type']) && /max-age=31536000/.test(js.headers['cache-control'] || '') && /immutable/.test(js.headers['cache-control'] || ''),
            js.headers['content-type'] + ' | ' + js.headers['cache-control']);
          check('F12: de CSS met hash idem', cs.status === 200 && /text\/css/.test(cs.headers['content-type']) && /immutable/.test(cs.headers['cache-control'] || ''), cs.headers['content-type'] + ' | ' + cs.headers['cache-control']);
          const zonder = await haal(APACHE_PORT, '/assets/brand-theme.css', H);
          check('F13: assets/brand-theme.css (zonder hash, voor de bijpagina\'s) wordt NIET een jaar bewaard', zonder.status === 200 && !/immutable/.test(zonder.headers['cache-control'] || ''), zonder.headers['cache-control']);
        } else {
          console.log('ℹ️  F11-F13 overgeslagen: de index.html in ' + ROOT + ' verwijst niet naar css/js met een hash (de bron, niet de uitgeleverde bouw).');
        }
        const plain = await haal(APACHE_PORT, '/', {});
        check('F10: zonder https-header blijft de doorverwijzing naar https werken (bestaand gedrag)',
          plain.status === 301 && /^https:\/\//.test(plain.headers.location || ''), plain.status + ' ' + (plain.headers.location || ''));
      }
    } finally {
      spawnSync(A.bin, ['-f', A.cf, '-k', 'stop']);
      await sleep(300);
      try { fs.rmSync(A.dir, { recursive: true, force: true }); } catch (e) { /* tijdelijke map */ }
    }
  }

  // ========================================================= G. WebMCP
  console.log('\n--- G: WebMCP ---');
  await new Promise((r) => web.listen(WEB_PORT, r));
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/';
  const browser = await chromium.launch({
    executablePath: findExecutable(),
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const errs = [];
  try {
    // G0: zonder WebMCP-API gebeurt er niets raars
    {
      const p = await (await browser.newContext()).newPage();
      p.on('pageerror', (e) => errs.push('ZONDER-API: ' + e.message));
      await p.goto(BASE); await sleep(700);
      check('G0: zonder navigator.modelContext laadt de pagina gewoon (geen fouten)', (await p.title()).length > 0 && errs.length === 0);
      await p.close();
    }
    // G1..: met een nagebootste API die de geregistreerde tools bewaart
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      window.__tools = [];
      Object.defineProperty(navigator, 'modelContext', {
        value: { registerTool(t) { window.__tools.push(t); } }, configurable: true,
      });
      // Tel elke aanvraag voor camera of microfoon, zodat te zien is of een tool er een start.
      window.__gum = 0;
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = function (c) { window.__gum++; return g(c); };
      }
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push('MET-API: ' + e.message));
    await p.goto(BASE); await sleep(800);
    const info = await p.evaluate(() => window.__tools.map((t) => ({
      name: t.name, beschrijving: t.description, props: Object.keys((t.inputSchema && t.inputSchema.properties) || {}),
      heeftExecute: typeof t.execute === 'function', schemaType: t.inputSchema && t.inputSchema.type,
    })));
    check('G1: de pagina registreert tools bij het laden', info.length >= 3, info.map((t) => t.name).join(', '));
    check('G2: elke tool heeft naam, beschrijving, inputSchema en execute',
      info.every((t) => t.name && t.beschrijving && t.beschrijving.length > 30 && t.schemaType === 'object' && t.heeftExecute));
    const gevoelig = info.filter((t) => /start|baby|camera|micro|code|token|room|join|connect/i.test(t.name) || t.props.some((x) => /code|token|room/i.test(x)));
    check('G3: GEEN tool die een eenheid start, verbindt, of een code/token leest of invult', gevoelig.length === 0,
      gevoelig.map((t) => t.name).join(', ') || 'ingangen: ' + [...new Set(info.flatMap((t) => t.props))].join(', '));
    // Bestaat de tool niet, dan komt er een herkenbare tekst terug en falen de controles
    // eronder netjes, in plaats van dat de hele suite crasht.
    const roep = (naam, args) => p.evaluate(([n, a]) => {
      const t = window.__tools.find((x) => x.name === n);
      return t ? t.execute(a) : { content: [{ type: 'text', text: '(tool "' + n + '" bestaat niet)' }] };
    }, [naam, args]);
    const tekstVan = (r) => r.content.map((c) => c.text).join('\n');

    const ai = tekstVan(await roep('get_app_info', {}));
    check('G4: get_app_info legt uit wat de app is', /free baby monitor/i.test(ai) && /https/.test(ai));
    check('G5: en zegt dat codes nooit worden prijsgegeven', /never reveals room codes/i.test(ai));
    check('G6: bevat geen kamercode of token', !/\b[A-Z0-9]{6}\b\.[a-f0-9]{16,}/.test(ai));
    const ro = await p.evaluate(() => { const t = window.__tools.find((x) => x.name === 'get_app_info'); return t && t.annotations; });
    check('G7: get_app_info is als alleen-lezen gemarkeerd', ro && ro.readOnlyHint === true);

    await roep('set_language', { language: 'nl' });
    await sleep(200);
    check('G8: set_language wisselt de taal van de pagina', (await p.evaluate(() => document.documentElement.lang)) === 'nl');
    const onbekend = tekstVan(await roep('set_language', { language: 'xx' }));
    check('G9: een onbekende taal wordt netjes geweigerd, de taal blijft', /Unknown language/.test(onbekend) && (await p.evaluate(() => document.documentElement.lang)) === 'nl');

    const ouder = tekstVan(await roep('show_parent_screen', {}));
    await sleep(300);
    const scherm = await p.evaluate(() => { const e = document.getElementById('screenPairParent'); return !!e && !e.classList.contains('hidden'); });
    check('G10: show_parent_screen toont het ouderscherm', scherm, ouder);
    const camera = await p.evaluate(() => window.__gum || 0);
    check('G11: en start geen camera of microfoon', camera === 0);
    const dubbel = tekstVan(await roep('show_parent_screen', {}));
    check('G12: nogmaals aanroepen verandert niets en zegt dat', /already active/.test(dubbel));

    const urlVoor = p.url();
    const geweigerd = tekstVan(await roep('open_info_page', { page: 'privacy' }));
    await sleep(500);
    check('G13: open_info_page weigert zolang een eenheid actief is, en blijft op de pagina',
      /would stop the monitoring/.test(geweigerd) && p.url() === urlVoor, geweigerd.slice(0, 80));

    // Vanaf het startscherm wél
    const p2 = await ctx.newPage();
    await p2.goto(BASE); await sleep(600);
    await p2.evaluate(() => { const t = window.__tools.find((x) => x.name === 'open_info_page'); return t && t.execute({ page: 'about' }); });
    await p2.waitForURL('**/about.html', { timeout: 6000 }).catch(() => {});
    check('G14: open_info_page opent vanaf het startscherm de gevraagde pagina', /\/about\.html$/.test(p2.url()), p2.url());
    const onbekendP = await roep('open_info_page', { page: 'admin' });
    check('G15: een onbekende pagina wordt geweigerd', /Unknown page/.test(tekstVan(onbekendP)));

    // Koppen zien er nog hetzelfde uit: 22 px, vet, geen marge (de zes die van h1 naar h2 gingen)
    const p3 = await (await browser.newContext()).newPage();
    await p3.goto(BASE); await sleep(500);
    const koppen = await p3.evaluate(() => [...document.querySelectorAll('.pair-head h2, .dash-title h2, .browser-block h2')].map((el) => {
      const cs = getComputedStyle(el); return { fs: cs.fontSize, fw: cs.fontWeight, mt: cs.marginTop, mb: cs.marginBottom, kleur: cs.color };
    }));
    // Zes in de bron; in de draaiende pagina haalt de app het blok "onbeveiligd
    // adres" zelf uit de DOM als het adres wél veilig is, dus daar zijn het er vijf.
    const bron = (index.match(/<h2[^>]*data-i18n="(pairBabyTitle|pairParentTitle|parentUnit|babyUnit|unsupportedTitle|insecureTitle)"/g) || []).length;
    check('G16: de zes omgezette koppen staan als h2 in de bron, vijf in de draaiende pagina', bron === 6 && koppen.length === 5, bron + ' in de bron, ' + koppen.length + ' draaiend');
    check('G17: en zien er hetzelfde uit: 22px, vet, geen marge (blokkade: 12px onder), marineblauw',
      koppen.every((k) => k.fs === '22px' && Number(k.fw) >= 700 && k.mt === '0px' && k.kleur === 'rgb(12, 47, 99)' && (k.mb === '0px' || k.mb === '12px')),
      JSON.stringify(koppen[0]));
    const nu = await p3.evaluate(() => document.querySelectorAll('h1').length);
    check('G18: ook in de draaiende pagina is er precies één <h1>', nu === 1, nu + '');
  } finally {
    await browser.close();
    web.close();
  }

  check('G19: geen pagina-fouten', errs.length === 0, errs.join(' | '));
  console.log('\nRESULTAAT: ' + (fail ? 'MISLUKT' : 'GESLAAGD'));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Testfout:', e); process.exit(1); });
