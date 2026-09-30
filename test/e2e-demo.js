'use strict';

/**
 * End-to-end DEMO-OMSTANDIGHEDEN — waarom faalt de app juist als het ertoe doet?
 *
 * Meldpunt van de gebruiker: "Waarom zijn er altijd problemen als ik de app aan
 * mensen wil demonstreren en dan werkt deze weer niet goed."
 *
 * Thuis op één wifi, met onthouden toestemmingen en een broker die net bereikbaar
 * is, werkt alles. Bij een demo geldt niets daarvan: twee verse toestellen, twee
 * netwerken, verse toestemmingsvensters, mobiel internet, een gastnetwerk met een
 * strenge firewall. Deze suite bootst precies die omstandigheden na en meet per
 * geval TWEE dingen: wat de demonstrerende gebruiker op zijn scherm ziet, en hoe
 * lang hij daarop moet wachten.
 *
 *   npm run test:demo            (ONLY=3 draait alleen scenario 3; ONLY=0,5 enz.)
 *
 * ---------------------------------------------------------------------------
 * ONDERSCHEIDEND VERMOGEN
 * ---------------------------------------------------------------------------
 * Een controle die altijd groen is bewijst niets. Elk scenario draait daarom
 * zijn meting TWEE keer: één keer onder de demo-omstandigheid, en één keer als
 * TEGENPROEF onder de gezonde omstandigheid, met de omgekeerde verwachting.
 * Staat de tegenproef niet op groen, dan meet de controle niet wat hij beweert
 * te meten en is de uitslag van de hoofdmeting waardeloos — dat wordt dan ook
 * als fout gemeld ("tegenproef").
 *
 * ---------------------------------------------------------------------------
 * WANNEER FAALT DEZE SUITE? (lees dit vóór je de uitslag beoordeelt)
 * ---------------------------------------------------------------------------
 * Een aantal controles staat op dit moment MET OPZET op rood: dat zijn de
 * bevindingen uit het onderzoek, elk met een kenmerk (B1…B12) dat terugslaat op
 * scratchpad/ronde2/demo.md. Die zijn hier vastgelegd zodat ze niet opnieuw
 * hoeven te worden gevonden, en zodat de reparatie aantoonbaar is: is een
 * bevinding verholpen, dan springt zijn controle op groen.
 *
 * De afloop is daarom:
 *   • rood ZONDER kenmerk  → een REGRESSIE. De suite faalt (exitcode 1).
 *   • rood MÉT kenmerk     → een bekende, nog openstaande bevinding. Wordt
 *                            gemeld, maar laat de suite slagen — anders is de
 *                            CI-stap vanaf dag één rood en zegt hij niets meer.
 *   • groen MÉT kenmerk    → die bevinding is kennelijk gerepareerd. Wordt
 *                            nadrukkelijk gemeld ("OPGELOST"); haal het kenmerk
 *                            dan weg, zodat de controle vanaf dan bewaakt.
 *   • een rode TEGENPROEF  → de meting zelf deugt niet. Altijd exitcode 1,
 *                            want dan zegt de hoofdmeting ernaast niets.
 * Met STRICT=1 falen ook de bekende bevindingen; zo kan een reparatie-agent
 * zien of hij ze allemaal te pakken heeft.
 *
 * ---------------------------------------------------------------------------
 * GRENS VAN DE METING (belangrijk bij het lezen van de uitslag)
 * ---------------------------------------------------------------------------
 * Deze testomgeving kan `openrelay.metered.ca` en `0.peerjs.com` NIET bereiken
 * (de netwerkpolicy blokkeert beide; gemeten: geen TCP-antwoord op 443, geen
 * UDP-antwoord op 3478). Alle ICE loopt hier dus over 127.0.0.1 en alle
 * koppelserver-verkeer over een lokale PeerJS-broker. Dat is een GRENS VAN DE
 * METING, geen resultaat:
 *
 *   • "TURN onbereikbaar" wordt nagebootst met een TURN-adres dat gegarandeerd
 *     niet antwoordt (198.51.100.7, TEST-NET-2) plus iceTransportPolicy:'relay'.
 *     Dat is een getrouwe nabootsing van een gastnetwerk dat UDP blokkeert en
 *     van een TURN-dienst die eruit ligt; het is GEEN meting aan de echte
 *     Open Relay-dienst.
 *   • "alleen relay mogelijk MÉT werkende TURN" is hier niet te meten: er is
 *     geen bereikbare TURN-server. De tijd die een echte relay kost (extra
 *     hop, hogere RTT) zit dus NIET in de getallen hieronder.
 *   • De absolute milliseconden zijn een ONDERGRENS. Twee browsers op één
 *     machine met een broker op de loopback zijn sneller dan twee telefoons op
 *     4G. De WACHTTIJDEN die de app zelf oplegt (20 s, 30 s, 10 s, 60 s) zijn
 *     wél exact: die staan hard in de code en gelden overal hetzelfde.
 *   • Scenario 0 (onbeveiligde oorsprong) wordt nagebootst met een naam die de
 *     browser naar 127.0.0.1 wijst (--host-resolver-rules). Dat is geen truc
 *     maar precies wat er bij een demo gebeurt: http://192.168.x.x:port/ of
 *     http://laptop.local:port/ is voor de browser géén beveiligde oorsprong,
 *     terwijl http://127.0.0.1/ dat wél is. Zie de tegenproef daar.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const net = require('net');
const express = require('express');
const { chromium } = require('playwright');
const { ExpressPeerServer } = require('peer');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT = process.env.APP_ROOT || path.join(__dirname, '..', 'serverless');
const WEB_PORT = +(process.env.WEB_PORT || 8831);
const PEER_PORT = +(process.env.PEER_PORT || 9831);
const HANG_PORT = +(process.env.HANG_PORT || 9833);
const TRAAG_PORT = +(process.env.TRAAG_PORT || 9835);
// Een poort waar met opzet NIETS luistert: de koppelserver die er niet is.
const DICHT_PORT = +(process.env.DICHT_PORT || 9837);

// Een TURN-adres dat met zekerheid nooit antwoordt: TEST-NET-2 (RFC 5737) is
// gereserveerd voor documentatie en wordt nergens gerouteerd.
const DOOD_TURN = 'turn:198.51.100.7:3478';

// Een gewone hostnaam (géén 'localhost', géén IP-loopback) die naar dezelfde
// webserver wijst. Zie scenario 0: hierover is de pagina voor de browser een
// ONBEVEILIGDE oorsprong, net als http://192.168.1.20:8080/ bij een demo.
const LAN_HOST = process.env.LAN_HOST || 'lan.babyphone.test';

// Simulatie van een trage mobiele verbinding: extra vertraging per richting op
// het verkeer naar de koppelserver. 350 ms heen en terug ≈ 700 ms RTT, wat een
// realistische slechte 4G-verbinding is.
const TRAAG_MS = +(process.env.BABYFOON_TRAAG_MS || 350);

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.mp3': 'audio/mpeg', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain',
};

// De webserver kan turn.json per test anders laten reageren. Dat is de enige
// manier om "kapotte turn.json" en "onbereikbare turn.json" na te bootsen
// zonder een bestand in serverless/ aan te raken — die map is van iemand anders.
let turnModus = null; // null = gewoon het bestand op schijf
const web = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/') p = '/index.html';
  if (p === '/turn.json' && turnModus) {
    if (turnModus.hang) return; // nooit antwoorden: de verbinding blijft open hangen
    res.statusCode = turnModus.status || 200;
    res.setHeader('Content-Type', 'application/json');
    return res.end(turnModus.body != null ? turnModus.body : '');
  }
  const fp = path.join(ROOT, p);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
    res.statusCode = 404; return res.end('nf');
  }
  res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
  fs.createReadStream(fp).pipe(res);
});

// ------------------------------------------------------------ koppelservers
// De echte koppelserver, die tussendoor écht uit moet kunnen (poort dicht,
// websockets verbroken). Zelfde aanpak als in test/e2e-stabiliteit.js.
function startBroker(port) {
  return new Promise((res) => {
    const app = express();
    const srv = http.createServer(app);
    srv.__sockets = new Set();
    srv.on('connection', (s) => { srv.__sockets.add(s); s.on('close', () => srv.__sockets.delete(s)); });
    app.use('/', ExpressPeerServer(srv, { path: '/' }));
    srv.listen(port, '127.0.0.1', () => res(srv));
  });
}
async function stopBroker(srv) {
  if (!srv) return;
  try {
    srv.__sockets.forEach((s) => { try { s.destroy(); } catch (e) {} });
    srv.__sockets.clear();
  } catch (e) {}
  await new Promise((r) => {
    let klaar = false;
    const fin = () => { if (!klaar) { klaar = true; r(); } };
    setTimeout(fin, 3000);
    try { srv.close(fin); } catch (e) { fin(); }
  });
}

// Een koppelserver die TRAAG is op de ergste manier: de TCP-verbinding wordt
// netjes aangenomen en daarna komt er nooit een antwoord. Dit is geen exotisch
// geval — het is precies wat een captive portal, een overbelaste gratis dienst
// of een firewall die pakketten laat verdwijnen oplevert. Een geweigerde
// verbinding levert een foutmelding op; deze levert stilte op, en daar gaan
// applicaties doorgaans slechter mee om.
function startHangendeBroker(port) {
  return new Promise((res) => {
    const srv = net.createServer((sock) => {
      sock.on('error', () => {});
      // niets terugsturen, niets sluiten
    });
    srv.on('error', () => {});
    srv.listen(port, '127.0.0.1', () => res(srv));
  });
}

// Een tussenstation dat elk byte vertraagt: de nabootsing van een mobiele
// verbinding met hoge latentie. De vertraging is tijdens het draaien te
// veranderen (traagMsHuidig), zodat dezelfde poort meerdere snelheden kan
// nabootsen.
let traagMsHuidig = TRAAG_MS;
function startTrageDoorgeef(luisterPoort, naarPoort) {
  return new Promise((res) => {
    const srv = net.createServer((client) => {
      const up = net.connect(naarPoort, '127.0.0.1');
      const pomp = (van, naar) => {
        van.on('data', (d) => { setTimeout(() => { try { naar.write(d); } catch (e) {} }, traagMsHuidig); });
        van.on('close', () => { setTimeout(() => { try { naar.end(); } catch (e) {} }, traagMsHuidig); });
        van.on('error', () => {});
      };
      pomp(client, up); pomp(up, client);
    });
    srv.on('error', () => {});
    srv.listen(luisterPoort, '127.0.0.1', () => res(srv));
  });
}

function findExecutable() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  try {
    for (const dir of fs.readdirSync('/opt/pw-browsers')) {
      if (dir.startsWith('chromium-') && !dir.includes('headless')) {
        const p = path.join('/opt/pw-browsers', dir, 'chrome-linux', 'chrome');
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (e) { /* map bestaat niet */ }
  return undefined;
}

