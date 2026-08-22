'use strict';

/**
 * End-to-end STABILITEIT: blijft de verbinding staan, of blijft de app
 * herverbinden?
 *
 * Meldpunt van de gebruiker: "App blijft reconnecten en lijkt niet stabiel."
 *
 *   npm run test:stability          (ONLY=2 draait alleen scenario 2)
 *
 * Scenario 1, 2 en 3 zijn ONDERSCHEIDEND: gemeten op de code van vóór deze
 * ronde (commit ecf7e57) zijn ze rood, erná groen. Scenario 4 is dat NIET —
 * het is een bewaker tegen terugval, geen bewijs. Zie de aantekening daar.
 *
 *   1. KOPPELSERVER VALT WEG (onderscheidend). De koppelserver (PeerJS-broker)
 *      brengt twee toestellen alleen bij elkaar; daarna loopt alles
 *      rechtstreeks. Toch brak de ouderunit haar hele verbinding af zodra
 *      PeerJS 'network' meldde, en riep de 'disconnected'-tak meteen (zonder
 *      wachttijd, onbeperkt) peer.reconnect() aan. Gemeten op de oude code:
 *      2 herverbindingen en 27 nieuwe websockets in zes seconden uitval.
 *
 *   2. OPRUIMEN VAN DE OUDE PEER TELT ALS WEGVAL (onderscheidend).
 *      startParentConnect() riep peer.destroy() aan terwijl `controlConn` nog
 *      naar het oude kanaal wees. Dat kanaal meldt zijn 'close', attachControl
 *      leest `controlConn === conn` en behandelt de nette opruiming als een
 *      wegval: nog een herverbinding bovenop de poging die net begon. Elke
 *      poging kostte zo twee beurten uit de tabel; bij de laatste beurt gaf de
 *      app meteen op met "verbinding mislukt". Dit scenario laat dat zien met
 *      een babyunit die traag antwoordt.
 *
 *   3. WAKE-STORM (onderscheidend). Eén keer het scherm aanzetten levert
 *      visibilitychange, pageshow én focus op. Elk daarvan startte een
 *      compleet nieuwe koppelpoging, inclusief peer.destroy() van de poging
 *      die er net voor gestart was. Gemeten op de oude code: 8 aanmeldingen
 *      bij de koppelserver voor vijf gebeurtenissen; nu 1.
 *
 *   4. VERLATEN MEDIAVERBINDING (bewaker, GEEN bewijs). Na een 'recall' hoort
 *      er geen tweede, verlaten RTCPeerConnection open te blijven staan en
 *      hoort de verbinding daarna rustig te blijven. Dit is op de oude code
 *      óók groen: PeerJS ruimt in dít scenario de achtergebleven
 *      MediaConnection zelf op zodra de ICE-status 'closed'/'failed' wordt.
 *      De test blijft staan als bewaker tegen terugval.
 *
 * Let op: dit draait tegen een koppelserver op 127.0.0.1 en twee browsers op
 * dezelfde machine. De uitval van de koppelserver is echt (de poort gaat
 * dicht); het gedrag van een mobiel netwerk is dat niet.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');
const { chromium } = require('playwright');
const { ExpressPeerServer } = require('peer');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOT = path.join(__dirname, '..', 'serverless');
const WEB_PORT = +(process.env.WEB_PORT || 8177);
const PEER_PORT = +(process.env.PEER_PORT || 9037);

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

// De koppelserver moet tussendoor ECHT uit kunnen: hij draait daarom op een
// eigen http-server die we kunnen sluiten (inclusief de open websockets) en
// later opnieuw op dezelfde poort kunnen openen.
function startBroker(port) {
  return new Promise((res) => {
    const app = express();
    const srv = http.createServer(app);
    // Zelf de rauwe sockets bijhouden. Een websocket die is opgewaardeerd
    // telt niet meer mee voor server.close() én niet voor
    // closeAllConnections(); zonder deze administratie blijft close() dus
    // eeuwig wachten en gaat de poort nooit echt dicht.
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

function findExecutable() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  try {
    for (const dir of fs.readdirSync('/opt/pw-browsers')) {
      if (dir.startsWith('chromium-')) {
        const p = path.join('/opt/pw-browsers', dir, 'chrome-linux', 'chrome');
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (e) { /* map bestaat niet */ }
  return undefined;
}

