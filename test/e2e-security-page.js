'use strict';

/**
 * End-to-end VEILIGHEIDSARTIKEL (security.html).
 *
 *   npm run test:securitypage
 *
 * Wat hier bewaakt wordt:
 *
 *   1. De pagina laadt zonder paginafouten en toont echte inhoud.
 *   2. Ze is in ALLE 30 talen leesbaar. Dat is de eigenlijke opdracht: de
 *      taalkiezer biedt 30 talen aan, dus een taal kiezen en dan Engels
 *      krijgen is geen vertaling maar een belofte die niet wordt waargemaakt.
 *      Daarom per taal: geen enkele tekst mag gelijk zijn aan het Engels.
 *   3. De opsommingen (stappen, lagen, veelgestelde vragen) worden werkelijk
 *      opgebouwd — een lege lijst valt bij het bekijken niet op, want de kop
 *      erboven staat er gewoon.
 *   4. Rechts-naar-links-talen zetten dir="rtl".
 *   5. De taalkeuze blijft behouden in de links naar de app en de andere blog.
 *   6. Geen overloop tussen 320 en 1440 px.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = process.env.APP_ROOT || path.join(__dirname, '..', 'serverless');
const WEB_PORT = +(process.env.WEB_PORT || 8197);

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
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/security.html';
  const browser = await chromium.launch({ executablePath: findExecutable(), headless: true });

  let fail = false;
  const errs = [];
  const check = (n, c) => { console.log((c ? '✅' : '❌') + ' ' + n); if (!c) fail = true; };

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE, { waitUntil: 'load' });
  await sleep(500);

  // Leest de zichtbare inhoud van de pagina uit.
  const lees = () => page.evaluate(() => {
    const tekst = (s) => { const e = document.querySelector(s); return e ? (e.textContent || '').trim() : ''; };
    const lijst = (s) => Array.prototype.map.call(
      document.querySelectorAll(s), (e) => (e.textContent || '').trim()).filter(Boolean);
    return {
      titel: document.title,
      h1: tekst('h1'),
      lede: tekst('.lede'),
      kaart: lijst('#cardList li'),
      stappen: lijst('#steps li'),
      lagen: lijst('#layers li'),
      does: lijst('#does li'),
      you: lijst('#you li'),
      faq: lijst('#faq li'),
      notice: tekst('#notice'),
      dir: document.documentElement.getAttribute('dir'),
      lang: document.documentElement.getAttribute('lang'),
      ctaHref: (document.getElementById('ctaLink') || {}).getAttribute
        ? document.getElementById('ctaLink').getAttribute('href') : '',
      blogHref: (document.getElementById('blogLink') || {}).getAttribute
        ? document.getElementById('blogLink').getAttribute('href') : '',
    };
  });

  const talen = await page.evaluate(() => {
    const sel = document.querySelector('select.lang-select');
    return Array.prototype.map.call(sel.options, (o) => ({ code: o.value, naam: o.textContent }));
  });
  check('De taalkiezer biedt 30 talen aan (' + talen.length + ')', talen.length === 30);

  const en = await lees();
  check('Engelse pagina heeft een kop en inleiding', en.h1.length > 20 && en.lede.length > 60);
  check('Alle opsommingen zijn gevuld (kaart ' + en.kaart.length + ', stappen ' + en.stappen.length +
    ', lagen ' + en.lagen.length + ', does ' + en.does.length + ', you ' + en.you.length +
    ', faq ' + en.faq.length + ')',
    en.kaart.length === 3 && en.stappen.length === 4 && en.lagen.length === 4 &&
    en.does.length === 3 && en.you.length === 3 && en.faq.length === 4);
  check('De eerlijke kanttekening over WhatsApp staat er', /WhatsApp/.test(en.notice));

  // ---- alle 30 talen ----------------------------------------------------
  const RTL = ['ar', 'ur', 'fa'];
  const nietVertaald = [];
  const leeg = [];
  const rtlFout = [];
  for (const t of talen) {
    // Via de echte taalkiezer, niet via een achterdeur: zo wordt het
    // besturingselement zelf meegetest.
    await page.selectOption('select.lang-select', t.code);
    await sleep(60);
    const d = await lees();
    if (t.code !== 'en') {
      // Elk van deze velden moet écht anders zijn dan het Engels. Eén gelijk
      // veld kan toeval zijn (een merknaam), meerdere betekent terugval.
      const zelfde = [
        d.titel === en.titel, d.h1 === en.h1, d.lede === en.lede,
        d.stappen.join('|') === en.stappen.join('|'),
        d.faq.join('|') === en.faq.join('|'),
        d.notice === en.notice,
      ].filter(Boolean).length;
      if (zelfde > 0) nietVertaald.push(t.code + ' (' + zelfde + ' velden gelijk aan Engels)');
    }
    const vol = d.h1 && d.lede && d.kaart.length === 3 && d.stappen.length === 4 &&
      d.lagen.length === 4 && d.does.length === 3 && d.you.length === 3 &&
      d.faq.length === 4 && d.notice.length > 60;
    if (!vol) leeg.push(t.code);
    const hoortRtl = RTL.indexOf(t.code) >= 0;
    if (hoortRtl !== (d.dir === 'rtl')) rtlFout.push(t.code + ' dir=' + d.dir);
    if (d.lang !== t.code) rtlFout.push(t.code + ' lang=' + d.lang);
  }
  check('Geen enkele taal valt terug op de Engelse tekst' +
    (nietVertaald.length ? ' — ' + nietVertaald.join(', ') : ''), nietVertaald.length === 0);
  check('Alle 30 talen tonen een volledig artikel' +
    (leeg.length ? ' — onvolledig: ' + leeg.join(', ') : ''), leeg.length === 0);
  check('Leesrichting en lang-attribuut kloppen per taal' +
    (rtlFout.length ? ' — ' + rtlFout.join(', ') : ''), rtlFout.length === 0);

  // ---- taalkeuze blijft behouden in de links ----------------------------
  await page.selectOption('select.lang-select', 'de');
  await sleep(60);
  const de = await lees();
  check('Link naar de app houdt de taal vast (' + de.ctaHref + ')', de.ctaHref === './?lang=de');
  check('Link naar de andere blog houdt de taal vast (' + de.blogHref + ')',
    de.blogHref === 'blog.html?lang=de');
  await ctx.close();

  // ---- doorlopende breedtesweep ----------------------------------------
  const slecht = [];
  for (let w = 320; w <= 1440; w += 20) {
    const c2 = await browser.newContext({ viewport: { width: w, height: 800 } });
    const p2 = await c2.newPage();
    p2.on('pageerror', (e) => errs.push(e.message));
    await p2.goto(BASE, { waitUntil: 'load' });
    await sleep(80);
    const m = await p2.evaluate(() => ({
      pagina: document.documentElement.scrollWidth,
      venster: window.innerWidth,
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