// ------------------------------------------------------- meetgereedschap
// Gaat in elke pagina mee. Legt vast wat de GEBRUIKER ziet (elke statustekst,
// elke foutmelding, met tijdstip) en wat de app ONDER WATER doet (welke
// ICE-servers er echt naar WebRTC gaan, hoe vaak de microfoon wordt opgevraagd).
const METERS = `
  (function () {
    window.__t0 = Date.now();
    window.zichtbaarScherm = function () {
      var ids = ['screenSetup', 'screenPairBaby', 'screenPairParent', 'screenParent', 'screenBaby'];
      for (var i = 0; i < ids.length; i++) {
        var e = document.getElementById(ids[i]);
        if (e && !e.classList.contains('hidden')) return ids[i];
      }
      return '';
    };
    window.__ws = 0;
    var OW = window.WebSocket;
    function W(url, protocols) {
      window.__ws++;
      return protocols === undefined ? new OW(url) : new OW(url, protocols);
    }
    W.prototype = OW.prototype;
    W.CONNECTING = OW.CONNECTING; W.OPEN = OW.OPEN; W.CLOSING = OW.CLOSING; W.CLOSED = OW.CLOSED;
    window.WebSocket = W;

    // Welke ICE-servers krijgt WebRTC werkelijk? Dit is de enige harde manier om
    // te zien wat turn.json heeft gedaan; de variabele zelf zit in een closure.
    window.__iceConfigs = [];
    var O = window.RTCPeerConnection;
    var P = function () {
      var args = [].slice.call(arguments);
      try { window.__iceConfigs.push(JSON.parse(JSON.stringify(args[0] || {}))); } catch (e) {}
      var pc = new (Function.prototype.bind.apply(O, [null].concat(args)))();
      return pc;
    };
    P.prototype = O.prototype;
    window.RTCPeerConnection = P;

    // Hoe vaak, en wanneer, vraagt deze rol om camera of microfoon?
    window.__gum = [];
    try {
      var md = navigator.mediaDevices;
      var og = md.getUserMedia.bind(md);
      md.getUserMedia = function (c) {
        window.__gum.push({ t: Date.now() - window.__t0, audio: !!(c && c.audio), video: !!(c && c.video) });
        return og(c);
      };
    } catch (e) {}

    // Alles wat er op het scherm van de gebruiker verschijnt, met tijdstip.
    window.__zicht = { status: [], fout: [], babyWacht: [], code: [], approval: [], toast: [] };
    function noteer(lijst, waarde) {
      var l = window.__zicht[lijst];
      if (!l) { l = window.__zicht[lijst] = []; }
      if (!l.length || l[l.length - 1].v !== waarde) l.push({ t: Date.now() - window.__t0, v: waarde });
    }
    setInterval(function () {
      var c = document.getElementById('connText');
      if (c) { var t = (c.textContent || '').trim(); if (t) noteer('status', t); }
      var e = document.getElementById('parentError');
      noteer('fout', (e && !e.classList.contains('hidden') && (e.textContent || '').trim()) || '');
      var bw = document.getElementById('babyWaiting');
      if (bw) {
        var sp = bw.querySelector('span[data-i18n]');
        noteer('babyWacht', (sp ? sp.getAttribute('data-i18n') : '') + (bw.classList.contains('warn') ? '!' : ''));
      }
      var bc = document.getElementById('babyCodeText');
      if (bc) noteer('code', (bc.textContent || '').trim());
      var ap = document.getElementById('babyApproval');
      noteer('approval', ap && !ap.classList.contains('hidden') ? 'open' : 'dicht');
      var ts = document.getElementById('toast');
      noteer('toast', (ts && !ts.classList.contains('hidden') && (ts.textContent || '').trim()) || '');
    }, 100);
  })();
`;

// ------------------------------------------------------------------ uitvoer
const STRICT = !!process.env.STRICT;
const uitslagen = [];
// `bekend` is het kenmerk van een al opgeschreven bevinding (B1…B12 in
// scratchpad/ronde2/demo.md). Zie de kop van dit bestand voor wat dat met de
// afloop doet.
function check(naam, ok, detail, bekend) {
  const teken = ok ? (bekend ? '🟢' : '✅') : (bekend ? '⚠️ ' : '❌');
  console.log(teken + ' ' + (bekend ? '[' + bekend + '] ' : '') + naam + (detail ? '  — ' + detail : ''));
  uitslagen.push({ naam, ok, detail, bekend: bekend || '', soort: 'controle' });
}
// Tegenproef: hoort ALTIJD groen te zijn. Is hij rood, dan meet de bijbehorende
// hoofdcontrole niet wat hij beweert en is die uitslag waardeloos.
function tegenproef(naam, ok, detail) {
  console.log((ok ? '✅' : '❌') + ' [tegenproef] ' + naam + (detail ? '  — ' + detail : ''));
  uitslagen.push({ naam: '[tegenproef] ' + naam, ok, detail, bekend: '', soort: 'tegenproef' });
}
const kop = (s) => console.log('\n' + '='.repeat(72) + '\n' + s + '\n' + '='.repeat(72));

