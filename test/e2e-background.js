'use strict';
/**
 * Scherm-uit en achtergrond-test.
 *
 * Gemeld geval: "als mijn telefoonscherm uitgaat stopt het geluid, en op de
 * babyunit wil ik het scherm uit terwijl de microfoon doorloopt".
 *
 * Wat een website daar wél aan kan doen, wordt hier getest. Wat een website
 * daar níét aan kan doen (echt afspelen met een vergrendelde iPhone) staat
 * eerlijk in de app zelf — zie de sleutel `lockScreenWarn`.
 *
 * Getest wordt:
 *   1. Babyunit merkt dat het toestel het microfoonspoor stilzet ('mute') en
 *      meldt dat aan de ouderunit in plaats van stil te blijven.
 *   2. Die melding verdwijnt weer zodra het spoor is heropend.
 *   3. Bij terugkeer uit de achtergrond herstelt de babyunit een spoor dat
 *      gedempt is blijven staan (niet alleen een spoor dat 'ended' is).
 *   4. De ouderunit registreert MediaSession-metadata en -knoppen, zodat er
 *      bediening op het vergrendelscherm verschijnt.
 *   5. "Scherm uit" maakt het scherm zwart terwijl het geluid doorspeelt.
 *   6. Terugkeer uit de achtergrond herverbindt NIET nodeloos als er alleen
 *      geluid binnenkomt (geen levend videospoor).
 *   7. De wake lock wordt ook na 'pageshow' opnieuw aangevraagd.
 *   8. De terugvaltruc voor browsers zonder Wake Lock API start zichzelf
 *      opnieuw als het stille filmpje gepauzeerd raakt.
 *
 * Bewust ZONDER --autoplay-policy=no-user-gesture-required: die vlag heeft
 * eerder een echte fout gemaskeerd. Alle klikken in deze test leveren een
 * echte gebruikersinteractie op, dus afspelen mag gewoon.
 *
 *   npm run test:background
 */
const path = require('path');
const http = require('http');
const fs = require('fs');
const { chromium } = require('playwright');
const { PeerServer } = require('peer');

const ROOT = process.env.APP_ROOT || path.join(__dirname, '..', 'serverless');
const WEB_PORT = Number(process.env.WEB_PORT || 8791);
const PEER_PORT = Number(process.env.PEER_PORT || 9791);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml', '.woff2': 'font/woff2' };
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

// Alles wat we later vanuit de pagina moeten kunnen aanraken, wordt hier
// klaargezet vóórdat de app laadt: elk uitgereikt mediaspoor, elke
// MediaSession-actie en een namaak-wakeLock die we kunnen laten loslaten.
const INIT = (peerPort) => `
  window.BABYFOON_PEER = { host: '127.0.0.1', port: ${peerPort}, path: '/', key: 'peerjs', secure: false };
  // Korte hersteltijd, anders duurt de test onnodig lang.
  window.BABYFOON_MUTE_HERSTEL = 1200;
  window.__sporen = [];
  window.__gumN = 0;
  (function () {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function (c) {
      window.__gumN++;
      return gum(c).then(function (s) {
        s.getTracks().forEach(function (t) { window.__sporen.push(t); });
        return s;
      });
    };
  })();
  window.__wakeN = 0;
  window.__wakeLocks = [];
  (function () {
    const nep = {
      request: function () {
        window.__wakeN++;
        const l = {
          type: 'screen', released: false, __h: [],
          addEventListener: function (n, f) { if (n === 'release') this.__h.push(f); },
          release: function () { this.released = true; this.__h.forEach(function (f) { f(); }); return Promise.resolve(); },
        };
        window.__wakeLocks.push(l);
        return Promise.resolve(l);
      },
    };
    try { Object.defineProperty(navigator, 'wakeLock', { value: nep, configurable: true }); } catch (e) {}
  })();
  window.__msActies = [];
  (function () {
    if (!navigator.mediaSession || !navigator.mediaSession.setActionHandler) return;
    const ms = navigator.mediaSession;
    const o = ms.setActionHandler.bind(ms);
    ms.setActionHandler = function (n, f) { window.__msActies.push(n + ':' + (f ? 'fn' : 'leeg')); return o(n, f); };
  })();
`;

