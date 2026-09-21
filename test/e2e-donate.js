'use strict';

/**
 * End-to-end DONATIES: de knop in de bovenbalk die naar Stripe leidt.
 *
 *   npm run test:donate
 *
 * Wat hier bewaakt wordt:
 *
 *   1. Zonder ingevulde betaallink blijft de knop VERBORGEN. Een donatieknop
 *      die naar een dode pagina leidt kost meer vertrouwen dan hij oplevert,
 *      en dit is precies het geval dat je bij een upload vergeet.
 *   2. Mét betaallink verschijnt de knop en wijst hij naar die link.
 *   3. De taal van de betaalpagina volgt de taal van de site, maar alleen
 *      voor talen die Stripe kent. Een onbekende locale meesturen laat de
 *      betaalpagina struikelen op het moment dat iemand wíl doneren.
 *   4. Label en schermlezer-naam zijn vertaald — het label valt op smalle
 *      telefoons weg, dus zonder aria-label is de knop daar naamloos.
 *   5. De bovenbalk loopt nergens over tussen 320 en 1440 px. De taalkeuze
 *      liep eerder tussen 361 en 390 px buiten beeld door de extra knop;
 *      daarom een doorlopende sweep en geen paar lievelingsbreedtes.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ROOT = process.env.APP_ROOT || path.join(__dirname, '..', 'serverless');
const WEB_PORT = +(process.env.WEB_PORT || 8187);

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain',
};
// De betaallink wordt in index.html op één regel gezet. Die regel vullen we
// hier in — precies zoals de eigenaar dat doet — in plaats van de waarde er
// achteraf in te injecteren: dan zou de test het echte mechanisme overslaan.
// Bewust een patroon en geen letterlijke regel: de eigenaar vult hier zijn
// echte betaallink in, en dan moet deze test nog steeds beide standen kunnen
// zetten — mét link én zonder.
const CONFIG_PATROON = /window\.BABYFOON_DONATE_URL\s*=\s*'([^']*)';/g;
let donatieLink = '';

// In index.html staat dezelfde regel twee keer: één keer als voorbeeld in het
// uitleg-commentaar erboven, en daarna de echte. De eerste treffer pakken gaf
// een test die stilletjes niets deed — het voorbeeld werd vervangen en de
// echte regel bleef staan. Daarom expliciet de LAATSTE treffer.
function vervangConfig(html, waarde) {
  const treffers = html.match(CONFIG_PATROON);
  if (!treffers || !treffers.length) return null;
  const laatste = treffers[treffers.length - 1];
  const pos = html.lastIndexOf(laatste);
  return html.slice(0, pos) +
    "window.BABYFOON_DONATE_URL = '" + waarde + "';" +
    html.slice(pos + laatste.length);
}
function leesConfig(html) {
  const treffers = html.match(CONFIG_PATROON);
  if (!treffers || !treffers.length) return '';
  return treffers[treffers.length - 1].replace(/.*'([^']*)'.*/, '$1');
}
const web = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.statusCode = 404; return res.end('nf');
  }
  res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
  if (p === '/index.html') {
    const html = vervangConfig(fs.readFileSync(fp, 'utf8'), donatieLink);
    if (html === null) {
      res.statusCode = 500;
      return res.end('CONFIGREGEL_NIET_GEVONDEN');
    }
    return res.end(html);
  }
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

const LINK = 'https://donate.stripe.com/test_abc123';

