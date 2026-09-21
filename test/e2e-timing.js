'use strict';

/**
 * End-to-end TIJDMETING: hoe snel is er beeld na het scannen van de QR?
 *
 * Meldpunt van de gebruiker: "vroeger was je meteen binnen, nu duurt het 3 à 5
 * seconden voordat er beeld komt." De oorzaak was dat de ouderunit eerst de
 * terugpraat-microfoon opvroeg (`getUserMedia`) en pas dáárna begon te
 * verbinden. Op een telefoon kost dat 1–3 seconden waarin er niets gebeurt.
 *
 * Deze test meet met de trace-marks uit `js/app.js` (aan via
 * `window.BABYFOON_TRACE`) hoe lang elke stap duurt en faalt als het weer
 * misgaat. Drie scenario's:
 *
 *   A. QR-koppeling zonder kunstmatige vertraging → tijd tot de eerste pixels
 *      moet onder de drempel blijven; de volledige tijdlijn wordt geprint.
 *   B. Telefoon-simulatie: `getUserMedia` duurt expres 9 seconden. Het beeld
 *      moet er ver vóór de microfoon zijn. Dit is de eigenlijke regressietest
 *      en is ongevoelig voor hoe snel of hoe druk de testmachine is.
 *   C. Beveiliging: een toestel ZONDER token krijgt, zolang er geen
 *      toestemming is gegeven, 0 mediatracks en 0 pixels — de versnelling is
 *      dus niet gekocht met een zwakkere toegangscontrole.
 *
 *   npm run test:timing
 *
 * Let op bij het lezen van de getallen: dit draait tegen een PeerJS-broker op
 * 127.0.0.1 en twee browsers op dezelfde machine. Dat is sneller dan de echte
 * wereld (publieke broker over TLS, wifi/4G, STUN/TURN). De absolute
 * milliseconden zijn dus een ONDERGRENS, geen voorspelling voor een telefoon;
 * de verhouding tussen de stappen — en check B — zijn wél representatief.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { PeerServer } = require('peer');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT = path.join(__dirname, '..', 'serverless');
const WEB_PORT = +(process.env.WEB_PORT || 8166);
const PEER_PORT = +(process.env.PEER_PORT || 9026);
// Drempel voor "tijd tot eerste beeld". Gemeten mediaan met de fix is ~1,2 s
// op een rustige machine; onder zware belasting liep dat op tot ~4 s. 6 s geeft
// daar ruim marge overheen en ligt nog altijd ver onder de 9 s microfoon-
// vertraging uit scenario B, zodat een terugkeer van de regressie altijd faalt.
const MAX_MS = +(process.env.BABYFOON_MAX_MS || 6000);
const MIC_DELAY = +(process.env.BABYFOON_MIC_SIM || 9000);

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
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
  for (const root of ['/opt/pw-browsers']) {
    try {
      for (const dir of fs.readdirSync(root)) {
        if (dir.startsWith('chromium-')) {
          const p = path.join(root, dir, 'chrome-linux', 'chrome');
          if (fs.existsSync(p)) return p;
        }
      }
    } catch (e) { /* map bestaat niet */ }
  }
  return undefined;
}