(async () => {
  let broker = await startBroker(PEER_PORT);
  const hang = await startHangendeBroker(HANG_PORT);
  const traag = await startTrageDoorgeef(TRAAG_PORT, PEER_PORT);
  await new Promise((r) => web.listen(WEB_PORT, r));
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/';

  const browser = await chromium.launch({
    executablePath: findExecutable(),
    headless: true,
    args: [
      '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
      // Eén verzonnen naam die naar dezelfde webserver wijst. Daarmee is
      // dezelfde pagina zowel via een BEVEILIGDE oorsprong (127.0.0.1) als via
      // een ONBEVEILIGDE (een gewone hostnaam over http) te openen — precies
      // het verschil tussen "op mijn laptop getest" en "op de demo geopend via
      // het adres in de adresbalk". Verder verandert deze vlag niets.
      '--host-resolver-rules=MAP ' + LAN_HOST + ' 127.0.0.1',
    ],
  });

  const ONLY = process.env.ONLY ? String(process.env.ONLY).split(',') : null;
  const doe = (n) => !ONLY || ONLY.indexOf(String(n)) >= 0;
  const errs = [];

  const peerCfg = (poort) =>
    "{ host: '127.0.0.1', port: " + poort + ", path: '/', key: 'peerjs', secure: false }";

  // Een verse pagina met meters. `poort` bepaalt welke koppelserver hij ziet.
  const mk = async (poort, extra) => {
    const c = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await c.addInitScript(
      'window.BABYFOON_PEER = ' + peerCfg(poort == null ? PEER_PORT : poort) + ';\n' +
      METERS + (extra || '')
    );
    return c;
  };
  const paginas = []; // om aan het eind de rode "kan de app niet starten"-balk te lezen
  const nieuwePagina = async (ctx, label) => {
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(label + ': ' + e.message));
    // index.html zet bij elke scriptfout een rode balk onderaan de pagina. Die
    // balk mag in geen enkel scenario verschijnen: hij is het ergste wat een
    // demonstrerende gebruiker kan zien.
    p.__bfLabel = label;
    paginas.push(p);
    await p.goto(BASE);
    await sleep(250);
    return p;
  };
  const leesBootFouten = async () => {
    for (const p of paginas) {
      if (p.isClosed()) continue;
      const t = await p.evaluate(() => {
        const e = document.getElementById('bootErrorText');
        return e ? (e.textContent || '').trim() : '';
      }).catch(() => '');
      if (t) errs.push(p.__bfLabel + ' toonde de rode startfoutbalk: ' + t.replace(/\s+/g, ' ').slice(0, 200));
    }
  };
  const wachtOpCode = async (p, ms) => {
    const t = Date.now();
    while (Date.now() - t < (ms || 20000)) {
      const c = await p.$eval('#babyCodeText', (e) => e.textContent.trim()).catch(() => '');
      if (/^[A-Z0-9]{6}$/.test(c)) return { code: c, ms: Date.now() - t };
      await sleep(100);
    }
    return { code: '', ms: Date.now() - t };
  };
  const keurGoed = async (p, ms) => {
    const t = Date.now();
    while (Date.now() - t < (ms || 20000)) {
      const zichtbaar = await p.evaluate(() => {
        const b = document.getElementById('babyApproval');
        return !!b && !b.classList.contains('hidden');
      }).catch(() => false);
      if (zichtbaar) { await p.click('#btnApproveYes'); return true; }
      await sleep(100);
    }
    return false;
  };
  const wachtOpBeeld = async (p, ms) => {
    const t = Date.now();
    while (Date.now() - t < (ms || 25000)) {
      const w = await p.$eval('#video', (v) => v.videoWidth || 0).catch(() => 0);
      if (w > 0) return { px: w, ms: Date.now() - t };
      await sleep(100);
    }
    return { px: 0, ms: Date.now() - t };
  };
  // Wacht tot de ouderunit iets meldt wat een gebruiker als MISLUKT leest:
  // een zichtbare foutregel. Geeft de wachttijd terug (of -1 bij niets).
  const wachtOpFout = async (p, ms) => {
    const t = Date.now();
    while (Date.now() - t < ms) {
      const f = await p.evaluate(() => {
        const e = document.getElementById('parentError');
        if (e && !e.classList.contains('hidden')) {
          const s = (e.textContent || '').trim();
          if (s) return s;
        }
        return '';
      }).catch(() => '');
      if (f) return { tekst: f, ms: Date.now() - t };
      await sleep(150);
    }
    return { tekst: '', ms: -1 };
  };
  const zicht = (p) => p.evaluate(() => JSON.parse(JSON.stringify(window.__zicht))).catch(() => ({}));
  const laatsteDiag = (p) => p.evaluate(() => {
    const d = document.getElementById('parentDiag');
    return d ? (d.textContent || '').trim() : '';
  }).catch(() => '');

  // Een ouderunit die een kamercode intypt en op Verbinden drukt.
  const ouderVerbindt = async (p, code) => {
    await p.click('#pickParent');
    await p.fill('#parentOfferInput', code);
    await p.click('#parentGenBtn');
  };

  // ==================================================================
  // 0. ONBEVEILIGDE OORSPRONG — de demo geopend op het adres uit de adresbalk
  // ==================================================================
  // DIT IS DE GROOTSTE DEMOKILLER en hij is eerder al gemeten; deze controle
  // legt hem vast. De app wordt bij een demo zelden via https geopend: iemand
  // deelt het adres van de laptop (http://192.168.1.20:8080/), of opent de map
  // op een tweede toestel in hetzelfde wifi. Op zo'n adres BESTAAT
  // navigator.mediaDevices niet — browsers geven camera en microfoon alleen
  // vrij op een beveiligde oorsprong (https, of de loopback 127.0.0.1/
  // localhost). De app leest dat als "deze browser kan het niet" en zet
  // schermvullend neer dat je een recente Chrome/Safari/Firefox/Edge moet
  // openen — terwijl de demonstrator ín een actuele Chrome zit en dus niets
  // kan doen met dat advies. Hij gaat op zoek naar een andere browser, en de
  // demo is voorbij.
  if (doe(0)) {
    kop('0. Pagina geopend op een onbeveiligde oorsprong (http:// met een hostnaam)');
    const meet = async (host, label) => {
      const c = await browser.newContext({ permissions: ['camera', 'microphone'] });
      const p = await c.newPage();
      p.on('pageerror', (e) => errs.push(label + ': ' + e.message));
      await p.goto('http://' + host + ':' + WEB_PORT + '/');
      await sleep(1200);
      const r = await p.evaluate(() => {
        const bb = document.getElementById('browserBlock');
        const zichtbaar = !!(bb && !bb.classList.contains('hidden'));
        const tekst = bb ? (bb.textContent || '').replace(/\s+/g, ' ').trim() : '';
        return {
          beveiligd: !!window.isSecureContext,
          mediaDevices: !!navigator.mediaDevices,
          rtc: !!window.RTCPeerConnection,
          blokkade: zichtbaar,
          tekst: zichtbaar ? tekst : '',
        };
      });
      await c.close();
      return r;
    };
    const onveilig = await meet(LAN_HOST, '0-ONVEILIG');
    const veilig = await meet('127.0.0.1', '0-VEILIG');
    console.log('   http://' + LAN_HOST + ':' + WEB_PORT + '/  ' + JSON.stringify(onveilig));
    console.log('   http://127.0.0.1:' + WEB_PORT + '/  ' + JSON.stringify(veilig));

    // TEGENPROEF EERST: de nabootsing moet aantoonbaar het verschil maken dat
    // hij beweert te maken. Zonder dit zou 0a/0b ook rood staan bij een app die
    // niets verkeerd doet.
    tegenproef('0: de nabootsing maakt het verschil — dezelfde pagina is via 127.0.0.1 wél beveiligd',
      veilig.beveiligd && veilig.mediaDevices && !veilig.blokkade &&
      !onveilig.beveiligd && !onveilig.mediaDevices,
      'via 127.0.0.1 beveiligd=' + veilig.beveiligd + '/mediaDevices=' + veilig.mediaDevices +
      ', via ' + LAN_HOST + ' beveiligd=' + onveilig.beveiligd + '/mediaDevices=' + onveilig.mediaDevices);

    // 0a — de app hoort dit geval te ONDERSCHEIDEN van een oude browser. De
    // browser is niet het probleem; het adres is het probleem.
    const noemtAdres = /https|beveiligd|secure|adres|address|localhost|127\.0\.0\.1/i.test(onveilig.tekst);
    check('0a: bij een onbeveiligde oorsprong legt de app de schuld niet bij de browser maar bij het adres',
      !onveilig.blokkade || noemtAdres,
      onveilig.blokkade
        ? 'schermvullend getoond: "' + onveilig.tekst.slice(0, 160) + '"'
        : 'geen blokkade getoond',
      'B1');

    // 0b — en de blokkade mag in ieder geval niet beweren dat de BROWSER te oud
    // is, want dat is onwaar en stuurt de demonstrator de verkeerde kant op.
    check('0b: de melding beweert niet dat de browser te oud is terwijl hij dat niet is',
      !(onveilig.blokkade && /recent|version|browser can't|kan .* niet (uitvoeren|draaien)/i.test(onveilig.tekst)),
      onveilig.blokkade ? '"' + onveilig.tekst.slice(0, 160) + '"' : 'geen blokkade',
      'B1');

    // 0c — WebRTC zélf is er wél. Dat is het bewijs dat de app de verkeerde
    // conclusie trekt: RTCPeerConnection bestaat, alleen mediaDevices niet.
    check('0c: de app onderscheidt "geen WebRTC" van "geen toegang tot camera op dit adres"',
      !(onveilig.rtc && onveilig.blokkade && !noemtAdres),
      'RTCPeerConnection=' + onveilig.rtc + ', mediaDevices=' + onveilig.mediaDevices +
      ', blokkade=' + onveilig.blokkade,
      'B1');
  }

  // ==================================================================
  // 1. KOPPELSERVER WEG — de gratis, gedeelde broker is niet bereikbaar
  // ==================================================================
  if (doe(1)) {
    kop('1. Koppelserver weg (poort dicht) — wat ziet de demonstrerende gebruiker?');
    // De ouderunit wijst naar een poort waar niets luistert.
    const DICHT = DICHT_PORT; // niemand luistert hier — de koppelserver is weg
    const c = await mk(DICHT);
    const ouder = await nieuwePagina(c, '1-OUDER');
    const t0 = Date.now();
    await ouderVerbindt(ouder, 'ABC234');
    const f = await wachtOpFout(ouder, 95000);
    const z = await zicht(ouder);
    const statussen = (z.status || []).map((x) => x.v);
    console.log('   statusverloop: ' + statussen.join(' → '));
    check('1: de ouderunit meldt uiteindelijk dat het mislukt is',
      f.ms >= 0, f.ms >= 0 ? 'na ' + (f.ms / 1000).toFixed(1) + ' s: "' + f.tekst + '"' : 'binnen 95 s helemaal niets');
    check('1: die melding komt binnen 15 s (een demo verdraagt niet meer)',
      f.ms >= 0 && f.ms <= 15000, 'gemeten ' + (f.ms / 1000).toFixed(1) + ' s', 'B2');
    check('1: de melding wijst naar de koppelserver, niet naar de kamercode',
      !!f.tekst && !/code/i.test(f.tekst),
      'getoond: "' + f.tekst + '"', 'B3');
    // TEGENPROEF: met een WERKENDE koppelserver mag er in dezelfde tijd geen
    // foutmelding staan, en moet er beeld zijn. Zonder dit bewijst het
    // bovenstaande niets — dan zou de test ook rood staan bij een gezonde app.
    const cb = await mk(); const baby = await nieuwePagina(cb, '1-TEGEN-BABY');
    await baby.click('#pickBaby');
    const kc = await wachtOpCode(baby);
    const cp = await mk(); const ouder2 = await nieuwePagina(cp, '1-TEGEN-OUDER');
    await ouderVerbindt(ouder2, kc.code);
    await keurGoed(baby);
    const b = await wachtOpBeeld(ouder2, 25000);
    const f2 = await ouder2.evaluate(() => {
      const e = document.getElementById('parentError');
      return e && !e.classList.contains('hidden') ? (e.textContent || '').trim() : '';
    });
    tegenproef('1: met een werkende koppelserver komt er beeld en géén foutmelding',
      b.px > 0 && !f2, 'beeld ' + b.px + 'px na ' + (b.ms / 1000).toFixed(1) + ' s, fout: "' + f2 + '"');
    console.log('   (' + (Date.now() - t0) / 1000 + ' s totaal voor scenario 1)');
    await c.close(); await cb.close(); await cp.close();
  }

  // ==================================================================
  // 2. KOPPELSERVER TRAAG — neemt de verbinding aan en antwoordt nooit
  // ==================================================================
  if (doe(2)) {
    kop('2. Koppelserver traag/stil (TCP aangenomen, nooit antwoord)');
    // 2a — de BABYUNIT. Die meldt zich aan en toont pas daarna zijn kamercode.
    const cb = await mk(HANG_PORT);
    const baby = await nieuwePagina(cb, '2-BABY');
    await baby.click('#pickBaby');
    const kc = await wachtOpCode(baby, 20000);
    const zb = await zicht(baby);
    const wachtteksten = (zb.babyWacht || []).map((x) => x.v).filter(Boolean);
    const codes = (zb.code || []).map((x) => x.v);
    console.log('   wachtpil: ' + wachtteksten.join(' → '));
    console.log('   kamercode-veld: ' + codes.join(' → '));
    const eerlijk = !!kc.code || wachtteksten.some((t) => /!$/.test(t));
    check('2a: de babyunit toont binnen 20 s óf een kamercode óf een waarschuwing',
      eerlijk, kc.code ? 'code ' + kc.code : 'geen code; wachtpil bleef "' + (wachtteksten.pop() || '') + '"', 'B4');
    // TEGENPROEF: met een gezonde koppelserver is diezelfde controle groen.
    const cb2 = await mk();
    const baby2 = await nieuwePagina(cb2, '2-TEGEN-BABY');
    await baby2.click('#pickBaby');
    const kc2 = await wachtOpCode(baby2, 20000);
    tegenproef('2a: met een gezonde koppelserver verschijnt de kamercode wél',
      !!kc2.code, kc2.code ? kc2.code + ' na ' + (kc2.ms / 1000).toFixed(1) + ' s' : 'geen code');

    // 2b — de OUDERUNIT tegen diezelfde stille koppelserver.
    const cp = await mk(HANG_PORT);
    const ouder = await nieuwePagina(cp, '2-OUDER');
    await ouderVerbindt(ouder, 'ABC234');
    const f = await wachtOpFout(ouder, 45000);
    check('2b: de ouderunit meldt binnen 15 s dat er niets te bereiken valt',
      f.ms >= 0 && f.ms <= 15000,
      f.ms >= 0 ? (f.ms / 1000).toFixed(1) + ' s: "' + f.tekst + '"' : 'binnen 45 s niets', 'B5');
    check('2b: en die melding wijst niet de kamercode aan als schuldige',
      !!f.tekst && !/code/i.test(f.tekst), 'getoond: "' + f.tekst + '"', 'B3');
    await cb.close(); await cb2.close(); await cp.close();
  }

  // ==================================================================
  // 3. TURN ONBEREIKBAAR TERWIJL ALLEEN RELAY MOGELIJK IS
  // ==================================================================
  if (doe(3)) {
    kop('3. Alleen relay mogelijk (gastnetwerk/4G) en TURN is onbereikbaar');
    // Koppelserver werkt perfect; alleen het MEDIAPAD is onmogelijk. Dat is de
    // scherpste vorm van het probleem: de app kan zich prima aanmelden en denkt
    // dus dat er niets aan de hand is.
    const RELAY_ONLY =
      "window.BABYFOON_PEER = { host: '127.0.0.1', port: " + PEER_PORT +
      ", path: '/', key: 'peerjs', secure: false, config: { iceServers: [" +
      "{ urls: '" + DOOD_TURN + "', username: 'x', credential: 'y' }], iceTransportPolicy: 'relay' } };";
    const cb = await mk(PEER_PORT, RELAY_ONLY);
    const baby = await nieuwePagina(cb, '3-BABY');
    await baby.click('#pickBaby');
    const kc = await wachtOpCode(baby, 20000);
    check('3: de babyunit komt gewoon op de koppelserver — het probleem zit in het mediapad',
      !!kc.code, kc.code || 'geen code');

    const cp = await mk(PEER_PORT, RELAY_ONLY);
    const ouder = await nieuwePagina(cp, '3-OUDER');
    const t0 = Date.now();
    await ouderVerbindt(ouder, kc.code || 'ABC234');
    const f = await wachtOpFout(ouder, 45000);
    const diag = await laatsteDiag(ouder);
    const z = await zicht(ouder);
    console.log('   statusverloop: ' + (z.status || []).map((x) => x.v).join(' → '));
    console.log('   diagnoseregel: "' + diag + '"');
    check('3: de ouderunit blijft niet eeuwig op "Verbinden…" staan',
      f.ms >= 0, f.ms >= 0 ? 'melding na ' + (f.ms / 1000).toFixed(1) + ' s' : 'na 45 s nog steeds niets');
    check('3: die melding komt binnen 10 s (ICE weet allang dat het mislukt is)',
      f.ms >= 0 && f.ms <= 10000, 'gemeten ' + (f.ms / 1000).toFixed(1) + ' s', 'B5');
    check('3: de melding legt de schuld niet bij de kamercode',
      !!f.tekst && !/code/i.test(f.tekst), '"' + f.tekst + '"', 'B3');
    check('3: de diagnoseregel zegt iets waars over het netwerk (niet het vaste "host:0")',
      !!diag && !/^host:0\b/.test(diag), '"' + diag + '"', 'B6');
    // TEGENPROEF: zonder de relay-dwang lukt precies dezelfde koppeling wél.
    const cb2 = await mk(); const baby2 = await nieuwePagina(cb2, '3-TEGEN-BABY');
    await baby2.click('#pickBaby');
    const kc2 = await wachtOpCode(baby2);
    const cp2 = await mk(); const ouder3 = await nieuwePagina(cp2, '3-TEGEN-OUDER');
    await ouderVerbindt(ouder3, kc2.code);
    await keurGoed(baby2);
    const b2 = await wachtOpBeeld(ouder3, 25000);
    tegenproef('3: zonder relay-dwang komt er wél beeld (het scenario is dus de oorzaak)',
      b2.px > 0, b2.px + 'px na ' + (b2.ms / 1000).toFixed(1) + ' s');
    console.log('   (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)');
    await cb.close(); await cp.close(); await cb2.close(); await cp2.close();
  }

  // ==================================================================
  // 4. turn.json — doet dat bestand iets, en wat als het stuk is?
  // ==================================================================
  if (doe(4)) {
    kop('4. turn.json: werking, terugval en de STUN-val');
    // LET OP bij het lezen van deze meting. PeerJS maakt bij het laden van de
    // pagina zélf al een RTCPeerConnection aan om te kijken wat de browser kan
    // (een "capability probe"), en gebruikt daarvoor zijn eigen standaardlijst
    // (stun.l.google.com + eu-0/us-0.turn.peerjs.com). Die verbinding zegt
    // niets over de app. We wissen de meter daarom vlak vóór het echte
    // koppelen en lezen alleen de configuratie van de verbinding die dáárna
    // ontstaat: dat is de enige die er voor beeld en geluid toe doet.
    const wachtOpEchteIce = async (p, ms) => {
      const t = Date.now();
      while (Date.now() - t < (ms || 15000)) {
        const ice = await p.evaluate(() => {
          const c = (window.__iceConfigs || []).filter((x) => x && x.iceServers);
          return c.length ? c[0].iceServers : null;
        }).catch(() => null);
        if (ice) return ice;
        await sleep(100);
      }
      return null;
    };
    // Eén compleet koppelpaar onder een bepaalde turn.json, en dan de ICE-lijst
    // van de verbinding die de ouderunit werkelijk opzet.
    const koppelEnLeesIce = async (modus) => {
      turnModus = modus;
      const cb = await mk(); const baby = await nieuwePagina(cb, '4-BABY');
      const tB = Date.now();
      await baby.click('#pickBaby');
      const kc = await wachtOpCode(baby, 25000);
      const babyMs = Date.now() - tB;
      const cp = await mk(); const ouder = await nieuwePagina(cp, '4-OUDER');
      await ouder.evaluate(() => { window.__iceConfigs.length = 0; }); // probe weg
      await ouderVerbindt(ouder, kc.code || 'ABC234');
      const ice = await wachtOpEchteIce(ouder, 15000);
      await cb.close(); await cp.close();
      turnModus = null;
      return { ice, code: kc.code, babyMs };
    };

    // 4a — werkt turn.json überhaupt?
    const eigen = await koppelEnLeesIce({
      status: 200,
      body: JSON.stringify({ iceServers: [{ urls: 'turn:turn.voorbeeld.nl:3478', username: 'u', credential: 'p' }] }),
    });
    const urls = (eigen.ice || []).map((x) => x.urls);
    check('4a: een eigen turn.json wordt echt aan WebRTC doorgegeven',
      urls.some((u) => /turn\.voorbeeld\.nl/.test(u)), JSON.stringify(urls));

    // 4b — DE VAL: één eigen TURN erin zetten wist ALLE STUN-servers.
    check('4b: een eigen TURN in turn.json laat de STUN-servers staan',
      urls.some((u) => /^stuns?:/.test(u)),
      'overgebleven servers: ' + JSON.stringify(urls), 'B7');

    // 4c — kapotte JSON: netjes terugvallen op de ingebouwde lijst.
    const kapot = await koppelEnLeesIce({ status: 200, body: '{ dit is geen json' });
    const ku = (kapot.ice || []).map((x) => x.urls);
    check('4c: bij kapotte turn.json blijft de ingebouwde lijst van de app gelden',
      ku.some((u) => /^stun:/.test(u)) && ku.some((u) => /openrelay/.test(u)),
      JSON.stringify(ku));
    // TEGENPROEF voor 4a/4c samen: deze twee metingen moeten VERSCHILLEN,
    // anders leest de test alleen maar steeds dezelfde standaardlijst terug.
    tegenproef('4: eigen en teruggevallen lijst zijn aantoonbaar verschillend',
      JSON.stringify(urls) !== JSON.stringify(ku), 'eigen ' + JSON.stringify(urls) + ' vs. terugval ' + ku.length + ' ingangen');

    // 4d — turn.json onbereikbaar (server antwoordt nooit): hoeveel tijd kost
    // dat vóórdat de babyunit zijn kamercode laat zien?
    const meetBabyTijd = async (modus) => {
      turnModus = modus;
      const c = await mk(); const p = await nieuwePagina(c, '4d-BABY');
      const t = Date.now();
      await p.click('#pickBaby');
      await wachtOpCode(p, 25000);
      const ms = Date.now() - t;
      await c.close(); turnModus = null;
      return ms;
    };
    const snelMs = await meetBabyTijd({ status: 404, body: 'nf' });
    const traagMs = await meetBabyTijd({ hang: true });
    const snel = { ms: snelMs }, traagTurn = { ms: traagMs };
    const extraTijd = traagTurn.ms - snel.ms;
    check('4d: een onbereikbare turn.json kost hooguit 3 s extra voor de kamercode',
      extraTijd <= 3000,
      '404: ' + (snel.ms / 1000).toFixed(1) + ' s, onbereikbaar: ' + (traagTurn.ms / 1000).toFixed(1) +
      ' s (verschil ' + (extraTijd / 1000).toFixed(1) + ' s)');
    tegenproef('4d: de meting is gevoelig — de onbereikbare variant duurt meetbaar langer',
      extraTijd > 300, 'verschil ' + extraTijd + ' ms');
  }

  // ==================================================================
  // 5. VERSE TOESTEMMINGEN — bij een demo is niets onthouden
  // ==================================================================
  if (doe(5)) {
    kop('5. Verse toestemmingsvensters op beide toestellen');
    // 5a — zolang de gebruiker nog naar het toestemmingsvenster kijkt, moet de
    // babyunit zeggen dat hij op de GEBRUIKER wacht, niet op de ouderunit.
    const TRAGE_TOESTEMMING = (ms) => `
      (function () {
        var md = navigator.mediaDevices;
        var og = md.getUserMedia.bind(md);
        md.getUserMedia = function (c) {
          return new Promise(function (res, rej) { setTimeout(function () { og(c).then(res, rej); }, ${ms}); });
        };
      })();
    `;
    const cb = await mk(PEER_PORT, TRAGE_TOESTEMMING(6000));
    const baby = await nieuwePagina(cb, '5-BABY');
    await baby.click('#pickBaby');
    await sleep(3000);
    const tussen = await baby.evaluate(() => {
      const bw = document.getElementById('babyWaiting');
      const sp = bw && bw.querySelector('span[data-i18n]');
      return {
        sleutel: sp ? sp.getAttribute('data-i18n') : '',
        code: (document.getElementById('babyCodeText') || {}).textContent || '',
      };
    });
    check('5a: tijdens het toestemmingsvenster wijst de babyunit naar de gebruiker',
      tussen.sleutel === 'permissionNeeded', 'wachtpil = "' + tussen.sleutel + '", code = "' + tussen.code.trim() + '"');
    const kc = await wachtOpCode(baby, 25000);
    tegenproef('5a: ná de toestemming komt de kamercode alsnog',
      !!kc.code, kc.code || 'geen code');
    await cb.close();

    // 5b — de gebruiker doet te lang over het venster (telefoon doorgeven,
    // brilletje zoeken). De app breekt af. Blijft er dan iets op het scherm
    // staan dat uitlegt wat er gebeurde?
    const cb2 = await mk(PEER_PORT,
      'window.BABYFOON_MEDIA_PERMISSIE_TIMEOUT = 4000;' + TRAGE_TOESTEMMING(30000));
    const baby2 = await nieuwePagina(cb2, '5-BABY-TRAAG');
    await baby2.click('#pickBaby');
    await sleep(5200); // net na de afbreking
    const meteen = await baby2.evaluate(() => {
      const t = document.getElementById('toast');
      return {
        toast: t && !t.classList.contains('hidden') ? (t.textContent || '').trim() : '',
        scherm: zichtbaarScherm(),
      };
    });
    tegenproef('5b: vlak na het afbreken staat de uitleg er wél',
      !!meteen.toast, '"' + meteen.toast + '" op scherm ' + meteen.scherm);
    await sleep(4000);
    const later = await baby2.evaluate(() => {
      const t = document.getElementById('toast');
      const zichtbaar = (el) => !!el && !el.classList.contains('hidden') && (el.textContent || '').trim();
      return {
        toast: zichtbaar(t) || '',
        scherm: zichtbaarScherm(),
      };
    });
    check('5b: ook 9 s na het afbreken staat er nog een leesbare uitleg op het scherm',
      !!later.toast, 'zichtbare uitleg: "' + later.toast + '", scherm: ' + later.scherm, 'B8');
    await cb2.close();

    // 5c — de ouderunit mag voor BEELD geen enkele toestemming nodig hebben.
    // Een tweede toestemmingsvenster op het ouder-toestel is bij een demo een
    // extra kans op stilstand; bovendien was dit eerder een snelheidsregressie.
    const cb3 = await mk(); const baby3 = await nieuwePagina(cb3, '5c-BABY');
    await baby3.click('#pickBaby');
    const kc3 = await wachtOpCode(baby3);
    const cp3 = await mk(); const ouder3 = await nieuwePagina(cp3, '5c-OUDER');
    await ouderVerbindt(ouder3, kc3.code);
    await keurGoed(baby3);
    const b3 = await wachtOpBeeld(ouder3, 25000);
    const gum = await ouder3.evaluate(() => window.__gum.slice());
    check('5c: de ouderunit vraagt geen camera/microfoon om beeld te krijgen',
      b3.px > 0 && gum.length === 0, b3.px + 'px na ' + (b3.ms / 1000).toFixed(1) + ' s, ' + gum.length + ' toestemmingsvragen');
    // TEGENPROEF: de meter werkt — de BABYunit vraagt er wél om.
    const gumBaby = await baby3.evaluate(() => window.__gum.slice());
    tegenproef('5c: de meter telt wel degelijk (de babyunit vraagt er wél om)',
      gumBaby.length > 0, gumBaby.length + ' toestemmingsvragen op de babyunit');
    await cb3.close(); await cp3.close();

    // 5d — EXTRA MICROFOONS OP EEN ANDROID-DEMOTOESTEL. Een Android-telefoon
    // meldt meestal meerdere microfooningangen. De babyunit opent die er ná de
    // toestemming bij, en pas dáárna verschijnt de kamercode. Geeft het toestel
    // een tweede opname niet vrij (heel gewoon op Android), dan is dat wachten
    // voor niets — en staat de demonstrator met een leeg koppelscherm.
    const VEEL_MICS = `
      (function () {
        var md = navigator.mediaDevices;
        var oe = md.enumerateDevices.bind(md);
        md.enumerateDevices = function () {
          return oe().then(function (ds) {
            var cam = ds.filter(function (d) { return d.kind === 'videoinput'; });
            var mics = ['mic-onder', 'mic-boven', 'mic-achter', 'mic-extra'].map(function (id) {
              return { kind: 'audioinput', deviceId: id, groupId: id, label: id, toJSON: function () { return this; } };
            });
            return cam.concat(mics);
          });
        };
        var og = md.getUserMedia.bind(md);
        md.getUserMedia = function (c) {
          var a = c && c.audio;
          // Een tweede opname op dezelfde audio-hardware: blijft hangen.
          if (a && typeof a === 'object' && a.deviceId) return new Promise(function () {});
          return og(c);
        };
      })();
    `;
    const meetStarttijd = async (extra, label) => {
      const c = await mk(PEER_PORT, extra);
      const p = await nieuwePagina(c, label);
      const t = Date.now();
      await p.click('#pickBaby');
      const kc = await wachtOpCode(p, 30000);
      await c.close();
      return { ms: Date.now() - t, code: kc.code };
    };
    const gewoon = await meetStarttijd('', '5d-GEWOON');
    const androidachtig = await meetStarttijd(VEEL_MICS, '5d-ANDROID');
    const kosten = androidachtig.ms - gewoon.ms;
    check('5d: extra microfoons die niet opengaan kosten de babyunit hooguit 2 s starttijd',
      kosten <= 2000,
      'kamercode na ' + (gewoon.ms / 1000).toFixed(1) + ' s (één microfoon) tegen ' +
      (androidachtig.ms / 1000).toFixed(1) + ' s (vier microfoons, geen ervan gaat open) — ' +
      (kosten / 1000).toFixed(1) + ' s verloren', 'B9');
    tegenproef('5d: de babyunit start in beide gevallen wél op',
      !!gewoon.code && !!androidachtig.code, gewoon.code + ' / ' + androidachtig.code);
  }

  // ==================================================================
  // 6. WACHTTIJD OP "TOESTAAN" — de demonstrator loopt naar het andere toestel
  // ==================================================================
  if (doe(6)) {
    kop('6. Hoe lang blijft de toestemmingsvraag staan bij een handmatige code?');
    // Bij een herverbinding geldt AUTH_TIMEOUT_RETRY (10 s) in plaats van
    // AUTH_TIMEOUT (30 s). Elke koppelpoging die niet meteen de eerste is —
    // en na één hapering van de gratis koppelserver is dat precies wat er
    // gebeurt — geeft de demonstrator dus maar tien seconden om naar het
    // andere toestel te lopen en op "Toestaan" te tikken.
    //
    // Wat er dán gebeurt is het eigenlijke probleem: de ouderunit gooit de
    // hele koppeling weg en begint opnieuw, terwijl er niets mis is behalve
    // dat er nog niemand getikt heeft. Deze meting draait op de ECHTE
    // standaardwaarden.
    //
    // OVER 6b. Of de toestemmingsvraag daarbij ook van het scherm SPRINGT is
    // een race: het hangt ervan af of het kanaal sluit vlak voor of vlak na
    // een herverbindingsronde. In twee metingen zagen we het één keer wel en
    // één keer niet. Een controle daarop zou wisselend groen en rood staan en
    // dus niets bewaken. 6b meet daarom het onderliggende, wél vaste feit:
    // HOEVEEL TIJD de app een mens gunt voordat hij de koppeling weggooit.
    // Dat getal staat hard in de code (AUTH_TIMEOUT / AUTH_TIMEOUT_RETRY) en
    // is precies wat een demonstrator die naar het andere toestel loopt merkt.
    const WACHT_MS = +(process.env.DEMO_WACHT_MS || 45000);
    const volgDialoog = async (baby, ms) => {
      const t = Date.now();
      const beurten = []; // { open: tijdstip, dicht: tijdstip }
      let op = 0;
      while (Date.now() - t < ms) {
        const zichtbaar = await baby.evaluate(() => {
          const b = document.getElementById('babyApproval');
          return !!b && !b.classList.contains('hidden');
        }).catch(() => false);
        if (zichtbaar && !op) op = Date.now();
        if (!zichtbaar && op) { beurten.push({ open: op - t, dicht: Date.now() - t }); op = 0; }
        await sleep(150);
      }
      if (op) beurten.push({ open: op - t, dicht: -1 });
      return beurten;
    };

    const cb = await mk(); const baby = await nieuwePagina(cb, '6-BABY');
    await baby.click('#pickBaby');
    const kc = await wachtOpCode(baby);
    const cp = await mk(); const ouder = await nieuwePagina(cp, '6-OUDER');
    const tVerbind = Date.now();
    await ouderVerbindt(ouder, kc.code); // handmatig ingetypte code: baby vraagt toestemming
    const beurten = await volgDialoog(baby, WACHT_MS);
    const na = await ouder.evaluate(() => ({
      status: (document.getElementById('connText').textContent || '').trim(),
      fout: (() => { const e = document.getElementById('parentError'); return e && !e.classList.contains('hidden') ? (e.textContent || '').trim() : ''; })(),
      verloop: window.__zicht.status.map((x) => x.v),
      // __t0 is een Date.now()-waarde; daarmee zijn de tijdstippen uit de meter
      // om te rekenen naar het moment waarop er op Verbinden werd gedrukt.
      t0: window.__t0,
      gemerkt: window.__zicht.status.map((x) => ({ t: x.t, v: x.v })),
    }));
    console.log('   toestemmingsvraag op de babyunit: ' +
      beurten.map((b) => (b.open / 1000).toFixed(1) + 's–' + (b.dicht < 0 ? 'nog open' : (b.dicht / 1000).toFixed(1) + 's')).join(', '));
    console.log('   statusverloop ouderunit: ' + na.verloop.join(' → '));
    // Hoe vaak heeft de ouderunit de hele koppeling weggegooid en opnieuw
    // opgebouwd, terwijl er helemaal niets mis was behalve dat er nog niemand
    // getikt had? Elke "(n/5)" is er één, en bij (5/5) geeft de app het op.
    const rondes = na.verloop.filter((t) => /\(\d+\/\d+\)/.test(t)).length;
    const hoogste = na.verloop.map((t) => (/\((\d+)\/(\d+)\)/.exec(t) || [])[1]).filter(Boolean).pop() || '0';
    const secs = (WACHT_MS / 1000).toFixed(0) + ' s';
    check('6a: de ouderunit telt géén herverbindingspogingen af terwijl hij op een menselijke tik wacht',
      rondes === 0,
      rondes + ' herverbindingsronden in ' + secs + ' (tot ' + hoogste + '/5); de app geeft na 5 ronden op met een ' +
      'foutmelding, terwijl er alleen nog getikt moet worden', 'B10');
    // Hoeveel tijd krijgt een mens? Van "Verbinden" tot de eerste ronde waarin
    // de app de koppeling weggooit. Dat is een vaste waarde uit de code, geen
    // race — anders dan de vraag of de dialoog daarbij ook van het scherm
    // springt (zie de toelichting hierboven).
    const eerste = na.gemerkt.filter((x) => /\(\d+\/\d+\)/.test(x.v))[0];
    const gunTijd = eerste ? (na.t0 + eerste.t) - tVerbind : -1;
    check('6b: de app gunt de gebruiker minstens 60 s om naar het andere toestel te lopen en te tikken',
      gunTijd < 0 || gunTijd >= 60000,
      gunTijd < 0
        ? 'binnen ' + secs + ' gooide de app de koppeling niet weg'
        : 'na ' + (gunTijd / 1000).toFixed(1) + ' s gooide de ouderunit de koppeling al weg, terwijl de ' +
          'toestemmingsvraag nog onbeantwoord op de babyunit stond',
      'B10');
    // Werkt een LATE tik dan tenminste nog? (Gemeten: ja — hier zit geen defect.)
    const laatOk = await (async () => {
      const zichtbaar = await baby.evaluate(() => {
        const b = document.getElementById('babyApproval');
        return !!b && !b.classList.contains('hidden');
      });
      if (!zichtbaar) return { px: 0, reden: 'de vraag stond op dat moment niet op het scherm' };
      await baby.click('#btnApproveYes');
      const b = await wachtOpBeeld(ouder, 20000);
      return { px: b.px, ms: b.ms, reden: '' };
    })();
    check('6c: een tik op "Toestaan" na ' + secs + ' levert alsnog beeld op',
      laatOk.px > 0, laatOk.px ? laatOk.px + 'px na ' + (laatOk.ms / 1000).toFixed(1) + ' s' : laatOk.reden);
    // TEGENPROEF: wordt er wél meteen getikt, dan is er GEEN enkele
    // herverbindingsronde en verschijnt de vraag precies één keer.
    const cb2 = await mk(); const baby2 = await nieuwePagina(cb2, '6-TEGEN-BABY');
    await baby2.click('#pickBaby');
    const kc2 = await wachtOpCode(baby2);
    const cp2 = await mk(); const ouder2 = await nieuwePagina(cp2, '6-TEGEN-OUDER');
    const volg = volgDialoog(baby2, 12000);
    await ouderVerbindt(ouder2, kc2.code);
    await keurGoed(baby2);
    const b2 = await wachtOpBeeld(ouder2, 20000);
    const beurten2 = await volg;
    const rondes2 = (await ouder2.evaluate(() => window.__zicht.status.map((x) => x.v)))
      .filter((t) => /\(\d+\/\d+\)/.test(t)).length;
    tegenproef('6: met een snelle tik: één vraag, nul herverbindingsronden, beeld',
      beurten2.length === 1 && b2.px > 0 && rondes2 === 0,
      beurten2.length + ' vraag/vragen, ' + rondes2 + ' ronden, beeld ' + b2.px + 'px');
    await cb.close(); await cp.close(); await cb2.close(); await cp2.close();
  }

  // ==================================================================
  // 7. TRAGE VERBINDING — 4G met hoge latentie naar de koppelserver
  // ==================================================================
  if (doe(7)) {
    kop('7. Trage verbinding — waar blijft de tijd tussen "code ingetypt" en "beeld"?');
    // De weg van kamercode naar beeld gaat vijf keer langs de koppelserver
    // (aanmelden, kanaal openen, hallo, akkoord, media-onderhandeling). Elke
    // stap kost een heen-en-weer. Door de vertraging naar de koppelserver op
    // te voeren is te zien hoe hard die tijd meeloopt — en dus hoeveel van de
    // vaste 20 s-limiet er op een echte 4G-verbinding overblijft.
    const meetKoppeltijd = async (poort, label) => {
      const cb = await mk(poort, 'window.BABYFOON_TRACE = 1;');
      const baby = await nieuwePagina(cb, label + '-BABY');
      const tB = Date.now();
      await baby.click('#pickBaby');
      const kc = await wachtOpCode(baby, 40000);
      const babyMs = Date.now() - tB;
      const cp = await mk(poort, 'window.BABYFOON_TRACE = 1;');
      const ouder = await nieuwePagina(cp, label + '-OUDER');
      const tO = Date.now();
      await ouderVerbindt(ouder, kc.code || 'ABC234');
      const goedgekeurd = keurGoed(baby, 40000);
      const b = await wachtOpBeeld(ouder, 40000);
      await goedgekeurd;
      const z = await zicht(ouder);
      const marks = await ouder.evaluate(() => (window.BABYFOON_MARKS || []).slice()).catch(() => []);
      await cb.close(); await cp.close();
      return {
        babyMs, code: kc.code, beeldMs: Date.now() - tO, px: b.px,
        statussen: (z.status || []).map((x) => x.v), marks,
      };
    };
    // De tijdlijn van de ouderunit, stap voor stap, ten opzichte van het
    // moment waarop er op Verbinden werd gedrukt.
    const tijdlijn = (marks) => {
      const start = (marks.find((m) => m.name === 'connectStart') || marks[0] || {}).t || 0;
      return marks.map((m) => m.name + ' ' + Math.round(m.t - start) + 'ms').join(' → ');
    };
    const snel = await meetKoppeltijd(PEER_PORT, '7-SNEL');
    traagMsHuidig = TRAAG_MS;
    const traagM = await meetKoppeltijd(TRAAG_PORT, '7-TRAAG');
    traagMsHuidig = TRAAG_MS * 3;
    const zeerTraag = await meetKoppeltijd(TRAAG_PORT, '7-ZEERTRAAG');
    traagMsHuidig = TRAAG_MS;
    console.log('   loopback (0 ms extra) : babyunit klaar na ' + (snel.babyMs / 1000).toFixed(1) + ' s, beeld na ' + (snel.beeldMs / 1000).toFixed(1) + ' s');
    console.log('     ' + tijdlijn(snel.marks));
    console.log('   +' + TRAAG_MS + ' ms per richting : babyunit klaar na ' + (traagM.babyMs / 1000).toFixed(1) + ' s, beeld na ' + (traagM.beeldMs / 1000).toFixed(1) + ' s');
    console.log('     ' + tijdlijn(traagM.marks));
    console.log('   +' + TRAAG_MS * 3 + ' ms per richting : babyunit klaar na ' + (zeerTraag.babyMs / 1000).toFixed(1) + ' s, beeld na ' + (zeerTraag.beeldMs / 1000).toFixed(1) + ' s');
    console.log('     ' + tijdlijn(zeerTraag.marks));
    console.log('   statusverloop (traag): ' + traagM.statussen.join(' → '));
    check('7a: op een trage verbinding komt er nog steeds beeld',
      traagM.px > 0 && zeerTraag.px > 0,
      traagM.px + 'px / ' + zeerTraag.px + 'px');
    check('7b: de vaste 20 s-limiet van de ouderunit wordt niet geraakt',
      zeerTraag.px > 0 && zeerTraag.beeldMs < 20000,
      (zeerTraag.beeldMs / 1000).toFixed(1) + ' s van de 20 s (marge ' + ((20000 - zeerTraag.beeldMs) / 1000).toFixed(1) + ' s)');
    // Hoeveel seconden tot beeld per 100 ms extra vertraging? Dat getal maakt
    // de 20 s-limiet inschatbaar voor een echt mobiel netwerk.
    const perRondje = (zeerTraag.beeldMs - snel.beeldMs) / (TRAAG_MS * 3 * 2 / 100);
    console.log('   → ongeveer ' + (perRondje / 1000).toFixed(2) + ' s extra tot beeld per 100 ms RTT naar de koppelserver');
    check('7c: de tijd tot beeld loopt niet harder op dan 1 s per 100 ms RTT',
      perRondje <= 1000, (perRondje / 1000).toFixed(2) + ' s per 100 ms RTT; bij 200 ms RTT (gewone 4G) is dat ' +
      ((snel.beeldMs + perRondje * 2) / 1000).toFixed(1) + ' s tot beeld');
    tegenproef('7: de vertraging is echt aangekomen in de meting',
      zeerTraag.beeldMs > traagM.beeldMs + 300 && traagM.beeldMs > snel.beeldMs + 300,
      (snel.beeldMs / 1000).toFixed(1) + ' s → ' + (traagM.beeldMs / 1000).toFixed(1) + ' s → ' + (zeerTraag.beeldMs / 1000).toFixed(1) + ' s');
  }

  // ==================================================================
  // 8. QR-CODE IN EEN ECHTE RUIMTE
  // ==================================================================
  if (doe(8)) {
    kop('8. QR-scannen in een echte ruimte (weinig licht, schuin, weinig helderheid)');
    // De app maakt de QR zelf en leest hem zelf. We voeren de eigen decoder
    // (jsQR, op de manier waarop js/qr.js hem aanroept) beelden die zijn
    // aangetast zoals een camera in een woonkamer ze aantast: een donkerder,
    // vlakker scherm, schuin gehouden, en met de 640 px-verkleining die de
    // scanner zelf toepast.
    const c = await mk();
    const p = await nieuwePagina(c, '8');
    const uitslag = await p.evaluate(async () => {
      const url = location.href.split('#')[0] + '#ABC234.' + 'a'.repeat(32);
      // Zoals js/qr.js hem tekent: foutcorrectieniveau 'L'.
      const teken = (niveau, cel) => {
        const qr = qrcode(0, niveau);
        qr.addData(url);
        qr.make();
        return { src: qr.createDataURL(cel, 8), modules: qr.getModuleCount() };
      };
      const laad = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
      // Eén beeldje zoals de scanner het ziet: het QR-scherm binnen een
      // cameraframe van 640 px breed (SCAN_BREEDTE), met contrast/helderheid
      // en een scheefstand.
      const scan = async (img, opt) => {
        const W = 640, H = 480;   // SCAN_BREEDTE uit js/qr.js
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const g = cv.getContext('2d', { willReadFrequently: true });
        g.fillStyle = '#101418'; g.fillRect(0, 0, W, H); // donkere kamer
        const s = opt.deel * H;                          // hoeveel van het beeld de code vult
        g.save();
        g.translate(W / 2, H / 2);
        g.transform(1, opt.scheef, opt.scheef * 0.4, 1, 0, 0); // schuin gehouden
        g.filter = 'brightness(' + opt.helder + ') contrast(' + opt.contrast + ') blur(' + opt.blur + 'px)';
        g.drawImage(img, -s / 2, -s / 2, s, s);
        g.restore();
        // Spiegeling van een lamp of raam in het glanzende scherm: een brede,
        // felle baan die een deel van de code volledig uitwist. In een echte
        // kamer is dit de vaakst voorkomende reden dat scannen niet lukt.
        if (opt.glans) {
          g.save();
          g.globalCompositeOperation = 'lighter';
          const grad = g.createLinearGradient(W / 2 - s / 2, H / 2 - s / 2, W / 2 + s / 2, H / 2 + s / 2);
          grad.addColorStop(0, 'rgba(255,255,255,0)');
          grad.addColorStop(0.5, 'rgba(255,255,255,' + opt.glans + ')');
          grad.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grad;
          g.fillRect(W / 2 - s / 2, H / 2 - s / 2, s, s);
          g.restore();
        }
        const d = g.getImageData(0, 0, W, H);
        const res = jsQR(d.data, d.width, d.height, { inversionAttempts: 'dontInvert' });
        return !!(res && res.data === url);
      };
      const gevallen = [
        { naam: 'ideaal (recht, fel, dichtbij)', deel: 0.75, scheef: 0, helder: 1, contrast: 1, blur: 0, glans: 0 },
        { naam: 'schermhelderheid laag', deel: 0.75, scheef: 0, helder: 0.45, contrast: 0.8, blur: 0, glans: 0 },
        { naam: 'schuin gehouden (~20 graden)', deel: 0.7, scheef: 0.2, helder: 1, contrast: 1, blur: 0, glans: 0 },
        { naam: 'op armlengte (code vult 35% van het beeld)', deel: 0.35, scheef: 0, helder: 1, contrast: 1, blur: 0.6, glans: 0 },
        { naam: 'weinig licht + schuin + armlengte', deel: 0.4, scheef: 0.18, helder: 0.5, contrast: 0.8, blur: 0.6, glans: 0 },
        { naam: 'lampweerspiegeling in het scherm', deel: 0.6, scheef: 0.08, helder: 0.9, contrast: 0.9, blur: 0.4, glans: 0.75 },
        // Dit laatste geval is MET OPZET buiten bereik: alles tegelijk mis.
        // Geen enkele QR-lezer haalt dit, en een hoger foutcorrectieniveau helpt
        // er ook niet (zie 8b). Het is daarom geen eis aan de app, maar het
        // bewijs dát scannen soms eenvoudig niet kan — en juist daarom moet de
        // app dat zeggen in plaats van stil te blijven staan (zie 8c).
        { naam: 'weerspiegeling + op afstand + bewogen', deel: 0.3, scheef: 0.12, helder: 0.7, contrast: 0.85, blur: 1.2, glans: 0.6, extreem: true },
      ];
      const uit = { L: [], M: [], Q: [] };
      // Hoe klein mag de code in het camerabeeld worden voordat hij onleesbaar
      // wordt? Dat is het praktische getal: het zegt hoe dicht je de telefoon
      // erbij moet houden.
      const drempel = async (img) => {
        for (let deel = 0.60; deel >= 0.05; deel -= 0.02) {
          const ok = await scan(img, { deel: deel, scheef: 0.05, helder: 0.8, contrast: 0.9, blur: 0.5, glans: 0 });
          if (!ok) return +(deel + 0.02).toFixed(2);
        }
        return 0.05;
      };
      for (const niveau of ['L', 'M', 'Q']) {
        const t = teken(niveau, 8);
        const img = await laad(t.src);
        for (const g of gevallen) uit[niveau].push({ naam: g.naam, extreem: !!g.extreem, ok: await scan(img, g) });
        uit[niveau + '_modules'] = t.modules;
        uit[niveau + '_drempel'] = await drempel(img);
      }
      return uit;
    });
    const aantal = uitslag.L.length;
    for (const niveau of ['L', 'M', 'Q']) {
      const r = uitslag[niveau];
      console.log('   foutcorrectie ' + niveau + ' (' + uitslag[niveau + '_modules'] + ' modules, ' +
        'kleinst leesbaar: ' + Math.round(uitslag[niveau + '_drempel'] * 100) + '% van het beeld): ' +
        r.map((x) => (x.ok ? '✓' : '✗') + ' ' + x.naam).join(' | '));
    }
    const gelukt = (n) => uitslag[n].filter((x) => x.ok).length;
    // Alleen de HAALBARE omstandigheden zijn een eis aan de app. Het extreme
    // geval staat er als ijkpunt en wordt apart gemeld.
    const haalbaar = uitslag.L.filter((x) => !x.extreem);
    const haalbaarOk = haalbaar.filter((x) => x.ok).length;
    check('8a: de QR die de app maakt (niveau L) is in alle ' + haalbaar.length +
      ' haalbare ruimte-omstandigheden leesbaar',
      haalbaarOk === haalbaar.length, haalbaarOk + '/' + haalbaar.length + ' gelukt' +
      (haalbaarOk === haalbaar.length ? '' : ': ' + haalbaar.filter((x) => !x.ok).map((x) => x.naam).join('; ')));
    const extreem = uitslag.L.filter((x) => x.extreem);
    console.log('   ijkpunt (geen eis): "' + extreem.map((x) => x.naam).join('; ') + '" lukt op ' +
      'geen enkel foutcorrectieniveau — daarom moet de app bij mislukt scannen iets ZEGGEN (8c).');
    check('8b: een hoger foutcorrectieniveau levert niets op (dan valt er niets te winnen)',
      gelukt('Q') <= gelukt('L') && uitslag.Q_drempel >= uitslag.L_drempel,
      'L ' + gelukt('L') + '/' + aantal + ' (drempel ' + Math.round(uitslag.L_drempel * 100) + '%) · ' +
      'M ' + gelukt('M') + '/' + aantal + ' (' + Math.round(uitslag.M_drempel * 100) + '%) · ' +
      'Q ' + gelukt('Q') + '/' + aantal + ' (' + Math.round(uitslag.Q_drempel * 100) + '%)');
    // TEGENPROEF: de nabootsing kan aantoonbaar zowel groen als rood opleveren.
    // Zou hij altijd groen zijn, dan bewees 8a niets.
    tegenproef('8: de nabootsing maakt echt verschil — ideaal lukt, te klein lukt niet',
      uitslag.L[0].ok && uitslag.L_drempel > 0.05,
      'ideaal gelukt; onleesbaar zodra de code kleiner is dan ' + Math.round(uitslag.L_drempel * 100) + '% van het beeld');

    // 8c — blijft de scanner eeuwig stil als het lezen niet lukt?
    const stil = await p.evaluate(() => {
      // js/qr.js roept onError alleen aan als de camera niet opengaat of als
      // jsQR ontbreekt. In de leeslus zelf zit geen enkele tijdslimiet, dus een
      // scan die niet lukt geeft nooit een signaal.
      const zoek = (fn) => /setTimeout|Date\.now\(\)|deadline/.test(String(fn));
      const referentie = function () { setTimeout(function () {}, 1000); };
      return { scanner: zoek(QRKit.startScanner), referentie: zoek(referentie) };
    });
    check('8c: de scanner geeft na verloop van tijd een hint als het lezen niet lukt',
      stil.scanner, 'geen enkele tijdslimiet in QRKit.startScanner()', 'B11');
    tegenproef('8c: de detectie werkt — een functie mét tijdslimiet wordt wél herkend',
      stil.referentie, 'referentiefunctie herkend: ' + stil.referentie);
    await c.close();
  }

  // ==================================================================
  // 9. ONDERSCHEID: koppelserver weg  vs.  mediaverbinding weg
  // ==================================================================
  if (doe(9)) {
    kop('9. Zegt de app het verschil tussen "koppelserver weg" en "beeld weg"?');
    // Eerst een gezonde verbinding, dan de koppelserver eruit. De app hoort de
    // sessie met rust te laten (dat is eerder gerepareerd) — deze controle is
    // de bewaker daarop, én meet wat de gebruiker in beide gevallen leest.
    const EXTRA = 'window.BABYFOON_RECONNECT_DELAYS = [1200, 2500, 5000];';
    const cb = await mk(PEER_PORT, EXTRA); const baby = await nieuwePagina(cb, '9-BABY');
    await baby.click('#pickBaby');
    const kc = await wachtOpCode(baby);
    const cp = await mk(PEER_PORT, EXTRA); const ouder = await nieuwePagina(cp, '9-OUDER');
    await ouderVerbindt(ouder, kc.code);
    await keurGoed(baby);
    const b = await wachtOpBeeld(ouder, 25000);
    check('9: uitgangspunt — er is beeld', b.px > 0, b.px + 'px');

    // Een tweede babyunit die nog op een kijker WACHT, met een geldige code in
    // beeld. Straks gaat de koppelserver eruit; dan is die code niets meer
    // waard en hoort dat te blijken — dit is de demo-situatie waarin iemand
    // staat te scannen terwijl er niets kan aankomen.
    const cbw = await mk(PEER_PORT, EXTRA); const wachtBaby = await nieuwePagina(cbw, '9-WACHTBABY');
    await wachtBaby.click('#pickBaby');
    const kcw = await wachtOpCode(wachtBaby, 20000);
    const wachtVooraf = await wachtBaby.evaluate(() => {
      const bw = document.getElementById('babyWaiting');
      return !!(bw && bw.classList.contains('warn'));
    });
    tegenproef('9b: de wachtende babyunit staat vóór de storing NIET te waarschuwen',
      !!kcw.code && !wachtVooraf, 'code ' + (kcw.code || '(geen)') + ', waarschuwing: ' + wachtVooraf);

    await ouder.evaluate(() => { window.__zicht.status.length = 0; window.__zicht.fout.length = 0; });
    const tW = Date.now();
    await stopBroker(broker); broker = null;
    let babyWaarschuwt = -1;
    while (Date.now() - tW < 20000) {
      const w = await wachtBaby.evaluate(() => {
        const bw = document.getElementById('babyWaiting');
        const sp = bw && bw.querySelector('span[data-i18n]');
        return { sleutel: sp ? sp.getAttribute('data-i18n') : '', warn: !!(bw && bw.classList.contains('warn')) };
      }).catch(() => ({ sleutel: '', warn: false }));
      if (w.warn || w.sleutel === 'connectionLost') { babyWaarschuwt = Date.now() - tW; break; }
      await sleep(200);
    }
    check('9b: een wachtende babyunit waarschuwt binnen 10 s dat zijn kamercode niets meer waard is',
      babyWaarschuwt >= 0 && babyWaarschuwt <= 10000,
      babyWaarschuwt >= 0 ? 'na ' + (babyWaarschuwt / 1000).toFixed(1) + ' s' : 'binnen 20 s geen waarschuwing');
    await cbw.close();
    while (Date.now() - tW < 6000) await sleep(200);
    const tijdensBroker = await ouder.evaluate(() => ({
      status: (document.getElementById('connText').textContent || '').trim(),
      fout: (() => { const e = document.getElementById('parentError'); return e && !e.classList.contains('hidden') ? (e.textContent || '').trim() : ''; })(),
      frames: (() => { const v = document.getElementById('video'); return v ? v.currentTime : 0; })(),
    }));
    check('9a: bij uitval van de koppelserver blijft de ouderunit "verbonden" melden en loopt het beeld door',
      !/\(\d+\/\d+\)/.test(tijdensBroker.status) && !tijdensBroker.fout,
      'status "' + tijdensBroker.status + '", fout "' + tijdensBroker.fout + '"');

    broker = await startBroker(PEER_PORT);
    await sleep(5000);

    // 9c — nu het ANDERE geval: het MEDIAPAD valt weg terwijl de koppelserver
    // en het besturingskanaal gewoon leven. De babyunit stopt zijn uitgaande
    // sporen; de ouder ziet een bevroren beeld. Zegt de app dat?
    await ouder.evaluate(() => { window.__zicht.status.length = 0; });
    await baby.evaluate(() => {
      // Alle uitgaande media-sporen van de babyunit stoppen. Het datakanaal
      // blijft open, dus de hartslag merkt niets — precies de storing waar het
      // hier om gaat.
      document.querySelectorAll('video').forEach((v) => {
        if (v.srcObject && v.srcObject.getTracks) v.srcObject.getTracks().forEach((t) => t.stop());
      });
    });
    const tM = Date.now();
    let mediaGemeld = -1;
    // 25 s: de controle eist een melding binnen 20 s, dus langer wachten voegt
    // niets toe aan de uitspraak en kost alleen CI-tijd.
    while (Date.now() - tM < 25000) {
      const s = await ouder.evaluate(() => (document.getElementById('connText').textContent || '').trim()).catch(() => '');
      if (s && s !== tijdensBroker.status) { mediaGemeld = Date.now() - tM; break; }
      await sleep(250);
    }
    const naMedia = await ouder.evaluate(() => ({
      status: (document.getElementById('connText').textContent || '').trim(),
      verloop: window.__zicht.status.map((x) => x.v),
    }));
    console.log('   statusverloop na wegvallend beeld: ' + naMedia.verloop.join(' → '));
    check('9c: bij wegvallend beeld meldt de ouderunit dat binnen 20 s (geen "verbonden" bij een bevroren beeld)',
      mediaGemeld >= 0 && mediaGemeld <= 20000,
      mediaGemeld >= 0 ? 'na ' + (mediaGemeld / 1000).toFixed(1) + ' s: "' + naMedia.status + '"' : 'na 25 s nog steeds "' + naMedia.status + '"',
      'B12');
    // TEGENPROEF: zit de statuslezer soms gewoon vast? Nee — trek nu het héle
    // toestel weg (de babyunit sluit zijn pagina) en de status verandert wél.
    // Pas daarmee staat vast dat "Connected bij bevroren beeld" een uitspraak
    // over de app is en niet over de meting.
    await baby.close();
    const tD = Date.now();
    let dropGemeld = -1;
    while (Date.now() - tD < 30000) {
      const s = await ouder.evaluate(() => (document.getElementById('connText').textContent || '').trim()).catch(() => '');
      if (s && s !== naMedia.status) { dropGemeld = Date.now() - tD; break; }
      await sleep(250);
    }
    tegenproef('9: de statusmeting is gevoelig — bij een écht weggevallen toestel verandert de tekst wél',
      dropGemeld >= 0, dropGemeld >= 0 ? 'na ' + (dropGemeld / 1000).toFixed(1) + ' s' : 'ook toen niet');
    await cb.close(); await cp.close();
  }

  // ------------------------------------------------------------------ slot
  kop('SAMENVATTING');
  let fail = false;
  await leesBootFouten();
  if (errs.length) {
    console.log('Pagina-fouten:');
    errs.forEach((e) => console.log('  ! ' + e));
    fail = true;
  } else {
    console.log('Geen pagina-fouten.');
  }

  const regressies = uitslagen.filter((u) => !u.ok && !u.bekend && u.soort === 'controle');
  const kapotteMeting = uitslagen.filter((u) => !u.ok && u.soort === 'tegenproef');
  const openBevindingen = uitslagen.filter((u) => !u.ok && u.bekend);
  const opgelost = uitslagen.filter((u) => u.ok && u.bekend);
  const schoon = uitslagen.filter((u) => u.ok && !u.bekend && u.soort === 'controle');

  console.log('\n' + schoon.length + ' controle(s) groen zonder kenmerk — daar zit geen defect.');
  console.log(openBevindingen.length + ' bekende bevinding(en) nog open, ' +
    opgelost.length + ' kennelijk opgelost, ' +
    regressies.length + ' regressie(s), ' +
    kapotteMeting.length + ' kapotte meting(en).');

  if (openBevindingen.length) {
    console.log('\nBEKENDE BEVINDINGEN, nog open (zie scratchpad/ronde2/demo.md):');
    openBevindingen.forEach((u) => console.log('  ⚠️  [' + u.bekend + '] ' + u.naam + (u.detail ? '  — ' + u.detail : '')));
  }
  if (opgelost.length) {
    console.log('\nOPGELOST — deze bevindingen zijn kennelijk gerepareerd. Haal hun kenmerk');
    console.log('uit test/e2e-demo.js weg, zodat de controle vanaf nu op regressie bewaakt:');
    opgelost.forEach((u) => console.log('  🟢 [' + u.bekend + '] ' + u.naam + (u.detail ? '  — ' + u.detail : '')));
  }
  if (regressies.length) {
    console.log('\nREGRESSIE — dit gedrag was er wél en is nu weg:');
    regressies.forEach((u) => console.log('  ❌ ' + u.naam + (u.detail ? '  — ' + u.detail : '')));
    fail = true;
  }
  if (kapotteMeting.length) {
    console.log('\nKAPOTTE METING — de tegenproef is rood, dus de hoofdmeting ernaast zegt niets:');
    kapotteMeting.forEach((u) => console.log('  ❌ ' + u.naam + (u.detail ? '  — ' + u.detail : '')));
    fail = true;
  }
  if (STRICT && openBevindingen.length) {
    console.log('\nSTRICT=1: de bekende bevindingen tellen mee als fout.');
    fail = true;
  }

  console.log('\nGRENS VAN DE METING: openrelay.metered.ca en 0.peerjs.com zijn vanuit deze');
  console.log('omgeving niet bereikbaar. Alle ICE liep over 127.0.0.1 en alle');
  console.log('koppelserver-verkeer over een lokale broker. De wachttijden die de app');
  console.log('zelf oplegt zijn exact; de netwerktijden zijn een ondergrens.');

  await browser.close();
  await stopBroker(broker);
  try { hang.close(); } catch (e) {}
  try { traag.close(); } catch (e) {}
  await new Promise((r) => web.close(r));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
