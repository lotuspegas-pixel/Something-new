'use strict';
/**
 * Mediaverbinding-test.
 *
 * Gemeld geval: "verbinding gelegd, maar beeld en geluid niet te zien of te
 * horen". Het datakanaal en de beeld/geluid-verbinding zijn twee LOSSE
 * verbindingen. Lukt de eerste wel en de tweede niet, dan meldde de app zich
 * verbonden en bleef daarna eeuwig een rondje draaien: de hartslag kijkt
 * alleen naar het datakanaal en zag dus niets mis.
 *
 * Deze test saboteert gericht de eerste media-oproep en controleert dat de
 * ouderunit dat merkt, de babyunit om een nieuwe oproep vraagt, en dat het
 * beeld daarna alsnog binnenkomt.
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const { PeerServer } = require('peer');

const ROOT = path.join(__dirname, '..', 'serverless');
const WEB_PORT = Number(process.env.WEB_PORT || 8788);
const PEER_PORT = Number(process.env.PEER_PORT || 9788);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.mp4':'video/mp4','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.txt':'text/plain','.xml':'application/xml','.woff2':'font/woff2' };
const web = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); } });
});
function findExecutable() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try { for (const d of fs.readdirSync(base)) { if (!d.startsWith('chromium-')) continue; const p = path.join(base, d, 'chrome-linux', 'chrome'); if (fs.existsSync(p)) return p; } } catch (e) {}
  return undefined;
}

(async () => {
  PeerServer({ port: PEER_PORT, path: '/', host: '127.0.0.1' });
  await new Promise((r) => web.listen(WEB_PORT, r));
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/';
  // De EERSTE media-oproep van de babyunit laten mislukken: peer.call geeft
  // dan een oproep terug die nooit een stream oplevert. Dat is precies wat er
  // gebeurt als de ICE-onderhandeling van de mediaverbinding faalt terwijl het
  // datakanaal het wél doet.
  const SABOTAGE = `
    window.__callPogingen = 0;
    window.__saboteerEersteCall = true;
    (function () {
      const origPeer = window.Peer;
      Object.defineProperty(window, 'Peer', {
        configurable: true,
        get() { return origPeer; },
        set(v) { /* niets */ },
      });
    })();
  `;
  const INIT_BABY = `
    window.BABYFOON_PEER = { host: '127.0.0.1', port: ${PEER_PORT}, path: '/', key: 'peerjs', secure: false };
    window.BABYFOON_MEDIA_WACHT = 4000;
  `;
  const INIT_PARENT = INIT_BABY;

  const browser = await chromium.launch({
    executablePath: findExecutable(), headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  let fail = false;
  const check = (n, c) => { console.log((c ? '✅' : '❌') + ' ' + n); if (!c) fail = true; };
  const errs = [];
  const mkBaby = async () => { const c = await browser.newContext({ permissions: ['camera','microphone'] }); await c.addInitScript(INIT_BABY); return c; };
  const mkPar  = async () => { const c = await browser.newContext({ permissions: ['camera','microphone'] }); await c.addInitScript(INIT_PARENT); return c; };

  const baby = await (await mkBaby()).newPage();
  baby.on('pageerror', (e) => errs.push('BABY: ' + e.message));
  await baby.goto(BASE); await sleep(500);
  // Sabotage aanbrengen VÓÓR het starten: de eerste peer.call levert een
  // oproep op waarvan we de onderliggende verbinding meteen dichtgooien.
  await baby.evaluate(() => {
    window.__callN = 0;
    const wrap = () => {
      if (!window.Peer || window.Peer.__gewrapt) return;
      const O = window.Peer;
      const W = function (...a) {
        const p = new O(...a);
        const origCall = p.call.bind(p);
        p.call = function (id, stream, opts) {
          window.__callN++;
          const c = origCall(id, stream, opts);
          if (window.__callN === 1 && c && c.peerConnection) {
            // eerste oproep saboteren: mediaverbinding meteen sluiten
            try { c.peerConnection.close(); } catch (e) {}
          }
          return c;
        };
        return p;
      };
      W.__gewrapt = true;
      W.prototype = O.prototype;
      window.Peer = W;
    };
    wrap();
  });
  await baby.click('#pickBaby');
  let code = '';
  for (let i = 0; i < 40; i++) { code = await baby.$eval('#babyCodeText', (e) => e.textContent.trim()).catch(() => ''); if (/^[A-Z0-9]{6}$/.test(code)) break; await sleep(300); }
  check('Babyunit gestart, code ' + code, /^[A-Z0-9]{6}$/.test(code));

  const parent = await (await mkPar()).newPage();
  parent.on('pageerror', (e) => errs.push('PARENT: ' + e.message));
  await parent.goto(BASE); await sleep(300);
  await parent.click('#pickParent');
  await parent.fill('#parentOfferInput', code);
  await parent.click('#parentGenBtn');
  for (let i = 0; i < 40; i++) { const v = await baby.evaluate(() => { const b = document.getElementById('babyApproval'); return !!b && !b.classList.contains('hidden'); }); if (v) { await baby.click('#btnApproveYes'); break; } await sleep(250); }

  // Datakanaal moet er wél zijn: de app hoort zich verbonden te melden.
  let dataOk = false;
  for (let i = 0; i < 40; i++) {
    dataOk = await parent.evaluate(() => { const d = document.getElementById('connDot'); return !!d && !d.classList.contains('off'); });
    if (dataOk) break; await sleep(250);
  }
  check('Datakanaal komt tot stand (app meldt zich verbonden)', dataOk);

  const eerste = await parent.$eval('#video', (v) => v.videoWidth || 0).catch(() => 0);
  check('Eerste media-oproep is inderdaad mislukt (' + eerste + 'px)', eerste === 0);

  // Nu het punt van deze test: merkt de ouderunit dit en herstelt het?
  let herstel = 0;
  for (let i = 0; i < 80; i++) {
    herstel = await parent.$eval('#video', (v) => v.videoWidth || 0).catch(() => 0);
    if (herstel > 0) break;
    await sleep(500);
  }
  const pogingen = await baby.evaluate(() => window.__callN || 0);
  check('Ouderunit vraagt om een nieuwe media-oproep (' + pogingen + ' oproepen vanaf de babyunit)', pogingen >= 2);
  check('Beeld komt alsnog binnen na herstel (' + herstel + 'px)', herstel > 0);

  if (errs.length) { console.log('\nPAGINAFOUTEN:\n' + errs.join('\n')); fail = true; } else console.log('\nGEEN PAGINAFOUTEN');
  await browser.close(); web.close();
  console.log('\nRESULTAAT: ' + (fail ? 'MISLUKT' : 'GESLAAGD'));
  process.exit(fail ? 1 : 0);
})();