// Meetgereedschap dat in elke pagina meegaat: hoeveel websockets er naar de
// koppelserver zijn geopend (een reconnect-storm is anders niet te tellen),
// welke RTCPeerConnections er zijn, en of de faalstatus ooit in beeld stond.
const METERS = `
  (function () {
    window.__ws = 0;
    var OW = window.WebSocket;
    function W(url, protocols) {
      window.__ws++;
      return protocols === undefined ? new OW(url) : new OW(url, protocols);
    }
    W.prototype = OW.prototype;
    W.CONNECTING = OW.CONNECTING; W.OPEN = OW.OPEN;
    W.CLOSING = OW.CLOSING; W.CLOSED = OW.CLOSED;
    window.WebSocket = W;

    var O = window.RTCPeerConnection;
    window.__pcs = [];
    var P = function () {
      var pc = new (Function.prototype.bind.apply(O, [null].concat([].slice.call(arguments))))();
      window.__pcs.push(pc);
      return pc;
    };
    P.prototype = O.prototype;
    window.RTCPeerConnection = P;

    window.__failSeen = false;
    window.__retrySeen = false;
    window.__statuses = [];
    setInterval(function () {
      var e = document.getElementById('parentError');
      if (e && !e.classList.contains('hidden') && (e.textContent || '').trim()) window.__failSeen = true;
      var r = document.getElementById('phRetry');
      if (r && !r.classList.contains('hidden')) window.__retrySeen = true;
      var c = document.getElementById('connText');
      if (c) {
        var t = (c.textContent || '').trim();
        if (t && window.__statuses[window.__statuses.length - 1] !== t) window.__statuses.push(t);
      }
    }, 100);
  })();
`;

