'use strict';

/**
 * End-to-end test voor de serverloze variant (PeerJS-koppelcode).
 *
 * Volledig zelfvoorzienend: start een lokale statische webserver voor
 * `serverless/` én een lokale PeerJS-broker, en drijft twee browsers
 * (babyunit + ouderunit) door de echte flows:
 *
 *   pairing met korte code → live video → deelweergaven (zijbalk) →
 *   sleep timer → audio-only-sync → muziek over het datakanaal →
 *   batterij-terugkanaal → foutstatus bij verkeerde code →
 *   reconnect-met-backoff en de expliciete faalstatus + retry-knop.
 *
 *   npm run test:serverless
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { PeerServer } = require('peer');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT = path.join(__dirname, '..', 'serverless');
const WEB_PORT = +(process.env.WEB_PORT || 8155);
const PEER_PORT = +(process.env.PEER_PORT || 9015);
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml', '.txt': 'text/plain',
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

// Zoek een bruikbare Chromium (bijv. vooraf geïnstalleerd in de omgeving).
function findExecutable() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const roots = ['/opt/pw-browsers'];
  for (const root of roots) {
    try {
      for (const dir of fs.readdirSync(root)) {
        if (dir.startsWith('chromium-')) {
          const p = path.join(root, dir, 'chrome-linux', 'chrome');
          if (fs.existsSync(p)) return p;
        }
      }
    } catch (e) { /* map bestaat niet */ }
  }
  return undefined; // laat Playwright zijn eigen download gebruiken
}

