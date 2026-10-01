'use strict';

/**
 * Regressietests bij de onafhankelijke audit.
 *
 * Elke controle hieronder faalt aantoonbaar op de code van vóór de bijbehorende
 * reparatie. Ze zijn bewust gescheiden van `e2e-serverless.js` gehouden, zodat
 * duidelijk blijft wélk gedrag door welke bevinding wordt afgedekt.
 *
 *   npm run test:audit
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { chromium } = require('playwright');
const { PeerServer } = require('peer');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT = path.join(__dirname, '..', 'serverless');
const WEB_PORT = +(process.env.WEB_PORT || 8177);
const PEER_PORT = +(process.env.PEER_PORT || 9077);
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain',
};
const gemist = [];   // 404's — bevinding 29 (turn.json)
const web = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/') p = '/index.html';
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    gemist.push(p);
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
    window.BABYFOON_PEER = { host: '127.0.0.1', port: ${PEER_PORT}, path: '/', key: 'peerjs', secure: false };
    window.BABYFOON_RECONNECT_DELAYS = [400, 700];
    window.BABYFOON_CONNECT_TIMEOUT = 4000;
    window.BABYFOON_HEARTBEAT_TIMEOUT = 5000;
    window.BABYFOON_AUTH_TIMEOUT_RETRY = 8000;
    (function () {
      // Alle timers tellen (bevinding 6) en alle RTCPeerConnections onthouden.
      window.__intervals = [];
      const SI = window.setInterval;
      window.setInterval = function (fn, ms) { const id = SI.apply(window, arguments); window.__intervals.push({ id: id, ms: ms }); return id; };
      const CI = window.clearInterval;
      window.clearInterval = function (id) { window.__intervals = window.__intervals.filter((x) => x.id !== id); return CI.apply(window, arguments); };
      const O = window.RTCPeerConnection;
      window.__pcs = [];
      const W = function (...a) { const pc = new O(...a); window.__pcs.push(pc); return pc; };
      W.prototype = O.prototype;
      window.RTCPeerConnection = W;
    })();
  `;

  const browser = await chromium.launch({
    executablePath: findExecutable(),
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  let fail = false;
  const check = (n, c) => { console.log((c ? '✅' : '❌') + ' ' + n); if (!c) fail = true; };
  const errs = [];
  const mk = async (extra) => {
    const c = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await c.addInitScript(INIT + (extra || ''));
    return c;
  };
  const wachtOpCode = async (p) => {
    for (let i = 0; i < 60; i++) {
      const c = await p.$eval('#babyCodeText', (e) => e.textContent.trim()).catch(() => '');
      if (c && c !== '······' && c.length >= 6) return c;
      await sleep(250);
    }
    return '';
  };
  const keurGoed = async (p) => {
    for (let i = 0; i < 60; i++) {
      const zichtbaar = await p.evaluate(() => {
        const b = document.getElementById('babyApproval');
        return !!b && !b.classList.contains('hidden');
      });
      if (zichtbaar) { await p.click('#btnApproveYes'); return true; }
      await sleep(250);
    }
    return false;
  };
  const wachtOpBeeld = async (p, ms) => {
    const t0 = Date.now();
    while (Date.now() - t0 < (ms || 25000)) {
      const w = await p.evaluate(() => { const v = document.getElementById('video'); return (v && v.videoWidth) || 0; });
      if (w > 0) return w;
      await sleep(300);
    }
    return 0;
  };

  // =====================================================================
  // Koppel één paar dat de meeste controles deelt.
  // =====================================================================
  const cB = await mk();
  const baby = await cB.newPage();
  baby.on('pageerror', (e) => errs.push('BABY: ' + e.message));
  await baby.goto(BASE); await sleep(400);
  await baby.click('#pickBaby');
  const code = await wachtOpCode(baby);
  check('Babyunit levert een kamercode ("' + code + '")', /^[A-Z0-9]{6}$/.test(code));

  const cP = await mk();
  const parent = await cP.newPage();
  parent.on('pageerror', (e) => errs.push('PARENT: ' + e.message));
  await parent.goto(BASE); await sleep(300);
  await parent.click('#pickParent');
  await parent.fill('#parentOfferInput', code);
  await parent.click('#parentGenBtn');
  check('Toestemmingsvraag verschijnt en is toegestaan', await keurGoed(baby));
  check('Live beeld bij de ouderunit', (await wachtOpBeeld(parent)) > 0);
  await sleep(800);

  // ------------------------------------------------------------------
  // BEVINDING 1 (blokkerend) — privacyscherm mag niet stilzwijgend uit
  // ------------------------------------------------------------------
  // Privacyscherm aanzetten op de babyunit.
  await baby.click('#tgPrivacy');
  await sleep(700);
  const na1 = await baby.evaluate(() => ({
    priv: document.getElementById('swPrivacy').classList.contains('on'),
    cam: document.getElementById('swCam').classList.contains('on'),
    spoor: document.getElementById('bPreview').srcObject.getVideoTracks().map((t) => t.enabled),
  }));
  check('Privacyscherm aan: schakelaar aan én videospoor uit', na1.priv && !na1.cam && na1.spoor.every((x) => x === false));

  // Nu precies wat er bij een wifi↔4G-wissel of een herverbinding gebeurt: de
  // ouderunit stuurt opnieuw een kwaliteitscommando met stand "hoog".
  await parent.evaluate(() => {
    const qs = document.getElementById('qualitySelect');
    qs.value = 'hoog';
    qs.dispatchEvent(new Event('change'));
  });
  await sleep(1200);
  const na2 = await baby.evaluate(() => ({
    priv: document.getElementById('swPrivacy').classList.contains('on'),
    cam: document.getElementById('swCam').classList.contains('on'),
    ao: document.getElementById('swAudioOnly').classList.contains('on'),
    spoor: document.getElementById('bPreview').srcObject.getVideoTracks().map((t) => t.enabled),
  }));
  check('Kwaliteitscommando zet het privacyscherm NIET uit (spoor blijft uit)',
    na2.spoor.length > 0 && na2.spoor.every((x) => x === false));
  check('De drie schuiven blijven onderling kloppen (privacy aan, camera uit, alleen-geluid aan)',
    na2.priv === true && na2.cam === false && na2.ao === true);
  const ouderZiet = await parent.$eval('#privVal', (e) => e.textContent.trim());
  check('Ouderunit meldt niet "camera zichtbaar" terwijl het scherm dicht is ("' + ouderZiet + '")',
    ouderZiet !== 'Camera visible');

  // Zet hem weer uit; vanaf hier hoort het beeld gewoon terug te komen.
  await baby.click('#tgPrivacy');
  await sleep(900);
  const na3 = await baby.evaluate(() => ({
    priv: document.getElementById('swPrivacy').classList.contains('on'),
    spoor: document.getElementById('bPreview').srcObject.getVideoTracks().map((t) => t.enabled),
  }));
  check('Privacyscherm handmatig uit: beeld gaat weer aan', !na3.priv && na3.spoor.every((x) => x === true));

  // En een kwaliteitscommando mag dán wél weer beeld aanzetten.
  await parent.evaluate(() => {
    const qs = document.getElementById('qualitySelect');
    qs.value = 'geluid';
    qs.dispatchEvent(new Event('change'));
  });
  await sleep(1000);
  const alleenGeluid = await baby.evaluate(() => document.getElementById('bPreview').srcObject.getVideoTracks().map((t) => t.enabled));
  check('Stand "alleen geluid" zet het beeld nog steeds uit', alleenGeluid.every((x) => x === false));
  await parent.evaluate(() => {
    const qs = document.getElementById('qualitySelect');
    qs.value = 'hoog';
    qs.dispatchEvent(new Event('change'));
  });
  await sleep(1400);
  const weerBeeld = await baby.evaluate(() => document.getElementById('bPreview').srcObject.getVideoTracks().map((t) => t.enabled));
  check('Terug naar "hoog" zet het beeld weer aan (geen gebruikerskeuze in de weg)', weerBeeld.every((x) => x === true));

  // ------------------------------------------------------------------
  // BEVINDING 5 — de tegel "Slaapliedje" volgt ook de mp3-playlist
  // ------------------------------------------------------------------
  await parent.evaluate(() => document.querySelector('#playlist .track').click());
  await sleep(1400);
  const speelt = await baby.evaluate(() => { const a = document.getElementById('musicAudio'); return !!(a && !a.paused && /music\//.test(a.src)); });
  const tegel = await baby.$eval('#tileLullaby', (e) => e.textContent.trim());
  check('Muziek speelt op de babyunit', speelt);
  check('Babytegel "Slaapliedje" staat op AAN terwijl er muziek speelt ("' + tegel + '")', speelt && tegel !== 'Off');
  // Hetzelfde nummer nogmaals aantikken zet het uit (parentPlayMusic toggelt).
  await parent.evaluate(() => document.querySelector('#playlist .track').click());
  await sleep(1400);
  const gestopt = await baby.evaluate(() => { const a = document.getElementById('musicAudio'); return !a || a.paused; });
  const tegelUit = await baby.$eval('#tileLullaby', (e) => e.textContent.trim());
  check('Muziek stopt op de babyunit', gestopt);
  check('Babytegel gaat weer uit als de muziek stopt ("' + tegelUit + '")', gestopt && tegelUit === 'Off');

  // ------------------------------------------------------------------
  // BEVINDING 20 — de HD-badge toont de werkelijke beeldhoogte
  // ------------------------------------------------------------------
  const badge = await parent.evaluate(() => {
    const v = document.getElementById('video');
    return { tekst: (document.getElementById('vcardHd') || {}).textContent, h: v.videoHeight };
  });
  const verwachtBadge = badge.h >= 700 ? 'HD' : badge.h + 'p';
  check('Badge toont de gemeten beeldhoogte ("' + badge.tekst + '" bij ' + badge.h + 'px)', badge.tekst === verwachtBadge);

  // ------------------------------------------------------------------
  // BEVINDING 19 / 18 — geen claims die de code tegenspreekt
  // ------------------------------------------------------------------
  const teksten = await parent.evaluate(() => document.body.innerText);
  check('Ouderdashboard belooft geen "auto noise reduction" meer (de mic is juist onbewerkt)',
    !/auto noise reduction/i.test(teksten));
  const babyTeksten = await baby.evaluate(() => document.body.innerText);
  check('Babyunit claimt niet meer "local network only" (de app werkt ook tussen netwerken)',
    !/local network only/i.test(babyTeksten));

  // ------------------------------------------------------------------
  // BEVINDING 17 — QR op het babydashboard is te vergroten
  // ------------------------------------------------------------------
  const qrDash = await baby.evaluate(() => {
    const d = document.getElementById('babyDashQR');
    return { role: d && d.getAttribute('role'), tab: d && d.getAttribute('tabindex'), klik: !!(d && d.onclick), code: !!(d && d.dataset.code) };
  });
  check('QR op het babydashboard is knop, focusbaar én klikbaar',
    qrDash.role === 'button' && qrDash.tab === '0' && qrDash.klik && qrDash.code);
  await baby.click('#babyDashQR');
  await sleep(400);
  const zoomOpen = await baby.evaluate(() => {
    const z = document.querySelector('.qr-zoom, #qrZoom, .qrzoom');
    return !!z && !z.classList.contains('hidden');
  });
  check('Tikken op die QR opent de vergroting', zoomOpen);
  await baby.keyboard.press('Escape');
  await sleep(300);

  // ------------------------------------------------------------------
  // BEVINDING 4 — het huilalarm is zichtbaar scherp te stellen
  // ------------------------------------------------------------------
  const alarmUi = await parent.evaluate(() => ({
    knop: !!document.getElementById('btnAlarmTest'),
    knop2: !!document.getElementById('btnAlarmTest2'),
    // De "Crying detected"-pil stond in een verborgen compat-blok: het element
    // bestond wel maar kon nooit in beeld komen.
    pilInVerborgenBlok: !!document.querySelector('#parentCompat #cryAlert'),
    pilOpMonitor: !!document.querySelector('#dviewMonitor #monitorAlerts > #cryAlert'),
  }));
  check('Er is een knop "Alarmgeluid testen" op het monitorscherm én in Alerts', alarmUi.knop && alarmUi.knop2);
  check('De "Crying detected"-pil staat niet meer in het verborgen compat-blok', !alarmUi.pilInVerborgenBlok);
  check('De "Crying detected"-pil staat op het monitorscherm', alarmUi.pilOpMonitor);
  const alarmWerkt = await parent.evaluate(async () => {
    const knop = document.getElementById('btnAlarmTest');
    if (!knop) return false;
    knop.click();
    await new Promise((r) => setTimeout(r, 400));
    const a = document.querySelector('audio[src^="data:audio/wav"]');
    // De ingebouwde terugvaltoon moet bestaan én echt speelbaar zijn.
    return !!a && a.duration > 0.1;
  });
  check('De testknop maakt een echte, ingebouwde toon aan (geen externe bron)', alarmWerkt);

  // ------------------------------------------------------------------
  // BEVINDING 16 — toestemmingsvenster vangt de focus en Escape weigert
  // ------------------------------------------------------------------
  const cX = await mk();
  const derde = await cX.newPage();
  derde.on('pageerror', (e) => errs.push('DERDE: ' + e.message));
  await derde.goto(BASE); await sleep(300);
  await derde.click('#pickParent');
  await derde.fill('#parentOfferInput', code);
  await derde.click('#parentGenBtn');
  let dialoog = false;
  for (let i = 0; i < 60 && !dialoog; i++) {
    dialoog = await baby.evaluate(() => { const b = document.getElementById('babyApproval'); return !!b && !b.classList.contains('hidden'); });
    if (!dialoog) await sleep(250);
  }
  check('Tweede ouderunit laat de toestemmingsvraag verschijnen', dialoog);
  const focus1 = await baby.evaluate(() => document.activeElement && document.activeElement.id);
  check('Focus staat bij openen op "Weigeren" (veilige standaard, nu: "' + focus1 + '")', focus1 === 'btnApproveNo');
  await baby.keyboard.press('Tab');
  const focus2 = await baby.evaluate(() => document.activeElement && document.activeElement.id);
  check('Tab blijft binnen de dialoog (nu: "' + focus2 + '")', focus2 === 'btnApproveYes');
  await baby.keyboard.press('Tab');
  const focus3 = await baby.evaluate(() => document.activeElement && document.activeElement.id);
  check('Tab loopt rond in plaats van de pagina in (nu: "' + focus3 + '")', focus3 === 'btnApproveNo');
  const inert = await baby.evaluate(() => {
    const s = document.getElementById('screenBaby');
    return s.getAttribute('aria-hidden') === 'true';
  });
  check('De rest van het babyscherm is voor schermlezers afgeschermd', inert);
  await baby.keyboard.press('Escape');
  await sleep(500);
  const naEsc = await baby.evaluate(() => ({
    dicht: document.getElementById('babyApproval').classList.contains('hidden'),
    scherm: document.getElementById('screenBaby').getAttribute('aria-hidden'),
  }));
  check('Escape sluit de dialoog', naEsc.dicht);
  check('Het babyscherm is daarna weer bereikbaar', naEsc.scherm === null);
  let geweigerd = '';
  for (let i = 0; i < 40; i++) {
    geweigerd = await derde.$eval('#parentError', (e) => (e.classList.contains('hidden') ? '' : e.textContent.trim())).catch(() => '');
    if (geweigerd) break;
    await sleep(250);
  }
  check('Escape WEIGERT (de derde unit krijgt een afwijzing: "' + geweigerd + '")', /refused/i.test(geweigerd));
  await cX.close();

  await cP.close();
  await cB.close();

  // ------------------------------------------------------------------
  // BEVINDING 2 (blokkerend) — status komt terug na een geslaagde recall
  // ------------------------------------------------------------------
  // Eigen paar, want dit vraagt om een korte mediawachttijd zodat de bewaking
  // gegarandeerd langs haar recall-tak gaat.
  const EXTRA_RECALL = 'window.BABYFOON_MEDIA_WACHT = 2500;';
  const cBr = await mk(EXTRA_RECALL);
  const babyR = await cBr.newPage();
  babyR.on('pageerror', (e) => errs.push('BABYR: ' + e.message));
  await babyR.goto(BASE); await sleep(400);
  await babyR.click('#pickBaby');
  const codeR = await wachtOpCode(babyR);
  const cPr = await mk(EXTRA_RECALL);
  const parentR = await cPr.newPage();
  parentR.on('pageerror', (e) => errs.push('PARENTR: ' + e.message));
  await parentR.goto(BASE); await sleep(300);
  await parentR.click('#pickParent');
  await parentR.fill('#parentOfferInput', codeR);
  await parentR.click('#parentGenBtn');
  await keurGoed(babyR);
  check('Recall-test: eerst gewoon live beeld', (await wachtOpBeeld(parentR)) > 0);
  const voor = await parentR.$eval('#connText', (e) => e.textContent.trim());

  // Netwerkhapering: mediaverbinding valt weg en het beeld blijft daarna nog
  // ~7 seconden uit. Dat is precies lang genoeg om de mediabewaking een
  // 'recall' te laten sturen — de tak die `setParentStatus('Verbinden…')` zet.
  await parentR.evaluate(() => {
    const v = document.getElementById('video');
    if (v.srcObject) v.srcObject.getTracks().forEach((t) => t.stop());
    v.srcObject = null;
    window.__pcs.forEach((pc) => { try { pc.close(); } catch (e) {} });
    const houdTegen = setInterval(() => {
      const el = document.getElementById('video');
      if (el.srcObject) { el.srcObject.getTracks().forEach((t) => t.stop()); el.srcObject = null; }
    }, 100);
    setTimeout(() => clearInterval(houdTegen), 7000);
  });
  // Vaststellen dat de recall-tak echt gelopen heeft: anders bewijst deze test
  // niets (een groene ronde zonder dat het foute pad geraakt is).
  let zagConnecting = false;
  const tRec = Date.now();
  while (Date.now() - tRec < 20000) {
    const t = await parentR.$eval('#connText', (e) => e.textContent.trim()).catch(() => '');
    if (/^connecting/i.test(t)) { zagConnecting = true; break; }
    await sleep(400);
  }
  check('De mediabewaking gaat aantoonbaar langs haar recall-tak ("Connecting…")', zagConnecting);
  const terug = await wachtOpBeeld(parentR, 40000);
  check('Beeld komt terug na de recall (' + terug + 'px)', terug > 0);
  // Even doorlopen: een latere setPairStap() mag de tekst niet opnieuw op
  // "Verbinden…" zetten — dat was precies waardoor hij bleef staan.
  await sleep(5000);
  const na = await parentR.evaluate(() => ({
    tekst: document.getElementById('connText').textContent.trim(),
    dotUit: document.getElementById('connDot').classList.contains('off'),
    beeld: document.getElementById('video').videoWidth,
  }));
  check('Statusbalk blijft niet op "Verbinden…" staan (voor="' + voor + '" na="' + na.tekst + '", beeld ' + na.beeld + 'px)',
    na.tekst === 'Connected' && na.beeld > 0);
  check('Het verbindingsbolletje staat op verbonden', !na.dotUit);
  await cPr.close(); await cBr.close();

  // ------------------------------------------------------------------
  // BEVINDING 6 — geen extra bewakingstimer per herverbinding
  // ------------------------------------------------------------------
  const cB2 = await mk();
  const baby2 = await cB2.newPage();
  baby2.on('pageerror', (e) => errs.push('BABY2: ' + e.message));
  await baby2.goto(BASE); await sleep(400);
  await baby2.click('#pickBaby');
  const code2 = await wachtOpCode(baby2);
  const tel = async () => baby2.evaluate(() => window.__intervals.filter((x) => x.ms === 3000 || x.ms === 5000).length);
  const metingen = [];
  for (let ronde = 0; ronde < 3; ronde++) {
    const cN = await mk();
    const pN = await cN.newPage();
    await pN.goto(BASE); await sleep(250);
    await pN.click('#pickParent');
    await pN.fill('#parentOfferInput', code2);
    await pN.click('#parentGenBtn');
    await keurGoed(baby2);
    await wachtOpBeeld(pN, 25000);
    await sleep(1200);
    metingen.push(await tel());
    await cN.close();
    await sleep(1500);
  }
  check('Bewakingstimers groeien niet mee met het aantal koppelingen (' + metingen.join(' → ') + ')',
    metingen[metingen.length - 1] <= metingen[0]);
  await cB2.close();

  // ------------------------------------------------------------------
  // BEVINDING 8 — eerlijk scherm terwijl de browservraag openstaat
  // ------------------------------------------------------------------
  const cB3 = await mk(`
    window.BABYFOON_MEDIA_PERMISSIE_TIMEOUT = 4000;
    // getUserMedia die nooit antwoordt: de gebruiker tikt de browservraag weg.
    navigator.mediaDevices.getUserMedia = () => new Promise(() => {});
  `);
  const baby3 = await cB3.newPage();
  baby3.on('pageerror', (e) => errs.push('BABY3: ' + e.message));
  await baby3.goto(BASE); await sleep(400);
  await baby3.click('#pickBaby');
  await sleep(1200);
  const hangend = await baby3.evaluate(() => {
    const pil = document.getElementById('babyWaiting');
    const codeEl = document.getElementById('babyCodeText');
    return {
      tekst: pil ? pil.innerText.trim() : '',
      codeZichtbaar: codeEl ? codeEl.offsetParent !== null : true,
      qrZichtbaar: document.getElementById('babyQR').offsetParent !== null,
      scherm: !document.getElementById('screenPairBaby').classList.contains('hidden'),
    };
  });
  check('Tijdens de toestemmingsvraag zegt de babyunit NIET dat hij op de ouderunit wacht ("' + hangend.tekst + '")',
    hangend.scherm && !/waiting for the parent/i.test(hangend.tekst));
  check('Tijdens de toestemmingsvraag staat er geen kamercode van puntjes en geen QR',
    !hangend.codeZichtbaar && !hangend.qrZichtbaar);
  // En na de tijdslimiet valt hij netjes terug naar de startpagina.
  await sleep(4500);
  const naTimeout = await baby3.evaluate(() => ({
    setup: !document.getElementById('screenSetup').classList.contains('hidden'),
    pair: !document.getElementById('screenPairBaby').classList.contains('hidden'),
  }));
  check('Onbeantwoorde toestemmingsvraag loopt af en valt terug naar de startpagina',
    naTimeout.setup && !naTimeout.pair);
  await cB3.close();

  // ------------------------------------------------------------------
  // BEVINDING 12 — geen technische diagnose in de hoofdmelding
  // ------------------------------------------------------------------
  const cB4 = await mk();
  const fout = await cB4.newPage();
  fout.on('pageerror', (e) => errs.push('FOUT: ' + e.message));
  await fout.goto(BASE); await sleep(300);
  await fout.click('#pickParent');
  await fout.fill('#parentOfferInput', 'ZZZZZZ');
  await fout.click('#parentGenBtn');
  let melding = '';
  for (let i = 0; i < 60; i++) {
    melding = await fout.$eval('#parentError', (e) => (e.classList.contains('hidden') ? '' : e.textContent.trim())).catch(() => '');
    if (melding) break;
    await sleep(250);
  }
  const diag = await fout.evaluate(() => {
    const b = document.getElementById('parentDiagBox');
    return { open: !!b && !b.classList.contains('hidden'), tekst: (document.getElementById('parentDiag') || {}).textContent || '' };
  });
  check('Foutmelding bevat geen "[host:1 · 2/5]" meer ("' + melding + '")', melding.length > 3 && !/\[.*\d\/\d\]/.test(melding));
  check('De diagnose staat wél in een uitklapbaar detail ("' + diag.tekst + '")', diag.open && /\d\/\d/.test(diag.tekst));
  await cB4.close();

  // ------------------------------------------------------------------
  // BEVINDING 11 / 29 — .warn bestaat in CSS; turn.json geeft geen 404
  // ------------------------------------------------------------------
  const css = ['luna.css', 'dash.css', path.join('assets', 'brand-theme.css')]
    .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  check('De klasse .warn heeft een zichtbare stijl in de CSS', /\.warn\b/.test(css));
  check('Geen 404 op turn.json meer' + (gemist.length ? ' — gemist: ' + [...new Set(gemist)].join(', ') : ''),
    !gemist.some((p) => /turn\.json$/.test(p)));

  await browser.close();
  web.close();
  console.log(errs.length ? '\nPAGINAFOUTEN:\n' + errs.join('\n') : '\nGEEN PAGINAFOUTEN');
  console.log('\nRESULTAAT: ' + (fail || errs.length ? 'MISLUKT' : 'GESLAAGD'));
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('Testfout:', e); process.exit(1); });