// Zelfde init, maar met TWEE microfooningangen. De echte fake-camera van
// Chromium levert er maar één, en dan slaat openExtraMicrofoons() zichzelf
// over — precies de code die we hier willen zien draaien. We doen dus alsof
// er een tweede ingang is en halen de exacte deviceId er weer af vlak voordat
// de browser hem te zien krijgt, zodat de nepmicrofoon gewoon antwoordt.
const INIT_TWEE_MICS = (peerPort) => INIT(peerPort) + `
  window.__extraMicN = 0;
  (function () {
    if (!navigator.mediaDevices) return;
    const md = navigator.mediaDevices;
    const enu = md.enumerateDevices.bind(md);
    md.enumerateDevices = function () {
      return enu().then(function (l) {
        const a = l.filter(function (d) { return d.kind === 'audioinput'; })[0];
        if (!a) return l;
        const eerste = { kind: 'audioinput', deviceId: 'mic-een', groupId: 'g1', label: 'Mic 1', toJSON: function () { return this; } };
        const tweede = { kind: 'audioinput', deviceId: 'mic-twee', groupId: 'g2', label: 'Mic 2', toJSON: function () { return this; } };
        return l.filter(function (d) { return d.kind !== 'audioinput'; }).concat([eerste, tweede]);
      });
    };
    const gum = md.getUserMedia.bind(md);
    md.getUserMedia = function (c) {
      try {
        if (c && c.audio && c.audio.deviceId && c.audio.deviceId.exact) {
          window.__extraMicN++;
          c = Object.assign({}, c, { audio: Object.assign({}, c.audio) });
          delete c.audio.deviceId;
        }
      } catch (e) {}
      return gum(c);
    };
  })();
`;

// Zelfde init, maar zónder Wake Lock API — zo komt de terugvaltruc
// (stil filmpje afspelen) aan bod, net als op iOS vóór 16.4.
const INIT_ZONDER_WAKELOCK = (peerPort) => INIT(peerPort) + `
  try { delete Navigator.prototype.wakeLock; } catch (e) {}
  try { Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true }); delete navigator.wakeLock; } catch (e) {}
`;

