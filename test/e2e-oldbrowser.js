'use strict';
/**
 * Oude-browser-test.
 *
 * Waarom dit bestaat: op een iPad met iOS 12 startte de app niet, en de
 * gewone tests zagen daar niets van — Chromium heeft alles wat Safari 12
 * mist. De fouten kwamen dus pas boven water op het toestel van de
 * gebruiker, één per keer.
 *
 * Deze test SLOOPT daarom in de pagina alle DOM- en JS-functies die Safari
 * 12 (iOS 12) niet heeft, en loopt daarna de volledige gebruikersreis door.
 * Elke plek waar de code zo'n functie zonder controle gebruikt, valt hier
 * meteen om — vóór het op een echt toestel gebeurt.
 *
 * Wat dit NIET is: een echte Safari 12. De taalversie (ES2018) wordt door
 * build.js bewaakt met een parser; dit bestand bewaakt de ontbrekende
 * API's. Verschillen in weergave of WebRTC-gedrag vangt geen van beide.
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const { PeerServer } = require('peer');

const ROOT = path.join(__dirname, '..', 'serverless');
const WEB_PORT = Number(process.env.WEB_PORT || 8688);
const PEER_PORT = Number(process.env.PEER_PORT || 9688);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml', '.woff2': 'font/woff2' };
const web = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); }
    else { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); }
  });
});

// Precies wat Safari 12.5 (iOS 12) NIET heeft. Achter elke regel staat de
// Safari-versie waarin het pas verscheen.
const SLOOP = `
(function () {
  function weg(o, k) { try { delete o[k]; } catch (e) { try { o[k] = undefined; } catch (e2) {} } }
  weg(Element.prototype, 'replaceChildren');   // 14
  weg(DocumentFragment.prototype, 'replaceChildren'); // 14
  weg(Array.prototype, 'at');                  // 15.4
  weg(String.prototype, 'at');                 // 15.4
  weg(Object, 'hasOwn');                       // 15.4
  weg(window, 'structuredClone');              // 15.4
  weg(String.prototype, 'replaceAll');         // 13.1
  weg(Promise, 'any');                         // 14
  weg(Promise, 'allSettled');                  // 13
  weg(window, 'ResizeObserver');               // 13.1
  weg(window, 'MediaRecorder');                // 14.3
  weg(window, 'requestIdleCallback');          // 16
  weg(Intl, 'RelativeTimeFormat');             // 14
  weg(navigator, 'clipboard');                 // 13.1
  weg(navigator, 'wakeLock');                  // 16.4
  if (window.crypto) weg(window.crypto, 'randomUUID');           // 15.4
  if (window.MediaStreamTrack) weg(MediaStreamTrack.prototype, 'getCapabilities'); // 13
  // De Battery Status API bestaat in WebKit helemaal niet. Deze staat op het
  // prototype, dus daar moet hij weg — niet van het navigator-object zelf.
  if (window.Navigator) weg(Navigator.prototype, 'getBattery');
  weg(navigator, 'getBattery');
  // Vastleggen DAT er gesloopt is. De app mag ontbrekende functies zelf
  // aanvullen (dat is precies de bedoeling), dus achteraf meten of ze weg
  // zijn bewijst niets — deze vlag wel.
  window.__oudGesloopt = {
    replaceChildrenWeg: typeof Element.prototype.replaceChildren === 'undefined',
    batterijWeg: !('getBattery' in navigator),
    recorderWeg: typeof window.MediaRecorder === 'undefined'
  };
})();
`;


// Zelfde aanpak als de andere tests: gebruik de Chromium die in deze omgeving
// al klaarstaat, in plaats van er een te downloaden.
function findExecutable() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base)) {
      if (!d.startsWith('chromium-')) continue;
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch (e) {}
  return undefined; // laat Playwright zijn eigen browser kiezen
}

(async () => {
  PeerServer({ port: PEER_PORT, path: '/', host: '127.0.0.1' });
  await new Promise((r) => web.listen(WEB_PORT, r));
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/';
  const INIT = SLOOP + `
    window.BABYFOON_PEER = { host: '127.0.0.1', port: ${PEER_PORT}, path: '/', key: 'peerjs', secure: false };
    window.BABYFOON_RECONNECT_DELAYS = [500, 900];
    window.BABYFOON_CONNECT_TIMEOUT = 6000;
    window.BABYFOON_HEARTBEAT_TIMEOUT = 6000;
  `;
  const browser = await chromium.launch({
    executablePath: findExecutable(),
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  let fail = false;
  const check = (n, c) => { console.log((c ? '✅' : '❌') + ' ' + n); if (!c) fail = true; };
  const errs = [];
  const mk = async () => {
    const c = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 1024, height: 768 } });
    await c.addInitScript(INIT);
    return c;
  };

  const baby = await (await mk()).newPage();
  baby.on('pageerror', (e) => errs.push('BABY: ' + e.message));
  await baby.goto(BASE); await sleep(500);

  // De sloop moet echt gelukt zijn, anders bewijst deze test niets.
  const g = await baby.evaluate(() => window.__oudGesloopt || null);
  check('Oude-browser-simulatie actief (' + JSON.stringify(g) + ')',
        !!g && g.replaceChildrenWeg && g.batterijWeg && g.recorderWeg);
  // De app hoort de ontbrekende functie zelf aan te vullen; dat is de fix.
  const aangevuld = await baby.evaluate(() => typeof Element.prototype.replaceChildren === 'function');
  check('App vult replaceChildren zelf aan', aangevuld);

  await baby.click('#pickBaby');
  let code = '';
  for (let i = 0; i < 40; i++) {
    code = await baby.$eval('#babyCodeText', (e) => e.textContent.trim()).catch(() => '');
    if (/^[A-Z0-9]{6}$/.test(code)) break;
    await sleep(300);
  }
  check('Babyunit start en toont een kamercode ("' + code + '")', /^[A-Z0-9]{6}$/.test(code));
  const qr = await baby.evaluate(() => {
    // De koppel-QR staat in #babyQR (op het koppelscherm). #babyDashQR is de
    // tweede QR op het dashboard en is hier nog leeg; dat is normaal.
    const b = document.getElementById('babyQR');
    if (!b) return { gevonden: false };
    const img = b.querySelector('img');
    return { gevonden: true, kinderen: b.children.length, afbeelding: !!img, bron: img ? img.src.slice(0, 22) : '' };
  });
  check('QR-code is opgebouwd via replaceChildren (' + JSON.stringify(qr) + ')',
        qr.gevonden && qr.afbeelding && qr.bron.indexOf('data:image') === 0);

  const parent = await (await mk()).newPage();
  parent.on('pageerror', (e) => errs.push('PARENT: ' + e.message));
  await parent.goto(BASE); await sleep(400);
  await parent.click('#pickParent');
  await parent.fill('#parentOfferInput', code);
  await parent.click('#parentGenBtn');
  let gevraagd = false;
  for (let i = 0; i < 40; i++) {
    const v = await baby.evaluate(() => { const b = document.getElementById('babyApproval'); return !!b && !b.classList.contains('hidden'); });
    if (v) { gevraagd = true; await baby.click('#btnApproveYes'); break; }
    await sleep(250);
  }
  check('Toestemmingsvraag verschijnt en is te bedienen', gevraagd);

  let w = 0;
  for (let i = 0; i < 60; i++) { w = await parent.$eval('#video', (v) => v.videoWidth || 0).catch(() => 0); if (w > 0) break; await sleep(300); }
  check('Ouderunit krijgt live beeld ("' + w + 'px")', w > 0);

  const lijst = await parent.$$eval('#playlist .track', (e) => e.length).catch(() => 0);
  check('Afspeellijst is opgebouwd (' + lijst + ' nummers, gebruikt replaceChildren)', lijst > 0);
  if (lijst) { await parent.evaluate(() => document.querySelector('#playlist .track').click()); await sleep(1000); }

  for (const [naam, sel] of [['Terugpraten', '#btnTalk'], ['Nachtlampje', '#btnNight'], ['Huilalarm', '#btnAlarm']]) {
    const bestaat = await parent.$(sel);
    if (bestaat) { await parent.click(sel).catch(() => {}); await sleep(400); }
    check(naam + ' indrukken geeft geen fout', true);
  }

  // Opnemen bestaat niet op oude iOS: moet netjes melden, niet crashen.
  const rec = await parent.$('#btnRec');
  if (rec) { await parent.click('#btnRec').catch(() => {}); await sleep(600); }
  check('Opnameknop meldt netjes i.p.v. crashen', true);

  await sleep(2500);
  const nogLive = await parent.$eval('#video', (v) => v.videoWidth || 0).catch(() => 0);
  check('Beeld loopt nog steeds ("' + nogLive + 'px")', nogLive > 0);

  const foutbalk = await parent.evaluate(() => { const d = document.getElementById('bootErrorText'); return d ? d.textContent.trim() : ''; })
    .catch(() => '');
  check('Geen opstartfout op het scherm' + (foutbalk ? ': ' + foutbalk.slice(0, 120) : ''), !foutbalk);

  if (errs.length) { console.log('\nPAGINAFOUTEN:\n' + errs.join('\n')); fail = true; }
  else console.log('\nGEEN PAGINAFOUTEN');
  await browser.close(); web.close();
  console.log('\nRESULTAAT: ' + (fail ? 'MISLUKT' : 'GESLAAGD'));
  process.exit(fail ? 1 : 0);
})();
