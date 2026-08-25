'use strict';

/**
 * End-to-end GIDS-ARTIKEL (blog.html).
 *
 *   npm run test:blogpage
 *
 * De taalkiezer op deze pagina bood 30 talen aan, maar er waren er zeven
 * vertaald; koos je Hindi, dan kreeg je Engels. Een taal aanbieden die
 * daarna Engels blijkt te zijn is erger dan hem weglaten, dus bewaakt deze
 * suite dat alle 30 talen echt vertaald zijn — en dat de opsommingen
 * (stappen, functies, vergelijking, veelgestelde vragen) werkelijk gevuld
 * worden. Een lege lijst valt bij het bekijken niet op, want de kop erboven
 * staat er gewoon.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = process.env.APP_ROOT || path.join(__dirname, '..', 'serverless');
const WEB_PORT = +(process.env.WEB_PORT || 8199);

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain',
};
const web = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.statusCode = 404; return res.end('nf');
  }
  res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
  fs.createReadStream(fp).pipe(res);
});

function findExecutable() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  try {
    for (const dir of fs.readdirSync('/opt/pw-browsers')) {
      if (dir.startsWith('chromium-')) {
        const p = path.join('/opt/pw-browsers', dir, 'chrome-linux', 'chrome');
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (e) { /* map bestaat niet */ }
  return undefined;
}

(async () => {
  await new Promise((r) => web.listen(WEB_PORT, r));
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/blog.html';
  const browser = await chromium.launch({ executablePath: findExecutable(), headless: true });

  let fail = false;
  const errs = [];
  const check = (n, c) => { console.log((c ? '✅' : '❌') + ' ' + n); if (!c) fail = true; };

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await sleep(500);

  const lees = () => page.evaluate(() => {
    const tekst = (s) => { const e = document.querySelector(s); return e ? (e.textContent || '').trim() : ''; };
    const lijst = (s) => Array.prototype.map.call(
      document.querySelectorAll(s), (e) => (e.textContent || '').trim()).filter(Boolean);
    return {
      titel: document.title,
      h1: tekst('h1'),
      lede: tekst('.lede'),
      wifi: tekst('[data-b="wifiP"]'),
      travel: tekst('[data-b="travelP"]'),
      stappen: lijst('#steps li'),
      functies: lijst('#features li'),
      vs: lijst('#vs li'),
      faq: lijst('#faq li'),
      dir: document.documentElement.getAttribute('dir'),
      lang: document.documentElement.getAttribute('lang'),
      secHref: (document.getElementById('secLink') || {}).getAttribute
        ? document.getElementById('secLink').getAttribute('href') : '',
    };
  });

  const talen = await page.evaluate(() => {
    const sel = document.querySelector('select.lang-select');
    return Array.prototype.map.call(sel.options, (o) => o.value);
  });
  check('De taalkiezer biedt 30 talen aan (' + talen.length + ')', talen.length === 30);

  const en = await lees();
  check('Alle opsommingen zijn gevuld (stappen ' + en.stappen.length + ', functies ' +
    en.functies.length + ', vergelijking ' + en.vs.length + ', vragen ' + en.faq.length + ')',
    en.stappen.length === 3 && en.functies.length === 12 && en.vs.length === 6 && en.faq.length === 6);

  const RTL = ['ar', 'ur', 'fa'];
  const nietVertaald = [];
  const leeg = [];
  const rtlFout = [];
  for (const code of talen) {
    await page.selectOption('select.lang-select', code);
    await sleep(60);
    const d = await lees();
    if (code !== 'en') {
      const zelfde = [
        d.titel === en.titel, d.h1 === en.h1, d.lede === en.lede,
        d.wifi === en.wifi, d.travel === en.travel,
        d.stappen.join('|') === en.stappen.join('|'),
        d.functies.join('|') === en.functies.join('|'),
        d.vs.join('|') === en.vs.join('|'),
        d.faq.join('|') === en.faq.join('|'),
      ].filter(Boolean).length;
      if (zelfde > 0) nietVertaald.push(code + ' (' + zelfde + ' velden gelijk aan Engels)');
    }
    const vol = d.h1 && d.lede && d.wifi.length > 200 && d.travel.length > 150 &&
      d.stappen.length === 3 && d.functies.length === 12 && d.vs.length === 6 && d.faq.length === 6;
    if (!vol) leeg.push(code);
    const hoortRtl = RTL.indexOf(code) >= 0;
    if (hoortRtl !== (d.dir === 'rtl')) rtlFout.push(code + ' dir=' + d.dir);
    if (d.lang !== code) rtlFout.push(code + ' lang=' + d.lang);
  }
  check('Geen enkele taal valt terug op de Engelse tekst' +
    (nietVertaald.length ? ' — ' + nietVertaald.join(', ') : ''), nietVertaald.length === 0);
  check('Alle 30 talen tonen een volledig artikel' +
    (leeg.length ? ' — onvolledig: ' + leeg.join(', ') : ''), leeg.length === 0);
  check('Leesrichting en lang-attribuut kloppen per taal' +
    (rtlFout.length ? ' — ' + rtlFout.join(', ') : ''), rtlFout.length === 0);

  await page.selectOption('select.lang-select', 'de');
  await sleep(60);
  const de = await lees();
  check('Link naar het veiligheidsartikel houdt de taal vast (' + de.secHref + ')',
    de.secHref === 'security.html?lang=de');
  await ctx.close();

  const slecht = [];
  for (let w = 320; w <= 1440; w += 20) {
    const c2 = await browser.newContext({ viewport: { width: w, height: 800 } });
    const p2 = await c2.newPage();
    p2.on('pageerror', (e) => errs.push(e.message));
    await p2.goto(BASE, { waitUntil: 'load' });
    await sleep(80);
    const m = await p2.evaluate(() => ({
      pagina: document.documentElement.scrollWidth, venster: window.innerWidth,
    }));
    if (m.pagina > m.venster + 1) slecht.push(w + 'px (' + m.pagina + ' > ' + m.venster + ')');
    await c2.close();
  }
  check('Geen horizontale overloop tussen 320 en 1440 px' +
    (slecht.length ? ' — ' + slecht.slice(0, 5).join(', ') : ''), slecht.length === 0);

  if (errs.length) { console.log('\nPAGINAFOUTEN:\n' + errs.join('\n')); fail = true; } else console.log('\nGEEN PAGINAFOUTEN');
  await browser.close(); web.close();
  console.log('\nRESULTAAT: ' + (fail ? 'MISLUKT' : 'GESLAAGD'));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Testfout:', e); process.exit(1); });
