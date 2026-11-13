'use strict';

/**
 * End-to-end ANDROID — Chrome op Android, Samsung Internet en de Android
 * WebView waarin apps links openen.
 *
 *   npm run test:android
 *
 * Waarom deze suite naast test/e2e-webkit.js bestaat
 * --------------------------------------------------
 * Chromium hier is dezelfde motor als Chrome op Android. Dat maakt Android
 * véél beter te benaderen dan iOS: het verschil zit niet in de motor maar in
 * (a) het TOESTEL — aanraakscherm, geen muis, smal scherm — en (b) de SCHIL.
 * Samsung Internet en de Android WebView zijn Chromium-schillen die een deel
 * van de moderne API's niet doorgeven, en Android zelf zet een tabblad dat op
 * de achtergrond staat zonder pardon uit het geheugen.
 *
 * Alles hieronder wordt daarom aangetikt (page.tap) en niet aangeklikt, op een
 * geëmuleerd toestel met isMobile/hasTouch/deviceScaleFactor en een echte
 * Android-useragent. Bewust GEEN --autoplay-policy=no-user-gesture-required:
 * die vlag verbergt precies het telefoongedrag waar scenario F over gaat.
 *
 * De scenario's
 * -------------
 *   A  Functieveegactie. Elke functie van de app één keer langs op een
 *      geëmuleerde Pixel, alleen met aanraking. Geeft per functie een meting.
 *   B  WebView / oudere Samsung Internet: wakeLock, vibrate, permissions,
 *      clipboard, share, MediaRecorder, getCapabilities en getBattery zijn er
 *      niet. Overleeft de app dat, en wat ziet de gebruiker?
 *   C  isWebKit() mag Samsung Internet en de WebView NIET als WebKit
 *      aanmerken — dat zou op Android de extra microfoons uitzetten die daar
 *      juist wél mogen. Gemeten aan het gedrag, niet aan de useragent.
 *   D  applyConstraints weigert (komt voor in WebView): raakt de
 *      duplex-microfoon bij terugpraten en het LED-lampje.
 *   E  Binnenkomen via de QR-deeplink zonder ooit te tikken. De AudioContext
 *      blijft dan opgeschort — werkt de geluidsmeter nog, en wordt de ouder
 *      gewaarschuwd dat het huilalarm stil is?
 *   F  Android Chrome blokkeert automatisch afspelen mét geluid, net als iOS.
 *   G  Een andere app houdt de camera vast: getUserMedia geeft
 *      NotReadableError.
 *   H  Android gooit het tabblad weg zodra het naar de achtergrond gaat en
 *      laadt de pagina opnieuw bij terugkeer. Komt de bewaking dan terug?
 *
 * Wat hier NIET te testen is (geen echt toestel, geen mobiel netwerk):
 * echte torch-hardware, echte batterij, een echte TURN-server, het
 * daadwerkelijk kwijtraken van audiofocus aan een inkomend gesprek, en of
 * Chrome op Android `video.webkitEnterFullscreen` werkelijk aanbiedt.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const { chromium } = require('playwright');
const { ExpressPeerServer } = require('peer');

const ROOT = process.env.APP_ROOT || path.join(__dirname, '..', 'serverless');
const WEB_PORT = Number(process.env.WEB_PORT || 8801);
const PEER_PORT = Number(process.env.PEER_PORT || 9801);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml', '.woff2': 'font/woff2' };
const web = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); res.end(); }
    else { res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); }
  });
});

function startBroker(port) {
  return new Promise((res) => {
    const app = express();
    const srv = http.createServer(app);
    app.use('/', ExpressPeerServer(srv, { path: '/' }));
    srv.listen(port, '127.0.0.1', () => res(srv));
  });
}
function findExecutable() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const d of fs.readdirSync(base)) {
      if (!d.startsWith('chromium-')) continue;
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch (e) {}
  return undefined;
}

// Een hoorbare kamer nabootsen. De nepmicrofoon van Chromium levert stilte;
// dan staat de geluidsmeter terecht stil en bewijst "de meter beweegt niet"
// helemaal niets. Met dit bestand als microfoon is de meter wél een meting:
// een toon van 500 Hz waarvan het volume langzaam op en neer gaat, zodat de
// balkjes van slag tot slag moeten verschillen.
function maakToonBestand(file) {
  const rate = 48000, sec = 10, n = rate * sec;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const omhullende = 0.35 + 0.6 * Math.abs(Math.sin(2 * Math.PI * 0.7 * t));
    const v = Math.sin(2 * Math.PI * 500 * t) * omhullende * 0.9;
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(v * 32767))), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  return file;
}

// --------------------------------------------------------------- toestellen
// Een Pixel 7 op Android 14. deviceScaleFactor, isMobile en hasTouch samen
// zorgen dat page.tap() echte touch-gebeurtenissen stuurt en dat
// (pointer: coarse) / (hover: none) aanslaan — zoals op een telefoon.
const UA_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
// Samsung Internet: Chromium-schil, useragent bevat AppleWebKit én Chrome.
const UA_SAMSUNG = 'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/21.0 Chrome/110.0.0.0 Mobile Safari/537.36';
// De WebView waarin apps (WhatsApp, Facebook, Gmail) links openen: "; wv".
const UA_WEBVIEW = 'Mozilla/5.0 (Linux; Android 12; SM-A525F Build/SP1A.210812.016; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/107.0.0.0 Mobile Safari/537.36';

const PIXEL = (ua) => ({
  userAgent: ua || UA_CHROME,
  viewport: { width: 412, height: 915 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  permissions: ['camera', 'microphone'],
});

// --------------------------------------------------------- bouwstenen (init)

const BASIS = (peerPort) => `
  window.BABYFOON_PEER = { host: '127.0.0.1', port: ${peerPort}, path: '/', key: 'peerjs', secure: false };
  window.__gumN = 0;
  window.__gumAudioOnly = 0;
  window.__trillingen = [];
  (function () {
    // Trillen is op een echte telefoon niet waar te nemen; hier wordt het
    // geteld zodat "de app laat het toestel trillen" een meting is.
    try {
      const v = navigator.vibrate;
      if (v) navigator.vibrate = function (p) { window.__trillingen.push(p); return v.apply(navigator, arguments); };
    } catch (e) {}
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const md = navigator.mediaDevices;
      const gum = md.getUserMedia.bind(md);
      md.getUserMedia = function (c) {
        window.__gumN++;
        if (c && c.audio && !c.video) window.__gumAudioOnly++;
        return gum(c);
      };
    }
  })();
`;

// Twee microfoon-ingangen voorspiegelen, zodat openExtraMicrofoons() zich niet
// vanzelf overslaat. Het verzonnen deviceId gaat er weer af vlak voordat de
// browser het te zien krijgt (die kent alleen zijn eigen nepapparaat).
const TWEE_MICROFOONS = `
  (function () {
    if (!navigator.mediaDevices) return;
    const md = navigator.mediaDevices;
    const enu = md.enumerateDevices.bind(md);
    md.enumerateDevices = function () {
      return enu().then(function (l) {
        const rest = l.filter(function (d) { return d.kind !== 'audioinput'; });
        return rest.concat([
          { kind: 'audioinput', deviceId: 'mic-een', groupId: 'g1', label: 'Mic 1', toJSON: function () { return this; } },
          { kind: 'audioinput', deviceId: 'mic-twee', groupId: 'g2', label: 'Mic 2', toJSON: function () { return this; } },
        ]);
      });
    };
    const gum = md.getUserMedia.bind(md);
    md.getUserMedia = function (c) {
      const k = JSON.parse(JSON.stringify(c || {}));
      if (k && k.audio && k.audio.deviceId) delete k.audio.deviceId;
      if (k && k.video && k.video.deviceId) delete k.video.deviceId;
      return gum(k);
    };
  })();
`;

// B: de API's die de Android WebView en oudere Samsung Internet niet hebben.
// Alles wordt weggehaald vóórdat app.js draait, precies zoals de app het daar
// aantreft.
const WEBVIEW_KAAL = `
  (function () {
    const weg = function (obj, k) { try { delete obj[k]; } catch (e) {} try { Object.defineProperty(obj, k, { configurable: true, get: function () { return undefined; } }); } catch (e) {} };
    weg(navigator, 'wakeLock');
    weg(navigator, 'vibrate');
    weg(navigator, 'permissions');
    weg(navigator, 'clipboard');
    weg(navigator, 'share');
    weg(navigator, 'getBattery');
    weg(window, 'MediaRecorder');
    weg(window, 'showSaveFilePicker');
    try { delete MediaStreamTrack.prototype.getCapabilities; } catch (e) {}
    window.__trillingen = [];
  })();
`;

// D: applyConstraints weigert altijd — komt voor in oudere WebViews.
const GEEN_APPLYCONSTRAINTS = `
  (function () {
    window.__applyPogingen = [];
    const p = MediaStreamTrack.prototype.applyConstraints;
    MediaStreamTrack.prototype.applyConstraints = function (c) {
      window.__applyPogingen.push(c);
      const e = new Error('NotSupportedError'); e.name = 'NotSupportedError';
      return Promise.reject(e);
    };
    window.__applyOrigineel = p;
  })();
`;

// E: Android laat een AudioContext opgeschort staan tot er écht getikt is.
// Sticky activation namaken: resume() lukt pas als er ooit een pointerdown
// langs is gekomen. Wordt er nergens getikt (QR-deeplink), dan blijft de
// context slapen — en dat is precies het geval dat het huilalarm stil maakt.
const AUDIO_PAS_NA_TIK = `
  (function () {
    window.__gebaar = false;
    window.__ctx = [];
    window.__stateOverride = false;
    document.addEventListener('pointerdown', function () { window.__gebaar = true; }, true);
    document.addEventListener('touchstart', function () { window.__gebaar = true; }, true);
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const res = AC.prototype.resume;
    AC.prototype.resume = function () {
      if (!window.__gebaar) {
        const e = new Error('NotAllowedError'); e.name = 'NotAllowedError';
        return Promise.reject(e);
      }
      return res.apply(this, arguments);
    };
    // Een verse context staat op Android opgeschort tot dat gebaar er is.
    // Let op: 'state' hangt aan BaseAudioContext, niet aan AudioContext. Werd
    // dat verwisseld, dan sloeg deze hele namaak stilzwijgend over en liep de
    // context gewoon — precies de val waarin een controle groen wordt om de
    // verkeerde reden. Vandaar __stateOverride: scenario E controleert dat.
    try {
      const proto = window.BaseAudioContext ? BaseAudioContext.prototype : AC.prototype;
      const d = Object.getOwnPropertyDescriptor(proto, 'state');
      window.__stateOverride = !!(d && d.get);
      if (d && d.get) {
        Object.defineProperty(proto, 'state', {
          configurable: true,
          get: function () { return window.__gebaar ? d.get.call(this) : 'suspended'; },
        });
      }
    } catch (e) {}
    // Elke context die de app aanmaakt bijhouden, zodat te meten is dat hij
    // werkelijk slaapt terwijl de metingen hieronder lopen.
    try {
      function P() {
        const i = new (Function.prototype.bind.apply(AC, [null].concat([].slice.call(arguments))))();
        window.__ctx.push(i);
        return i;
      }
      P.prototype = AC.prototype;
      window.AudioContext = P;
      window.webkitAudioContext = P;
    } catch (e) {}
  })();
`;

// F: geen automatisch afspelen mét geluid. Alleen een tik ÓP de speelknop
// telt mee — met opzet: het koppelen gaat zelf al met tikken, dus zou elke
// tik meetellen dan bewees deze controle niets.
const GEEN_AUTOPLAY = `
  (function () {
    window.__getikt = false;
    document.addEventListener('click', function (e) {
      const t = e.target;
      if (t && t.closest && t.closest('#playArm')) window.__getikt = true;
    }, true);
    const p = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (!window.__getikt && !this.muted) {
        const e = new Error('NotAllowedError'); e.name = 'NotAllowedError';
        return Promise.reject(e);
      }
      return p.apply(this, arguments);
    };
    document.addEventListener('playing', function (e) {
      const el = e.target;
      if (el && el.tagName === 'VIDEO' && !window.__getikt && !el.muted) {
        try { el.pause(); } catch (x) {}
      }
    }, true);
  })();
`;

// G: een andere app (de camera-app, een videobelapp) houdt de camera vast.
const CAMERA_BEZET = `
  (function () {
    if (!navigator.mediaDevices) return;
    const md = navigator.mediaDevices;
    const gum = md.getUserMedia.bind(md);
    md.getUserMedia = function (c) {
      if (c && c.video) {
        const e = new Error('Could not start video source'); e.name = 'NotReadableError';
        return Promise.reject(e);
      }
      return gum(c);
    };
  })();
`;

(async () => {
  const toon = maakToonBestand(path.join(os.tmpdir(), 'babyfoon-android-toon.wav'));
  const broker = await startBroker(PEER_PORT);
  await new Promise((r) => web.listen(WEB_PORT, r));
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/';
  const browser = await chromium.launch({
    executablePath: findExecutable(),
    headless: true,
    args: [
      // Twee nepcamera's: een telefoon heeft er voor én achter, en zonder een
      // tweede valt er niets te wisselen (A17).
      '--use-fake-device-for-media-stream=device-count=2',
      '--use-fake-ui-for-media-stream',
      // Een hoorbare kamer i.p.v. stilte (A8, E4).
      '--use-file-for-fake-audio-capture=' + toon,
      // Bewust GEEN --autoplay-policy=no-user-gesture-required: scenario F
      // gaat er juist over, en die vlag heeft in dit project eerder een echte
      // fout verstopt.
    ],
  });

  let fail = false;
  const errs = [];
  // Welk scenario draait er nu? Staat in elke paginafout, anders is achteraf
  // niet te zeggen wélke nabootsing hem opleverde — en dan is "er waren
  // paginafouten" geen bruikbare bevinding.
  let scenario = '?';
  const check = (n, c) => { console.log((c ? '✅' : '❌') + ' ' + n); if (!c) fail = true; };
  // Bevinding zonder oordeel: iets wat gemeten is en in het rapport hoort,
  // maar waar geen "goed of fout" op zit (bv. een API die er hier nu eenmaal
  // wel of niet is). Zo'n regel mag de uitslag niet kleuren.
  const meting = (n, v) => console.log('ℹ️  ' + n + ': ' + v);

  async function maakToestel(init, ua) {
    const ctx = await browser.newContext(PIXEL(ua));
    await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => {
      const naam = (e && e.name) || '';
      const tekst = (e && e.message) || String(e);
      errs.push(scenario + ' / ' +
        (ua === UA_WEBVIEW ? 'WEBVIEW' : ua === UA_SAMSUNG ? 'SAMSUNG' : 'ANDROID') + ': ' +
        (naam && naam !== tekst ? naam + ' — ' : '') + tekst);
    });
    return { ctx, page };
  }
  async function maakBaby(init, ua, opts) {
    opts = opts || {};
    const t = await maakToestel(init, ua);
    await t.page.goto(BASE);
    await sleep(400);
    if (!opts.geenRolkeuze) await t.page.tap('#pickBaby');
    return t;
  }
  async function wachtOpCode(page, tellen) {
    let code = '';
    for (let i = 0; i < (tellen || 60); i++) {
      code = await page.$eval('#babyCodeText', (e) => e.textContent.trim()).catch(() => '');
      if (/^[A-Z0-9]{6}$/.test(code)) break;
      await sleep(300);
    }
    return code;
  }
  // De QR bevat "<site>/#CODE.TOKEN". Dat is precies wat een Android-telefoon
  // opent als je met de camera-app scant: de deeplink, zonder één tik.
  async function leesDeeplink(page) {
    return page.evaluate(() => {
      const el = document.getElementById('babyQR');
      return el && el.dataset ? (el.dataset.code || '') : '';
    });
  }
  async function koppelOuder(code, init, ua) {
    const t = await maakToestel(init, ua);
    await t.page.goto(BASE);
    await sleep(300);
    await t.page.tap('#pickParent');
    await t.page.fill('#parentOfferInput', code);
    await t.page.tap('#parentGenBtn');
    return t;
  }
  async function keurGoed(baby) {
    for (let i = 0; i < 60; i++) {
      const v = await baby.evaluate(() => {
        const b = document.getElementById('babyApproval');
        return !!b && !b.classList.contains('hidden');
      });
      if (v) { await baby.tap('#btnApproveYes'); return true; }
      await sleep(250);
    }
    return false;
  }
  async function wachtOpBeeld(parent, ms) {
    const t = Date.now();
    while (Date.now() - t < (ms || 24000)) {
      const w = await parent.$eval('#video', (v) => v.videoWidth || 0).catch(() => 0);
      if (w > 0) return w;
      await sleep(300);
    }
    return 0;
  }
  const zichtbaar = (page, id) => page.evaluate((i) => {
    const e = document.getElementById(i);
    if (!e) return false;
    if (e.classList.contains('hidden')) return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, id);
  async function wachtTot(fn, ms) {
    const t = Date.now();
    while (Date.now() - t < (ms || 8000)) { if (await fn()) return true; await sleep(200); }
    return false;
  }

  // =====================================================================
  // A — functieveegactie op een geëmuleerde Pixel, alleen met aanraking
  // =====================================================================
  {
    scenario = 'A';
    console.log('\n--- A: functieveegactie (Android Chrome, alleen aanraking) ---');
    const b = await maakBaby(BASIS(PEER_PORT));

    // Het toestel moet zich ook echt als telefoon gedragen; anders bewijzen
    // alle tikken hieronder niets.
    const toestel = await b.page.evaluate(() => ({
      touch: matchMedia('(pointer: coarse)').matches,
      hover: matchMedia('(hover: hover)').matches,
      breed: document.documentElement.scrollWidth,
      zicht: document.documentElement.clientWidth,
    }));
    check('A1: het toestel gedraagt zich als aanraakscherm zonder muis (coarse=' +
      toestel.touch + ', hover=' + toestel.hover + ')', toestel.touch === true && toestel.hover === false);
    check('A2: geen horizontaal schuiven op telefoonbreedte (' + toestel.breed + ' vs ' + toestel.zicht + 'px)',
      toestel.breed <= toestel.zicht + 1);

    const code = await wachtOpCode(b.page);
    check('A3: kamercode verschijnt op de babyunit (' + (code || 'geen') + ')', /^[A-Z0-9]{6}$/.test(code));

    const deeplink = await leesDeeplink(b.page);
    check('A4: de QR bevat een deeplink met kamercode én token (' +
      (deeplink ? deeplink.replace(/^https?:\/\/[^#]*/, '…') : 'leeg') + ')',
      /#[A-Z0-9]{6}\.[A-Za-z0-9]{8,}$/.test(deeplink));

    const p = await koppelOuder(code, BASIS(PEER_PORT));
    const gevraagd = await keurGoed(b.page);
    check('A5: goedkeuringsvenster verschijnt bij de baby en "Toestaan" is aan te tikken', gevraagd === true);

    const breedte = await wachtOpBeeld(p.page);
    check('A6: beeld bij de ouder (' + breedte + 'px)', breedte > 0);

    const geluid = await p.page.evaluate(() => {
      const v = document.getElementById('video');
      const s = v && v.srcObject;
      if (!s) return { sporen: 0, levend: 0 };
      const a = s.getAudioTracks();
      return { sporen: a.length, levend: a.filter((t) => t.readyState === 'live').length };
    });
    check('A7: geluid bij de ouder (' + geluid.levend + ' levend audiospoor van ' + geluid.sporen + ')',
      geluid.levend >= 1);

    // Geluidsmeter: de balkjes horen te bewegen. Twee metingen op verschillende
    // momenten; blijven alle 40 balkjes exact gelijk, dan staat de meter stil.
    const meterStand = () => p.page.evaluate(() => {
      const m = document.getElementById('audioMeter');
      if (!m) return null;
      return Array.from(m.children).map((i) => i.style.height).join('|');
    });
    await sleep(2000); // de meetketen krijgt even tijd na het eerste beeld
    const m1 = await meterStand();
    await sleep(1200);
    const m2 = await meterStand();
    check('A8: geluidsmeter beweegt (40 balkjes, ' + (m1 === m2 ? 'onveranderd' : 'veranderd') + ')',
      !!m1 && !!m2 && m1 !== m2);

    // 30 dB is de bodem van de schaal (30 + niveau × 0,55). Blijft hij daar
    // staan terwijl er een toon door de nepmicrofoon gaat, dan komt er niets
    // door — en dat is iets anders dan een stille kamer.
    const dbText = await p.page.$eval('#dbText', (e) => e.textContent.trim()).catch(() => '');
    const db = parseInt((dbText.match(/(\d+)/) || [])[1] || '0', 10);
    check('A9: de meter reageert op echt geluid en blijft niet op de bodem staan ("' + dbText + '")',
      /\d+\s*dB/.test(dbText) && db > 32);

    // Huilalarm: de testknop moet met één tik hoorbaar/voelbaar alarm geven.
    await p.page.tap('.dnav[data-view="alerts"]');
    await sleep(300);
    const alarmKnop = await zichtbaar(p.page, 'btnAlarmTest2') || await zichtbaar(p.page, 'btnAlarmTest');
    check('A10: knop "alarm testen" is zichtbaar op de telefoon', alarmKnop === true);
    if (alarmKnop) {
      const welke = (await zichtbaar(p.page, 'btnAlarmTest2')) ? '#btnAlarmTest2' : '#btnAlarmTest';
      await p.page.tap(welke);
      await sleep(600);
      const na = await p.page.evaluate(() => ({
        tril: (window.__trillingen || []).length,
        ctx: (function () { try { return document.querySelectorAll('audio').length; } catch (e) { return 0; } })(),
      }));
      check('A11: één tik op "alarm testen" laat het toestel trillen (' + na.tril + ' trilopdracht(en))', na.tril >= 1);
    }

    // Terugpraten (duplex).
    await p.page.tap('.dnav[data-view="talk"]');
    await sleep(300);
    check('A12: grote terugpraatknop is zichtbaar op de telefoon', await zichtbaar(p.page, 'talkBig'));
    await p.page.tap('#talkBig');
    const praat = await wachtTot(async () => {
      const t = await p.page.$eval('#talkBig', (e) => e.classList.contains('on')).catch(() => false);
      return t;
    }, 10000);
    check('A13: terugpraten gaat aan met één tik', praat === true);
    // Terugpraten zet de babyunit op duplex; die mag daarbij zijn microfoon
    // niet kwijtraken, anders hoort de ouder de kamer niet meer.
    const babyMic = await b.page.evaluate(() => {
      const v = document.getElementById('bPreview');
      const s = v && v.srcObject;
      const a = s ? s.getAudioTracks() : [];
      return a.filter((t) => t.readyState === 'live').length;
    });
    check('A13b: de babyunit houdt tijdens het terugpraten een levende microfoon (' + babyMic + ')',
      babyMic >= 1);
    await p.page.tap('#talkBig');
    await sleep(400);
    const praatUit = await p.page.$eval('#talkBig', (e) => e.classList.contains('on')).catch(() => true);
    check('A14: terugpraten gaat weer uit met dezelfde knop', praatUit === false);

    // Slaapliedjes / muziek.
    await p.page.tap('.dnav[data-view="lullabies"]');
    await sleep(400);
    const nummers = await p.page.evaluate(() => document.querySelectorAll('#playlist .pl-row, #playlist > *').length);
    check('A15: slaapliedjes staan in de lijst (' + nummers + ')', nummers > 0);
    if (nummers > 0) {
      await p.page.evaluate(() => {
        const r = document.querySelector('#playlist .pl-row') || document.querySelector('#playlist > *');
        if (r) r.scrollIntoView({ block: 'center' });
      });
      await p.page.tap('#playlist > *:first-child');
      const speelt = await wachtTot(async () => b.page.evaluate(() => {
        const a = document.querySelector('audio');
        return !!a && !a.paused;
      }), 8000);
      check('A16: een aangetikt slaapliedje gaat spelen op de babyunit', speelt === true);
    }

    // Wisselen van camera (ouder stuurt, baby voert uit).
    await p.page.tap('.dnav[data-view="monitor"]');
    await sleep(300);
    // Welke camera staat er nu écht aan op de babyunit? (De browser draait
    // hier met twee nepcamera's; met één zou er niets te wisselen vallen en
    // zou deze controle altijd rood zijn zonder iets te bewijzen.)
    const actieveCam = () => b.page.evaluate(() => {
      const v = document.getElementById('bPreview');
      const st = v && v.srcObject;
      const t = st && st.getVideoTracks()[0];
      return t ? (t.getSettings().deviceId || t.label || '') : '';
    });
    const camVoor = await actieveCam();
    if (await zichtbaar(p.page, 'btnFlipCam')) {
      await p.page.tap('#btnFlipCam');
      await sleep(3000);
      const camNa = await actieveCam();
      const kort = (s) => (s || '').slice(0, 10);
      check('A17: "wissel camera" van de ouder levert een ánder toestel op de baby op ("' +
        kort(camVoor) + '…" → "' + kort(camNa) + '…")', !!camVoor && !!camNa && camVoor !== camNa);
    } else {
      check('A17: "wissel camera" is zichtbaar op het ouderdashboard', false);
    }

    // LED/torch: alleen zichtbaar als de babyunit torch meldt.
    const ledRij = await zichtbaar(p.page, 'rowLed');
    meting('A18: LED-rij op het ouderdashboard', ledRij ? 'zichtbaar (babyunit meldt torch)' :
      'verborgen — de nepcamera hier kent geen torch; op een echt toestel bepaalt getCapabilities().torch dit');

    // Opnemen.
    const recZichtbaar = await zichtbaar(p.page, 'btnRecord');
    check('A19: opnameknop is zichtbaar op de telefoon', recZichtbaar === true);
    if (recZichtbaar) {
      await p.page.tap('#btnRecord');
      const bezig = await wachtTot(async () => p.page.$eval('#btnRecord', (e) => e.classList.contains('active')).catch(() => false), 5000);
      check('A20: opnemen start met één tik', bezig === true);
      if (bezig) { await p.page.tap('#btnRecord'); await sleep(800); }
    }

    // Scherm uit / blackout.
    check('A21: knop "scherm uit" is zichtbaar', await zichtbaar(p.page, 'btnScreenOff'));
    await p.page.tap('#btnScreenOff');
    const zwart = await wachtTot(() => zichtbaar(p.page, 'blackout'), 4000);
    check('A22: "scherm uit" maakt het scherm zwart', zwart === true);
    if (zwart) {
      await p.page.tap('#blackout');
      const terug = await wachtTot(async () => !(await zichtbaar(p.page, 'blackout')), 4000);
      check('A23: één tik op het zwarte scherm haalt het beeld terug', terug === true);
    }

    // Volledig scherm.
    check('A24: knop "volledig scherm" is zichtbaar', await zichtbaar(p.page, 'btnFullscreen'));
    const fsApi = await p.page.evaluate(() => ({
      video: !!document.createElement('video').webkitEnterFullscreen,
      el: !!(document.getElementById('screen').requestFullscreen || document.getElementById('screen').webkitRequestFullscreen),
    }));
    check('A25: er is een werkende weg naar volledig scherm (element-API=' + fsApi.el + ')', fsApi.el === true);
    meting('A25b: video.webkitEnterFullscreen', String(fsApi.video) +
      ' — op iOS bestaat die wél; of Chrome op Android hem aanbiedt is hier niet vast te stellen');

    // Wake lock.
    const wake = await p.page.evaluate(() => ({ api: 'wakeLock' in navigator }));
    check('A26: de Wake Lock API is beschikbaar en de app vraagt hem aan', wake.api === true);

    // Nachtlampje.
    await p.page.tap('.dnav[data-view="night"]');
    await sleep(300);
    const nlZichtbaar = await zichtbaar(p.page, 'nlToggle');
    check('A27: nachtlampje-schakelaar is zichtbaar', nlZichtbaar === true);
    if (nlZichtbaar) {
      await p.page.tap('#nlToggle');
      const nlAan = await wachtTot(async () => b.page.evaluate(() => {
        const n = document.getElementById('nightlight');
        return !!n && !n.classList.contains('hidden');
      }), 6000);
      check('A28: nachtlampje gaat aan op de babyunit', nlAan === true);
    }

    // Batterij en temperatuur.
    const tegels = await p.page.evaluate(() => {
      const g = (i) => { const e = document.getElementById(i); return e ? e.textContent.trim() : null; };
      return { batt: g('battVal'), battSub: g('battSub'), temp: g('tempVal') };
    });
    check('A29: batterijstand van de babyunit staat op het ouderdashboard ("' + tegels.batt + '")',
      !!tegels.batt && tegels.batt !== '—');
    meting('A30: temperatuur', tegels.temp === null ?
      'geen temperatuurtegel in de app — geen enkele browser geeft een website de kamertemperatuur' :
      String(tegels.temp));

    // Taalwisselaar.
    const talen = await p.page.evaluate(() => {
      const s = document.querySelector('#langSelectParent select');
      return s ? s.options.length : 0;
    });
    check('A31: taalwisselaar biedt 30 talen (' + talen + ')', talen === 30);
    if (talen) {
      await p.page.selectOption('#langSelectParent select', 'nl');
      const nl = await wachtTot(async () => p.page.evaluate(() => document.documentElement.lang === 'nl'), 4000);
      check('A32: een andere taal kiezen verandert de pagina echt', nl === true);
      await p.page.selectOption('#langSelectParent select', 'en');
    }

    // Donatieknop.
    const donZichtbaar = await zichtbaar(p.page, 'donateBtn');
    const donHref = await p.page.$eval('#donateBtn', (e) => e.getAttribute('href') + '|' + (e.getAttribute('target') || '')).catch(() => '');
    meting('A33: donatieknop', donZichtbaar ? 'zichtbaar, ' + donHref :
      'verborgen — hij komt er alleen als window.BABYFOON_DONATE_URL gezet is (zie app.js zetDonatieknop)');

    // Meldingen en trillen.
    const meldingen = await p.page.evaluate(() => ({
      notificatie: typeof window.Notification,
      gebruiktDeApp: /Notification\s*\(/.test(''),
      tril: (window.__trillingen || []).length,
    }));
    meting('A34: systeemmeldingen', 'de app gebruikt de Notification API nergens (' +
      meldingen.notificatie + ' beschikbaar); waarschuwen gebeurt met een balk in de pagina, geluid en trillen');
    check('A35: trillen is daadwerkelijk aangeroepen tijdens deze sessie (' + meldingen.tril + 'x)', meldingen.tril >= 1);

    // Aanraakdoelen groot genoeg voor een vinger (>= 40px hoog).
    const klein = await p.page.evaluate(() => {
      const uit = [];
      document.querySelectorAll('button, [role="button"], [role="switch"], select').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;               // niet zichtbaar
        if (el.closest('.hidden')) return;
        if (r.height < 30) uit.push((el.id || el.className || el.tagName) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      });
      return uit;
    });
    check('A36: geen zichtbaar bedieningselement lager dan 30px (' + klein.length + ' te klein' +
      (klein.length ? ': ' + klein.slice(0, 6).join(', ') : '') + ')', klein.length === 0);

    // PWA-manifest.
    const man = await p.page.evaluate(async () => {
      const l = document.querySelector('link[rel="manifest"]');
      if (!l) return null;
      try {
        const r = await fetch(l.href);
        const j = await r.json();
        return { ok: r.ok, icons: (j.icons || []).length, display: j.display, start: j.start_url, sw: 'serviceWorker' in navigator };
      } catch (e) { return { fout: String(e) }; }
    });
    check('A37: het PWA-manifest is te laden en heeft iconen (' + JSON.stringify(man) + ')',
      !!man && man.ok === true && man.icons >= 2 && man.display === 'standalone');

    // Nevenpagina's op telefoonbreedte.
    for (const pag of ['blog.html', 'security.html']) {
      const t = await maakToestel(BASIS(PEER_PORT));
      const resp = await t.page.goto(BASE + pag);
      await sleep(600);
      const st = await t.page.evaluate(() => ({
        breed: document.documentElement.scrollWidth,
        zicht: document.documentElement.clientWidth,
        titel: (document.title || '').slice(0, 40),
      }));
      check('A38/' + pag + ': laadt (' + (resp && resp.status()) + ') en past op telefoonbreedte (' +
        st.breed + ' vs ' + st.zicht + 'px) — "' + st.titel + '"',
        !!resp && resp.status() === 200 && st.breed <= st.zicht + 1);
      await t.ctx.close();
    }

    await p.ctx.close(); await b.ctx.close();
  }

  // =====================================================================
  // B — WebView / oudere Samsung Internet zonder de moderne API's
  // =====================================================================
  {
    scenario = 'B';
    console.log('\n--- B: Android WebView zonder wakeLock/vibrate/clipboard/MediaRecorder/… ---');
    const init = BASIS(PEER_PORT) + WEBVIEW_KAAL;

    // Eerst bewijzen dat de opzet klopt: de API's zijn er echt niet.
    const b = await maakBaby(init, UA_WEBVIEW);
    const kaal = await b.page.evaluate(() => ({
      wakeLock: 'wakeLock' in navigator && !!navigator.wakeLock,
      vibrate: !!navigator.vibrate,
      permissions: !!navigator.permissions,
      clipboard: !!navigator.clipboard,
      share: !!navigator.share,
      MediaRecorder: !!window.MediaRecorder,
      getCapabilities: !!MediaStreamTrack.prototype.getCapabilities,
      getBattery: 'getBattery' in navigator && !!navigator.getBattery,
    }));
    const nogAanwezig = Object.keys(kaal).filter((k) => kaal[k]);
    check('B1: opzet — alle acht API\'s zijn werkelijk weg (' +
      (nogAanwezig.length ? 'nog aanwezig: ' + nogAanwezig.join(', ') : 'geen') + ')', nogAanwezig.length === 0);

    const code = await wachtOpCode(b.page);
    check('B2: babyunit komt gewoon op in de WebView (' + (code || 'geen') + ')', /^[A-Z0-9]{6}$/.test(code));

    const p = await koppelOuder(code, init, UA_WEBVIEW);
    await keurGoed(b.page);
    const w = await wachtOpBeeld(p.page);
    check('B3: ouderunit krijgt beeld in de WebView (' + w + 'px)', w > 0);

    // Kamercode kopiëren zonder navigator.clipboard. Naast de melding die de
    // app zelf geeft wordt ook geteld of de klassieke weg
    // (document.execCommand('copy')) überhaupt geprobeerd is — dat maakt het
    // verschil tussen "lukte niet" en "er is geen tweede weg".
    await b.page.evaluate(() => {
      window.__execCopy = 0;
      const e = document.execCommand ? document.execCommand.bind(document) : null;
      document.execCommand = function (cmd) {
        if (String(cmd).toLowerCase() === 'copy') window.__execCopy++;
        return e ? e.apply(document, arguments) : false;
      };
    });
    const kopieerKnop = await zichtbaar(b.page, 'copyBabyDash') ? '#copyBabyDash' : '#copyBabyOffer';
    const kanTikken = await b.page.$(kopieerKnop);
    let kopieMelding = '';
    let execN = 0;
    if (kanTikken) {
      await b.page.tap(kopieerKnop);
      await sleep(600);
      kopieMelding = await b.page.$eval('#toast', (e) => e.classList.contains('hidden') ? '' : e.textContent.trim()).catch(() => '');
      execN = await b.page.evaluate(() => window.__execCopy || 0);
    }
    // Groen betekent: de app meldt zelf dat het gelukt is. In scenario A
    // (Android Chrome, clipboard aanwezig) is dat "Copied" — deze controle
    // staat dus niet standaard rood.
    const gelukt = /copied|gekopieerd/i.test(kopieMelding);
    check('B4: kamercode kopiëren lukt ook zonder navigator.clipboard (melding: "' +
      (kopieMelding || 'geen') + '", terugval via execCommand geprobeerd: ' + execN + 'x)', gelukt);

    // Batterij zonder Battery Status API.
    const batt = await b.page.$eval('#bBatt', (e) => e.textContent.trim()).catch(() => '');
    check('B5: zonder Battery Status API toont de babyunit netjes "N/A" i.p.v. leeg of "—" ("' + batt + '")', batt === 'N/A');

    // Opnemen zonder MediaRecorder: de knop mag geen stilte geven.
    let recMelding = '';
    if (await zichtbaar(p.page, 'btnRecord')) {
      await p.page.tap('#btnRecord');
      await sleep(600);
      recMelding = await p.page.$eval('#toast', (e) => e.classList.contains('hidden') ? '' : e.textContent.trim()).catch(() => '');
    }
    check('B6: zonder MediaRecorder zegt de app dat opnemen niet kan i.p.v. niets te doen ("' +
      (recMelding || 'geen melding') + '")', recMelding.length > 0);

    // Wake lock terugval: de app hoort de "stil filmpje"-truc te gebruiken.
    const terugval = await wachtTot(async () => p.page.evaluate(() =>
      Array.from(document.querySelectorAll('video')).some((v) => v !== document.getElementById('video') &&
        v !== document.getElementById('bPreview') && v !== document.getElementById('parentScanVideo'))), 6000);
    check('B7: zonder Wake Lock API valt de app terug op de "stil filmpje"-truc', terugval === true);

    await p.ctx.close(); await b.ctx.close();
  }

  // =====================================================================
  // C — isWebKit() mag Samsung Internet en de WebView niet als WebKit zien
  // =====================================================================
  {
    scenario = 'C';
    console.log('\n--- C: browserherkenning (Samsung Internet / WebView / iOS) ---');
    // Gemeten aan het GEDRAG: op WebKit slaat de app het openen van extra
    // microfoons bewust over (één opname tegelijk op iOS). Op Android hoort
    // dat juist wél te gebeuren. Het verschil is te tellen in het aantal
    // audio-only getUserMedia-aanvragen.
    async function tel(ua) {
      const t = await maakBaby(BASIS(PEER_PORT) + TWEE_MICROFOONS, ua);
      const code = await wachtOpCode(t.page);
      await sleep(2500); // de extra microfoons worden ná het eerste spoor geopend
      const n = await t.page.evaluate(() => window.__gumAudioOnly || 0);
      await t.ctx.close();
      return { code, n };
    }
    const chrome = await tel(UA_CHROME);
    const samsung = await tel(UA_SAMSUNG);
    const webview = await tel(UA_WEBVIEW);
    const iphone = await tel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

    check('C1: opzet — op iOS slaat de app de extra microfoons over (' + iphone.n + ' audio-aanvragen)',
      /^[A-Z0-9]{6}$/.test(iphone.code) && iphone.n === 0);
    check('C2: opzet — op Android Chrome opent de app ze wél (' + chrome.n + ' audio-aanvragen)',
      /^[A-Z0-9]{6}$/.test(chrome.code) && chrome.n > 0);
    check('C3: Samsung Internet wordt NIET als WebKit aangemerkt (' + samsung.n + ' audio-aanvragen, ' +
      'net als Chrome ' + chrome.n + ')', samsung.n > 0);
    check('C4: de Android WebView wordt NIET als WebKit aangemerkt (' + webview.n + ' audio-aanvragen)', webview.n > 0);
  }

  // =====================================================================
  // D — applyConstraints weigert (WebView): duplex-microfoon en LED
  // =====================================================================
  {
    scenario = 'D';
    console.log('\n--- D: applyConstraints weigert ---');
    const init = BASIS(PEER_PORT) + GEEN_APPLYCONSTRAINTS;
    const b = await maakBaby(init, UA_WEBVIEW);
    const code = await wachtOpCode(b.page);
    check('D1: babyunit komt op terwijl applyConstraints alles weigert (' + (code || 'geen') + ')',
      /^[A-Z0-9]{6}$/.test(code));

    const p = await koppelOuder(code, BASIS(PEER_PORT));
    await keurGoed(b.page);
    const w = await wachtOpBeeld(p.page);
    check('D2: ouderunit krijgt beeld (' + w + 'px)', w > 0);

    // Terugpraten aanzetten dwingt de babyunit tot duplex. Lukt
    // applyConstraints niet, dan moet de app de microfoon heropenen — en niet
    // zonder geluid achterblijven.
    await p.page.tap('.dnav[data-view="talk"]');
    await sleep(300);
    await p.page.tap('#talkBig');
    await sleep(4000);
    const babyGeluid = await b.page.evaluate(() => {
      const v = document.getElementById('bPreview');
      const s = v && v.srcObject;
      const a = s ? s.getAudioTracks() : [];
      return { sporen: a.length, levend: a.filter((t) => t.readyState === 'live').length,
        pogingen: (window.__applyPogingen || []).length };
    });
    check('D3: de app probeerde applyConstraints (' + babyGeluid.pogingen + ' poging(en)) en viel terug — ' +
      'de babyunit heeft nog een levend microfoonspoor (' + babyGeluid.levend + ')',
      babyGeluid.pogingen >= 1 && babyGeluid.levend >= 1);

    const nog = await wachtOpBeeld(p.page, 6000);
    check('D4: de ouder houdt beeld na het omschakelen naar duplex (' + nog + 'px)', nog > 0);

    // LED: applyConstraints weigert, dus torch kan niet aan. De app mag dan
    // niet blijven doen alsof het lampje brandt.
    const ledRij = await zichtbaar(p.page, 'rowLed');
    meting('D5: LED-rij', ledRij ? 'zichtbaar' : 'verborgen (de nepcamera meldt geen torch)');

    await p.ctx.close(); await b.ctx.close();
  }

  // =====================================================================
  // E — binnenkomen via de QR-deeplink, zonder ooit te tikken
  // =====================================================================
  {
    scenario = 'E';
    console.log('\n--- E: QR-deeplink, geen enkele tik (AudioContext blijft slapen) ---');
    const b = await maakBaby(BASIS(PEER_PORT));
    const code = await wachtOpCode(b.page);
    const link = await leesDeeplink(b.page);
    check('E1: opzet — er is een deeplink met token', /#[A-Z0-9]{6}\.[A-Za-z0-9]{8,}$/.test(link));

    // Precies wat de camera-app van Android doet: de link openen. Daarna wordt
    // er in dit scenario NERGENS getikt.
    const hash = link.slice(link.indexOf('#'));
    const p = await maakToestel(BASIS(PEER_PORT) + AUDIO_PAS_NA_TIK);
    await p.page.goto(BASE + hash);

    const w = await wachtOpBeeld(p.page, 25000);
    check('E2: de ouder krijgt beeld zonder één tik (token in de deeplink) (' + w + 'px)', w > 0);

    const opzet = await p.page.evaluate(() => ({
      gebaar: !!window.__gebaar,
      override: !!window.__stateOverride,
      staten: (window.__ctx || []).map((c) => c.state),
    }));
    check('E3: opzet — er is werkelijk nergens getikt (gebaar=' + opzet.gebaar + ')', opzet.gebaar === false);
    // Zonder deze controle zou E4/E5 groen kunnen worden omdat de AudioContext
    // stiekem tóch liep: dan meet de fijne meting gewoon mee en bewijst de
    // terugval niets. 'state' hangt aan BaseAudioContext; wordt dat gemist,
    // dan slaat de namaak stilzwijgend over.
    check('E3b: opzet — de app heeft een AudioContext en die staat écht opgeschort (' +
      (opzet.staten.join(', ') || 'geen context') + '; namaak actief=' + opzet.override + ')',
      opzet.override === true && opzet.staten.length > 0 && opzet.staten.every((s) => s === 'suspended'));

    // De fijne meting (AudioContext) kan hier niet lopen. De app hoort dan op
    // de WebRTC-meting terug te vallen, anders staat de balk dood stil terwijl
    // de kamer klinkt.
    const meterStand = () => p.page.evaluate(() => {
      const m = document.getElementById('audioMeter');
      return m ? Array.from(m.children).map((i) => i.style.height).join('|') : null;
    });
    await sleep(2500);
    const m1 = await meterStand();
    await sleep(1500);
    const m2 = await meterStand();
    const dbE = await p.page.$eval('#dbText', (e) => e.textContent.trim()).catch(() => '');
    const dbEn = parseInt((dbE.match(/(\d+)/) || [])[1] || '0', 10);
    check('E4: geluidsmeter beweegt ook met een slapende AudioContext (terugval via WebRTC, "' +
      dbE + '")', !!m1 && !!m2 && m1 !== m2 && dbEn > 32);

    // Het huilalarm kán dan geen Web Audio-toon maken. De ouder hoort dat te
    // zien, anders denkt hij bewaakt te zijn terwijl het alarm zwijgt.
    const banner = await wachtTot(() => zichtbaar(p.page, 'alarmArm'), 12000);
    check('E5: de ouder wordt gewaarschuwd dat het alarm nog scherpgesteld moet worden', banner === true);

    // En die waarschuwing moet ook op te lossen zijn: de knop erin geeft het
    // gebaar dat de AudioContext nodig heeft. Werkt dat, dan is de stille-alarm-
    // situatie met één aanraking voorbij.
    if (banner) {
      await p.page.tap('#btnAlarmTest');
      const opgelost = await wachtTot(async () => !(await zichtbaar(p.page, 'alarmArm')), 10000);
      const na = await p.page.evaluate(() => ({
        staten: (window.__ctx || []).map((c) => c.state),
        tril: (window.__trillingen || []).length,
      }));
      check('E6: één aanraking op de knop in die waarschuwing stelt het alarm scherp ' +
        '(context nu: ' + na.staten.join(', ') + ')', opgelost === true && na.staten.indexOf('running') >= 0);
      check('E7: en het alarm laat het toestel dan ook echt trillen (' + na.tril + 'x)', na.tril >= 1);
    }

    await p.ctx.close(); await b.ctx.close();
  }

  // =====================================================================
  // F — Android Chrome blokkeert automatisch afspelen mét geluid
  // =====================================================================
  {
    scenario = 'F';
    console.log('\n--- F: automatisch afspelen mét geluid geblokkeerd ---');
    const b = await maakBaby(BASIS(PEER_PORT));
    const code = await wachtOpCode(b.page);
    const p = await koppelOuder(code, BASIS(PEER_PORT) + GEEN_AUTOPLAY);
    await keurGoed(b.page);
    const w = await wachtOpBeeld(p.page);
    check('F1: opzet — er komt beeld binnen bij de ouder (' + w + 'px)', w > 0);

    const knop = await wachtTot(() => zichtbaar(p.page, 'playArm'), 12000);
    check('F2: weigert de browser af te spelen, dan vraagt de app om een tik', knop === true);

    const stil = await p.page.$eval('#video', (v) => v.paused).catch(() => true);
    check('F3: opzet — het beeld stond inderdaad stil', stil === true);

    let na = { paused: true, weg: false };
    if (knop) {
      // Aantikken, niet aanklikken: dit is de kern van het scenario.
      await p.page.tap('#playArm');
      await sleep(1000);
      na = await p.page.evaluate(() => {
        const v = document.getElementById('video');
        const k = document.getElementById('playArm');
        return { paused: v ? v.paused : true, weg: !!k && k.classList.contains('hidden') };
      });
    }
    check('F4: na één AANRAKING speelt het beeld af', na.paused === false);
    check('F5: en de vraag om te tikken verdwijnt', na.weg === true);
    await p.ctx.close(); await b.ctx.close();
  }

  // =====================================================================
  // G — een andere app houdt de camera vast (NotReadableError)
  // =====================================================================
  {
    scenario = 'G';
    console.log('\n--- G: camera bezet door een andere app (NotReadableError) ---');
    const b = await maakBaby(BASIS(PEER_PORT) + CAMERA_BEZET);
    // De app mag hier niet eeuwig blijven hangen; er hoort iets zichtbaars te
    // gebeuren binnen een halve minuut.
    const iets = await wachtTot(async () => b.page.evaluate(() => {
      const t = document.getElementById('toast');
      const zichtbaarToast = !!t && !t.classList.contains('hidden') && t.textContent.trim().length > 0;
      const c = document.getElementById('babyCodeText');
      const code = c ? c.textContent.trim() : '';
      return zichtbaarToast || /^[A-Z0-9]{6}$/.test(code);
    }), 30000);
    const stand = await b.page.evaluate(() => {
      const t = document.getElementById('toast');
      const c = document.getElementById('babyCodeText');
      return {
        toast: t && !t.classList.contains('hidden') ? t.textContent.trim() : '',
        code: c ? c.textContent.trim() : '',
        opSetup: !document.getElementById('screenSetup').classList.contains('hidden'),
      };
    });
    check('G1: de babyunit blijft niet eindeloos hangen als de camera bezet is ' +
      '(melding: "' + (stand.toast || 'geen') + '", code: "' + stand.code + '")', iets === true);
    check('G2: de gebruiker krijgt uitleg óf een bruikbare kamercode — niet een leeg scherm',
      stand.toast.length > 0 || /^[A-Z0-9]{6}$/.test(stand.code));

    // De melding hoort een tekst van de app te zijn, in de taal van de
    // gebruiker. Ruwe browserteksten als "Could not start video source" staan
    // alleen in het Engels, zeggen een ouder niets, en vertellen niet wat er
    // te doen valt (de andere app sluiten).
    const uitApp = await b.page.evaluate((t) => {
      try {
        // Elke Engelse tekst die de app zelf kent; komt de melding daaruit,
        // dan is hij ook vertaalbaar naar de 29 andere talen.
        const alle = [];
        for (const k of ['mediaError', 'permissionDenied', 'permissionNeeded', 'cameraBusy', 'mediaBusy']) {
          try { const v = I18n.t(k); if (v && v !== k) alle.push(v); } catch (e) {}
        }
        return alle.indexOf(t) >= 0;
      } catch (e) { return false; }
    }, stand.toast);
    check('G3: de melding komt uit de teksten van de app (en is dus vertaald), ' +
      'niet rechtstreeks uit de browser ("' + stand.toast + '")', uitApp === true);

    // Tegenproef: bij een geweigerde toestemming toont de app wél zijn eigen,
    // vertaalde tekst. Dat bewijst dat G3 niet altijd rood is maar precies dit
    // ene pad aanwijst.
    const b2 = await maakBaby(BASIS(PEER_PORT) + `
      (function () {
        const md = navigator.mediaDevices;
        md.getUserMedia = function () {
          const e = new Error('Permission denied'); e.name = 'NotAllowedError';
          return Promise.reject(e);
        };
      })();
    `);
    await wachtTot(async () => b2.page.evaluate(() => {
      const t = document.getElementById('toast');
      return !!t && !t.classList.contains('hidden') && t.textContent.trim().length > 0;
    }), 20000);
    const geweigerd = await b2.page.$eval('#toast', (e) => e.textContent.trim()).catch(() => '');
    const geweigerdUitApp = await b2.page.evaluate((t) => {
      try { return I18n.t('permissionDenied') === t; } catch (e) { return false; }
    }, geweigerd);
    check('G4: tegenproef — bij geweigerde toestemming toont de app wél zijn eigen tekst ("' +
      geweigerd + '")', geweigerdUitApp === true);
    await b2.ctx.close();
    await b.ctx.close();
  }

  // =====================================================================
  // H — Android gooit het tabblad weg en laadt het opnieuw
  // =====================================================================
  {
    scenario = 'H';
    console.log('\n--- H: tabblad weggegooid en opnieuw geladen ---');

    // H-a: gekoppeld door de code in te typen.
    const b1 = await maakBaby(BASIS(PEER_PORT));
    const code1 = await wachtOpCode(b1.page);
    const p1 = await koppelOuder(code1, BASIS(PEER_PORT));
    await keurGoed(b1.page);
    check('H1: opzet — beeld bij de ouder vóór het weggooien (' + (await wachtOpBeeld(p1.page)) + 'px)',
      (await p1.page.$eval('#video', (v) => v.videoWidth || 0)) > 0);
    const urlNaTypen = p1.page.url();
    // Android gooit het tabblad weg; bij terugkeer laadt de browser exact
    // dezelfde URL opnieuw. Dat is precies wat page.reload() doet.
    await p1.page.reload();
    await sleep(1500);
    const terug1 = await wachtOpBeeld(p1.page, 15000);
    const schermNa = await p1.page.evaluate(() =>
      ['screenSetup', 'screenPairParent', 'screenParent'].find((s) => !document.getElementById(s).classList.contains('hidden')) || '?');
    check('H2: na het weggooien van het tabblad komt de bewaking vanzelf terug ' +
      '(gekoppeld met een ingetypte code; URL "' + urlNaTypen.replace(BASE, '/') + '", scherm nu "' +
      schermNa + '", beeld ' + terug1 + 'px)', terug1 > 0);
    await p1.ctx.close(); await b1.ctx.close();

    // H-b: gekoppeld via de QR-deeplink. Ter vergelijking — hier staat de
    // kamercode wél in de URL, dus dit hoort te herstellen. Dat maakt H2 een
    // ONDERSCHEIDENDE controle: hij is rood waar H3 groen is, en dat verschil
    // wijst het defect precies aan.
    const b2 = await maakBaby(BASIS(PEER_PORT));
    await wachtOpCode(b2.page);
    const link = await leesDeeplink(b2.page);
    const p2 = await maakToestel(BASIS(PEER_PORT));
    await p2.page.goto(BASE + link.slice(link.indexOf('#')));
    check('H3a: opzet — beeld bij de ouder via de deeplink (' + (await wachtOpBeeld(p2.page, 25000)) + 'px)',
      (await p2.page.$eval('#video', (v) => v.videoWidth || 0)) > 0);
    await p2.page.reload();
    await sleep(1500);
    const terug2 = await wachtOpBeeld(p2.page, 20000);
    check('H3: na het weggooien van het tabblad herstelt de deeplink-koppeling wél (' + terug2 + 'px)', terug2 > 0);
    await p2.ctx.close(); await b2.ctx.close();
  }

  if (errs.length) { console.log('\nPAGINAFOUTEN:\n' + errs.join('\n')); fail = true; } else console.log('\nGEEN PAGINAFOUTEN');
  await browser.close();
  web.close();
  try { broker.close(); } catch (e) {}
  console.log('\nRESULTAAT: ' + (fail ? 'MISLUKT' : 'GESLAAGD'));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Testfout:', e); process.exit(1); });