(async () => {
  PeerServer({ port: PEER_PORT, path: '/', host: '127.0.0.1' });
  await new Promise((r) => web.listen(WEB_PORT, r));
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/';

  const INIT = `
    window.BABYFOON_TRACE = 1;
    window.BABYFOON_PEER = { host: '127.0.0.1', port: ${PEER_PORT}, path: '/', key: 'peerjs', secure: false };
    // Tel elke binnenkomende mediatrack op RTC-niveau. Sterker bewijs dan naar
    // het <video>-element kijken: ook een track die nooit getoond wordt telt mee.
    (function () {
      const O = window.RTCPeerConnection;
      window.__tracks = 0;
      const W = function (...a) {
        const pc = new O(...a);
        pc.addEventListener('track', () => { window.__tracks++; });
        return pc;
      };
      W.prototype = O.prototype;
      window.RTCPeerConnection = W;
    })();
  `;
  // Doet alsof het opvragen van de microfoon net zo traag is als op een telefoon.
  const TRAGE_MIC = `
    (function () {
      const md = navigator.mediaDevices;
      const orig = md.getUserMedia.bind(md);
      md.getUserMedia = (c) => new Promise((res, rej) => {
        setTimeout(() => orig(c).then(res, rej), ${MIC_DELAY});
      });
    })();
  `;

  const browser = await chromium.launch({
    executablePath: findExecutable(),
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required'],
  });
  let fail = false;
  const check = (n, c) => { console.log((c ? '✅' : '❌') + ' ' + n); if (!c) fail = true; };
  const errs = [];
  const mk = async (extra) => {
    const c = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await c.addInitScript(INIT);
    if (extra) await c.addInitScript(extra);
    return c;
  };

  // Start een babyunit en geef code + deeplink terug.
  async function startBaby(label) {
    const ctx = await mk();
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push(label + ': ' + e.message));
    await page.goto(BASE);
    await page.click('#pickBaby');
    let code = '', link = '';
    for (let i = 0; i < 80; i++) {
      const r = await page.evaluate(() => ({
        t: (document.getElementById('babyCodeText').textContent || '').trim(),
        d: (document.getElementById('babyQR').dataset.code) || '',
      })).catch(() => ({ t: '', d: '' }));
      if (/^[A-Z0-9]{6}$/.test(r.t) && r.d) { code = r.t; link = r.d; break; }
      await sleep(100);
    }
    return { ctx, page, code, link };
  }

  // Wacht (in de pagina zelf) op echte pixels en geef de tijdlijn terug.
  async function tijdlijn(page, maxMs) {
    const pixels = await page.evaluate((mx) => new Promise((res) => {
      const v = document.getElementById('video');
      const stop = Date.now() + mx;
      (function loop() {
        if (v && v.videoWidth > 0) return res({ t: Math.round(performance.now()), w: v.videoWidth });
        if (Date.now() > stop) return res({ t: null, w: 0 });
        setTimeout(loop, 15);
      })();
    }), maxMs);
    const marks = await page.evaluate(() => window.BABYFOON_MARKS || []);
    const base = marks.length ? marks[0].t : 0;
    const rel = {};
    marks.forEach((m) => { if (rel[m.name] == null) rel[m.name] = m.t - base; });
    return { rel: rel, pixelsMs: pixels.t == null ? null : pixels.t - base, breedte: pixels.w };
  }
  function printTijdlijn(titel, r) {
    const volgorde = ['connectStart', 'peerOpen', 'connOpen', 'helloSent', 'authOk',
      'callOffer', 'firstTrack', 'firstFrame', 'micReady'];
    console.log('\n   ' + titel);
    console.log('   | stap | ms na start |');
    console.log('   |---|---|');
    volgorde.forEach((k) => {
      if (r.rel[k] != null) console.log('   | ' + k + ' | ' + r.rel[k] + ' |');
    });
    console.log('   | video.videoWidth > 0 | ' + (r.pixelsMs == null ? 'nooit' : r.pixelsMs) + ' |');
  }

  // ============================================ A. QR-koppeling, geen vertraging
  const A = await startBaby('BABY-A');
  check('A: babyunit toont een kamercode ("' + A.code + '")', /^[A-Z0-9]{6}$/.test(A.code));
  const cPA = await mk();
  const pA = await cPA.newPage();
  pA.on('pageerror', (e) => errs.push('OUDER-A: ' + e.message));
  await pA.goto(A.link); // exact wat een gescande QR doet
  const rA = await tijdlijn(pA, 25000);
  printTijdlijn('Tijdlijn A (QR-koppeling, echte getUserMedia)', rA);
  check('A: er komt live beeld bij de ouder (' + rA.breedte + 'px)', rA.breedte > 0);
  check('A: eerste beeld binnen ' + MAX_MS + ' ms (' + rA.pixelsMs + ' ms)',
    rA.pixelsMs != null && rA.pixelsMs < MAX_MS);
  // De toestemmingsronde (hello → authOk) mag geen merkbare kostenpost zijn.
  const authKosten = (rA.rel.authOk != null && rA.rel.helloSent != null)
    ? rA.rel.authOk - rA.rel.helloSent : null;
  check('A: de toegangscontrole kost < 1000 ms (' + authKosten + ' ms)',
    authKosten != null && authKosten < 1000);
  await cPA.close(); await A.ctx.close();

  // ================================ B. trage telefoon-microfoon (regressietest)
  const B = await startBaby('BABY-B');
  const cPB = await mk(TRAGE_MIC);
  const pB = await cPB.newPage();
  pB.on('pageerror', (e) => errs.push('OUDER-B: ' + e.message));
  await pB.goto(B.link);
  const rB = await tijdlijn(pB, 30000);
  printTijdlijn('Tijdlijn B (getUserMedia duurt ' + MIC_DELAY + ' ms)', rB);
  check('B: er komt live beeld bij de ouder (' + rB.breedte + 'px)', rB.breedte > 0);
  // Dit is de kern: de microfoon mag niet vóór het beeld in de weg lopen.
  check('B: beeld is er vóór de microfoon (firstTrack=' + rB.rel.firstTrack +
    ', micReady=' + (rB.rel.micReady == null ? 'nog niet' : rB.rel.micReady) + ')',
    rB.rel.firstTrack != null && (rB.rel.micReady == null || rB.rel.micReady > rB.rel.firstTrack));
  check('B: eerste beeld binnen ' + MAX_MS + ' ms ondanks trage microfoon (' + rB.pixelsMs + ' ms)',
    rB.pixelsMs != null && rB.pixelsMs < MAX_MS);
  // En terugpraten moet daarna gewoon werken, ook al kwam de microfoon later.
  await pB.click('#btnTalk');
  let talkOk = false;
  for (let i = 0; i < 80; i++) {
    talkOk = await B.page.evaluate(() => {
      const a = document.getElementById('talkbackAudio');
      return !!(a && a.srcObject && a.srcObject.getAudioTracks().length > 0);
    }).catch(() => false);
    if (talkOk) break;
    await sleep(250);
  }
  check('B: terugpraten werkt nog nadat de microfoon later binnenkwam', talkOk);
  await cPB.close(); await B.ctx.close();

  // ============================== C. geen token, geen toestemming → geen media
  const C = await startBaby('BABY-C');
  const cPC = await mk();
  const pC = await cPC.newPage();
  pC.on('pageerror', (e) => errs.push('OUDER-C: ' + e.message));
  await pC.goto(BASE);
  await pC.click('#pickParent');
  await pC.fill('#parentOfferInput', C.code); // alleen de code, géén token
  await pC.click('#parentGenBtn');
  let gevraagd = false;
  for (let i = 0; i < 80; i++) {
    gevraagd = await C.page.evaluate(() => {
      const b = document.getElementById('babyApproval');
      return !!b && !b.classList.contains('hidden');
    }).catch(() => false);
    if (gevraagd) break;
    await sleep(150);
  }
  check('C: babyunit vraagt toestemming voor een onbekend toestel', gevraagd);
  // Ruim de tijd geven: als er ergens media zou lekken, is dat nu zichtbaar.
  await sleep(3000);
  const lek = await pC.evaluate(() => {
    const v = document.getElementById('video');
    return {
      tracks: window.__tracks || 0,
      elTracks: (v && v.srcObject && v.srcObject.getTracks().length) || 0,
      w: (v && v.videoWidth) || 0,
    };
  });
  check('C: 0 mediatracks vóór goedkeuring (' + lek.tracks + ')', lek.tracks === 0);
  check('C: 0 pixels vóór goedkeuring (' + lek.w + 'px, ' + lek.elTracks + ' tracks op <video>)',
    lek.w === 0 && lek.elTracks === 0);
  // Weigeren → nog steeds niets.
  await C.page.click('#btnApproveNo');
  await sleep(2000);
  const naWeigeren = await pC.evaluate(() => {
    const v = document.getElementById('video');
    return { tracks: window.__tracks || 0, w: (v && v.videoWidth) || 0 };
  });
  check('C: na weigeren nog steeds 0 tracks en 0 pixels',
    naWeigeren.tracks === 0 && naWeigeren.w === 0);
  await cPC.close(); await C.ctx.close();

  await browser.close();
  web.close();
  console.log(errs.length ? '\nPAGINAFOUTEN:\n' + errs.join('\n') : '\nGEEN PAGINAFOUTEN');
  console.log('\nRESULTAAT: ' + (fail || errs.length ? 'MISLUKT' : 'GESLAAGD'));
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('Testfout:', e); process.exit(1); });