(async () => {
  await new Promise((r) => web.listen(WEB_PORT, r));
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/';
  const browser = await chromium.launch({
    executablePath: findExecutable(),
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });

  let fail = false;
  const errs = [];
  const check = (n, c) => { console.log((c ? '✅' : '❌') + ' ' + n); if (!c) fail = true; };

  // Opent de pagina; `link` leeg laten = niets ingevuld (de stand waarin de
  // site wordt uitgeleverd). `taal` zet de sitetaal vóór het laden.
  async function open(link, taal) {
    donatieLink = link || '';
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript((a) => {
      if (a.taal) { try { localStorage.setItem('babyfoon.lang', a.taal); } catch (e) {} }
    }, { taal: taal || '' });
    await page.goto(BASE, { waitUntil: 'load' });
    await sleep(700);
    return { ctx, page };
  }

  const lees = (page) => page.evaluate(() => {
    const e = document.getElementById('donateBtn');
    if (!e) return null;
    const label = e.querySelector('.bp-donate-label');
    return {
      verborgen: e.classList.contains('hidden'),
      zichtbaar: e.getBoundingClientRect().width > 0,
      href: e.getAttribute('href') || '',
      aria: e.getAttribute('aria-label') || '',
      titel: e.getAttribute('title') || '',
      label: label ? (label.textContent || '').trim() : '',
      blank: e.getAttribute('target') === '_blank',
      noopener: (e.getAttribute('rel') || '').indexOf('noopener') >= 0,
    };
  });

  // ---------------------------------------------------------------- 0
  // De site zoals hij wordt uitgeleverd hoort een ingevulde betaallink te
  // hebben. Zonder deze controle merk je pas ná het uploaden dat de knop
  // ontbreekt, en dan mist er stilletjes een donatiemogelijkheid.
  const ingevuld = leesConfig(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
  check('De uitgeleverde site heeft een ingevulde Stripe-betaallink (' +
    (ingevuld || 'LEEG') + ')', /^https:\/\/(donate|buy)\.stripe\.com\/.+/.test(ingevuld));

  // ---------------------------------------------------------------- 1
  let s = await open('', '');
  let d = await lees(s.page);
  check('De knop staat in de bovenbalk', !!d);
  check('Zonder ingevulde betaallink blijft de knop verborgen',
    !!d && d.verborgen && !d.zichtbaar);
  await s.ctx.close();

  // ---------------------------------------------------------------- 2
  s = await open(LINK, 'en');
  d = await lees(s.page);
  check('Mét betaallink is de knop zichtbaar', !!d && !d.verborgen && d.zichtbaar);
  check('De knop wijst naar de ingevulde betaallink (' + (d ? d.href : '-') + ')',
    !!d && d.href.indexOf(LINK) === 0);
  check('De betaalpagina opent in een nieuw tabblad, met rel="noopener"',
    !!d && d.blank && d.noopener);
  check('Engels label staat op de knop ("' + (d ? d.label : '-') + '")',
    !!d && d.label === 'Support us');
  await s.ctx.close();

  // ---------------------------------------------------------------- 3
  s = await open(LINK, 'nl');
  d = await lees(s.page);
  check('Nederlands label ("' + (d ? d.label : '-') + '")', !!d && d.label === 'Steun ons');
  check('Stripe krijgt de sitetaal mee voor een taal die Stripe kent (' +
    (d ? d.href.replace(LINK, '…') : '-') + ')', !!d && /[?&]locale=nl(&|$)/.test(d.href));
  check('Schermlezer-naam is vertaald ("' + (d ? d.aria : '-') + '")',
    !!d && d.aria.indexOf('Steun BabyPhone.online') === 0);
  await s.ctx.close();

  // Hindi kent Stripe niet: dan hoort er GEEN locale meegestuurd te worden.
  s = await open(LINK, 'hi');
  d = await lees(s.page);
  check('Hindi label is vertaald ("' + (d ? d.label : '-') + '")',
    !!d && d.label === 'सहयोग करें');
  check('Voor een taal die Stripe niet kent gaat er GEEN locale mee (' +
    (d ? d.href.replace(LINK, '…') : '-') + ')', !!d && d.href.indexOf('locale=') < 0);
  await s.ctx.close();

  // Taal wisselen zonder herladen moet de knop meenemen.
  s = await open(LINK, 'en');
  await s.page.evaluate(() => window.I18n.setLang('de'));
  await sleep(300);
  d = await lees(s.page);
  check('Na wisselen van taal volgt het label ("' + (d ? d.label : '-') + '")',
    !!d && d.label === 'Unterstützen');
  check('Na wisselen van taal volgt ook de locale voor Stripe (' +
    (d ? d.href.replace(LINK, '…') : '-') + ')', !!d && /[?&]locale=de(&|$)/.test(d.href));
  await s.ctx.close();

  // ---------------------------------------------------------------- 4
  // Alle 30 talen hebben een eigen, niet-Engels label waar dat hoort.
  s = await open(LINK, 'en');
  const talen = await s.page.evaluate(() => {
    const uit = [];
    window.I18n.LANGS.forEach((l) => {
      window.I18n.setLang(l.code);
      const el = document.querySelector('#donateBtn .bp-donate-label');
      const knop = document.getElementById('donateBtn');
      uit.push({
        code: l.code,
        label: el ? (el.textContent || '').trim() : '',
        aria: knop ? (knop.getAttribute('aria-label') || '') : '',
      });
    });
    return uit;
  });
  check('Alle 30 talen hebben een label op de knop (' + talen.length + ')',
    talen.length === 30 && talen.every((x) => x.label.length > 0));
  check('Alle 30 talen hebben een schermlezer-naam',
    talen.every((x) => x.aria.length > 0));
  const engels = talen.filter((x) => x.code !== 'en' && x.label === 'Support us');
  check('Geen enkele taal valt stil terug op het Engelse label' +
    (engels.length ? ' (' + engels.map((x) => x.code).join(', ') + ')' : ''),
    engels.length === 0);
  await s.ctx.close();

  // ---------------------------------------------------------------- 5
  // Doorlopende sweep: loopt de bovenbalk ergens over?
  let slecht = [];
  donatieLink = LINK;
  for (let w = 320; w <= 1440; w += 10) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(e.message));
    await page.goto(BASE, { waitUntil: 'load' });
    await sleep(120);
    const m = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect() : null; };
      const pil = r('.lang-pill'), knop = r('.bp-donate');
      return {
        pagina: document.documentElement.scrollWidth,
        venster: window.innerWidth,
        pilRechts: pil ? Math.round(pil.right) : null,
        pilBreed: pil ? Math.round(pil.width) : null,
        knopBreed: knop ? Math.round(knop.width) : 0,
      };
    });
    if (m.pagina > m.venster + 1 || (m.pilRechts !== null && m.pilRechts > m.venster + 1) ||
        (m.pilBreed !== null && m.pilBreed < 40) || m.knopBreed < 30) {
      slecht.push(w + 'px (taalpil tot ' + m.pilRechts + ', knop ' + m.knopBreed + ')');
    }
    await ctx.close();
  }
  check('Bovenbalk loopt nergens over tussen 320 en 1440 px' +
    (slecht.length ? ' — fout bij: ' + slecht.slice(0, 5).join(', ') : ''), slecht.length === 0);

  if (errs.length) { console.log('\nPAGINAFOUTEN:\n' + errs.join('\n')); fail = true; } else console.log('\nGEEN PAGINAFOUTEN');
  await browser.close(); web.close();
  console.log('\nRESULTAAT: ' + (fail ? 'MISLUKT' : 'GESLAAGD'));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Testfout:', e); process.exit(1); });
