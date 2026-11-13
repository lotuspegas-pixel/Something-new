'use strict';

/**
 * End-to-end HUILALARM-BALK: blijft de melding staan, en springt het beeld niet?
 *
 *   npm run test:alarm
 *
 * De klacht van de eigenaar: "als er geluid is gaat de alarm af, dan komt en
 * verdwijnt een balk in de browser waardoor het videovenster steeds snel
 * achter elkaar heen en weer beweegt."
 *
 * De oorzaak zat in meterTick(): bij elk beeldje (~60x per seconde) werd de
 * "Crying detected"-pil getoond zodra het geluid boven de drempel kwam en weer
 * verborgen zodra het eronder zakte, en daarmee de hele strook boven het
 * beeld, die een eigen rij in het raster heeft. Schommelt het geluid rond de
 * drempel, dan wisselt dat met de snelheid van de beeldjes en schuift het
 * videovenster mee.
 *
 * Gewenst gedrag: de balk is er ALTIJD en verandert alleen van kleur en tekst.
 * Wat deze suite bewaakt:
 *
 *   A. Het geluid schommelt rond de drempel (0,3 s aan, 0,3 s uit). Het
 *      videovenster mag dan geen enkele pixel verplaatsen, de strook mag niet
 *      verschijnen of verdwijnen, en de balk is bij elke meting zichtbaar.
 *   B. Het alarm werkt nog: de balk komt in de alarmkleur en zegt "Crying
 *      detected", er is dus echt gehuil gedetecteerd (anders meet A niets).
 *   C. Hij valt vanzelf terug naar de rustkleur als het stil wordt, en blijft
 *      daarbij staan.
 *   D. Alarm uitzetten verandert de balk (grijs, "Alarm off") maar haalt hem
 *      niet weg; en een taalwissel laat hem niet op de oude tekst staan.
 *   E. Hetzelfde op een telefoonbreedte.
 *
 * APP_ROOT wijst naar een andere map (bv. dist/), standaard serverless/.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const { chromium } = require('playwright');
const { ExpressPeerServer } = require('peer');

const ROOT = path.resolve(process.env.APP_ROOT || path.join(__dirname, '..', 'serverless'));
const WEB_PORT = Number(process.env.WEB_PORT || 8807);
const PEER_PORT = Number(process.env.PEER_PORT || 9807);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.woff2': 'font/woff2' };
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
      for (const sub of ['chrome-linux64', 'chrome-linux']) {
        const p = path.join(base, d, sub, 'chrome');
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (e) { /* geen map: laat Playwright zelf zoeken */ }
  return undefined;
}

// Een kamer waarvan het geluid rond de drempel schommelt: 0,3 s een toon (ruim
// boven de drempel), 0,3 s stilte, en zo door. De nepmicrofoon speelt dit
// bestand in een lus. Zo komt precies de situatie van de klacht na: geluid dat
// bij elk beeldje net wel of net niet boven de drempel zit.
function maakSchommelendGeluid(file) {
  const rate = 48000, sec = 6, n = rate * sec;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const luid = Math.floor(t / 0.3) % 2 === 0;
    const v = luid ? Math.sin(2 * Math.PI * 500 * t) * 0.9 : 0;
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  return file;
}

const INIT = (peerPort) => `
  window.BABYFOON_PEER = { host: '127.0.0.1', port: ${peerPort}, path: '/', key: 'peerjs', secure: false };
`;

let fail = false;
const check = (n, c, extra) => { console.log((c ? '✅' : '❌') + ' ' + n + (extra ? '  — ' + extra : '')); if (!c) fail = true; };