(async () => {
  PeerServer({ port: PEER_PORT, path: '/', host: '127.0.0.1' });
  await new Promise((r) => web.listen(WEB_PORT, r));
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/';

  const browser = await chromium.launch({
    executablePath: findExecutable(), headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  let fail = false;
  const check = (n, c) => { console.log((c ? '✅' : '❌') + ' ' + n); if (!c) fail = true; };
  const errs = [];

  async function paar(initBaby, initParent) {
    const cb = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await cb.addInitScript(initBaby || INIT(PEER_PORT));
    const baby = await cb.newPage();
    baby.on('pageerror', (e) => errs.push('BABY: ' + e.message));
    await baby.goto(BASE); await sleep(400);
    await baby.click('#pickBaby');
    let code = '';
    for (let i = 0; i < 60; i++) { code = await baby.$eval('#babyCodeText', (e) => e.textContent.trim()).catch(() => ''); if (/^[A-Z0-9]{6}$/.test(code)) break; await sleep(300); }

    const cp = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await cp.addInitScript(initParent || INIT(PEER_PORT));
    const parent = await cp.newPage();
    parent.on('pageerror', (e) => errs.push('PARENT: ' + e.message));
    await parent.goto(BASE); await sleep(300);
    await parent.click('#pickParent');
    await parent.fill('#parentOfferInput', code);
    await parent.click('#parentGenBtn');
    for (let i = 0; i < 60; i++) {
      const v = await baby.evaluate(() => { const b = document.getElementById('babyApproval'); return !!b && !b.classList.contains('hidden'); });
      if (v) { await baby.click('#btnApproveYes'); break; }
      await sleep(250);
    }
    let w = 0;
    for (let i = 0; i < 80; i++) { w = await parent.$eval('#video', (v) => v.videoWidth || 0).catch(() => 0); if (w > 0) break; await sleep(300); }
    return { baby, parent, code, cb, cp, beeld: w };
  }

  // ==================================================================
  // 1 & 2 — babyunit merkt een stilgezette microfoon en meldt dat
  // ==================================================================
  const A = await paar();
  check('Opzet A: ouderunit heeft beeld van de babyunit (' + A.beeld + 'px)', A.beeld > 0);

  // De babyunit opent bij het starten al meerdere microfoons; alleen een
  // TOENAME ná de onderbreking bewijst dat er echt hersteld is.
  const gumVoorA = await A.baby.evaluate(() => window.__gumN || 0);

  // Het toestel dat het microfoonspoor stilzet, precies zoals iOS doet bij
  // scherm-uit of een app-wissel: het spoor blijft leven, maar levert niets.
  const gedempt = await A.baby.evaluate(() => {
    const t = (window.__sporen || []).filter((x) => x.kind === 'audio' && x.readyState === 'live')[0];
    if (!t) return 'geen microfoonspoor gevonden';
    try { Object.defineProperty(t, 'muted', { get: () => true, configurable: true }); } catch (e) {}
    t.dispatchEvent(new Event('mute'));
    return '';
  });
  check('Testopzet: het ruwe microfoonspoor kon stilgezet worden' + (gedempt ? ' — ' + gedempt : ''), gedempt === '');

  let babyStatus = '';
  for (let i = 0; i < 20; i++) {
    babyStatus = await A.baby.$eval('#bConnSub', (e) => e.textContent.trim()).catch(() => '');
    if (/interrupt/i.test(babyStatus)) break;
    await sleep(150);
  }
  check('Babyunit toont dat de microfoon onderbroken is ("' + babyStatus + '")', /interrupt/i.test(babyStatus));

  let melding = {};
  for (let i = 0; i < 20; i++) {
    melding = await A.parent.evaluate(() => {
      const p = document.getElementById('streamAlert');
      const s = document.getElementById('monitorAlerts');
      return { bestaat: !!p, zichtbaar: !!p && !p.classList.contains('hidden'), strook: !!s && !s.classList.contains('hidden'), tekst: p ? p.textContent.trim() : '' };
    });
    if (melding.zichtbaar) break;
    await sleep(150);
  }
  check('Ouderunit waarschuwt zichtbaar dat er geen geluid binnenkomt ("' + melding.tekst + '")',
    melding.bestaat && melding.zichtbaar && melding.strook);

  // Herstel: na de wachttijd hoort de babyunit de microfoon opnieuw te openen
  // en de waarschuwing bij de ouder weer weg te halen.
  let hersteld = false;
  let gumNa = gumVoorA;
  for (let i = 0; i < 40; i++) {
    gumNa = await A.baby.evaluate(() => window.__gumN || 0);
    hersteld = melding.zichtbaar && await A.parent.evaluate(() => {
      const p = document.getElementById('streamAlert');
      return !!p && p.classList.contains('hidden');
    });
    if (hersteld && gumNa > gumVoorA) break;
    await sleep(250);
  }
  check('Babyunit opent de microfoon zelf opnieuw (' + gumVoorA + ' → ' + gumNa + ' getUserMedia-aanvragen)', gumNa > gumVoorA);
  check('Waarschuwing bij de ouderunit verdwijnt weer na het herstel', hersteld);

  await A.cp.close(); await A.cb.close();

  // ==================================================================
  // 3 — terugkeer uit de achtergrond herstelt een gedempt gebleven spoor
  // ==================================================================
  const B = await paar();
  check('Opzet B: ouderunit heeft beeld van de babyunit (' + B.beeld + 'px)', B.beeld > 0);
  // Geen 'mute'-event dit keer (iOS levert dat lang niet altijd): alleen een
  // spoor dat gedempt blijkt zodra de pagina weer zichtbaar wordt.
  const gumVoorB = await B.baby.evaluate(() => {
    const t = (window.__sporen || []).filter((x) => x.kind === 'audio' && x.readyState === 'live')[0];
    if (t) { try { Object.defineProperty(t, 'muted', { get: () => true, configurable: true }); } catch (e) {} }
    return window.__gumN || 0;
  });
  await B.baby.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  let gumNaB = gumVoorB;
  for (let i = 0; i < 30; i++) {
    gumNaB = await B.baby.evaluate(() => window.__gumN || 0);
    if (gumNaB > gumVoorB) break;
    await sleep(200);
  }
  check('Terugkeer uit de achtergrond heropent een gedempt spoor (' + gumVoorB + ' → ' + gumNaB + ')', gumNaB > gumVoorB);
  await B.cp.close(); await B.cb.close();

  // ==================================================================
  // 4, 5, 6, 7 — ouderunit: vergrendelscherm-bediening, scherm uit,
  //              geen nodeloze herverbinding, wake lock na pageshow
  // ==================================================================
  const C = await paar();
  check('Opzet C: ouderunit heeft beeld van de babyunit (' + C.beeld + 'px)', C.beeld > 0);

  const ms = await C.parent.evaluate(() => {
    const m = navigator.mediaSession;
    return {
      titel: m && m.metadata ? m.metadata.title : '',
      stand: m ? m.playbackState : '',
      acties: (window.__msActies || []).join(','),
    };
  });
  check('Ouderunit zet MediaSession-metadata ("' + ms.titel + '")', ms.titel === 'BabyPhone.online');
  check('MediaSession staat op "playing" ("' + ms.stand + '")', ms.stand === 'playing');
  check('Play- en pauzeknop voor het vergrendelscherm zijn geregistreerd',
    /(^|,)play:fn(,|$)/.test(ms.acties) && /(^|,)pause:fn(,|$)/.test(ms.acties));

  // ---- scherm uit ----
  const heeftKnop = await C.parent.evaluate(() => !!document.getElementById('btnScreenOff') && !!document.getElementById('blackout'));
  check('Ouderdashboard heeft een "Scherm uit"-knop', heeftKnop);
  if (heeftKnop) await C.parent.click('#btnScreenOff');
  await sleep(400);
  const zwart = await C.parent.evaluate(async () => {
    const b = document.getElementById('blackout');
    const v = document.getElementById('video');
    const t0 = v ? v.currentTime : 0;
    await new Promise((r) => setTimeout(r, 1200));
    return {
      zichtbaar: !!b && !b.classList.contains('hidden'),
      dekt: !!b && getComputedStyle(b).position === 'fixed',
      speelt: !!v && !v.paused && v.currentTime > t0,
    };
  });
  check('Het scherm gaat volledig zwart', zwart.zichtbaar && zwart.dekt);
  check('Geluid en beeld lopen door terwijl het scherm zwart is', zwart.zichtbaar && zwart.speelt);
  if (zwart.zichtbaar) await C.parent.click('#blackout');
  await sleep(300);
  const weerAan = await C.parent.evaluate(() => {
    const b = document.getElementById('blackout');
    return !!b && b.classList.contains('hidden');
  });
  check('Tikken op het zwarte scherm haalt het dashboard terug', zwart.zichtbaar && weerAan);

  // ---- geen nodeloze herverbinding bij alleen geluid ----
  await C.parent.evaluate(() => {
    window.__peerN = 0;
    const O = window.Peer;
    const W = function () {
      window.__peerN++;
      const a = Array.prototype.slice.call(arguments);
      return new (Function.prototype.bind.apply(O, [null].concat(a)))();
    };
    W.prototype = O.prototype;
    window.Peer = W;
    // Alleen-geluid nabootsen: geen levend videospoor meer, wél audio.
    const v = document.getElementById('video');
    if (v && v.srcObject) v.srcObject.getVideoTracks().forEach((t) => t.stop());
  });
  await sleep(200);
  const audioLeeft = await C.parent.evaluate(() => {
    const v = document.getElementById('video');
    if (!v || !v.srcObject) return false;
    return v.srcObject.getAudioTracks().some((t) => t.readyState === 'live') &&
      !v.srcObject.getVideoTracks().some((t) => t.readyState === 'live');
  });
  check('Testopzet: alleen nog een levend geluidsspoor, geen beeldspoor', audioLeeft);
  await C.parent.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await sleep(2000);
  const peerN = await C.parent.evaluate(() => window.__peerN || 0);
  check('Terugkeer bij alleen geluid bouwt de verbinding NIET nodeloos opnieuw op (' + peerN + ' nieuwe verbindingen)', peerN === 0);

  // ---- wake lock opnieuw aanvragen na pageshow ----
  const wakeVoor = await C.parent.evaluate(() => {
    const n = window.__wakeN || 0;
    const l = (window.__wakeLocks || [])[window.__wakeLocks.length - 1];
    if (l) l.release();     // het systeem laat de lock los (zoals bij tab-wissel)
    return n;
  });
  check('Testopzet: de ouderunit had een wake lock aangevraagd (' + wakeVoor + ')', wakeVoor >= 1);
  await C.parent.evaluate(() => window.dispatchEvent(new Event('pageshow')));
  let wakeNa = wakeVoor;
  for (let i = 0; i < 15; i++) {
    wakeNa = await C.parent.evaluate(() => window.__wakeN || 0);
    if (wakeNa > wakeVoor) break;
    await sleep(150);
  }
  check('Wake lock wordt na "pageshow" opnieuw aangevraagd (' + wakeVoor + ' → ' + wakeNa + ')', wakeNa > wakeVoor);
  await C.cp.close(); await C.cb.close();

  // ==================================================================
  // 8 — terugval zonder Wake Lock API: het stille filmpje herstart zichzelf
  // ==================================================================
  const D = await paar(INIT_ZONDER_WAKELOCK(PEER_PORT), INIT_ZONDER_WAKELOCK(PEER_PORT));
  check('Opzet D: ouderunit heeft beeld zonder Wake Lock API (' + D.beeld + 'px)', D.beeld > 0);
  const truc = await D.parent.evaluate(() => {
    const alle = Array.prototype.slice.call(document.querySelectorAll('video'));
    const v = alle.filter((x) => x.style && x.style.width === '1px')[0];
    if (!v) return { bestaat: false };
    return {
      bestaat: true,
      muteAttribuut: v.hasAttribute('muted'),
      inline: v.hasAttribute('playsinline'),
    };
  });
  check('Zonder Wake Lock API draait de terugval (stil filmpje)', truc.bestaat);
  check('Dat filmpje heeft het muted-ATTRIBUUT (WebKit weigert afspelen zonder)', !!truc.muteAttribuut && !!truc.inline);
  const herstart = await D.parent.evaluate(async () => {
    const alle = Array.prototype.slice.call(document.querySelectorAll('video'));
    const v = alle.filter((x) => x.style && x.style.width === '1px')[0];
    if (!v) return false;
    v.pause();
    if (!v.paused) return false;          // pauzeren lukte niet: geen bewijs
    await new Promise((r) => setTimeout(r, 1500));
    return !v.paused;
  });
  check('Een gepauzeerd terugval-filmpje start binnen 1,5 s vanzelf weer', herstart);
  await D.cp.close(); await D.cb.close();

  // ==================================================================
  // 9 — scherm-uit mag een wéggevallen verbinding niet verbergen
  //
  // Het zwarte scherm ligt als vaste laag (z-index 3000) over ÁLLE schermen
  // heen. Raakt de babyfoon intussen de verbinding kwijt, dan schrijft de
  // ouderunit netjes een foutmelding, zet het bolletje uit en slaat alarm —
  // maar de ouder ziet daar niets van: het scherm blijft gewoon zwart. Voor
  // een babyfoon is dat het gevaarlijkste geval dat er is: het lijkt alsof
  // er meegeluisterd wordt terwijl er niets meer binnenkomt. Zodra de app
  // het opgeeft, moet het zwarte scherm dus wijken.
  // ==================================================================
  const E = await paar(INIT(PEER_PORT), INIT(PEER_PORT) + `
    // Snel opgeven, anders duurt deze test een halve minuut.
    window.BABYFOON_RECONNECT_DELAYS = [400];
  `);
  check('Opzet E: ouderunit heeft beeld van de babyunit (' + E.beeld + 'px)', E.beeld > 0);
  await E.parent.click('#btnScreenOff');
  await sleep(400);
  const zwartE = await E.parent.evaluate(() => {
    const b = document.getElementById('blackout');
    return !!b && !b.classList.contains('hidden');
  });
  check('Opzet E: het scherm staat op zwart vóór de wegval', zwartE);

  // De babyunit valt weg terwijl het scherm zwart is.
  await E.cb.close();
  let opgegeven = false;
  let statusE = '';
  for (let i = 0; i < 120; i++) {
    const s = await E.parent.evaluate(() => {
      const e = document.getElementById('parentError');
      const c = document.getElementById('connText');
      return {
        fout: !!e && !e.classList.contains('hidden') && e.textContent.trim().length > 3,
        tekst: c ? c.textContent.trim() : '',
      };
    });
    statusE = s.tekst;
    if (s.fout) { opgegeven = true; break; }
    await sleep(300);
  }
  check('Opzet E: de ouderunit geeft het op en toont een foutmelding (status: "' + statusE + '")', opgegeven);
  await sleep(600);
  const naWegval = await E.parent.evaluate(() => {
    const b = document.getElementById('blackout');
    const e = document.getElementById('parentError');
    return {
      zwart: !!b && !b.classList.contains('hidden'),
      melding: !!e && !e.classList.contains('hidden') ? e.textContent.trim() : '',
    };
  });
  check('Het zwarte scherm wijkt zodra de verbinding weg is (nu ' +
    (naWegval.zwart ? 'nog zwart' : 'weer zichtbaar') + ', melding: "' + naWegval.melding + '")',
  opgegeven && !naWegval.zwart);
  await E.cp.close();

  // ==================================================================
  // 10 — na een microfoonherstel moeten de EXTRA microfoons terugkomen
  //
  // De babyunit opent alle microfoons van het toestel en telt ze bij elkaar
  // op, zodat geluid uit de hele kamer wordt opgepikt. Het herstelpad sluit
  // ze allemaal (dat moet: iOS geeft een tweede opname pas vrij als de eerste
  // écht dicht is), maar bouwde de keten daarna weer op zonder ze opnieuw te
  // openen. Gevolg: na één onderbreking luistert de babyunit de rest van de
  // nacht met één microfoon in plaats van alle.
  // ==================================================================
  const F = await paar(INIT_TWEE_MICS(PEER_PORT), INIT(PEER_PORT));
  check('Opzet F: ouderunit heeft beeld van de babyunit (' + F.beeld + 'px)', F.beeld > 0);
  let extraVoor = 0;
  for (let i = 0; i < 40; i++) {
    extraVoor = await F.baby.evaluate(() => window.__extraMicN || 0);
    if (extraVoor > 0) break;
    await sleep(250);
  }
  check('Testopzet: de babyunit opent bij de start een extra microfoon (' + extraVoor + 'x)', extraVoor > 0);

  // Het toestel zet het ruwe microfoonspoor stil; de app hoort te herstellen.
  const gedemptF = await F.baby.evaluate(() => {
    const t = (window.__sporen || []).filter((x) => x.kind === 'audio' && x.readyState === 'live')[0];
    if (!t) return 'geen microfoonspoor gevonden';
    try { Object.defineProperty(t, 'muted', { get: () => true, configurable: true }); } catch (e) {}
    t.dispatchEvent(new Event('mute'));
    return '';
  });
  check('Testopzet F: het ruwe microfoonspoor kon stilgezet worden' + (gedemptF ? ' — ' + gedemptF : ''), gedemptF === '');

  const gumVoorF = await F.baby.evaluate(() => window.__gumN || 0);
  let herstelF = false;
  for (let i = 0; i < 40; i++) {
    herstelF = (await F.baby.evaluate(() => window.__gumN || 0)) > gumVoorF;
    if (herstelF) break;
    await sleep(250);
  }
  check('Opzet F: de babyunit heeft de microfoon opnieuw geopend', herstelF);
  await sleep(1500);
  const extraNa = await F.baby.evaluate(() => window.__extraMicN || 0);
  check('Na het herstel luistert de babyunit weer met álle microfoons (' +
    extraVoor + ' → ' + extraNa + ')', herstelF && extraNa > extraVoor);
  await F.cp.close(); await F.cb.close();

  if (errs.length) { console.log('\nPAGINAFOUTEN:\n' + errs.join('\n')); fail = true; } else console.log('\nGEEN PAGINAFOUTEN');
  await browser.close(); web.close();
  console.log('\nRESULTAAT: ' + (fail ? 'MISLUKT' : 'GESLAAGD'));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Testfout:', e); process.exit(1); });