(async () => {
  let broker = await startBroker(PEER_PORT);
  await new Promise((r) => web.listen(WEB_PORT, r));
  const BASE = 'http://127.0.0.1:' + WEB_PORT + '/';

  const browser = await chromium.launch({
    executablePath: findExecutable(),
    headless: true,
    // Bewust GEEN --autoplay-policy=no-user-gesture-required: die vlag heeft in
    // dit project eerder een echte fout gemaskeerd.
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });

  // Met ONLY=2 (of ONLY=1,3) draait alleen dat scenario. Handig om per
  // bevinding te laten zien dat de test op de oude code rood is.
  const ONLY = process.env.ONLY ? String(process.env.ONLY).split(',') : null;
  const doe = (n) => !ONLY || ONLY.indexOf(String(n)) >= 0;
  let fail = false;
  const check = (n, c) => { console.log((c ? '✅' : '❌') + ' ' + n); if (!c) fail = true; };
  const errs = [];

  const mk = async (extra) => {
    const c = await browser.newContext({ permissions: ['camera', 'microphone'] });
    await c.addInitScript(
      "window.BABYFOON_PEER = { host: '127.0.0.1', port: " + PEER_PORT +
      ", path: '/', key: 'peerjs', secure: false };\n" + METERS + (extra || '')
    );
    return c;
  };
  const wachtOpCode = async (p) => {
    for (let i = 0; i < 80; i++) {
      const c = await p.$eval('#babyCodeText', (e) => e.textContent.trim()).catch(() => '');
      if (/^[A-Z0-9]{6}$/.test(c)) return c;
      await sleep(250);
    }
    return '';
  };
  const keurGoed = async (p) => {
    for (let i = 0; i < 80; i++) {
      const zichtbaar = await p.evaluate(() => {
        const b = document.getElementById('babyApproval');
        return !!b && !b.classList.contains('hidden');
      }).catch(() => false);
      if (zichtbaar) { await p.click('#btnApproveYes'); return true; }
      await sleep(250);
    }
    return false;
  };
  const wachtOpBeeld = async (p, ms) => {
    const t = Date.now();
    let w = 0;
    while (Date.now() - t < (ms || 25000)) {
      w = await p.$eval('#video', (v) => v.videoWidth || 0).catch(() => 0);
      if (w > 0) return w;
      await sleep(250);
    }
    return w;
  };
  // Eén compleet, verbonden paar opzetten (handmatige code + toestemming).
  const koppel = async (label, extraBaby, extraOuder) => {
    const cB = await mk(extraBaby);
    const baby = await cB.newPage();
    baby.on('pageerror', (e) => errs.push(label + '-BABY: ' + e.message));
    await baby.goto(BASE); await sleep(300);
    await baby.click('#pickBaby');
    const code = await wachtOpCode(baby);
    const cP = await mk(extraOuder);
    const ouder = await cP.newPage();
    ouder.on('pageerror', (e) => errs.push(label + '-OUDER: ' + e.message));
    await ouder.goto(BASE); await sleep(250);
    await ouder.click('#pickParent');
    await ouder.fill('#parentOfferInput', code);
    await ouder.click('#parentGenBtn');
    await keurGoed(baby);
    const w = await wachtOpBeeld(ouder);
    return { cB, baby, cP, ouder, code, w };
  };
  // Loopt het beeld nog écht? videoWidth houdt na een wegval zijn oude waarde;
  // currentTime van een live MediaStream loopt alleen door zolang er frames
  // binnenkomen.
  const frames = async (p, ms) => p.evaluate(async (w) => {
    const v = document.getElementById('video');
    if (!v || !v.srcObject) return false;
    const a = v.currentTime;
    await new Promise((r) => setTimeout(r, w));
    return v.currentTime > a;
  }, ms || 1500);

  // ==================================================================
  // 1. Uitval van de koppelserver mag een lopende verbinding niet raken
  // ==================================================================
  if (doe(1)) {
    const EXTRA = 'window.BABYFOON_RECONNECT_DELAYS = [1200, 2500, 5000];';
    const s = await koppel('BROKER', EXTRA, EXTRA);
    check('1: eerst gewoon live beeld (' + s.w + 'px)', s.w > 0);

    const pcsVoor = await s.ouder.evaluate(() => window.__pcs.length);
    await s.ouder.evaluate(() => {
      window.__ws = 0; window.__failSeen = false; window.__retrySeen = false; window.__statuses.length = 0;
    });

    // Koppelserver ECHT uit: poort dicht en alle open websockets verbroken.
    await stopBroker(broker);
    broker = null;
    const beeldTijdensUitval = await frames(s.ouder, 6000);
    const tussen = await s.ouder.evaluate(() => ({
      ws: window.__ws, fail: window.__failSeen, statuses: window.__statuses.slice(),
    }));

    check('1: beeld loopt gewoon door tijdens 6 s uitval van de koppelserver', beeldTijdensUitval);
    const herverbindingen = tussen.statuses.filter((t) => /\(\d+\/\d+\)/.test(t)).length;
    check('1: ouderunit plant GEEN herverbinding bij uitval van de koppelserver (' +
      herverbindingen + 'x, statussen: ' + (tussen.statuses.join(' → ') || 'geen') + ')',
      herverbindingen === 0 && !tussen.fail);
    check('1: geen stortvloed van aanmeldpogingen — oplopende wachttijd (' +
      tussen.ws + ' websockets in 6 s)', tussen.ws <= 8);

    // Koppelserver terug: de app hoort zich stilletjes opnieuw aan te melden,
    // zonder een tweede besturingskanaal en zonder nieuwe media-onderhandeling.
    broker = await startBroker(PEER_PORT);
    await sleep(8000);
    const na = await s.ouder.evaluate(() => ({
      pcs: window.__pcs.length,
      tekst: (document.getElementById('connText').textContent || '').trim(),
      off: document.getElementById('connDot').classList.contains('off'),
      fail: window.__failSeen,
    }));
    check('1: na herstel van de koppelserver nog steeds verse frames', await frames(s.ouder));
    check('1: geen extra media-onderhandeling na het herstel (' + pcsVoor + ' → ' + na.pcs + ')',
      na.pcs === pcsVoor);
    check('1: status blijft "verbonden" ("' + na.tekst + '")', !na.off && !na.fail);
    await s.cP.close(); await s.cB.close();
  }

  // ==================================================================
  // 2. Een trage herverbinding mag niet halverwege afgebroken worden
  // ==================================================================
  if (doe(2)) {
    // De wachttijd (8 s) is bewust langer dan HEARTBEAT_TIMEOUT (6 s): dat is
    // de stand waarin zowel de verouderde `lastControlAt` als het opruimen van
    // de oude peer de verse poging kon neerslaan.
    const OUDER = `
      window.BABYFOON_HEARTBEAT_TIMEOUT = 6000;
      window.BABYFOON_RECONNECT_DELAYS = [8000];
      window.BABYFOON_CONNECT_TIMEOUT = 40000;
      window.BABYFOON_AUTH_TIMEOUT = 40000;
      window.BABYFOON_AUTH_TIMEOUT_RETRY = 40000;
    `;
    // De babyunit kan zijn besturingsverkeer laten stokken (stille uplink) en
    // daarna traag antwoorden. Beeld en geluid lopen over een ándere verbinding
    // en blijven ongemoeid — precies zoals bij een haperend mobiel netwerk.
    const BABY = `
      window.__vertraag = 0;   // 0 = normaal, -1 = alles weggooien, >0 = ms uitstel
      (function () {
        var S = RTCDataChannel.prototype.send;
        RTCDataChannel.prototype.send = function () {
          var self = this, args = arguments;
          if (window.__vertraag === -1) return;
          if (window.__vertraag > 0) {
            setTimeout(function () { try { S.apply(self, args); } catch (e) {} }, window.__vertraag);
            return;
          }
          return S.apply(self, args);
        };
      })();
    `;
    const s = await koppel('HARTSLAG', BABY, OUDER);
    check('2: eerst gewoon live beeld (' + s.w + 'px)', s.w > 0);

    await s.ouder.evaluate(() => {
      window.__failSeen = false; window.__retrySeen = false; window.__statuses.length = 0;
    });
    // Uplink van het besturingskanaal valt stil: geen 'pong' meer. De hartslag
    // hoort dit binnen HEARTBEAT_TIMEOUT als wegval te zien.
    await s.baby.evaluate(() => { window.__vertraag = -1; });

    let tDrop = 0;
    const tW = Date.now();
    while (Date.now() - tW < 25000) {
      const st = await s.ouder.evaluate(() => window.__statuses.slice());
      if (st.some((t) => /\(\d+\/\d+\)/.test(t))) { tDrop = Date.now(); break; }
      await sleep(150);
    }
    check('2: de hartslag merkt de stilgevallen uplink op (wegval gedetecteerd)', tDrop > 0);
    // Vanaf nu antwoordt de babyunit wél, maar traag (8 s). De herverbinding
    // duurt daardoor gegarandeerd langer dan één hartslagtik.
    await s.baby.evaluate(() => { window.__vertraag = 8000; });
    await sleep(11000);
    await s.baby.evaluate(() => { window.__vertraag = 0; });

    const tijdens = await s.ouder.evaluate(() => ({
      fail: window.__failSeen, retry: window.__retrySeen, statuses: window.__statuses.slice(),
    }));
    check('2: ouderunit geeft de trage herverbinding NIET op ' +
      '(faalstatus gezien: ' + tijdens.fail + ', retry-knop: ' + tijdens.retry +
      ', statussen: ' + tijdens.statuses.join(' → ') + ')', !tijdens.fail && !tijdens.retry);
    const wTerug = await wachtOpBeeld(s.ouder, 30000);
    check('2: beeld komt gewoon terug na de trage herverbinding (' + wTerug + 'px)', wTerug > 0);
    await s.cP.close(); await s.cB.close();
  }

  // ==================================================================
  // 3. Eén wake-moment = één koppelpoging, niet vijf
  // ==================================================================
  if (doe(3)) {
    // Lange wachttijd, zodat binnen het meetvenster alleen de wake-gebeurtenissen
    // een poging kunnen starten.
    //
    // De babyunit valt hier stil zónder het besturingskanaal netjes te sluiten.
    // Dat is bewust: eerst sloot deze test de browsercontext hard af, en dan
    // wordt de wegval normaal binnen milliseconden opgemerkt via het
    // 'close'-event (lokaal gemeten: 7–158 ms). Maar dat event komt niet
    // gegarandeerd aan — op de CI-machine bleef het uit, viel de detectie terug
    // op de hartslag van standaard 15 s, en dat was precies even lang als het
    // wachtvenster hieronder. De opzet-stap racete dus zijn eigen timeout en de
    // suite faalde wisselvallig. Door de babyunit stil te laten vallen loopt de
    // detectie áltijd via de hartslag (hier 6 s) en is de opzet deterministisch
    // — bovendien is dit de realistische variant: een telefoon die buiten bereik
    // raakt of leeg is stuurt ook geen afsluitbericht. Dit scenario meet het
    // samenvoegen van wake-gebeurtenissen; hóe snel een wegval wordt opgemerkt
    // hoort bij scenario 2 en wordt daar apart gecontroleerd.
    const OUDER = `
      window.BABYFOON_RECONNECT_DELAYS = [20000];
      window.BABYFOON_HEARTBEAT_TIMEOUT = 6000;
    `;
    const BABY = `
      (function () {
        var S = RTCDataChannel.prototype.send;
        RTCDataChannel.prototype.send = function () {
          if (window.__stil) return;
          return S.apply(this, arguments);
        };
      })();
    `;
    const s = await koppel('WAKE', BABY, OUDER);
    check('3: eerst gewoon live beeld (' + s.w + 'px)', s.w > 0);

    // Babyunit zwijgt vanaf nu → de ouderunit merkt dat via de hartslag en
    // plant één poging over 20 s.
    await s.baby.evaluate(() => { window.__stil = true; });
    let gepland = false;
    const tW = Date.now();
    while (Date.now() - tW < 20000) {
      gepland = await s.ouder.evaluate(() => window.__statuses.some((t) => /\(\d+\/\d+\)/.test(t)));
      if (gepland) break;
      await sleep(150);
    }
    check('3: wegval gedetecteerd, herverbinding gepland (' +
      (Date.now() - tW) + ' ms)', gepland);

    await s.ouder.evaluate(() => { window.__ws = 0; });
    // Scherm aan: één moment, vijf gebeurtenissen — zoals een telefoon ze levert.
    await s.ouder.evaluate(() => {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('pageshow'));
      window.dispatchEvent(new Event('focus'));
      setTimeout(() => document.dispatchEvent(new Event('visibilitychange')), 80);
      setTimeout(() => window.dispatchEvent(new Event('focus')), 160);
    });
    await sleep(4000);
    const pogingen = await s.ouder.evaluate(() => window.__ws);
    check('3: vijf wake-gebeurtenissen leveren hooguit één nieuwe koppelpoging op (' +
      pogingen + ' aanmeldingen bij de koppelserver)', pogingen <= 2);
    await s.cP.close(); await s.cB.close();
  }

  // ==================================================================
  // 4. Na een recall blijft er geen verlaten mediaverbinding achter
  //    (BEWAKER — op de oude code óók groen, zie de kop van dit bestand)
  // ==================================================================
  if (doe(4)) {
    const EXTRA = 'window.BABYFOON_MEDIA_WACHT = 2500;';
    const s = await koppel('RECALL', EXTRA, EXTRA);
    check('4: eerst gewoon live beeld (' + s.w + 'px)', s.w > 0);
    const pcsVoor = await s.ouder.evaluate(() => window.__pcs.length);

    // Het beeld komt 6 seconden lang niet aan — genoeg voor de mediabewaking om
    // een 'recall' te sturen. De verbindingen zelf raken we NIET aan: juist de
    // verlaten verbinding is wat we willen zien.
    await s.ouder.evaluate(() => {
      const houdTegen = setInterval(() => {
        const v = document.getElementById('video');
        if (v && v.srcObject) { v.srcObject = null; }
      }, 80);
      setTimeout(() => clearInterval(houdTegen), 6000);
    });
    await sleep(9000);
    const wTerug = await wachtOpBeeld(s.ouder, 25000);
    check('4: beeld komt terug na de recall (' + wTerug + 'px)', wTerug > 0);

    const pcs = await s.ouder.evaluate(() => window.__pcs.map((pc) => pc.connectionState));
    const open = pcs.filter((st) => st !== 'closed').length;
    check('4: er is echt een nieuwe mediaverbinding opgezet (' + pcsVoor + ' → ' + pcs.length + ')',
      pcs.length > pcsVoor);
    // Wat er hoort te draaien: het besturingskanaal + één mediaverbinding.
    check('4: geen verlaten mediaverbinding bij de ouderunit (' + open +
      ' open van ' + pcs.length + ': ' + pcs.join(', ') + ')', open <= 2);

    // Een achtergebleven verbinding meldt zich pas veel later ('failed' komt
    // na het verlopen van de ICE-toestemming, tientallen seconden). Daarom
    // blijven we hierna nog een tijd kijken: de verse verbinding moet rustig
    // blijven staan en er mag geen herverbinding uit het niets komen.
    await s.ouder.evaluate(() => { window.__statuses.length = 0; window.__failSeen = false; });
    await sleep(30000);
    const rust = await s.ouder.evaluate(() => ({
      statuses: window.__statuses.slice(), fail: window.__failSeen,
      off: document.getElementById('connDot').classList.contains('off'),
    }));
    const stoornissen = rust.statuses.filter((t) => /\(\d+\/\d+\)/.test(t)).length;
    check('4: 30 s ná de recall geen herverbinding uit het niets (' + stoornissen +
      'x, statussen: ' + (rust.statuses.join(' → ') || 'geen') + ')',
      stoornissen === 0 && !rust.fail && !rust.off);
    check('4: er komen 30 s later nog steeds verse frames binnen', await frames(s.ouder));
    await s.cP.close(); await s.cB.close();
  }

  await browser.close();
  await stopBroker(broker);
  web.close();
  console.log(errs.length ? '\nPAGINAFOUTEN:\n' + errs.join('\n') : '\nGEEN PAGINAFOUTEN');
  console.log('\nRESULTAAT: ' + (fail || errs.length ? 'MISLUKT' : 'GESLAAGD'));
  process.exit(fail || errs.length ? 1 : 0);
})().catch((e) => { console.error('Testfout:', e); process.exit(1); });