(async () => {
  PeerServer({ port: PEER_PORT, path: '/', host: '127.0.0.1' });
  await new Promise((r) => web.listen(WEB_PORT, r));
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/';
  // Lokale broker + snelle reconnect-tijden zodat de backoff-test vlot loopt.
  const INIT = `
    window.BABYFOON_PEER = { host: '127.0.0.1', port: ${PEER_PORT}, path: '/', key: 'peerjs', secure: false };
    window.BABYFOON_RECONNECT_DELAYS = [400, 700];
    window.BABYFOON_CONNECT_TIMEOUT = 4000;
    window.BABYFOON_HEARTBEAT_TIMEOUT = 5000;
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
    const c = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await c.addInitScript(INIT);
    return c;
  };

  // ---- BABY ----
  const cB = await mk();
  const baby = await cB.newPage();
  baby.on('pageerror', (e) => errs.push('BABY: ' + e.message));
  await baby.goto(BASE); await sleep(400);
  await baby.click('#pickBaby');
  let code = '';
  for (let i = 0; i < 40; i++) {
    code = await baby.$eval('#babyCodeText', (e) => e.textContent.trim()).catch(() => '');
    if (code && code !== '······' && code.length >= 6) break;
    await sleep(300);
  }
  check('Baby toont korte 6-tekens code ("' + code + '")', /^[A-Z0-9]{6}$/.test(code));

  // ---- OUDER ----
  const cP = await mk();
  const parent = await cP.newPage();
  parent.on('pageerror', (e) => errs.push('PARENT: ' + e.message));
  await parent.goto(BASE); await sleep(300);
  await parent.click('#pickParent');
  await parent.fill('#parentOfferInput', code);
  await parent.click('#parentGenBtn');
  let info = {};
  const t0 = Date.now();
  while (Date.now() - t0 < 25000) {
    info = await parent.evaluate(() => {
      const v = document.getElementById('video');
      return { shown: !document.getElementById('screenParent').classList.contains('hidden'), w: (v && v.videoWidth) || 0 };
    });
    if (info.shown && info.w > 0) break;
    await sleep(400);
  }
  check('Ouder verbindt met de korte code', info.shown);
  check('Live video bij de ouder (' + info.w + 'px)', info.w > 0);
  check('Baby schakelt naar live-scherm', await baby.evaluate(() => !document.getElementById('screenBaby').classList.contains('hidden')));
  check('Kamercode zichtbaar in statusbalk', (await parent.$eval('#roomLabel', (e) => e.textContent.trim())) === code);

  // ---- playlist / besturingskanaal ----
  await sleep(800);
  const titles = await parent.$$eval('#playlist .track .tt', (els) => els.map((e) => e.textContent.trim())).catch(() => []);
  check('Playlist geladen bij de ouder (' + titles.length + ' nummers)', titles.length === 5);
  await parent.evaluate(() => document.querySelector('#playlist .track').click());
  await sleep(1200);
  check('Muziekcommando bereikt de baby via het datakanaal',
    await baby.evaluate(() => { const a = document.getElementById('musicAudio'); return a && !a.paused && /music\//.test(a.src); }));
  await parent.evaluate(() => document.getElementById('btnMusic').click());
  await sleep(600);

  // ---- batterij-terugkanaal ----
  const batt = await parent.$eval('#battVal', (e) => e.textContent.trim()).catch(() => '');
  check('Batterijstatus van de baby zichtbaar ("' + batt + '")', batt.length > 0 && batt !== '—');

  // ---- zijbalk: echte deelweergaven ----
  await parent.click('.dnav[data-view="lullabies"]');
  const lulla = await parent.evaluate(() => ({
    act: document.getElementById('dviewLullabies').classList.contains('active'),
    mon: document.getElementById('dviewMonitor').classList.contains('active'),
    chips: document.querySelectorAll('#chips .chip').length,
    tracksVisible: !!document.querySelector('#playlist .track') && getComputedStyle(document.querySelector('#playlist .track')).display !== 'none',
  }));
  check('Zijbalk opent Lullabies-weergave (chips: ' + lulla.chips + ')', lulla.act && !lulla.mon && lulla.chips === 4 && lulla.tracksVisible);
  await parent.click('.dnav[data-view="settings"]');
  const setv = await parent.evaluate(() => ({
    act: document.getElementById('dviewSettings').classList.contains('active'),
    room: document.getElementById('roomLabel2').textContent.trim(),
  }));
  check('Settings-weergave toont kamercode', setv.act && setv.room === code);
  // Plus-paneel: zonder billing-config nette "binnenkort"-status
  const plus = await parent.evaluate(() => ({
    soon: !document.getElementById('plusState').classList.contains('hidden'),
    up: document.getElementById('plusUpgrade').classList.contains('hidden'),
  }));
  check('Plus-paneel in rustige binnenkort-status (ongeconfigureerd)', plus.soon && plus.up);
  await parent.click('.dnav[data-view="monitor"]');

  // ---- sleep timer: zichtbaar aftellen + baby-tegel ----
  await parent.click('#cardSleep'); await sleep(1300);
  const sv = await parent.$eval('#sleepVal', (e) => e.textContent.trim());
  check('Sleep timer telt zichtbaar af ("' + sv + '")', /^1[34]:[0-5]\d$/.test(sv));
  const tileSleep = await baby.$eval('#tileSleep', (e) => e.textContent.trim());
  check('Baby-tegel volgt de sleep timer ("' + tileSleep + '")', tileSleep === '15 min');
  await parent.click('#cardSleep'); await parent.click('#cardSleep'); await parent.click('#cardSleep'); await sleep(400);

  // ---- audio-only op de baby → ouder toont "Audio only" ----
  await baby.click('#tgAudioOnly'); await sleep(900);
  const priv1 = await parent.$eval('#privVal', (e) => e.textContent.trim());
  const shade = await parent.evaluate(() => document.getElementById('screen').classList.contains('privacy'));
  check('Audio-only op de baby synct naar de ouder ("' + priv1 + '")', shade && priv1.length > 0 && priv1 !== 'Camera visible');
  await baby.click('#tgAudioOnly'); await sleep(900);
  const priv2 = await parent.$eval('#privVal', (e) => e.textContent.trim());
  check('Beeld terug synct ook ("' + priv2 + '")', priv2 === 'Camera visible');

  // ---- camera-herstel: OS beëindigt het spoor hard → automatisch herstel ----
  // Simuleert dat het OS de camera geforceerd stopt (bv. na lang op de
  // achtergrond). Een 'ended'-event wordt niet door track.stop() gevuurd,
  // dus we dispatchen het zelf op het echte MediaStreamTrack-object —
  // functioneel identiek aan wat de browser zelf zou vuren.
  const recovery = await baby.evaluate(async () => {
    const before = document.getElementById('bPreview').srcObject.getVideoTracks()[0];
    const beforeId = before && before.id;
    before.dispatchEvent(new Event('ended'));
    const start = Date.now();
    while (Date.now() - start < 6000) {
      const t = document.getElementById('bPreview').srcObject.getVideoTracks()[0];
      if (t && t.id !== beforeId && t.readyState === 'live') return { ok: true, beforeId, afterId: t.id };
      await new Promise((r) => setTimeout(r, 200));
    }
    return { ok: false, beforeId };
  });
  check('Camera herstelt automatisch na "ended"-event', recovery.ok);
  await sleep(500);
  const stillLive = await parent.evaluate(() => {
    const v = document.getElementById('video');
    return v && v.videoWidth > 0;
  });
  check('Ouder blijft beeld ontvangen na camera-herstel', stillLive);

  // ---- foutstatus: verkeerde code ----
  const cE = await mk();
  const perr = await cE.newPage();
  perr.on('pageerror', (e) => errs.push('PERR: ' + e.message));
  await perr.goto(BASE); await sleep(300);
  await perr.click('#pickParent');
  await perr.fill('#parentOfferInput', 'ZZZZZZ');
  await perr.click('#parentGenBtn');
  let errShown = false;
  const tE = Date.now();
  while (Date.now() - tE < 10000) {
    errShown = await perr.evaluate(() => { const e = document.getElementById('parentError'); return e && !e.classList.contains('hidden') && e.textContent.length > 3; });
    if (errShown) break;
    await sleep(250);
  }
  const spinHidden = await perr.evaluate(() => document.getElementById('parentConnecting').classList.contains('hidden'));
  check('Verkeerde code: expliciete foutmelding', errShown);
  check('Verkeerde code: spinner weer verborgen', spinHidden);
  await cE.close();

  // ---- reconnect: baby valt weg → backoff → faalstatus + retry-knop ----
  await cB.close();
  let sawReconnecting = false, retryVisible = false;
  const tR = Date.now();
  while (Date.now() - tR < 60000) {
    const recTxt = await parent.$eval('#connText', (e) => e.textContent.trim()).catch(() => '');
    if (/\(\d\/\d\)/.test(recTxt)) sawReconnecting = true;
    retryVisible = await parent.evaluate(() => { const r = document.getElementById('phRetry'); return r && !r.classList.contains('hidden'); });
    if (retryVisible) break;
    await sleep(250);
  }
  check('Ouder toont "Opnieuw verbinden… (n/m)" na wegvallen', sawReconnecting);
  check('Na uitgeputte pogingen: expliciete faalstatus + retry-knop', retryVisible);
  await parent.click('#phRetry'); await sleep(600);
  const retrying = await parent.$eval('#connText', (e) => e.textContent.trim());
  check('Retry-knop start een nieuwe poging ("' + retrying + '")', retrying.length > 0);

  // ---- voorgrond-wacht: verbinding terug in beeld forceert meteen een nieuwe poging ----
  // Eigen paar met een lange backoff-stap, zodat er een ruime marge is
  // tussen "meteen door de voorgrond-wacht" en "pas na de normale wachttijd".
  const INIT_SLOW = INIT + `window.BABYFOON_RECONNECT_DELAYS = [6000];`;
  const mkSlow = async () => {
    const c = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await c.addInitScript(INIT_SLOW);
    return c;
  };
  const cB2 = await mkSlow();
  const baby2 = await cB2.newPage();
  await baby2.goto(BASE); await sleep(400);
  await baby2.click('#pickBaby');
  let code2 = '';
  for (let i = 0; i < 40; i++) {
    code2 = await baby2.$eval('#babyCodeText', (e) => e.textContent.trim()).catch(() => '');
    if (code2 && code2 !== '······' && code2.length >= 6) break;
    await sleep(300);
  }
  const cP2 = await mkSlow();
  const parent2 = await cP2.newPage();
  await parent2.goto(BASE); await sleep(300);
  await parent2.click('#pickParent');
  await parent2.fill('#parentOfferInput', code2);
  await parent2.click('#parentGenBtn');
  let w2 = 0;
  const t02 = Date.now();
  while (Date.now() - t02 < 20000) {
    w2 = await parent2.$eval('#video', (v) => v.videoWidth || 0).catch(() => 0);
    if (w2 > 0) break;
    await sleep(300);
  }
  check('Voorgrond-wacht-test: live video ("' + w2 + 'px")', w2 > 0);
  await cB2.close(); // babyunit valt weg → ouder plant een lange (6s) herverbindingspoging
  let waitingSince = 0;
  const tW = Date.now();
  while (Date.now() - tW < 10000) {
    const txt = await parent2.$eval('#connText', (e) => e.textContent.trim()).catch(() => '');
    if (/\(\d\/\d\)/.test(txt)) { waitingSince = Date.now(); break; }
    await sleep(100);
  }
  check('Wegval gedetecteerd (backoff gepland)', waitingSince > 0);
  await parent2.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  let forcedAt = 0;
  const tF = Date.now();
  while (Date.now() - tF < 3000) {
    const connecting = await parent2.evaluate(() => {
      const pcn = document.getElementById('parentConnecting');
      return pcn && !pcn.classList.contains('hidden');
    });
    if (connecting) { forcedAt = Date.now(); break; }
    await sleep(50);
  }
  const forcedFast = forcedAt > 0 && (forcedAt - waitingSince) < 3000;
  check('visibilitychange forceert meteen een nieuwe poging (i.p.v. de volle 6s wachttijd)', forcedFast);
  await cB2.close().catch(() => {});
  await cP2.close();

  // ---- camerakeuze + LED-lampje (babyunit met 2 camera's en torch-steun) ----
  // De babyunit-context simuleert twee camera's en torch-ondersteuning, zodat
  // de volledige keten baby → besturingskanaal → ouder-UI getest wordt.
  const capInit = INIT + `
    navigator.mediaDevices.enumerateDevices = async () => ([
      { kind: 'videoinput', deviceId: 'cam-a', label: 'Back camera' },
      { kind: 'videoinput', deviceId: 'cam-b', label: 'Front camera' },
    ]);
    try { MediaStreamTrack.prototype.getCapabilities = function () { return { torch: true }; }; } catch (e) {}
    try { MediaStreamTrack.prototype.applyConstraints = function () { return Promise.resolve(); }; } catch (e) {}
  `;
  const mkCap = async () => { const c = await browser.newContext({ permissions: ['camera', 'microphone'] }); await c.addInitScript(capInit); return c; };
  const cB3 = await mkCap();
  const baby3 = await cB3.newPage();
  baby3.on('pageerror', (e) => errs.push('BABY3: ' + e.message));
  await baby3.goto(BASE); await sleep(400);
  await baby3.click('#pickBaby');
  let code3 = '';
  for (let i = 0; i < 40; i++) {
    code3 = await baby3.$eval('#babyCodeText', (e) => e.textContent.trim()).catch(() => '');
    if (code3 && code3 !== '······' && code3.length >= 6) break;
    await sleep(300);
  }
  const cP3 = await mkCap();
  const parent3 = await cP3.newPage();
  parent3.on('pageerror', (e) => errs.push('PARENT3: ' + e.message));
  await parent3.goto(BASE); await sleep(300);
  await parent3.click('#pickParent');
  await parent3.fill('#parentOfferInput', code3);
  await parent3.click('#parentGenBtn');
  // wachten tot verbonden, dan de Instellingen-weergave openen (daar staan de rijen)
  const t03 = Date.now();
  while (Date.now() - t03 < 20000) {
    const w = await parent3.$eval('#video', (v) => v.videoWidth || 0).catch(() => 0);
    if (w > 0) break;
    await sleep(300);
  }
  await parent3.click('.dnav[data-view="settings"]');
  const camRow = await parent3.waitForSelector('#rowCamera:not(.hidden)', { timeout: 20000 }).then(() => true).catch(() => false);
  check('Camerakeuze verschijnt bij ≥2 camera’s', camRow);
  const camOpts = await parent3.$$eval('#camSelect option', (els) => els.length).catch(() => 0);
  check('Camerakeuze toont beide camera’s (' + camOpts + ')', camOpts === 2);
  const ledRow = await parent3.waitForSelector('#rowLed:not(.hidden)', { timeout: 20000 }).then(() => true).catch(() => false);
  check('LED-rij verschijnt bij torch-ondersteuning', ledRow);
  await parent3.click('#ledToggle');
  const ledOn = await parent3.waitForFunction(() => document.getElementById('ledToggle').classList.contains('on'), { timeout: 8000 }).then(() => true).catch(() => false);
  check('LED-knop schakelt naar aan', ledOn);
  // Zichtbare "Wissel camera"-knoppen op beide units (het gebrek hieraan was
  // de klacht: de functie was nergens te vinden).
  const babyFlipVisible = await baby3.evaluate(() => {
    const b = document.getElementById('tgFlipCam');
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  check('Babyunit toont een zichtbare "Wissel camera"-knop', babyFlipVisible);
  await parent3.click('.dnav[data-view="monitor"]');
  const parentFlipVisible = await parent3.evaluate(() => {
    const b = document.getElementById('btnFlipCam');
    if (!b) return false;
    const r = b.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  check('Ouderunit toont een zichtbare "Wissel camera"-knop op de monitor', parentFlipVisible);
  await cB3.close().catch(() => {});
  await cP3.close();

  await browser.close();
  web.close();
  console.log(errs.length ? '\nPAGINAFOUTEN:\n' + errs.join('\n') : '\nGEEN PAGINAFOUTEN');
  console.log('\nRESULTAAT: ' + (fail || errs.length ? 'MISLUKT' : 'GESLAAGD'));
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('Testfout:', e); process.exit(1); });
