'use strict';

/**
 * End-to-end WEBKIT (Safari op iPhone/iPad, en daar ook Chrome/Firefox/Edge —
 * dat zijn allemaal Safari-schillen).
 *
 *   npm run test:webkit
 *
 * Er is hier geen echte Safari beschikbaar. Wat deze suite wél kan: het
 * GEDRAG nabootsen waarin WebKit aantoonbaar van Chrome verschilt, en meten
 * of de app dat overleeft. Elk scenario hieronder is een verschil dat in de
 * praktijk tot "werkt op mijn laptop, niet op mijn iPhone" leidt:
 *
 *   A. Eén opname tegelijk. Een tweede getUserMedia laat de eerste niet
 *      staan maar BEËINDIGT hem. De babyunit verloor daarmee camera én
 *      microfoon zodra hij extra microfoons probeerde te openen.
 *   B. Geen automatisch afspelen. Beeld mét geluid start niet zonder tik van
 *      de gebruiker; de afwijzing verdween in een lege catch en liet een
 *      zwart scherm achter bij een verbinding die gewoon stond.
 *   C. Strenge ICE-configuratie. { urls: [a, b, c] } in één ingang wordt niet
 *      betrouwbaar verwerkt; oudere WebKit struikelt er zelfs over bij het
 *      opzetten van de verbinding.
 *   D. Strenge cameravoorwaarden. Een onhaalbare eis levert een
 *      OverconstrainedError op in plaats van "dan maar iets anders".
 *   E. Toestemming duurt langer. Safari vraagt het per sessie opnieuw, dus
 *      het venster moet elke keer gelezen en aangetikt worden.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { chromium } = require('playwright');
const { ExpressPeerServer } = require('peer');

const ROOT = process.env.APP_ROOT || path.join(__dirname, '..', 'serverless');
const WEB_PORT = Number(process.env.WEB_PORT || 8795);
const PEER_PORT = Number(process.env.PEER_PORT || 9795);
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

// --- bouwstenen voor de nagebootste WebKit-eigenaardigheden ----------------

const BASIS = (peerPort) => `
  window.BABYFOON_PEER = { host: '127.0.0.1', port: ${peerPort}, path: '/', key: 'peerjs', secure: false };
  window.__gumN = 0;
  window.__sporen = [];
`;

// Doet zich voor als Safari op een iPhone. De app leest de useragent om te
// bepalen of ze op WebKit draait.
const ALS_IPHONE = `
  try {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, get: function () {
      return 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
    } });
  } catch (e) {}
`;

// A: één opname tegelijk — elke nieuwe getUserMedia beëindigt de vorige.
const EEN_OPNAME_TEGELIJK = `
  (function () {
    if (!navigator.mediaDevices) return;
    const md = navigator.mediaDevices;
    const gum = md.getUserMedia.bind(md);
    window.__vorigeStreams = [];
    md.getUserMedia = function (c) {
      window.__gumN++;
      // Precies wat iOS doet: wat er al liep, wordt beëindigd.
      window.__vorigeStreams.forEach(function (s) {
        try { s.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
      });
      return gum(c).then(function (s) {
        window.__vorigeStreams.push(s);
        s.getTracks().forEach(function (t) { window.__sporen.push(t); });
        return s;
      });
    };
    // Twee microfooningangen, zodat de code die extra microfoons opent zich
    // niet vanzelf overslaat. De verzonnen deviceId wordt er weer afgehaald
    // vlak voordat de browser hem te zien krijgt.
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
    const echteGum = md.getUserMedia.bind(md);
    md.getUserMedia = function (c) {
      const k = JSON.parse(JSON.stringify(c || {}));
      if (k && k.audio && k.audio.deviceId) delete k.audio.deviceId;
      if (k && k.video && k.video.deviceId) delete k.video.deviceId;
      return echteGum(k);
    };
  })();
`;

// B: geen automatisch afspelen zolang er niet getikt is.
//
// Alleen een tik óp de speelknop telt hier mee. Dat is met opzet: op iOS
// geldt een gebaar maar kort, en de beeldstroom komt seconden later binnen —
// het tikken tijdens het koppelen helpt dan niet meer. Zou elke tik meetellen,
// dan zou deze test niets bewijzen, want het koppelen zelf gaat al met tikken.
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
        const e = new Error('NotAllowedError');
        e.name = 'NotAllowedError';
        return Promise.reject(e);
      }
      return p.apply(this, arguments);
    };
    // Het autoplay-ATTRIBUUT omzeilt play() volledig: de browser begint dan
    // zelf. WebKit weigert ook dát zonder gebaar, dus zetten we alles met
    // geluid meteen weer stil zolang er niet getikt is.
    document.addEventListener('playing', function (e) {
      const el = e.target;
      if (el && el.tagName === 'VIDEO' && !window.__getikt && !el.muted) {
        try { el.pause(); } catch (x) {}
      }
    }, true);
  })();
`;

// C: oudere WebKit struikelt over een ICE-ingang met meerdere URL's.
const STRENGE_ICE = `
  (function () {
    window.__iceIngangen = [];
    const O = window.RTCPeerConnection;
    function P(cfg) {
      const servers = (cfg && cfg.iceServers) || [];
      servers.forEach(function (s) {
        const meer = Array.isArray(s.urls) && s.urls.length > 1;
        window.__iceIngangen.push(meer ? 'MEERVOUDIG' : 'enkel');
        if (meer) throw new Error('InvalidAccessError: one URL per ICE server entry');
      });
      return new (Function.prototype.bind.apply(O, [null].concat([].slice.call(arguments))))();
    }
    P.prototype = O.prototype;
    ['generateCertificate'].forEach(function (k) { if (O[k]) P[k] = O[k].bind(O); });
    window.RTCPeerConnection = P;
  })();
`;

// D: een onhaalbare eis levert een OverconstrainedError op.
const STRENGE_EISEN = `
  (function () {
    if (!navigator.mediaDevices) return;
    const md = navigator.mediaDevices;
    const gum = md.getUserMedia.bind(md);
    md.getUserMedia = function (c) {
      window.__gumN++;
      const v = c && c.video;
      if (v && typeof v === 'object' && v.frameRate) {
        const e = new Error('OverconstrainedError'); e.name = 'OverconstrainedError';
        return Promise.reject(e);
      }
      return gum(c);
    };
  })();
`;

// E: de toestemming laat lang op zich wachten.
const TRAGE_TOESTEMMING = (ms) => `
  (function () {
    if (!navigator.mediaDevices) return;
    const md = navigator.mediaDevices;
    const gum = md.getUserMedia.bind(md);
    let eerste = true;
    md.getUserMedia = function (c) {
      window.__gumN++;
      if (!eerste) return gum(c);
      eerste = false;
      return new Promise(function (goed, af) {
        setTimeout(function () { gum(c).then(goed, af); }, ${ms});
      });
    };
  })();
`;

(async () => {
  const broker = await startBroker(PEER_PORT);
  await new Promise((r) => web.listen(WEB_PORT, r));
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/';
  const browser = await chromium.launch({
    executablePath: findExecutable(),
    headless: true,
    // Bewust GEEN --autoplay-policy=no-user-gesture-required: die vlag heeft
    // in dit project eerder een echte fout gemaskeerd, en scenario B gaat er
    // juist over.
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });

  let fail = false;
  const errs = [];
  const check = (n, c) => { console.log((c ? '✅' : '❌') + ' ' + n); if (!c) fail = true; };

  async function maakBaby(init) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('BABY: ' + e.message));
    await page.goto(BASE);
    await sleep(400);
    await page.click('#pickBaby');
    return { ctx, page };
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
  async function koppelOuder(code, init) {
    const ctx = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await ctx.addInitScript(init);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errs.push('PARENT: ' + e.message));
    await page.goto(BASE);
    await sleep(300);
    await page.click('#pickParent');
    await page.fill('#parentOfferInput', code);
    await page.click('#parentGenBtn');
    return { ctx, page };
  }
  async function keurGoed(baby) {
    for (let i = 0; i < 60; i++) {
      const v = await baby.evaluate(() => {
        const b = document.getElementById('babyApproval');
        return !!b && !b.classList.contains('hidden');
      });
      if (v) { await baby.click('#btnApproveYes'); return true; }
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

  // =================================================================
  // A — één opname tegelijk
  // =================================================================
  {
    const init = BASIS(PEER_PORT) + ALS_IPHONE + EEN_OPNAME_TEGELIJK;
    const b = await maakBaby(init);
    const code = await wachtOpCode(b.page);
    check('A: babyunit start op een nagebootste iPhone en toont een kamercode (' + (code || 'geen') + ')',
      /^[A-Z0-9]{6}$/.test(code));

    const leeft = await b.page.evaluate(() => {
      const s = window.__sporen || [];
      return {
        totaal: s.length,
        levend: s.filter((t) => t.readyState === 'live').length,
        audio: s.filter((t) => t.kind === 'audio' && t.readyState === 'live').length,
        video: s.filter((t) => t.kind === 'video' && t.readyState === 'live').length,
        gum: window.__gumN || 0,
      };
    });
    check('A: camera én microfoon van de babyunit leven nog (' + leeft.video + ' beeld, ' +
      leeft.audio + ' geluid, ' + leeft.gum + ' opnameaanvragen)',
      leeft.audio >= 1 && leeft.video >= 1);

    const p = await koppelOuder(code, BASIS(PEER_PORT) + ALS_IPHONE);
    await keurGoed(b.page);
    const w = await wachtOpBeeld(p.page);
    check('A: ouderunit krijgt beeld (' + w + 'px)', w > 0);
    await p.ctx.close(); await b.ctx.close();
  }

  // =================================================================
  // B — geen automatisch afspelen zonder tik
  // =================================================================
  {
    const b = await maakBaby(BASIS(PEER_PORT));
    const code = await wachtOpCode(b.page);
    const p = await koppelOuder(code, BASIS(PEER_PORT) + ALS_IPHONE + GEEN_AUTOPLAY);
    await keurGoed(b.page);
    const w = await wachtOpBeeld(p.page);
    check('B: opzet — er komt beeld binnen bij de ouderunit (' + w + 'px)', w > 0);

    // De app doet vier pogingen met 400 ms ertussen; daarna hoort de vraag
    // om een tik te verschijnen.
    let zichtbaar = false;
    for (let i = 0; i < 40; i++) {
      zichtbaar = await p.page.evaluate(() => {
        const k = document.getElementById('playArm');
        return !!k && !k.classList.contains('hidden');
      });
      if (zichtbaar) break;
      await sleep(250);
    }
    check('B: weigert de browser af te spelen, dan vraagt de app om een tik', zichtbaar);

    const gepauzeerd = await p.page.$eval('#video', (v) => v.paused).catch(() => true);
    check('B: opzet — het beeld stond inderdaad stil', gepauzeerd === true);

    // Alleen tikken als de knop er werkelijk is. Op code zónder deze knop
    // moet de suite een nette rode uitslag geven en niet halverwege
    // afbreken — anders blijft ongemeten wat de scenario's daarna doen.
    let na = { paused: true, knopWeg: false };
    if (zichtbaar) {
      await p.page.click('#playArm');
      await sleep(900);
      na = await p.page.evaluate(() => {
        const v = document.getElementById('video');
        const k = document.getElementById('playArm');
        return { paused: v ? v.paused : true, knopWeg: !!k && k.classList.contains('hidden') };
      });
    }
    check('B: na de tik speelt het beeld af', na.paused === false);
    check('B: en de knop verdwijnt weer', na.knopWeg === true);
    await p.ctx.close(); await b.ctx.close();
  }

  // =================================================================
  // C — strenge ICE-configuratie
  // =================================================================
  {
    const init = BASIS(PEER_PORT) + ALS_IPHONE + STRENGE_ICE;
    const b = await maakBaby(init);
    const code = await wachtOpCode(b.page);
    check('C: babyunit komt op met strenge ICE-regels (' + (code || 'geen') + ')',
      /^[A-Z0-9]{6}$/.test(code));

    const p = await koppelOuder(code, init);
    await keurGoed(b.page);
    const w = await wachtOpBeeld(p.page);
    check('C: verbinding komt tot stand met strenge ICE-regels (' + w + 'px)', w > 0);

    const ing = await p.page.evaluate(() => window.__iceIngangen || []);
    const meervoudig = ing.filter((x) => x === 'MEERVOUDIG').length;
    check('C: geen enkele ICE-ingang heeft meerdere URL\'s (' + ing.length +
      ' ingangen bekeken, ' + meervoudig + ' meervoudig)', ing.length > 0 && meervoudig === 0);
    await p.ctx.close(); await b.ctx.close();
  }

  // =================================================================
  // D — onhaalbare cameravoorwaarde
  // =================================================================
  {
    const init = BASIS(PEER_PORT) + ALS_IPHONE + STRENGE_EISEN;
    const b = await maakBaby(init);
    const code = await wachtOpCode(b.page);
    check('D: babyunit start ondanks een geweigerde beeldsnelheid (' + (code || 'geen') + ')',
      /^[A-Z0-9]{6}$/.test(code));

    const p = await koppelOuder(code, BASIS(PEER_PORT));
    await keurGoed(b.page);
    const w = await wachtOpBeeld(p.page);
    check('D: ouderunit krijgt beeld (' + w + 'px)', w > 0);
    await p.ctx.close(); await b.ctx.close();
  }

  // =================================================================
  // E — trage toestemming
  // =================================================================
  {
    const WACHT = 26000; // ruim boven de oude grens van 20 s
    const init = BASIS(PEER_PORT) + ALS_IPHONE + TRAGE_TOESTEMMING(WACHT);
    const b = await maakBaby(init);
    const code = await wachtOpCode(b.page, 160); // ruim de tijd geven
    check('E: babyunit start ook als de toestemming ' + Math.round(WACHT / 1000) +
      ' seconden duurt (' + (code || 'geen') + ')', /^[A-Z0-9]{6}$/.test(code));
    await b.ctx.close();
  }

  if (errs.length) { console.log('\nPAGINAFOUTEN:\n' + errs.join('\n')); fail = true; } else console.log('\nGEEN PAGINAFOUTEN');
  await browser.close();
  web.close();
  try { broker.close(); } catch (e) {}
  console.log('\nRESULTAAT: ' + (fail ? 'MISLUKT' : 'GESLAAGD'));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Testfout:', e); process.exit(1); });