(async () => {
  const geluid = maakSchommelendGeluid(path.join(os.tmpdir(), 'babyfoon-alarm-schommel.wav'));
  const broker = await startBroker(PEER_PORT);
  await new Promise((r) => web.listen(WEB_PORT, r));
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/';
  const browser = await chromium.launch({
    executablePath: findExecutable(),
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--use-file-for-fake-audio-capture=' + geluid],
  });
  const errs = [];

  // Zet een babyunit en een ouderunit aan elkaar; geeft de ouderpagina terug.
  async function koppel(naam, viewport, mobiel) {
    const cb = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await cb.addInitScript(INIT(PEER_PORT));
    const baby = await cb.newPage();
    baby.on('pageerror', (e) => errs.push(naam + ' BABY: ' + e.message));
    await baby.goto(BASE); await sleep(400);
    await baby.click('#pickBaby');
    let code = '';
    for (let i = 0; i < 60; i++) {
      code = await baby.$eval('#babyCodeText', (e) => e.textContent.trim()).catch(() => '');
      if (/^[A-Z0-9]{6}$/.test(code)) break;
      await sleep(300);
    }
    const cp = await browser.newContext({ viewport, isMobile: !!mobiel, hasTouch: !!mobiel, deviceScaleFactor: mobiel ? 2 : 1 });
    await cp.addInitScript(INIT(PEER_PORT));
    const ouder = await cp.newPage();
    ouder.on('pageerror', (e) => errs.push(naam + ' OUDER: ' + e.message));
    await ouder.goto(BASE); await sleep(400);
    await ouder.click('#pickParent');
    await ouder.fill('#parentOfferInput', code);
    await ouder.click('#parentGenBtn');
    for (let i = 0; i < 60; i++) {
      const v = await baby.evaluate(() => { const b = document.getElementById('babyApproval'); return !!b && !b.classList.contains('hidden'); });
      if (v) { await baby.click('#btnApproveYes'); break; }
      await sleep(250);
    }
    let w = 0;
    for (let i = 0; i < 80 && !w; i++) {
      w = await ouder.$eval('#video', (v) => v.videoWidth || 0).catch(() => 0);
      if (!w) await sleep(300);
    }
    return { baby, ouder, w, sluit: async () => { await cb.close(); await cp.close(); } };
  }

  // Meet in de ouderpagina gedurende `ms` milliseconden, elke 25 ms: waar het
  // videovenster staat, of de strook en de balk zichtbaar zijn, en hoe de balk
  // eruitziet. Daarnaast tellen MutationObservers hoe vaak de klasse "hidden"
  // van de strook en van de balk wisselt.
  const MEET = (ms) => `new Promise((klaar) => {
    const strook = document.getElementById('monitorAlerts');
    const balk = document.getElementById('cryAlert');
    const video = document.getElementById('video');
    const wissels = { strook: 0, balk: 0 };
    const obs = (el, k) => { if (!el) return; let was = el.classList.contains('hidden');
      new MutationObserver(() => { const nu = el.classList.contains('hidden'); if (nu !== was) { wissels[k]++; was = nu; } })
        .observe(el, { attributes: true, attributeFilter: ['class'] }); };
    obs(strook, 'strook'); obs(balk, 'balk');
    const zicht = (el) => { if (!el || el.classList.contains('hidden')) return false;
      const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const m = [];
    const t0 = Date.now();
    const iv = setInterval(() => {
      const r = video ? video.getBoundingClientRect() : { top: -1, height: -1 };
      const bovenOpPagina = r.top + window.scrollY;
      const cs = balk ? getComputedStyle(balk) : null;
      m.push({ t: Date.now() - t0, top: Math.round(bovenOpPagina * 10) / 10, hoogte: Math.round(r.height * 10) / 10,
        strook: zicht(strook), balk: zicht(balk), tekst: balk ? balk.textContent.trim() : '',
        kleur: cs ? cs.backgroundColor + ' | ' + cs.backgroundImage : '', stand: balk ? (balk.getAttribute('data-state') || '') : '' });
      if (Date.now() - t0 >= ${ms}) { clearInterval(iv); klaar({ m, wissels }); }
    }, 25);
  })`;

  const samenvatting = (res) => {
    const m = res.m;
    const tops = [...new Set(m.map((x) => x.top))];
    let sprongen = 0; for (let i = 1; i < m.length; i++) if (m[i].top !== m[i - 1].top) sprongen++;
    const kleuren = [...new Set(m.filter((x) => x.balk).map((x) => x.kleur))];
    const teksten = [...new Set(m.filter((x) => x.balk).map((x) => x.tekst))];
    const altijdZichtbaar = m.every((x) => x.balk);
    const alarmGezien = m.some((x) => x.balk && /crying detected/i.test(x.tekst));
    return { tops, sprongen, kleuren, teksten, altijdZichtbaar, alarmGezien, wissels: res.wissels, n: m.length };
  };

  for (const [naam, viewport, mobiel] of [['desktop 1280x900', { width: 1280, height: 900 }, false], ['telefoon 390x844', { width: 390, height: 844 }, true]]) {
    console.log('\n--- ' + naam + ' ---');
    const P = await koppel(naam, viewport, mobiel);
    check('opzet (' + naam + '): de ouderunit krijgt beeld', P.w > 0, P.w + 'px');
    if (!P.w) { await P.sluit(); continue; }
    await sleep(2500); // eerste alarm laten afgaan; vanaf hier schommelt het echt

    // ---- A + B: geluid dat rond de drempel schommelt
    const res = await P.ouder.evaluate(MEET(14000));
    const s = samenvatting(res);
    check('B: er is echt gehuil gedetecteerd (de balk zei "Crying detected")', s.alarmGezien, 'teksten: ' + JSON.stringify(s.teksten));
    check('A1: het videovenster staat de hele tijd op dezelfde plek', s.tops.length === 1, s.tops.length + ' verschillende standen: ' + JSON.stringify(s.tops.slice(0, 6)) + ', ' + s.sprongen + ' sprongen in ' + s.n + ' metingen');
    check('A2: de strook boven het beeld verschijnt of verdwijnt niet', s.wissels.strook === 0, s.wissels.strook + ' keer gewisseld');
    check('A3: de alarmbalk verschijnt of verdwijnt niet', s.wissels.balk === 0, s.wissels.balk + ' keer gewisseld');
    check('A4: de alarmbalk is bij elke meting zichtbaar', s.altijdZichtbaar);
    // Aanhoudend geluid = aanhoudend alarmkleur. Dat is het ontwerp, en precies het
    // tegenovergestelde van flikkeren: de balk springt niet terug naar rust zodra
    // het geluid even onder de drempel zakt.
    check('A5: tijdens het schommelende geluid blijft de balk in één kleur (de alarmkleur), geen geflikker', s.kleuren.length === 1 && /rgb\(200, 67, 47\)/.test(s.kleuren[0]), JSON.stringify(s.kleuren));

    // ---- C: stil maken -> vanzelf terug naar rust, en de balk blijft staan
    await P.ouder.evaluate(() => { const s = document.getElementById('alSens'); if (s) { s.value = '0'; s.dispatchEvent(new Event('input')); } });
    await sleep(500);
    const stil = samenvatting(await P.ouder.evaluate(MEET(9000)));
    const laatste = stil.teksten[stil.teksten.length - 1] || '';
    check('C1: de balk blijft zichtbaar terwijl het stil wordt', stil.altijdZichtbaar);
    check('C2: het videovenster blijft ook hier op zijn plek', stil.tops.length === 1, JSON.stringify(stil.tops.slice(0, 6)));
    check('C3: hij valt vanzelf terug naar de rustkleur en zegt niet meer "Crying detected"', !/crying detected/i.test(laatste) && stil.kleuren.length >= 1, 'laatste tekst: "' + laatste + '"');
    const rustKleur = (stil.kleuren[stil.kleuren.length - 1] || '');
    check('C4: de rustkleur is een andere dan de alarmkleur (de balk verandert van kleur, hij verdwijnt niet)', rustKleur !== '' && rustKleur !== s.kleuren[0], s.kleuren[0] + '  →  ' + rustKleur);

    // ---- D: alarm uit -> balk verandert, verdwijnt niet; taalwissel
    const voor = await P.ouder.evaluate(() => { const b = document.getElementById('cryAlert'); const c = getComputedStyle(b); return { kleur: c.backgroundColor + ' | ' + c.backgroundImage, top: Math.round((document.getElementById('video').getBoundingClientRect().top + window.scrollY) * 10) / 10 }; });
    await P.ouder.click('#btnAlarm');
    await sleep(400);
    const uit = await P.ouder.evaluate(() => { const b = document.getElementById('cryAlert'); const r = b.getBoundingClientRect(); const c = getComputedStyle(b); return { zicht: !b.classList.contains('hidden') && r.width > 0, tekst: b.textContent.trim(), kleur: c.backgroundColor + ' | ' + c.backgroundImage, top: Math.round((document.getElementById('video').getBoundingClientRect().top + window.scrollY) * 10) / 10, verwacht: window.I18n.t('alarmOff') }; });
    check('D1: met het alarm uit staat de balk er nog, met "Alarm off"', uit.zicht && uit.tekst === uit.verwacht, '"' + uit.tekst + '"');
    check('D2: en heeft dan een andere kleur dan met het alarm aan', uit.kleur !== voor.kleur, voor.kleur + ' → ' + uit.kleur);
    check('D3: en het videovenster verschuift er niet van', uit.top === voor.top, voor.top + ' → ' + uit.top);
    await P.ouder.evaluate(() => window.I18n.setLang('nl'));
    await sleep(400);
    const nl = await P.ouder.evaluate(() => ({ tekst: document.getElementById('cryAlert').textContent.trim(), verwacht: window.I18n.t('alarmOff') }));
    check('D4: na een taalwissel staat de balk niet op de oude tekst', nl.tekst === nl.verwacht, '"' + nl.tekst + '" (verwacht "' + nl.verwacht + '")');
    await P.ouder.evaluate(() => window.I18n.setLang('en'));
    await P.ouder.click('#btnAlarm');
    await sleep(400);
    const aan = await P.ouder.evaluate(() => ({ tekst: document.getElementById('cryAlert').textContent.trim(), verwacht: window.I18n.t('alarmOn') }));
    check('D5: weer aanzetten geeft "Alarm on"', aan.tekst === aan.verwacht, '"' + aan.tekst + '"');

    // ---- E: de balk is in elke taal en elke stand even hoog en niet afgekapt.
    // Dat is de reden dat het beeld niet meer schuift: een tweeregelige tekst in
    // één taal of stand zou de rij groter maken.
    const meetTalen = () => P.ouder.evaluate(() => {
      const b = document.getElementById('cryAlert');
      const uit = [];
      for (const l of window.I18n.LANGS) {
        window.I18n.setLang(l.code);
        const r = b.getBoundingClientRect();
        uit.push({ code: l.code, h: Math.round(r.height * 10) / 10, afgekapt: b.scrollWidth > b.clientWidth + 1, stand: b.getAttribute('data-state') });
      }
      window.I18n.setLang('en');
      return uit;
    });
    const stand = (naam, lijst) => {
      const hoogtes = [...new Set(lijst.map((x) => x.h))];
      const afgekapt = lijst.filter((x) => x.afgekapt).map((x) => x.code);
      return { hoogtes, afgekapt, standen: [...new Set(lijst.map((x) => x.stand))], n: lijst.length };
    };
    await P.ouder.evaluate(() => { const sl = document.getElementById('alSens'); sl.value = '0'; sl.dispatchEvent(new Event('input')); });
    await sleep(5000);
    const eRust = stand('rust', await meetTalen());
    await P.ouder.click('#btnAlarm'); await sleep(400);
    const eUit = stand('uit', await meetTalen());
    await P.ouder.click('#btnAlarm');
    await P.ouder.evaluate(() => { const sl = document.getElementById('alSens'); sl.value = '55'; sl.dispatchEvent(new Event('input')); });
    for (let i = 0; i < 40; i++) {
      if ((await P.ouder.$eval('#cryAlert', (e) => e.getAttribute('data-state'))) === 'alarm') break;
      await sleep(250);
    }
    const eAlarm = stand('alarm', await meetTalen());
    check('E1: rust, uit en alarm hebben in alle 30 talen dezelfde hoogte', eRust.n === 30 && eUit.n === 30 && eAlarm.n === 30 && new Set([...eRust.hoogtes, ...eUit.hoogtes, ...eAlarm.hoogtes]).size === 1,
      'standen: ' + eRust.standen + ' / ' + eUit.standen + ' / ' + eAlarm.standen + '; hoogtes: ' + JSON.stringify([...new Set([...eRust.hoogtes, ...eUit.hoogtes, ...eAlarm.hoogtes])]));
    check('E2: en in geen enkele taal of stand is de tekst afgekapt', eRust.afgekapt.length + eUit.afgekapt.length + eAlarm.afgekapt.length === 0,
      JSON.stringify({ rust: eRust.afgekapt, uit: eUit.afgekapt, alarm: eAlarm.afgekapt }));
    check('E3: de drie standen zijn alle drie echt gemeten (rust, uit, alarm)', eRust.standen[0] === 'on' && eUit.standen[0] === 'off' && eAlarm.standen[0] === 'alarm', eRust.standen + ' ' + eUit.standen + ' ' + eAlarm.standen);
    await P.sluit();
  }

  await browser.close();
  broker.close();
  web.close();
  check('geen pagina-fouten', errs.length === 0, errs.join(' | '));
  console.log('\nRESULTAAT: ' + (fail ? 'MISLUKT' : 'GESLAAGD'));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Testfout:', e); process.exit(1); });
