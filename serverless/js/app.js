'use strict';

/**
 * Serverloze babyfoon — BabyPhone.online.
 *
 * Twee apparaten koppelen zichzelf via een QR-code of koppelcode (handmatige
 * WebRTC-signalering). Daarna loopt beeld en geluid rechtstreeks peer-to-peer,
 * zonder enige server. De QR-code wordt volledig in de browser gemaakt.
 */
(function () {
  // Verbindings-servers. STUN ontdekt het publieke adres; TURN is de
  // terugval-relay wanneer een direct pad onmogelijk is (carrier-grade NAT
  // op 4G/5G, symmetrische routers). De relay ziet alleen versleuteld
  // verkeer (DTLS-SRTP) en kan niet meekijken. Het gratis Open Relay
  // Project is de best-effort standaard; vervang voor productie door een
  // eigen TURN-dienst via window.BABYFOON_ICE of window.BABYFOON_PEER.
  // Eigen doorgeefserver instellen zonder de code aan te raken: leg een
  // bestand turn.json naast index.html met de vorm
  //   { "iceServers": [ { "urls": "turn:jouwserver:3478",
  //                       "username": "...", "credential": "..." } ] }
  // Zonder zo'n bestand blijven de standaardservers gelden. Dit wordt vroeg
  // geladen; de eerste koppelpoging wacht er kort op (zie wachtOpIce).
  let iceGeladen = false;
  let iceWacht = null;
  function laadEigenIce() {
    if (iceWacht) return iceWacht;
    iceWacht = new Promise((klaar) => {
      let af = false;
      const stop = () => { if (!af) { af = true; iceGeladen = true; klaar(); } };
      setTimeout(stop, 2500); // nooit langer wachten dan dit
      try {
        fetch('turn.json', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((j) => {
            if (j && Array.isArray(j.iceServers) && j.iceServers.length) {
              ICE.length = 0;
              j.iceServers.forEach((x) => ICE.push(x));
            }
            stop();
          })
          .catch(stop);
      } catch (e) { stop(); }
    });
    return iceWacht;
  }

  const ICE = window.BABYFOON_ICE ||
    [
        // Meerdere STUN-servers: met één server is dat een enkelvoudig
        // faalpunt. Wordt er geen enkele bereikt, dan kent een toestel zijn
        // eigen publieke adres niet en lukt koppelen alleen binnen hetzelfde
        // netwerk.
        { urls: [
          'stun:stun.l.google.com:19302',
          'stun:stun1.l.google.com:19302',
          'stun:stun.cloudflare.com:3478',
          'stun:stun.nextcloud.com:443',
        ] },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turns:openrelay.metered.ca:443?transport=tcp',
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ];
  const $ = (id) => document.getElementById(id);
  const T = (k) => (window.I18n ? window.I18n.t(k) : k);
  // Slaapmuziek-ID → i18n-sleutel (labels worden vertaald weergegeven).
  const TRACK_I18N = { regen: 'trackRain', oceaan: 'trackOcean', hartslag: 'trackHeartbeat', witte: 'trackWhite' };
  const trackLabel = (tr) => T(TRACK_I18N[tr.id] || tr.id);

  // ------------------------------------------------------------------ meten
  // Tijdmeting van het koppelen. Staat uit tenzij window.BABYFOON_TRACE aan
  // staat; dan verzamelt window.BABYFOON_MARKS per stap een tijdstempel in
  // milliseconden. Zo is "hoe lang duurt het tot er beeld is" een meting en
  // geen vermoeden — zie test/e2e-timing.js.
  const TRACE = !!window.BABYFOON_TRACE;
  if (TRACE) window.BABYFOON_MARKS = [];
  function mark(name) {
    if (!TRACE) return;
    try { window.BABYFOON_MARKS.push({ name: name, t: Math.round(performance.now()) }); } catch (e) {}
  }

  // ------------------------------------------------------------------ helpers
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
  }
  function showScreen(id) {
    ['screenSetup', 'screenPairBaby', 'screenPairParent', 'screenParent', 'screenBaby'].forEach(
      (s) => $(s).classList.toggle('hidden', s !== id)
    );
    // Landing = donker/full-bleed; app-schermen = het lichte thema.
    document.body.classList.toggle('app-mode', id !== 'screenSetup');
  }
  async function getMedia(c) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(T('mediaError'));
    }
    return navigator.mediaDevices.getUserMedia(c);
  }
  // QR-weergave/zoom/scanner leven in js/qr.js (QRKit); dunne wrappers
  // houden de bestaande aanroepplekken en appstatus (toast/i18n/getMedia) hier.
  function renderQR(containerId, text, cell) {
    QRKit.render(containerId, text, cell, T('copyCode'));
  }
  function openQrZoom(text) { QRKit.openZoom(text, T('copyCode')); }
  function closeQrZoom() { QRKit.closeZoom(); }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast(T('copied'));
    } catch (e) {
      toast(T('copyFail'));
    }
  }
  function startScanner(videoEl, onResult) {
    return QRKit.startScanner(
      videoEl, $('scratch'),
      () => getMedia({ video: { facingMode: 'environment' }, audio: false }),
      onResult,
      () => toast(T('scanFail'))
    );
  }
  function stopScanner() { QRKit.stopScanner(); }
  // ---------------------------------------------------------------- verbinding (PeerJS)
  // Korte koppelcode via een licht online "koppel-hulpje" (PeerJS-broker).
  // De broker koppelt alleen de twee apparaten; beeld en geluid gaan
  // rechtstreeks tussen de telefoons (peer-to-peer, privé — de broker ziet
  // die niet). Optioneel zelf te hosten via window.BABYFOON_PEER.
  const PEER_PREFIX = 'babyfoon-9m3-'; // naamruimte op de gedeelde broker
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // zonder 0/O/1/I
  function makeCode(n) {
    let s = '';
    const a = (window.crypto && crypto.getRandomValues) ? crypto.getRandomValues(new Uint32Array(n)) : null;
    for (let i = 0; i < n; i++) {
      const r = a ? a[i] : Math.floor(Math.random() * 4294967296);
      s += CODE_ALPHABET[r % CODE_ALPHABET.length];
    }
    return s;
  }
  // Capability-token: 128 bit willekeur die in de QR-code en de deellink zit.
  // De korte kamercode dient alleen om elkaar te vínden op de broker; dit token
  // is het eigenlijke toegangsbewijs. Wie alleen de code intypt (zonder QR)
  // komt er niet zomaar in: de babyunit vraagt dan eerst om toestemming.
  function makeToken() {
    const a = new Uint8Array(16);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
    else for (let i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Vergelijking in constante tijd: geen timinglek over het token.
  function sameToken(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return d === 0;
  }

  function peerOptions() {
    const opts = { config: { iceServers: ICE }, debug: 0 };
    if (window.BABYFOON_PEER) Object.assign(opts, window.BABYFOON_PEER);
    return opts;
  }

  // ------------------------------------------------------------------ geluid
  // Een babyfoon is géén telefoongesprek. De spraakbewerking die browsers
  // standaard op een microfoon zetten is afgestemd op praten en werkt hier
  // juist tegen ons:
  //   • autoGainControl draait in een stille kamer de versterking helemaal
  //     open, blaast de ruisvloer op en klapt bij het eerste geluidje weer
  //     dicht — dat hoor je als pompen en kraken.
  //   • noiseSuppression is een spraakfilter: het poetst precies de zachte,
  //     niet-spraakachtige geluiden weg die je bij een baby wél wilt horen
  //     (ademhalen, draaien, zuchten) en laat op de opgeblazen ruisvloer
  //     "musical noise" achter — het typische gekraak.
  //   • echoCancellation zet de volledige spraakketen aan, inclusief de
  //     niet-lineaire onderdrukking die het slaapliedje uit de eigen speaker
  //     wegduikt en de microfoon daarbij dichtknijpt.
  // De babyunit neemt daarom onbewerkt op. Zodra de ouder terugpraat is er
  // wél een echopad (ouder → babyspeaker → babymicrofoon → ouder); alleen
  // dán zetten we de echo-onderdrukking tijdelijk aan.
  // channelCount/sampleRate zijn "ideal": zonder spraakbewerking geeft Chrome
  // de ruwe apparaatstand terug (soms 2 kanalen op 44,1 kHz). Dat is geen
  // probleem — het opus-fmtp hieronder dwingt het transport toch naar mono.
  const MIC_MONITOR = {
    echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    channelCount: 1, sampleRate: 48000,
  };
  // ---- versterking van de babymicrofoon ----------------------------------
  // De ingebouwde automatische versterking (autoGainControl) staat bewust uit:
  // die regelt zo snel dat je hem hoort pompen, en samen met ruisonderdrukking
  // gaf dat het gekraak waar eerder over geklaagd is. Maar zónder versterking
  // is een stille kinderkamer ook werkelijk stil — zeker op een tablet die de
  // spraakmicrofoon gebruikt in plaats van de luidsprekermicrofoon.
  //
  // Daarom een eigen trap: vaste versterking die LANGZAAM meebeweegt met het
  // gemiddelde niveau, gevolgd door een begrenzer. Langzaam regelen is precies
  // het verschil: het maakt zacht geluid hoorbaar zonder dat je het hoort
  // ademen, en de begrenzer vangt een huilbui op zonder vervorming.
  const MIC_GAIN_MIN = 1;
  const MIC_GAIN_MAX = 14;
  const MIC_GAIN_START = 5;
  let micChain = null;   // { src, gain, comp, dest, uit, ruw }
  let micGainTimer = null;

  function bouwMicKeten(ruwSpoor) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC || !ruwSpoor) return null;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) {} }
      if (!audioCtx.createMediaStreamDestination || !audioCtx.createDynamicsCompressor) return null;
      const src = audioCtx.createMediaStreamSource(new MediaStream([ruwSpoor]));
      const gain = audioCtx.createGain();
      gain.gain.value = MIC_GAIN_START;
      const comp = audioCtx.createDynamicsCompressor();
      // Begrenzer: pas laat ingrijpen, dan stevig. Zo blijft zacht geluid
      // ongemoeid en wordt alleen een piek afgevlakt.
      comp.threshold.value = -12;
      comp.knee.value = 6;
      comp.ratio.value = 12;
      comp.attack.value = 0.005;
      comp.release.value = 0.25;
      const dest = audioCtx.createMediaStreamDestination();
      src.connect(gain); gain.connect(comp); comp.connect(dest);
      const uit = dest.stream.getAudioTracks()[0];
      if (!uit) return null;
      return { src: src, gain: gain, comp: comp, dest: dest, uit: uit, ruw: ruwSpoor };
    } catch (e) { return null; }
  }

  function sloopMicKeten() {
    if (micGainTimer) { clearInterval(micGainTimer); micGainTimer = null; }
    if (!micChain) return;
    try { micChain.src.disconnect(); } catch (e) {}
    try { micChain.gain.disconnect(); } catch (e) {}
    try { micChain.comp.disconnect(); } catch (e) {}
    micChain = null;
  }

  // Vervangt het audiospoor van een opgenomen stream door de versterkte versie.
  // Lukt dat niet (oude WebKit kan hier stilte geven), dan blijft het ruwe
  // spoor gewoon staan — liever onversterkt dan niets.
  function versterkMic(stream) {
    if (!stream || !stream.getAudioTracks) return stream;
    const ruw = stream.getAudioTracks()[0];
    if (!ruw) return stream;
    sloopMicKeten();
    const keten = bouwMicKeten(ruw);
    if (!keten) return stream;
    micChain = keten;
    try {
      stream.removeTrack(ruw);   // ruw spoor NIET stoppen: het voedt de keten
      stream.addTrack(keten.uit);
    } catch (e) { return stream; }
    startMicGainRegeling();
    return stream;
  }

  // Langzame niveauregeling. Meet elke halve seconde het gemiddelde niveau en
  // schuift de versterking hooguit een klein stapje op. Een huilbui zakt dus
  // niet meteen weg en stilte wordt niet meteen opgeblazen.
  function startMicGainRegeling() {
    if (micGainTimer) clearInterval(micGainTimer);
    let meter = null;
    try {
      meter = audioCtx.createAnalyser();
      meter.fftSize = 1024;
      meter.smoothingTimeConstant = 0.85;
      micChain.src.connect(meter);
    } catch (e) { meter = null; }
    if (!meter) return;
    const buf = new Uint8Array(meter.fftSize);
    micGainTimer = setInterval(() => {
      if (!micChain || role !== 'baby' || shuttingDown) return;
      try {
        meter.getByteTimeDomainData(buf);
        let som = 0;
        for (let i = 0; i < buf.length; i++) { const d = (buf[i] - 128) / 128; som += d * d; }
        const rms = Math.sqrt(som / buf.length);            // 0..1, vóór versterking
        const doelRms = 0.06;                                // rustig maar duidelijk hoorbaar
        const huidig = micChain.gain.gain.value;
        let gewenst = huidig;
        if (rms > 0.0008) gewenst = doelRms / rms;           // stilte niet eindeloos opdraaien
        gewenst = Math.max(MIC_GAIN_MIN, Math.min(MIC_GAIN_MAX, gewenst));
        // Hooguit 8% per halve seconde: dat is te traag om te horen pompen.
        const stap = huidig * 0.08;
        const nieuw = gewenst > huidig ? Math.min(gewenst, huidig + stap) : Math.max(gewenst, huidig - stap);
        if (micChain.gain.gain.setTargetAtTime) micChain.gain.gain.setTargetAtTime(nieuw, audioCtx.currentTime, 0.25);
        else micChain.gain.gain.value = nieuw;
      } catch (e) {}
    }, 500);
  }

  // ---- opnameprofiel voor de babycamera --------------------------------
  // Een oude tablet (bv. een iPad mini uit 2013 op iOS 12) kan 1280x720 niet
  // in realtime coderen. De frames stapelen dan op en het beeld komt met een
  // groeiende vertraging aan: het lijkt slowmotion. Zulke toestellen krijgen
  // daarom meteen een lichter profiel. Herkenning gebeurt op browserleeftijd
  // en het aantal processorkernen — geen van beide is waterdicht, maar samen
  // vangen ze precies de toestellen die het niet trekken. Gaat het toch mis,
  // dan schakelt watchEncoder() hieronder alsnog terug.
  const ZWAAR = { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } };
  const LICHT = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 20 } };
  function oudToestel() {
    try {
      // replaceChildren kwam in Safari 14; ontbreekt die, dan is dit een
      // browser (en dus vrijwel zeker een toestel) van vóór 2020.
      if (typeof Element !== 'undefined' && !Element.prototype.replaceChildren) return true;
      if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return true;
    } catch (e) {}
    return false;
  }
  let camProfiel = oudToestel() ? LICHT : ZWAAR;

  const MIC_DUPLEX = {
    echoCancellation: true, noiseSuppression: false, autoGainControl: false,
    channelCount: 1,
  };
  // De ouder práát wél: daar is de spraakbewerking juist op zijn plaats.
  const MIC_TALKBACK = {
    echoCancellation: true, noiseSuppression: true, autoGainControl: true,
    channelCount: 1,
  };

  // Opus staat standaard op "telefoongesprek": krappe bitrate, en de browser
  // mag stilte weglaten. Voor een babyfoon willen we een ruime, vaste
  // mono-bitrate mét in-band foutcorrectie en zonder DTX, zodat zacht geluid
  // heel blijft en een verloren pakketje niet als een tik hoorbaar wordt.
  const OPUS_FMTP = 'minptime=10;useinbandfec=1;usedtx=0;stereo=0;sprop-stereo=0;' +
    'maxaveragebitrate=64000;maxplaybackrate=48000';
  function tuneOpus(sdp) {
    try {
      const m = /a=rtpmap:(\d+)\s+opus\/48000/i.exec(sdp);
      if (!m) return sdp;
      const pt = m[1];
      const fmtp = new RegExp('^a=fmtp:' + pt + ' .*$', 'm');
      if (fmtp.test(sdp)) return sdp.replace(fmtp, 'a=fmtp:' + pt + ' ' + OPUS_FMTP);
      return sdp.replace(new RegExp('^(a=rtpmap:' + pt + ' opus/48000[^\\r\\n]*)$', 'm'),
        '$1\r\na=fmtp:' + pt + ' ' + OPUS_FMTP);
    } catch (e) { return sdp; }
  }
  const CALL_OPTS = { sdpTransform: tuneOpus };

  // Geluid krijgt expliciet voorrang en een ruime bovengrens, zodat de
  // videostroom het niet kan verdringen.
  function tuneAudioSender(pc) {
    if (!pc || !pc.getSenders) return;
    try {
      pc.getSenders().forEach((s) => {
        if (!s.track || s.track.kind !== 'audio' || !s.getParameters) return;
        const p = s.getParameters();
        if (!p.encodings || !p.encodings.length) p.encodings = [{}];
        p.encodings[0].maxBitrate = 64000;
        p.encodings[0].networkPriority = 'high';
        p.encodings[0].priority = 'high';
        const r = s.setParameters(p);
        if (r && r.catch) r.catch(() => {});
      });
    } catch (e) {}
  }
  // Een ontvangstbuffer die voortdurend meerekt is zélf een bron van gekraak:
  // om de vertraging bij te sturen rekt de ontvanger de audio uit of kort hem
  // in (insertedSamplesForDeceleration / removedSamplesForAcceleration). Een
  // vaste, ruime buffer klinkt rustiger; bij een babyfoon weegt 150 ms extra
  // vertraging niet op tegen schoon geluid. 0 = de browser zelf laten kiezen.
  const JITTER_TARGET_MS = window.BABYFOON_JITTER_MS != null ? window.BABYFOON_JITTER_MS : 150;
  function tuneAudioReceiver(pc) {
    if (!pc || !pc.getReceivers || !(JITTER_TARGET_MS > 0)) return;
    try {
      pc.getReceivers().forEach((r) => {
        if (r.track && r.track.kind === 'audio' && 'jitterBufferTarget' in r) {
          r.jitterBufferTarget = JITTER_TARGET_MS;
        }
      });
    } catch (e) {}
  }

  // ------------------------------------------------------------------ state
  let role = null;
  let peer = null;
  let controlConn = null;   // PeerJS DataConnection (besturingskanaal)
  let mediaPc = null;       // onderliggende RTCPeerConnection (voor statistieken)
  let localStream = null;
  let remoteStream = null;
  let currentCode = null;
  // --- toegangscontrole ---
  let sessionToken = '';    // babyunit: het geheim uit de QR-code
  let approvedPeer = '';    // babyunit: PeerJS-id van de huidige ouderunit
  let approvedConn = null;  // babyunit: de levende verbinding met die ouderunit
  // Babyunit: het TOESTEL dat toestemming heeft. Los van approvedPeer, want
  // PeerJS geeft bij elke herverbinding een nieuw peer-id uit — daarop
  // vergelijken betekent dat hetzelfde toestel na een wegval als "tweede
  // apparaat" wordt gezien en opnieuw om toestemming moet vragen.
  let approvedDevice = '';
  let pendingApproval = null; // babyunit: verzoek dat op toestemming wacht
  let deniedCount = 0;      // babyunit: teller tegen eindeloos vragen
  let parentToken = '';     // ouderunit: token uit QR/deellink (leeg = handmatig)
  // Ouderunit: vaste identiteit van dit toestel voor de duur van de pagina.
  // Blijft staan als de PeerJS-verbinding opnieuw wordt opgebouwd, zodat de
  // babyunit een herverbinding herkent als hetzelfde, al toegelaten toestel.
  const deviceId = makeToken();
  const lullaby = new LullabyPlayer();

  function sendControl(obj) {
    if (controlConn && controlConn.open) {
      try { controlConn.send(obj); } catch (e) {}
    }
  }
  const link = {
    sendControl,
    async getStats() {
      if (!mediaPc) return null;
      const r = { rtt: null };
      try {
        const stats = await mediaPc.getStats();
        stats.forEach((s) => {
          if (s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated &&
            typeof s.currentRoundTripTime === 'number') {
            r.rtt = s.currentRoundTripTime * 1000;
          }
        });
      } catch (e) {}
      return r;
    },
  };

  // Koppel het besturingskanaal (DataConnection) aan de afhandeling.
  function attachControl(conn) {
    controlConn = conn;
    conn.on('data', (d) => { lastControlAt = Date.now(); if (d && typeof d === 'object') handleControl(d); });
    // Alleen het sluiten van het HUIDIGE kanaal is een wegval. Een oude,
    // vervangen verbinding meldt zijn 'close' pas even later: bij de ouderunit
    // gebeurt dat vlak nadat een nieuwe poging is gestart (peer.destroy()), en
    // bij de babyunit zodra allow() het vorige kanaal opruimt. Zonder deze
    // controle plande de ouderunit dan een tweede herverbinding bovenop de
    // lopende poging en zette de babyunit zichzelf op "verbinding verbroken"
    // terwijl er net weer iemand meekeek.
    conn.on('close', () => { if (controlConn === conn) onPeerDrop(); });
  }
  function playTalkback(stream) {
    let a = $('talkbackAudio');
    if (!a) {
      a = document.createElement('audio');
      a.id = 'talkbackAudio';
      a.autoplay = true; a.playsInline = true;
      document.body.appendChild(a);
    }
    a.srcObject = stream;
    a.play().catch(() => {});
  }
  function babyConnected() {
    showScreen('screenBaby');
    watchEncoder();   // houdt dit toestel het coderen bij?
    watchMicKeten();  // komt er echt geluid door de versterkingstrap?
    $('bConnDot').classList.remove('off');
    $('bConn').textContent = T('connected');
    const bl = $('bLatency'); if (bl) bl.textContent = T('live');
    startBabyDevice();
  }
  function parentConnected() {
    const pcn = $('parentConnecting');
    if (pcn) pcn.classList.add('hidden');
    showScreen('screenParent');
    $('connDot').classList.remove('off');
    $('connText').textContent = T('connected');
    $('placeholder').classList.add('hidden');
    $('liveText').textContent = nightMode ? T('nightModeBadge') : T('live');
    startParentDevice();
    startHeartbeat();
    sendControl({ cmd: 'ping' });
    sendControl({ cmd: 'getCaps' }); // camera-lijst + LED-ondersteuning opvragen
  }
  function onPeerDrop() {
    if (shuttingDown) return;
    if (role === 'parent') {
      $('connDot').classList.add('off');
      $('connText').textContent = T('connectionLost');
      // Microfoon dicht zolang er geen verbinding is. Stond terugpraten aan,
      // dan gaat hij na de herverbinding vanzelf weer open (zie 'authOk').
      const wasTalking = talking;
      stopTalkback(false);
      talking = wasTalking;
      triggerConnectionLostAlert();
      scheduleParentReconnect();
    } else if (role === 'baby') {
      // De babyunit blijft passief wachten: dezelfde code blijft geldig,
      // de ouderunit verbindt automatisch opnieuw.
      $('bConnDot').classList.add('off');
      $('bConn').textContent = T('connectionLost');
      const bl = $('bLatency'); if (bl) bl.textContent = '—';
    }
  }

  // ------------------------------------------------ herverbinden (met backoff)
  const RECONNECT_DELAYS = window.BABYFOON_RECONNECT_DELAYS || [2000, 4000, 8000, 15000, 30000];
  const CONNECT_TIMEOUT = window.BABYFOON_CONNECT_TIMEOUT || 20000;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let connectTimer = null;
  let wasConnected = false;
  let shuttingDown = false;

  function clearConnectTimers() {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    clearAuthWatchdog();
  }
  // Koppelen bestaat uit vijf stappen. Bleef de ouderunit hangen, dan zag je
  // alleen een draaiend rondje en was niet te achterhalen wáár het misging.
  // De stap wordt daarom achter de statustekst gezet — puur als cijfer, dus
  // in elke taal leesbaar zonder vertaling.
  //   1 aanmelden bij de koppelserver
  //   2 kanaal openen naar de babyunit
  //   3 legitimeren (hallo verstuurd)
  //   4 wachten op akkoord van de babyunit
  //   5 wachten op beeld en geluid
  const PAIR_STAPPEN = 5;
  let pairStap = 0;
  let pairStapTijd = 0;
  function setPairStap(n) {
    if (n <= pairStap) return;
    pairStap = n;
    pairStapTijd = Date.now();
  }
  function setParentStatus(txt) {
    // De kop houdt de kale status (en bij herverbinden de pogingenteller).
    const el = $('connText'); if (el) el.textContent = txt;
    // De tekst ónder het draaiende rondje krijgt de stap erbij. Daar kijkt de
    // gebruiker naar als het hangt, en daar botst het niet met de teller.
    const ph = $('phText');
    if (ph) {
      ph.textContent = (role === 'parent' && pairStap > 0 && pairStap < PAIR_STAPPEN)
        ? txt + ' · ' + pairStap + '/' + PAIR_STAPPEN : txt;
    }
  }
  function setPlaceholderSpinner(on) {
    const sp = document.querySelector('#placeholder .spinner');
    if (sp) sp.classList.toggle('hidden', !on);
    const rb = $('phRetry'); if (rb) rb.classList.toggle('hidden', on);
  }
  // Expliciete mislukt-status in plaats van eindeloos "Verbinden…".
  function connectFailed(msgKey) {
    clearConnectTimers();
    stopMediaWatchdog();
    // Netwerkdiagnose erbij: zonder 'relay' in de lijst is er geen
    // doorgeefserver beschikbaar, en dan lukt koppelen alleen als beide
    // toestellen elkaar rechtstreeks kunnen bereiken.
    const diag = ' [' + netwerkDiagnose() + ' · ' + pairStap + '/' + PAIR_STAPPEN + ']';
    const msg = T(msgKey || 'connectFailed') + diag;
    const pcn = $('parentConnecting'); if (pcn) pcn.classList.add('hidden');
    const err = $('parentError');
    if (err) { err.textContent = msg; err.classList.remove('hidden'); }
    if (parentStarted) {
      $('connDot').classList.add('off');
      setParentStatus(msg);
      $('placeholder').classList.remove('hidden');
      setPlaceholderSpinner(false);
      // Alleen hoorbaar alarmeren als er eerder echt een verbinding was en
      // alle pogingen nu uitgeput zijn — niet bij een gewoon mislukte
      // eerste koppelpoging (verkeerde code e.d.).
      if (wasConnected) triggerConnectionLostAlert();
    } else {
      toast(msg);
    }
  }
  function scheduleParentReconnect() {
    if (shuttingDown || reconnectTimer) return;
    if (reconnectAttempt >= RECONNECT_DELAYS.length) { connectFailed(); return; }
    const delay = RECONNECT_DELAYS[reconnectAttempt++];
    $('connDot').classList.add('off');
    setParentStatus(T('reconnecting') + ' (' + reconnectAttempt + '/' + RECONNECT_DELAYS.length + ')');
    if (parentStarted) { $('placeholder').classList.remove('hidden'); setPlaceholderSpinner(true); }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      startParentConnect(currentCode, true);
    }, delay);
  }
  // De babyunit moet ons nog toelaten. Blijft dat antwoord uit, dan is de
  // verbinding er feitelijk niet — ook al staat het datakanaal open. Zonder
  // deze bewaking bleef de ouderunit hangen op "Verbonden" zonder beeld.
  const AUTH_TIMEOUT = window.BABYFOON_AUTH_TIMEOUT || 30000;
  const AUTH_TIMEOUT_RETRY = window.BABYFOON_AUTH_TIMEOUT_RETRY || 10000;
  let authTimer = null;
  function clearAuthWatchdog() {
    if (authTimer) { clearTimeout(authTimer); authTimer = null; }
  }
  function startAuthWatchdog(isRetry) {
    clearAuthWatchdog();
    // Bij een eerste koppeling met handmatig ingetypte code loopt er iemand
    // naar de babyunit om op "Toestaan" te drukken; daar hoort ruimte voor.
    // Bij herverbinden hoort het antwoord meteen te komen.
    const wacht = (isRetry || wasConnected) ? AUTH_TIMEOUT_RETRY : AUTH_TIMEOUT;
    authTimer = setTimeout(() => {
      authTimer = null;
      if (shuttingDown) return;
      scheduleParentReconnect();
    }, wacht);
  }
  // ---- bewaking van de MEDIAverbinding (ouderunit) -----------------------
  // Het datakanaal en de beeld/geluid-verbinding zijn twee losse verbindingen
  // met elk hun eigen onderhandeling. Lukt de eerste wel en de tweede niet,
  // dan meldt de app zich "verbonden" terwijl er nooit beeld komt: de hartslag
  // kijkt namelijk alleen naar het datakanaal, ziet niets mis, en dus volgt er
  // geen nieuwe poging en geen foutmelding. Precies het gemelde geval
  // "verbinding gelegd maar geen beeld en geluid".
  const MEDIA_WACHT = window.BABYFOON_MEDIA_WACHT || 9000;
  const MEDIA_POGINGEN = 3;
  let mediaTimer = null;
  let mediaPogingen = 0;
  let mediaBevestigd = false;
  let vorigeMediaBytes = -1;

  function stopMediaWatchdog() {
    if (mediaTimer) { clearInterval(mediaTimer); mediaTimer = null; }
  }
  function mediaKomtBinnen() {
    // Beeld dat écht loopt: afmetingen én oplopende bytes.
    const v = $('video');
    return !!(v && v.videoWidth > 0);
  }
  function startMediaWatchdog() {
    if (role !== 'parent') return;
    stopMediaWatchdog();
    mediaBevestigd = false;
    vorigeMediaBytes = -1;
    const begin = Date.now();
    mediaTimer = setInterval(async () => {
      if (shuttingDown || role !== 'parent') { stopMediaWatchdog(); return; }
      // Zolang er geen goedkeuring is, is wachten normaal.
      if (!linkApproved) return;
      let bytes = 0;
      if (mediaPc && mediaPc.getStats) {
        try {
          const st = await mediaPc.getStats();
          st.forEach((r) => {
            if (r.type === 'inbound-rtp' && (r.kind === 'video' || r.kind === 'audio') && r.bytesReceived) bytes += r.bytesReceived;
          });
        } catch (e) {}
      }
      const loopt = mediaKomtBinnen() && bytes > vorigeMediaBytes;
      if (loopt) {
        mediaBevestigd = true;
        mediaPogingen = 0;
        setPlaceholderSpinner(false);
        const ph = $('placeholder'); if (ph) ph.classList.add('hidden');
        stopMediaWatchdog();
        return;
      }
      vorigeMediaBytes = bytes;
      if (Date.now() - begin < MEDIA_WACHT) return;
      // Te lang niets. Vraag de babyunit het beeld opnieuw te sturen; dat is
      // veel lichter dan de hele verbinding opnieuw opbouwen.
      if (mediaPogingen < MEDIA_POGINGEN) {
        mediaPogingen++;
        setParentStatus(T('connecting'));
        sendControl({ cmd: 'recall' });
        // klok opnieuw laten lopen voor de volgende poging
        stopMediaWatchdog();
        setTimeout(() => { if (!shuttingDown && !mediaBevestigd) startMediaWatchdog(); }, 500);
        return;
      }
      // Opgegeven: dít is een echte fout en hoort niet als eindeloos rondje
      // te blijven staan.
      stopMediaWatchdog();
      connectFailed('connectFailed');
    }, 3000);
  }

  function connectSucceeded() {
    clearAuthWatchdog();
    clearConnectTimers();
    reconnectAttempt = 0;
    wasConnected = true;
    lastControlAt = Date.now();
    const err = $('parentError'); if (err) err.classList.add('hidden');
    // De status stond op "Wacht op toestemming bij de babyunit…" (of op
    // "Opnieuw verbinden…"). Nu de babyunit ons heeft toegelaten hoort daar
    // weer "Verbonden" te staan; zonder dit bleef de ouderunit de hele
    // sessie melden dat hij nog op toestemming wachtte.
    if (role === 'parent') {
      const dot = $('connDot'); if (dot) dot.classList.remove('off');
      setParentStatus(T('connected'));
    }
    setPlaceholderSpinner(true);
  }
  // Het 'close'-event van het datakanaal blijft bij een onnette verbreking
  // (wifi weg, batterij leeg, browser gedood) soms uit. Daarom bewaken we
  // ook de onderliggende RTCPeerConnection-status…
  const ICE_GRACE = window.BABYFOON_ICE_GRACE || 8000;
  // Onthoudt welke soorten netwerkpaden gevonden zijn. Bij een mislukte
  // koppeling is dat het verschil tussen "de app is stuk" en "dit netwerk
  // laat geen directe verbinding toe":
  //   host  = zelfde netwerk
  //   srflx = eigen publieke adres bekend (via STUN)
  //   relay = via een doorgeefserver (TURN) — nodig bij streng afgeschermde
  //           netwerken en bij veel mobiele providers
  const kandidaatSoorten = {};
  function volgKandidaten(pc) {
    if (!pc || pc.__bfKand) return;
    pc.__bfKand = true;
    try {
      pc.addEventListener('icecandidate', (e) => {
        if (!e.candidate || !e.candidate.candidate) return;
        const m = /typ (\w+)/.exec(e.candidate.candidate);
        if (m) kandidaatSoorten[m[1]] = (kandidaatSoorten[m[1]] || 0) + 1;
      });
    } catch (e) {}
  }
  function netwerkDiagnose() {
    const s = Object.keys(kandidaatSoorten);
    if (!s.length) return 'host:0';
    return s.map((k) => k + ':' + kandidaatSoorten[k]).join(' ');
  }

  function watchMediaPc(pc) {
    volgKandidaten(pc);
    if (!pc || pc.__bfWatched) return;
    pc.__bfWatched = true;
    pc.addEventListener('connectionstatechange', () => {
      if (shuttingDown) return;
      if (pc.connectionState === 'failed') { onPeerDrop(); return; }
      if (pc.connectionState === 'disconnected') {
        // ICE krijgt even om zelf te herstellen; daarna als verbroken behandelen.
        // Een korte wifi-hapering duurt vaak enkele seconden en herstelt vanzelf.
        // Te snel afbreken betekende: verbinding opnieuw opbouwen terwijl de
        // oude er zo weer was — wat als "onstabiel beeld" voelt. Deze marge
        // vangt de gewone haperingen op; een échte wegval wordt alsnog binnen
        // HEARTBEAT_TIMEOUT opgemerkt.
        setTimeout(() => {
          if (!shuttingDown && pc.connectionState === 'disconnected') onPeerDrop();
        }, ICE_GRACE);
      }
    });
  }
  // …én stuurt de ouder een hartslag over het besturingskanaal. Blijft het
  // antwoord (batterijstatus) te lang uit, dan geldt dat als verbroken.
  const HEARTBEAT_TIMEOUT = window.BABYFOON_HEARTBEAT_TIMEOUT || 15000;
  let lastControlAt = 0;
  let heartbeatId = null;
  function startHeartbeat() {
    if (heartbeatId) return;
    lastControlAt = Date.now();
    heartbeatId = setInterval(() => {
      if (shuttingDown || role !== 'parent' || !wasConnected || reconnectTimer) return;
      if (controlConn && controlConn.open) {
        try { controlConn.send({ cmd: 'ping' }); } catch (e) {}
      }
      if (Date.now() - lastControlAt > HEARTBEAT_TIMEOUT) {
        lastControlAt = Date.now(); // niet nogmaals vuren tijdens dezelfde herverbindingspoging
        onPeerDrop();
      }
    }, 4000);
  }

  // Sessie beëindigen op BEIDE toestellen en terug naar de hoofdpagina.
  // Belangrijk: de hash (#code.token) moet weg, anders koppelt de pagina bij
  // het herladen meteen weer opnieuw.
  function endSession(meldAanPeer) {
    if (shuttingDown) return;
    shuttingDown = true;
    if (meldAanPeer) {
      try { sendControl({ cmd: 'bye' }); } catch (e) {}
    }
    try { if (typeof babyStopMusic === 'function') babyStopMusic(); } catch (e) {}
    try { lullaby.stop(); } catch (e) {}
    try { if (localStream) localStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    try { if (micStream) micStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
    // even wachten zodat het afscheidsbericht het andere toestel nog haalt
    setTimeout(() => {
      try { if (peer) peer.destroy(); } catch (e) {}
      location.replace(location.pathname + location.search);
    }, meldAanPeer ? 220 : 0);
  }

  // ------------------------------------------------------------------ besturingscommando's
  function handleControl(msg) {
    // Toegang geweigerd door de babyunit: meteen stoppen met proberen.
    if (msg && msg.cmd === 'authDenied' && role === 'parent') {
      // Alleen een échte weigering is definitief. 'busy' (er stond nog een
      // andere vraag open) en 'timeout' zijn tijdelijk — daarop de verbinding
      // voorgoed opgeven betekende dat een herverbinding nooit meer lukte.
      const reden = String((msg && msg.reason) || '');
      if (reden === 'busy' || reden === 'timeout') {
        clearAuthWatchdog();
        scheduleParentReconnect();
        return;
      }
      shuttingDown = true;
      clearConnectTimers();
      clearAuthWatchdog();
      const pcn = $('parentConnecting'); if (pcn) pcn.classList.add('hidden');
      const err = $('parentError');
      if (err) { err.textContent = T('authRefused'); err.classList.remove('hidden'); }
      toast(T('authRefused'));
      try { if (peer) peer.destroy(); } catch (e) {}
      return;
    }
    // Andere toestel heeft gestopt → hier ook afsluiten.
    if (msg && msg.cmd === 'bye') { endSession(false); return; }
    if (msg && msg.cmd === 'authOk') {
      if (role === 'parent') {
        mark('authOk');
        setPairStap(5);
        if (msg.token) parentToken = String(msg.token);
        // Pas nu staat de verbinding er echt: de babyunit heeft ons toegelaten.
        clearAuthWatchdog();
        connectSucceeded();
        linkApproved = true;
        mediaPogingen = 0;
        startMediaWatchdog();
        // Alleen als er vóór de herverbinding werd teruggepraat gaat de
        // microfoon weer open; anders blijft hij dicht (zie ensureMic).
        if (talking) ensureMic().then((s) => { if (s) startTalkback(); });
      }
      return;
    }
    if (role === 'baby') {
      switch (msg.cmd) {
        case 'lullaby': {
          if (msg.on) { babyStopMusic(); lullaby.play(msg.id); }
          else lullaby.stop();
          const tl = $('tileLullaby'); if (tl) { tl.textContent = lullaby.isPlaying() ? T('on2') : T('off2'); tl.classList.toggle('ok', lullaby.isPlaying()); }
          sendControl({ cmd: 'lullabyState', id: lullaby.isPlaying() ? lullaby.currentName() : null });
          break;
        }
        case 'music':
          if (msg.repeat != null) musicRepeat = !!msg.repeat;
          if (msg.action === 'stop') babyStopMusic();
          else if (msg.action === 'repeat') { /* alleen de stand bijwerken */ }
          else if (msg.action === 'next') babyPlayMusic(musicIndex + 1);
          else if (msg.action === 'prev') babyPlayMusic(musicIndex - 1);
          else babyPlayMusic(msg.index || 0);
          break;
        case 'nightlight': {
          const on = !!msg.on;
          $('nightlight').classList.toggle('hidden', !on);
          if (on) $('nightlight').style.opacity = Math.max(0.12, (msg.level == null ? 60 : msg.level) / 100).toFixed(2);
          const tn = $('tileNight'); if (tn) { tn.textContent = on ? T('on2') : T('off2'); tn.classList.toggle('ok', on); }
          break;
        }
        case 'sleepTimer': {
          const ts = $('tileSleep');
          if (ts) { ts.textContent = msg.min ? msg.min + ' min' : T('off2'); ts.classList.toggle('ok', !!msg.min); }
          break;
        }
        case 'talk':
          setBabyDuplex(!!msg.on);
          break;
        case 'recall':
          // De ouderunit ziet geen beeld. Nieuwe media-oproep opzetten; de
          // oude verbinding kan stilletjes gesneuveld zijn.
          hercallOuder();
          break;
        case 'flip':
          babyCycleCamera();
          break;
        case 'selectCamera':
          selectCamera(msg.deviceId);
          break;
        case 'torch':
          setTorch(!!msg.on);
          break;
        case 'getCaps':
          reportCameras();
          reportTorch();
          break;
        case 'ping':
          // ALTIJD eerst een kaal antwoord terugsturen. De ouderunit meet
          // hiermee of de verbinding nog leeft (zie startHeartbeat). Eerder
          // was reportBattery() het enige antwoord — en dat stuurt niets
          // zodra de Battery Status API ontbreekt (Safari op iPhone/iPad en
          // macOS, Firefox, oudere Android-webviews) of een uitzondering
          // geeft. Op die toestellen bleef de ouderunit stil, zag hij na
          // HEARTBEAT_TIMEOUT een "wegval" en herverbond hij elke 15
          // seconden terwijl er niets aan de hand was.
          sendControl({ cmd: 'pong' });
          reportBattery(true);
          break;
      }
    } else {
      if (msg.cmd === 'battery') {
        const bv = $('battVal'); if (bv) bv.textContent = msg.level + '%';
        const bs = $('battSub'); if (bs) bs.textContent = msg.charging ? T('charging') : T('onBattery');
      } else if (msg.cmd === 'lullabyState') {
        playing = !!msg.id;
        if (msg.id) {
          const i = tracks.findIndex((t) => t.id === msg.id);
          if (i >= 0) trackIndex = i;
        }
        const bl = $('btnLullaby'); if (bl) bl.classList.toggle('on', playing);
        renderChips();
      } else if (msg.cmd === 'videoState') {
        remoteVideoOff = !msg.on;
        applyPrivacyUI();
      } else if (msg.cmd === 'cameraList') {
        babyCameras = Array.isArray(msg.cameras) ? msg.cameras : [];
        camActiveId = msg.activeId || '';
        renderCameraSelect();
      } else if (msg.cmd === 'torchState') {
        torchSupported = !!msg.supported;
        torchLastOn = !!msg.on;
        renderTorchUI();
      } else if (msg.cmd === 'musicState') {
        musicPlaying = !!msg.playing;
        if (typeof msg.index === 'number') musicIndex = msg.index;
        // als de ouder (nog) geen eigen playlist kon laden, gebruik die van de baby
        if ((!musicList || !musicList.length) && Array.isArray(msg.list) && msg.list.length) {
          musicList = msg.list.map((t) => ({ file: null, title: t }));
          renderPlaylist();
        }
        updateMusicUI();
      }
    }
  }

  // ------------------------------------------------------------------ koppelen: baby
  let babyBrokerAttempt = 0;
  // Toont of de babyunit op dit moment te koppelen is. Is hij dat niet, dan
  // wordt de QR-code doorzichtig en verschijnt de bekende "verbinding kwijt"-
  // melding: dan hoef je niet te scannen, want er kan niets aankomen.
  function toonBabyKoppelbaar(ok) {
    const qr = $('babyQR');
    if (qr) {
      qr.style.opacity = ok ? '' : '0.25';
      qr.style.filter = ok ? '' : 'grayscale(1)';
    }
    const w = $('babyWaiting');
    if (w) {
      const tekst = w.querySelector('span[data-i18n]');
      if (tekst) tekst.textContent = ok ? T('waitingConnection') : T('connectionLost');
      w.classList.toggle('warn', !ok);
    }
  }

  async function openBabyPeer() {
    if (!iceGeladen) { try { await laadEigenIce(); } catch (e) {} }
    if (peer) { try { peer.destroy(); } catch (e) {} }
    const code = makeCode(6);
    currentCode = code;
    $('babyCodeText').textContent = '······';
    if (!sessionToken) sessionToken = makeToken();
    peer = new Peer(PEER_PREFIX + code, peerOptions());
    peer.on('open', () => {
      babyBrokerAttempt = 0;
      toonBabyKoppelbaar(true);
      $('babyCodeText').textContent = code;
      $('babyOfferCode').value = code;
      // De QR draagt code + token; het invoerveld toont alleen de korte code.
      const url = location.href.split('#')[0] + '#' + code + '.' + sessionToken;
      renderQR('babyQR', url);
    });
    // Elke inkomende verbinding moet zich eerst legitimeren. Zonder deze poort
    // kreeg iedereen die de kamercode kende meteen live beeld, geluid én
    // bediening van de camera — ook een tweede, ongenode kijker, zonder dat de
    // echte ouder daar iets van merkte.
    peer.on('connection', (conn) => { mark('babyConnIn'); gateIncoming(conn); });
    peer.on('call', (call) => {
      // Terugpraten van de ouder (audio) → alleen van de toegelaten ouderunit.
      if (!approvedPeer || call.peer !== approvedPeer) { try { call.close(); } catch (e) {} return; }
      call.answer(undefined, CALL_OPTS);
      // Terugpraten is een TWEEDE RTCPeerConnection. Die niet bewaken: als
      // het talkback-kanaal sneuvelt of netjes sluit, is de videoverbinding
      // nog gewoon in orde. Zie ook de ouderkant.
      if (!mediaPc) { mediaPc = call.peerConnection || mediaPc; }
      call.on('stream', playTalkback);
      call.on('close', () => setBabyDuplex(false));
    });
    peer.on('disconnected', () => {
      // Broker kwijt: opnieuw aanmelden met oplopende wachttijd, zodat de
      // kamercode geldig blijft en de ouderunit kan herverbinden.
      if (shuttingDown) return;
      // Zolang de babyunit niet bij de koppelserver is aangemeld, is zijn
      // QR-code onbruikbaar: een ouderunit die hem scant blijft dan eindeloos
      // draaien zonder dat iemand weet waarom. Dat moet zichtbaar zijn.
      toonBabyKoppelbaar(false);
      const d = RECONNECT_DELAYS[Math.min(babyBrokerAttempt++, RECONNECT_DELAYS.length - 1)];
      setTimeout(() => { if (!shuttingDown) { try { peer.reconnect(); } catch (e) {} } }, d);
    });
    peer.on('error', (err) => onPeerError(err, 'baby'));
  }
  // --------------------------------------------------------- toegangscontrole
  // Laat een ouderunit pas toe als die het token uit de QR-code meestuurt.
  // Wie de code handmatig intypte heeft dat token niet; dan beslist de ouder
  // bij de babyunit zelf of het apparaat erbij mag.
  function gateIncoming(conn) {
    let settled = false;
    const finish = () => { settled = true; if (pendingApproval && pendingApproval.conn === conn) hideApproval(); };
    const deny = (reason) => {
      if (settled) return;
      finish();
      try { conn.send({ cmd: 'authDenied', reason: reason }); } catch (e) {}
      setTimeout(() => { try { conn.close(); } catch (e) {} }, 200);
    };
    const allow = (toestel) => {
      if (settled) return;
      mark('babyAllow');
      finish();
      // Herverbinding van hetzelfde toestel: de oude, dode verbinding opruimen
      // zodat er nooit twee kanalen naast elkaar blijven staan.
      if (approvedConn && approvedConn !== conn) { try { approvedConn.close(); } catch (e) {} }
      approvedPeer = conn.peer;
      approvedConn = conn;
      if (toestel) approvedDevice = toestel;
      deniedCount = 0;
      attachControl(conn);
      // Token meegeven: eenmaal toegestaan hoeft de ouder na een wegval niet
      // opnieuw op "Toestaan" te wachten.
      try { conn.send({ cmd: 'authOk', token: sessionToken }); } catch (e) {}
      try {
        const call = peer.call(conn.peer, localStream, CALL_OPTS);
        if (call) {
          mediaPc = call.peerConnection || mediaPc;
          watchMediaPc(mediaPc);
          setTimeout(() => tuneAudioSender(call.peerConnection), 1000);
        }
      } catch (e) {}
      babyConnected();
      reportBattery();
    };
    // Niets sturen binnen 20 s = geen geldige ouderunit.
    const timer = setTimeout(() => deny('timeout'), 20000);
    conn.on('close', () => {
      clearTimeout(timer);
      finish();
      // Was dit de toegelaten ouderunit? Dan is er vanaf nu geen kijker meer.
      // approvedDevice blijft wél staan: die toestemming geldt de hele sessie,
      // zodat hetzelfde toestel zo terug kan komen zonder opnieuw te vragen.
      if (approvedConn === conn) { approvedConn = null; approvedPeer = ''; }
    });
    conn.on('data', (d) => {
      if (settled || !d || typeof d !== 'object' || d.cmd !== 'hello') return;
      mark('babyHello');
      clearTimeout(timer);
      const toestel = d.device ? String(d.device) : '';
      const heeftToken = sessionToken && sameToken(String(d.token || ''), sessionToken);
      // Is er op dit moment werkelijk nog iemand aan het meekijken? Een
      // verbinding die niet meer open staat telt niet mee.
      const liveKijker = !!(approvedConn && approvedConn !== conn && approvedConn.open);
      // Hetzelfde toestel dat eerder is toegelaten en het juiste token heeft:
      // dit is een herverbinding, geen nieuwe kijker. Nooit opnieuw vragen —
      // de ouder staat op dat moment per definitie niet bij de babyunit.
      if (heeftToken && toestel && toestel === approvedDevice) return allow(toestel);
      // Token klopt én er kijkt nog niemand mee → meteen door (QR-koppeling).
      if (heeftToken && !liveKijker) return allow(toestel);
      // Anders: expliciet toestemming vragen op het apparaat van de baby.
      if (deniedCount >= 3) return deny('blocked');
      askApproval(conn, () => allow(toestel), deny, liveKijker);
    });
  }

  function hideApproval() {
    pendingApproval = null;
    const box = $('babyApproval');
    if (box) box.classList.add('hidden');
  }

  function askApproval(conn, allow, deny, alReedsKijker) {
    const box = $('babyApproval');
    if (!box) return deny('no-ui'); // zonder dialoog nooit stilzwijgend toelaten
    // Al een verzoek open? Nieuwe aanvrager afwijzen i.p.v. de dialoog kapen.
    if (pendingApproval) return deny('busy');
    pendingApproval = { conn: conn, allow: allow, deny: deny };
    // Hier koppelen (en niet bij het opstarten van de ouderunit): deze dialoog
    // hoort bij de babyunit, dus de knoppen moeten ook daar werken.
    const yes = $('btnApproveYes'), no = $('btnApproveNo');
    if (yes) yes.onclick = () => answerApproval(true);
    if (no) no.onclick = () => answerApproval(false);
    const txt = $('babyApprovalText');
    if (txt) txt.textContent = T(alReedsKijker ? 'approveExtra' : 'approveAsk');
    box.classList.remove('hidden');
    try { if (navigator.vibrate) navigator.vibrate([120, 80, 120]); } catch (e) {}
  }

  function answerApproval(ok) {
    const p = pendingApproval;
    if (!p) return;
    hideApproval();
    if (ok) p.allow();
    else { deniedCount++; p.deny('refused'); }
  }

  // Vangnet voor toestellen die hierboven niet als "oud" herkend worden maar
  // het alsnog niet bijhouden. WebRTC meldt zelf waarom het inlevert
  // (qualityLimitationReason 'cpu') en hoeveel frames er per seconde de deur
  // uitgaan. Blijft dat te laag, dan halveren we de opname eenmalig. Dat is
  // beter dan doorgaan met beeld dat steeds verder achterloopt: bij een
  // babyfoon telt actueel beeld zwaarder dan scherp beeld.
  let encoderVerlaagd = false;
  // Veiligheidsnet voor de versterkingstrap. Op oude WebKit is bekend dat een
  // MediaStreamDestination soms stilte doorgeeft. Een babyfoon die zwijgt is
  // gevaarlijker dan een babyfoon die zacht is, dus meten we of er werkelijk
  // audio de deur uitgaat. Zo niet, dan terug naar het ruwe spoor.
  let micKetenGecontroleerd = false;
  function watchMicKeten() {
    if (role !== 'baby' || micKetenGecontroleerd || !micChain) return;
    let vorigeBytes = -1;
    let stilleMetingen = 0;
    const timer = setInterval(async () => {
      if (shuttingDown || role !== 'baby' || micKetenGecontroleerd) { clearInterval(timer); return; }
      if (!mediaPc || !mediaPc.getStats || !micChain) return;
      try {
        const stats = await mediaPc.getStats();
        let bytes = null;
        stats.forEach((r) => {
          if (r.type === 'outbound-rtp' && r.kind === 'audio' && typeof r.bytesSent === 'number') bytes = r.bytesSent;
        });
        if (bytes === null) return;
        if (vorigeBytes >= 0) {
          // Stilte in Opus is niet 0 bytes maar wel héél weinig; onder 200
          // bytes per 3 seconden gaat er feitelijk niets doorheen.
          if (bytes - vorigeBytes < 200) stilleMetingen++; else stilleMetingen = 0;
        }
        vorigeBytes = bytes;
        if (stilleMetingen >= 3) {
          clearInterval(timer);
          micKetenGecontroleerd = true;
          await zetMicKetenUit();
        } else if (stilleMetingen === 0 && vorigeBytes > 0) {
          // Er stroomt audio: keten is in orde, controle kan stoppen.
          clearInterval(timer);
          micKetenGecontroleerd = true;
        }
      } catch (e) {}
    }, 3000);
  }
  async function zetMicKetenUit() {
    if (!micChain) return;
    const ruw = micChain.ruw;
    const versterkt = micChain.uit;
    sloopMicKeten();
    try {
      if (localStream) {
        try { localStream.removeTrack(versterkt); } catch (e) {}
        try { versterkt.stop(); } catch (e) {}
        localStream.addTrack(ruw);
      }
      const z = mediaPc && mediaPc.getSenders().find((x) => x.track && x.track.kind === 'audio');
      if (z) { try { await z.replaceTrack(ruw); } catch (e) {} }
    } catch (e) {}
  }

  function watchEncoder() {
    if (role !== 'baby' || encoderVerlaagd) return;
    let slechteMetingen = 0;
    const timer = setInterval(async () => {
      if (shuttingDown || encoderVerlaagd || role !== 'baby') { clearInterval(timer); return; }
      if (!mediaPc || !mediaPc.getStats) return;
      try {
        const stats = await mediaPc.getStats();
        let fps = null, reden = '';
        stats.forEach((r) => {
          if (r.type === 'outbound-rtp' && r.kind === 'video') {
            if (typeof r.framesPerSecond === 'number') fps = r.framesPerSecond;
            if (r.qualityLimitationReason) reden = r.qualityLimitationReason;
          }
        });
        const teTraag = (fps !== null && fps < 8) || reden === 'cpu';
        slechteMetingen = teTraag ? slechteMetingen + 1 : 0;
        // Drie keer achter elkaar (dus ~15 s) voordat we ingrijpen: één
        // uitschieter tijdens het opstarten is geen reden om beeld te
        // verslechteren.
        if (slechteMetingen >= 3) {
          clearInterval(timer);
          encoderVerlaagd = true;
          camProfiel = LICHT;
          await verlaagCamera();
        }
      } catch (e) {}
    }, 5000);
  }
  async function verlaagCamera() {
    try {
      const sender = await detachVideoSender();
      const ot = localStream && localStream.getVideoTracks()[0];
      if (ot) { try { localStream.removeTrack(ot); ot.stop(); } catch (e) {} }
      let nt = babyCamId ? await openCam({ deviceId: { exact: babyCamId } }) : null;
      if (!nt) nt = await openCam({ facingMode: facing });
      if (!nt) nt = await openCam(true);
      if (!nt) return;
      await attachVideoTrack(nt, sender);
    } catch (e) {}
  }

  async function startBaby() {
    role = 'baby';
    showScreen('screenPairBaby');
    try {
      localStream = await getMedia({
        audio: MIC_MONITOR,
        video: Object.assign({ facingMode: 'environment' }, camProfiel),
      });
      // Zachte geluiden hoorbaar maken vóór het verzenden. Lukt de
      // versterkingstrap niet, dan gaat het ruwe spoor gewoon mee.
      versterkMic(localStream);
    } catch (e) {
      toast(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? T('permissionDenied') : (e.message || T('mediaError')));
      showScreen('screenSetup');
      role = null;
      return;
    }
    $('bPreview').srcObject = localStream;
    // Vastleggen met welke camera we begonnen zijn: Safari geeft niet altijd
    // een deviceId terug via getSettings(), dus dit is straks het houvast bij
    // wisselen en bij herstel na een wegval.
    const v0 = trackIdent(localStream.getVideoTracks()[0]);
    babyCamId = v0.id || '';
    if (v0.facing === 'user' || v0.facing === 'environment') facing = v0.facing;
    localStream.getTracks().forEach((t) => watchTrackEnd(t, t.kind));
    openBabyPeer();
  }

  // ------------------------------------------------------------------ koppelen: ouder
  async function startParentConnect(rawCode, isRetry) {
    let code = (rawCode != null ? rawCode : $('parentOfferInput').value || '').trim();
    if (code.indexOf('#') >= 0) code = code.slice(code.lastIndexOf('#') + 1).trim();
    // Een gescande QR of gedeelde link bevat "CODE.token"; handmatig getypt is
    // het alleen de code — dan volgt straks een toestemmingsvraag bij de baby.
    const dot = code.indexOf('.');
    if (dot > 0) { parentToken = code.slice(dot + 1).trim(); code = code.slice(0, dot); }
    else if (!isRetry) { parentToken = ''; }
    code = code.toUpperCase();
    if (!code) return toast(T('pastePairFirst'));
    mark('connectStart');
    currentCode = code; // toon de kamercode in het ouderdashboard
    role = 'parent';
    if (!isRetry) { reconnectAttempt = 0; }
    const err0 = $('parentError'); if (err0) err0.classList.add('hidden');
    const pcn = $('parentConnecting');
    if (pcn) pcn.classList.remove('hidden');
    // Bij herverbinden: oude peer volledig opruimen en opnieuw beginnen.
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; controlConn = null; mediaPc = null; }
    talkCall = null;
    linkApproved = false;
    currentBabyId = PEER_PREFIX + code;
    // De microfoon voor terugpraten wordt hier NIET meer opgevraagd. Hij is
    // niet nodig om beeld te krijgen, maar het opvragen duurt op een telefoon
    // vaak 1–3 seconden — en dat stond vóór het verbinden, dus die tijd telde
    // een-op-een op bij "tijd tot beeld". Hij gaat nu pas open als de ouder
    // echt op Talk back drukt, zodat hij niet met de ICE-onderhandeling om
    // dezelfde audio-hardware concurreert én het luisteren niet in
    // gespreksmodus zet.
    // Nooit eindeloos "Verbinden…": na 20 s expliciet mislukt of opnieuw.
    clearConnectTimers();
    connectTimer = setTimeout(() => {
      if (controlConn && controlConn.open) return;
      if (wasConnected || isRetry) scheduleParentReconnect();
      else connectFailed();
    }, CONNECT_TIMEOUT);
    const babyId = currentBabyId;
    pairStap = 0; setPairStap(1); setParentStatus(T('connecting'));
    if (!iceGeladen) { try { await laadEigenIce(); } catch (e) {} }
    peer = new Peer(peerOptions());
    peer.on('open', () => {
      mark('peerOpen');
      setPairStap(2); setParentStatus(T('connecting'));
      const conn = peer.connect(babyId, { reliable: true });
      attachControl(conn);
      conn.on('open', () => {
        mark('connOpen');
        setPairStap(3); setParentStatus(T('connecting'));
        // Legitimeren: met token uit de QR gaat het meteen door, anders vraagt
        // de babyunit eerst toestemming op het eigen scherm.
        try { conn.send({ cmd: 'hello', token: parentToken, device: deviceId }); } catch (e) {}
        mark('helloSent');
        setPairStap(4);
        // Nog niet klaar: connectSucceeded() volgt pas bij 'authOk' van de
        // babyunit. Tot dan bewaakt de watchdog of dat antwoord echt komt.
        startAuthWatchdog(isRetry);
        parentConnected();
        if (!wasConnected) setParentStatus(T('waitingApproval'));
        // Terugpraten volgt na 'authOk' (zie startTalkback): eerst beeld.
      });
    });
    peer.on('call', (call) => {
      // videobeeld van de baby
      mark('callOffer');
      // Het antwoord draagt óók het opus-profiel: dit is de kant die de
      // babyunit vertelt met welke bitrate hij mag coderen.
      call.answer(undefined, CALL_OPTS);
      mediaPc = call.peerConnection || mediaPc;
      watchMediaPc(mediaPc);
      call.on('stream', (s) => {
        mark('firstTrack');
        remoteStream = s;
        const v = $('video');
        if (TRACE) v.addEventListener('loadedmetadata', () => mark('firstFrame'), { once: true });
        v.srcObject = s;
        v.play().catch(() => {});
        tuneAudioReceiver(call.peerConnection || mediaPc);
        setupAnalyser(s);
        // De microfoon blijft dicht zolang er niet teruggepraat wordt.
        if (talking) ensureMic().then((x) => { if (x) startTalkback(); });
      });
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
    peer.on('error', (err) => onPeerError(err, 'parent'));
  }
  function onPeerError(err, r) {
    const type = err && err.type;
    if (type === 'unavailable-id' && r === 'baby') {
      openBabyPeer(); // code net bezet → nieuwe code
      return;
    }
    if (type === 'peer-unavailable') {
      // Baby (nog) niet bereikbaar. Na een eerdere verbinding proberen we
      // het opnieuw — de babyunit kan zelf ook aan het herverbinden zijn.
      if (r === 'parent' && wasConnected) { scheduleParentReconnect(); return; }
      clearConnectTimers();
      const pcn = $('parentConnecting');
      if (pcn) pcn.classList.add('hidden');
      const eBox = $('parentError');
      if (eBox) { eBox.textContent = T('invalidPair'); eBox.classList.remove('hidden'); }
      role = null;
      toast(T('invalidPair'));
      return;
    }
    if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
      if (r === 'parent') { scheduleParentReconnect(); return; }
      toast(T('connectionLost'));
      return;
    }
    try { console.warn('peer error', type, err); } catch (e) {}
  }

  // ================================================================== OUDER-PANEEL
  let micStream = null;
  let talkDisabled = false;
  let micPromise = null;     // pas gestart zodra er echt teruggepraat wordt
  let currentBabyId = '';    // PeerJS-id van de babyunit waarmee we praten
  let talkCall = null;       // terugpraat-MediaConnection (pas na goedkeuring)
  let linkApproved = false;  // babyunit heeft ons toegelaten ('authOk')
  // De microfoon van de OUDER gaat pas open als er ook echt teruggepraat
  // wordt, en gaat daarna weer helemaal dicht. Een openstaande microfoon —
  // ook eentje waarvan de track alleen op enabled=false staat — zet een
  // telefoon in gespreksmodus: de weergave schakelt naar het smalbandige
  // spraakpad en de echo-onderdrukking gaat meeluisteren met wat er uit de
  // speaker komt. Precies daardoor gaat het lúisteren zelf slechter klinken,
  // terwijl de ouder al die tijd helemaal niet praat.
  function ensureMic() {
    if (micStream) return Promise.resolve(micStream);
    if (talkDisabled) return Promise.resolve(null);
    if (!micPromise) {
      micPromise = getMedia({ audio: MIC_TALKBACK, video: false }).then((s) => {
        micStream = s;
        mark('micReady');
        applyTalkAvailability();
        return s;
      }, () => {
        talkDisabled = true;
        micPromise = null; // opnieuw proberen mag; misschien is toestemming later wél gegeven
        mark('micReady');
        applyTalkAvailability();
        return null;
      });
    }
    return micPromise;
  }
  // Microfoon en terugpraatkanaal volledig afbreken.
  function stopTalkback(meldAanBaby) {
    talking = false;
    if (talkCall) { try { talkCall.close(); } catch (e) {} talkCall = null; }
    if (micStream) {
      try { micStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
      micStream = null;
    }
    micPromise = null;
    if (meldAanBaby) sendControl({ cmd: 'talk', on: false });
  }
  function applyTalkAvailability() {
    const b = $('btnTalk');
    if (b) b.style.opacity = talkDisabled ? 0.5 : '';
  }
  // Terugpraatkanaal opzetten. Bewust ná 'authOk': de babyunit weigert een
  // gesprek van een niet-toegelaten toestel toch, en het scheelt een tweede
  // ICE-onderhandeling die met de videoverbinding zou concurreren.
  function startTalkback() {
    if (talkCall || !micStream || !peer || !currentBabyId) return;
    // Nooit bellen vóór 'authOk'. De babyunit gooit een gesprek van een nog
    // niet toegelaten toestel meteen dicht (zie peer.on('call') daar), en dat
    // dode gesprek bleef daarna in talkCall staan — waardoor de bovenste
    // controle élke volgende poging afkapte en terugpraten de rest van de
    // sessie stil bleef, terwijl de knop wél op "aan" stond. Bij een
    // handmatig ingetypte code staat het ouderdashboard al open terwijl er nog
    // op "Toestaan" gewacht wordt, dus die knop is daar echt in te drukken.
    // Zodra 'authOk' binnen is, wordt startTalkback() alsnog aangeroepen.
    if (!linkApproved) return;
    try {
      micStream.getAudioTracks().forEach((t) => (t.enabled = talking));
      talkCall = peer.call(currentBabyId, micStream, CALL_OPTS);
      // Terugpraten is een APARTE RTCPeerConnection naast die van het
      // babybeeld. Nooit bewaken met watchMediaPc: die verbinding mag
      // legitiem sluiten zonder dat de gezonde videoverbinding als wegval
      // geldt. Alleen de PC van het babybeeld telt.
      if (talkCall && !mediaPc) { mediaPc = talkCall.peerConnection || mediaPc; }
      // Sluit het terugpraatkanaal (van welke kant dan ook), dan moet talkCall
      // weer leeg — anders blijft er een dood gesprek staan dat een nieuwe
      // poging blokkeert. Alleen het HUIDIGE gesprek opruimen, net als bij
      // attachControl: een oude 'close' mag een net gestart gesprek niet wissen.
      if (talkCall) {
        const tc = talkCall;
        tc.on('close', () => { if (talkCall === tc) talkCall = null; });
      }
      if (talkCall) setTimeout(() => tuneAudioSender(talkCall && talkCall.peerConnection), 1000);
      // De babyunit zet zolang echo-onderdrukking aan op zijn microfoon,
      // anders zingt het rond: ouder → babyspeaker → babymicrofoon → ouder.
      sendControl({ cmd: 'talk', on: true });
    } catch (e) {}
  }
  let audioCtx = null;
  let analyser = null;
  let analyserSrc = null;
  let analyserStream = null;
  let talking = false;
  let nightMode = false;
  let alarmOn = true;
  let muted = false;
  let zoom = 1.0;
  let volume = 80;
  let brightness = 100;
  let nightlightOn = false; // aan/uit — via de Nachtstand-knop, niet de schuifbalk
  let nightlightLevel = 60; // 0..100 — sterkte terwijl het aan is
  let sensitivity = 55;
  let alarmCooldown = 0;
  // camerakeuze + LED-lampje van de babyunit (gemeld via het besturingskanaal)
  let babyCameras = [];
  let camActiveId = '';
  let torchSupported = false;
  let torchLastOn = false;
  const tracks = LullabyPlayer.list();
  let trackIndex = 0;
  let musicRepeat = true;   // playlist herhalen (standaard aan)
  let playing = false;
  let vuBars = [];

  // muziek-playlist (mp3's uit de map "music/")
  let musicList = null;       // [{ file, title }]
  let musicIndex = 0;
  let musicPlaying = false;   // ouder: spiegelt de babyunit-status
  let musicAudio = null;      // baby: <audio>-element
  let musicBabyPlaying = false;
  let musicErr = 0;

  // Geluidsmeter en huilalarm meten mee op een KLOON van de audiotrack.
  // Dezelfde track tegelijk door een <video>-element laten afspelen én door
  // een MediaStreamAudioSourceNode laten uitlezen geeft in sommige browsers
  // onderbrekingen in de weergave; met een kloon heeft de meting een eigen
  // afnemer en blijft het afspelen ongemoeid. Er is bewust één AudioContext
  // voor de hele pagina: bij elke herverbinding komt hier een nieuwe stream
  // binnen, en een context per herverbinding stapelt zich op.
  function setupAnalyser(stream) {
    try {
      const track = stream && stream.getAudioTracks && stream.getAudioTracks()[0];
      if (!track) { analyser = null; return; }
      // Oude meetketen opruimen, anders blijven bronknopen en gekloonde
      // tracks op dezelfde context achter.
      if (analyserSrc) { try { analyserSrc.disconnect(); } catch (e) {} analyserSrc = null; }
      if (analyserStream) {
        try { analyserStream.getTracks().forEach((t) => t.stop()); } catch (e) {}
        analyserStream = null;
      }
      analyser = null;
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      analyserStream = new MediaStream([track.clone()]);
      analyserSrc = audioCtx.createMediaStreamSource(analyserStream);
      const an = audioCtx.createAnalyser();
      an.fftSize = 512;
      an.smoothingTimeConstant = 0.6;
      analyserSrc.connect(an);
      analyser = an;
    } catch (e) {
      analyser = null;
    }
  }
  const meterBuf = new Uint8Array(256);
  let amBars = [];
  let soundEventCooldown = 0;
  function meterLoop() {
    let level = 0;
    if (analyser) {
      const n = analyser.fftSize / 2;
      analyser.getByteTimeDomainData(meterBuf.subarray(0, n));
      let sum = 0;
      for (let i = 0; i < n; i++) { const v = (meterBuf[i] - 128) / 128; sum += v * v; }
      level = Math.min(100, Math.round(Math.sqrt(sum / n) * 300));
    }
    for (let i = 0; i < vuBars.length; i++) {
      const h = Math.max(0.12, Math.min(1, (level / 100) * (0.7 + Math.random() * 0.6)));
      vuBars[i].style.transform = 'scaleY(' + h.toFixed(2) + ')';
    }
    // dB-audiometer (nieuw ontwerp): balken vullen op basis van niveau
    if (amBars.length) {
      const active = Math.round((level / 100) * amBars.length);
      for (let i = 0; i < amBars.length; i++) {
        const on = i < active;
        const h = on ? (30 + (i / amBars.length) * 70) * (0.75 + Math.random() * 0.4) : 18;
        amBars[i].style.height = Math.min(100, h).toFixed(0) + '%';
        amBars[i].style.opacity = on ? '1' : '0.3';
      }
    }
    const dbt = $('dbText'); if (dbt) dbt.textContent = Math.round(30 + level * 0.55) + ' dB';
    const threshold = 100 - sensitivity;
    const now = Date.now();
    const cry = $('cryAlert');
    if (alarmOn && level > threshold) {
      if (cry) cry.classList.remove('hidden');
      if (now > alarmCooldown) { alarmCooldown = now + 6000; triggerAlarm(); }
      if (now > soundEventCooldown) { soundEventCooldown = now + 8000; if (typeof addEvent === 'function') addEvent('sound', T('evSound'), T('evSoundSub')); }
    } else if (now > alarmCooldown - 5000) {
      if (cry) cry.classList.add('hidden');
    }
    requestAnimationFrame(meterLoop);
  }
  function triggerAlarm() {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    try {
      if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; audioCtx = new AC(); }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      [880, 1100].forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.18);
        g.gain.exponentialRampToValueAtTime(0.3, t + i * 0.18 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.15);
        osc.connect(g).connect(audioCtx.destination);
        osc.start(t + i * 0.18);
        osc.stop(t + i * 0.18 + 0.16);
      });
    } catch (e) {}
  }
  // Verbinding-verloren-melding: hoorbaar + trilling, zodat een ouder met
  // scherm-uit telefoon meteen merkt dat de verbinding wegviel — losstaand
  // van de huil-alarm (dalende tonen i.p.v. twee gelijke hoge tonen, zodat
  // ze niet met elkaar te verwarren zijn).
  function triggerConnectionLostAlert() {
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 300]);
    try {
      if (!audioCtx) { const AC = window.AudioContext || window.webkitAudioContext; audioCtx = new AC(); }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const t = audioCtx.currentTime;
      [660, 550, 440].forEach((f, i) => {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t + i * 0.22);
        g.gain.exponentialRampToValueAtTime(0.35, t + i * 0.22 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.2);
        osc.connect(g).connect(audioCtx.destination);
        osc.start(t + i * 0.22);
        osc.stop(t + i * 0.22 + 0.21);
      });
    } catch (e) {}
  }
  function setSignal(bars) {
    $('signal').querySelectorAll('i').forEach((i, idx) => i.classList.toggle('on', idx < bars));
  }
  async function statsLoop() {
    if (role === 'parent' && link) {
      const s = await link.getStats();
      if (s && s.rtt != null) {
        $('rttVal').textContent = Math.round(s.rtt) + ' ms';
        let bars = 4;
        if (s.rtt > 400) bars = 1; else if (s.rtt > 250) bars = 2; else if (s.rtt > 120) bars = 3;
        setSignal(bars);
      } else {
        setSignal(4); // lokaal netwerk: geen RTT beschikbaar, toon vol
      }
    }
    setTimeout(statsLoop, 2000);
  }

  function applyVideoFilter() {
    let f = 'brightness(' + brightness / 100 + ')';
    if (nightMode) f += ' grayscale(1) brightness(0.6) contrast(1.1)';
    $('video').style.filter = f;
    $('nightVeil').classList.toggle('hidden', !nightMode);
  }
  function applyZoom() {
    $('video').style.transform = 'scale(' + zoom + ')';
    const z = $('zoomVal'); if (z) z.textContent = zoom.toFixed(1) + '×';
  }
  function applyVolume() {
    $('video').volume = muted ? 0 : volume / 100;
    $('video').muted = muted || volume === 0;
    const h = $('volHub'); if (h) h.textContent = muted ? '⌀' : volume;
    const n = $('volNeedle'); if (n) n.style.transform = 'translateX(-50%) rotate(' + (-120 + (volume / 100) * 240) + 'deg)';
  }
  function setSliderKnob(elm, pct) {
    elm.querySelector('.knob').style.bottom = (pct * 100).toFixed(1) + '%';
  }
  function sendNightlightState() {
    sendControl({ cmd: 'nightlight', on: nightlightOn, level: nightlightLevel });
  }
  function applySlider(field, pct) {
    if (field === 'sBrightness') {
      brightness = Math.round(30 + pct * 100);
      applyVideoFilter();
      $('briReadout').textContent = brightness + '%';
    } else if (field === 'sNightlight') {
      // Regelt alleen de STERKTE, niet aan/uit — dat gaat via de Nachtstand-knop.
      nightlightLevel = Math.round(pct * 100);
      if (nightlightOn) sendNightlightState();
      $('nlReadout').textContent = nightlightOn ? nightlightLevel + '%' : T('off');
    } else if (field === 'sSensitivity') {
      sensitivity = Math.round(pct * 100);
      $('sensReadout').textContent = sensitivity + '%';
    }
    setSliderKnob($(field), pct);
  }
  function bindVertical(elm, onPct) {
    let active = false;
    const upd = (e) => {
      const r = elm.getBoundingClientRect();
      onPct(Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)));
    };
    elm.addEventListener('pointerdown', (e) => { active = true; try { elm.setPointerCapture(e.pointerId); } catch (x) {} upd(e); });
    elm.addEventListener('pointermove', (e) => active && upd(e));
    elm.addEventListener('pointerup', () => (active = false));
    elm.addEventListener('pointercancel', () => (active = false));
  }

  function renderChips() {
    const box = $('chips');
    box.replaceChildren();
    tracks.forEach((t, i) => {
      const c = document.createElement('div');
      c.className = 'chip' + (playing && i === trackIndex ? ' on' : '');
      c.textContent = trackLabel(t);
      c.onclick = () => selectTrack(i, true);
      box.appendChild(c);
    });
  }
  function sendPlay() {
    sendControl({ cmd: 'lullaby', on: true, id: tracks[trackIndex].id });
    playing = true; renderChips();
  }
  function sendStop() {
    sendControl({ cmd: 'lullaby', on: false, id: tracks[trackIndex].id });
    playing = false; renderChips();
  }
  function selectTrack(i, autoplay) {
    if (i === trackIndex && playing && autoplay) { sendStop(); return; }
    trackIndex = i;
    if (playing || autoplay) sendPlay(); else renderChips();
  }

  // ------------------------------------------------------------------ muziek-playlist
  // Laadt music/playlist.json (accepteert een array of { songs: [...] }; elk
  // item is een bestandsnaam of { file, title }). Zo kan de gebruiker zelf
  // mp3's toevoegen door ze in de map te zetten en playlist.json aan te vullen.
  async function loadPlaylist() {
    if (musicList) return musicList;
    try {
      const res = await fetch('music/playlist.json', { cache: 'no-store' });
      const data = await res.json();
      const arr = Array.isArray(data) ? data : (data && data.songs) || [];
      musicList = arr
        .map((s) => (typeof s === 'string'
          ? { file: s, title: s.replace(/\.[^.]+$/, '') }
          : { file: s.file, title: s.title || (s.file || '').replace(/\.[^.]+$/, '') }))
        .filter((s) => s.file);
    } catch (e) {
      musicList = [];
    }
    return musicList;
  }

  // --- babyunit: speelt de mp3's hardop af (loopt de hele playlist rond) ---
  async function babyPlayMusic(i) {
    const list = await loadPlaylist();
    if (!list.length) { sendBabyMusicState(); return; }
    lullaby.stop(); playing = false; // geen dubbel geluid met de gegenereerde slaapmuziek
    musicIndex = ((i % list.length) + list.length) % list.length;
    if (!musicAudio) {
      musicAudio = new Audio();
      musicAudio.id = 'musicAudio';
      document.body.appendChild(musicAudio);
      musicAudio.addEventListener('ended', () => {
        const laatste = musicList && musicIndex >= musicList.length - 1;
        if (laatste && !musicRepeat) { babyStopMusic(); return; }
        babyPlayMusic(musicIndex + 1);
      });
      musicAudio.addEventListener('playing', () => { musicErr = 0; });
      musicAudio.addEventListener('error', () => {
        // sla een ontbrekend/defect bestand over; stop als niets speelt
        if (++musicErr > (musicList ? musicList.length : 1)) { babyStopMusic(); return; }
        babyPlayMusic(musicIndex + 1);
      });
    }
    musicAudio.src = 'music/' + list[musicIndex].file;
    musicAudio.play().catch(() => {});
    musicBabyPlaying = true;
    sendBabyMusicState();
  }
  function babyStopMusic() {
    if (musicAudio) { try { musicAudio.pause(); musicAudio.currentTime = 0; } catch (e) {} }
    musicBabyPlaying = false;
    sendBabyMusicState();
  }
  function sendBabyMusicState() {
    sendControl({ cmd: 'musicState', playing: musicBabyPlaying, index: musicIndex,
      list: (musicList || []).map((s) => s.title) });
  }

  // --- ouderunit: bediening + weergave van de playlist ---
  // De lijst staat op twee plekken: in de zijbalkweergave Slaapliedjes én
  // direct onder de bedieningsknoppen op het monitorscherm, zodat je een
  // nummer kunt kiezen zonder van weergave te wisselen.
  async function renderPlaylist() {
    const boxes = ['playlist', 'monitorPlaylist'].map($).filter(Boolean);
    if (!boxes.length) return;
    const list = await loadPlaylist();
    boxes.forEach((box) => {
      box.replaceChildren();
      if (!list.length) {
        const d = document.createElement('div');
        d.className = 'playlist-empty';
        d.textContent = T('musicEmpty');
        box.appendChild(d);
        return;
      }
      list.forEach((s, i) => {
        const row = document.createElement('div');
        row.className = 'track' + (musicPlaying && i === musicIndex ? ' on' : '');
        const mk = (cls, txt) => { const el = document.createElement('span'); el.className = cls; if (txt != null) el.textContent = txt; return el; };
        row.appendChild(mk('n', String(i + 1)));
        row.appendChild(mk('tt', s.title));
        const eq = mk('eq');
        for (let k = 0; k < 3; k++) eq.appendChild(document.createElement('i'));
        row.appendChild(eq);
        row.onclick = () => parentPlayMusic(i);
        box.appendChild(row);
      });
    });
    updateMusicUI();
  }
  function updateMusicUI() {
    const btn = $('btnMusic');
    if (!btn) return;
    btn.classList.toggle('on', musicPlaying);
    $('musicBtnText').textContent = musicPlaying ? T('musicStop') : T('musicPlay');
    btn.querySelector('.ic-play').classList.toggle('hidden', musicPlaying);
    btn.querySelector('.ic-stop').classList.toggle('hidden', !musicPlaying);
    ['playlist', 'monitorPlaylist'].forEach((id) => {
      const b = $(id);
      if (b) b.querySelectorAll('.track').forEach((r, i) =>
        r.classList.toggle('on', musicPlaying && i === musicIndex));
    });
    const bl = $('btnLullaby'); if (bl) bl.classList.toggle('on', musicPlaying);
    const rb = $('btnRepeat');
    if (rb) { rb.classList.toggle('on', musicRepeat); rb.setAttribute('aria-pressed', String(musicRepeat)); }
  }
  function parentPlayMusic(i) {
    if (musicPlaying && i === musicIndex) { parentStopMusic(); return; }
    musicIndex = i; musicPlaying = true;
    sendControl({ cmd: 'music', action: 'play', index: i, repeat: musicRepeat });
    updateMusicUI();
  }
  function parentStopMusic() {
    musicPlaying = false;
    sendControl({ cmd: 'music', action: 'stop' });
    updateMusicUI();
  }

  // opnemen (lokaal)
  let recorder = null;
  let recChunks = [];
  function pickMime() {
    const opts = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
    for (const m of opts) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    return '';
  }
  async function saveBlob(blob, prefix, ext) {
    const name = prefix + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ accept: { [blob.type || 'application/octet-stream']: ['.' + ext] } }] });
        const w = await h.createWritable();
        await w.write(blob); await w.close();
        toast(T('saved')); return;
      } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast(T('saved'));
  }
  function toggleRecord(stream, btn, prefix) {
    const label = btn && btn.querySelector('span:not(.cb-ic)');
    if (!stream) return toast(T('noStream'));
    if (recorder) { recorder.stop(); return; }
    if (!window.MediaRecorder) return toast(T('recNotSupported'));
    const mime = pickMime();
    try { recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); }
    catch (e) { return toast(T('recNotSupported')); }
    recChunks = [];
    recorder.ondataavailable = (e) => e.data && e.data.size && recChunks.push(e.data);
    recorder.onstop = async () => {
      const blob = new Blob(recChunks, { type: recorder.mimeType || 'video/webm' });
      btn.classList.remove('active');
      if (label) label.textContent = T('recordVideo');
      recorder = null;
      await saveBlob(blob, prefix, (blob.type || '').includes('mp4') ? 'mp4' : 'webm');
    };
    recorder.start(1000);
    btn.classList.add('active');
    if (label) label.textContent = T('stop');
    toast(T('recStarted'));
  }

  // ------------------------------------------------------------------ event log
  const events = [];
  const EV_ICON = {
    sound: '<path d="M9 6v12l-5-4H2V10h2l5-4z" fill="currentColor"/><path d="M15 9a4 4 0 0 1 0 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
    talk: '<rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none"/>',
    lullaby: '<path d="M9 18V6l11-2v12" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="1.7" fill="none"/>',
    connect: '<path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  function addEvent(kind, title, sub) {
    const t = new Date();
    const hhmm = String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0') + ':' + String(t.getSeconds()).padStart(2, '0');
    events.unshift({ kind, title, sub, time: hhmm });
    if (events.length > 20) events.pop();
    renderEventLog();
  }
  function renderEventLog() {
    const fill = (box, max) => {
      if (!box) return;
      box.replaceChildren();
      events.slice(0, max).forEach((e) => {
        const row = document.createElement('div');
        row.className = 'evrow';
        const ic = document.createElement('span');
        ic.className = 'ev-ic';
        // EV_ICON bevat uitsluitend statische literals — nooit invoerdata.
        ic.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' + (EV_ICON[e.kind] || EV_ICON.connect) + '</svg>';
        const body = document.createElement('span');
        body.className = 'ev-b';
        const b = document.createElement('b'); b.textContent = e.title;
        const sm = document.createElement('small'); sm.textContent = e.sub || '';
        body.append(b, sm);
        const tm = document.createElement('span');
        tm.className = 'ev-t';
        tm.textContent = e.time;
        row.append(ic, body, tm);
        box.appendChild(row);
      });
    };
    fill($('eventLog'), 6);
    fill($('eventLogFull'), 20);
  }

  let parentStarted = false;
  let sleepTimerMin = 0, videoHidden = false;
  let remoteVideoOff = false; // babyunit heeft video uitgezet (audio only/shade)
  let sleepEndAt = 0, sleepTickerId = null;
  // Poster tonen + label bijwerken zodra beeld lokaal verborgen of op de
  // babyunit uitgezet is.
  function applyPrivacyUI() {
    const scr = $('screen'); if (scr) scr.classList.toggle('privacy', videoHidden || remoteVideoOff);
    const pv = $('privVal');
    if (pv) pv.textContent = videoHidden ? T('videoHidden') : (remoteVideoOff ? T('audioOnly') : T('cameraVisible'));
  }
  function buildAudioMeter() {
    const m = $('audioMeter');
    if (!m || m.childElementCount) return;
    for (let i = 0; i < 40; i++) m.appendChild(document.createElement('i'));
    amBars = Array.from(m.children);
  }
  // Camerakeuze tonen zodra de babyunit ≥2 camera's meldt.
  function renderCameraSelect() {
    const row = $('rowCamera'), sel = $('camSelect');
    if (!row || !sel) return;
    if (!babyCameras || babyCameras.length < 2) { row.classList.add('hidden'); return; }
    sel.textContent = '';
    babyCameras.forEach((c, i) => {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = (c.label && c.label.trim()) ? c.label : (T('cameraLabel') + ' ' + (i + 1));
      if (c.id === camActiveId) o.selected = true;
      sel.appendChild(o);
    });
    row.classList.remove('hidden');
  }
  // LED-rij alleen tonen als de babyunit torch-ondersteuning meldt.
  function renderTorchUI() {
    const row = $('rowLed'), btn = $('ledToggle');
    if (!row || !btn) return;
    if (!torchSupported) { row.classList.add('hidden'); return; }
    row.classList.remove('hidden');
    btn.classList.toggle('on', torchLastOn);
    btn.textContent = torchLastOn ? T('on2') : T('off2');
  }
  function startParentDevice() {
    if (parentStarted) return;
    parentStarted = true;
    vuBars = $('vu') ? Array.from($('vu').querySelectorAll('i')) : [];
    buildAudioMeter();
    applyTalkAvailability();
    const rl = $('roomLabel'); if (rl) rl.textContent = currentCode || 'P2P';
    applyVolume(); applyVideoFilter();
    renderChips(); renderPlaylist();
    $('btnAlarm').classList.toggle('on', alarmOn);
    addEvent('connect', T('evBabyConnected'), (currentCode ? T('room') + ' ' + currentCode : ''));

    // Talk back (druk om te praten) — grote knop in de Talk-weergave doet
    // hetzelfde als de monitorknop; één gedeelde toggle houdt ze in de pas.
    const setTalkUI = () => {
      $('btnTalk').classList.toggle('on', talking);
      $('talkText').textContent = talking ? T('talkActive') : T('talkBack');
      const tb = $('talkBig');
      if (tb) { tb.classList.toggle('on', talking); $('talkBigText').textContent = talking ? T('talkActive') : T('tapToTalk'); }
    };
    const toggleTalk = () => {
      // Terugpraten uit: microfoon én terugpraatkanaal helemaal sluiten, zodat
      // het toestel weer in gewone weergavemodus staat.
      if (talking) { stopTalkback(true); setTalkUI(); return; }
      // De microfoon wordt pas hier opgevraagd. Is hij er nog niet, dan
      // wachten we even — niet meteen "geen microfoon".
      if (!micStream) {
        if (talkDisabled) return toast(T('noMic'));
        ensureMic().then((s) => { if (s) toggleTalk(); else toast(T('noMic')); });
        return;
      }
      talking = true;
      micStream.getAudioTracks().forEach((t) => (t.enabled = true));
      startTalkback();
      setTalkUI();
      addEvent('talk', T('evTalk'), T('evTalkSub'));
    };
    $('btnTalk').onclick = toggleTalk;
    if ($('talkBig')) $('talkBig').onclick = toggleTalk;
    // Lullaby (eerste slaapliedje aan/uit)
    // Slaapliedje: start meteen bij nummer 1 van de playlist (of stopt).
    $('btnLullaby').onclick = () => {
      if (musicPlaying) { parentStopMusic(); return; }
      parentPlayMusic(0);
      addEvent('lullaby', T('evLullaby'), (musicList && musicList[0]) ? musicList[0].title : '');
    };
    // Playlist herhalen aan/uit
    if ($('btnRepeat')) $('btnRepeat').onclick = () => {
      musicRepeat = !musicRepeat;
      if (musicPlaying) sendControl({ cmd: 'music', action: 'repeat', repeat: musicRepeat });
      updateMusicUI();
    };
    // Night light (dimt eigen beeld + zet nachtlampje bij de baby)
    const setNightUI = () => {
      $('btnNightlight').classList.toggle('on', nightMode);
      const nt = $('nlToggle');
      if (nt) { nt.classList.toggle('on', nightlightOn); nt.textContent = nightlightOn ? T('on2') : T('off2'); }
    };
    $('btnNightlight').onclick = () => {
      nightMode = !nightMode; nightlightOn = nightMode;
      applyVideoFilter();
      $('liveText').textContent = nightMode ? T('nightModeBadge') : T('live');
      sendNightlightState();
      setNightUI();
    };
    if ($('nlToggle')) $('nlToggle').onclick = () => $('btnNightlight').click();
    if ($('nlLevel')) $('nlLevel').oninput = () => {
      nightlightLevel = +$('nlLevel').value;
      if (nightlightOn) sendNightlightState();
    };
    setNightUI();
    // Cry alert aan/uit + gevoeligheid (Alerts-weergave)
    const setAlarmUI = () => {
      $('btnAlarm').classList.toggle('on', alarmOn);
      const at = $('alToggle');
      if (at) { at.classList.toggle('on', alarmOn); at.textContent = alarmOn ? T('on2') : T('off2'); }
    };
    $('btnAlarm').onclick = () => {
      alarmOn = !alarmOn;
      setAlarmUI();
      if (!alarmOn) { const c = $('cryAlert'); if (c) c.classList.add('hidden'); }
    };
    if ($('alToggle')) $('alToggle').onclick = () => $('btnAlarm').click();
    if ($('alSens')) $('alSens').oninput = () => {
      sensitivity = +$('alSens').value;
      const v = $('alSensVal'); if (v) v.textContent = sensitivity + '%';
    };
    setAlarmUI();
    // Video+audio van de babyunit lokaal opnemen (MediaRecorder, opslaan op eigen apparaat)
    if ($('btnRecord')) $('btnRecord').onclick = () => toggleRecord(remoteStream, $('btnRecord'), 'babyunit');
    // Instellingen-weergave: volume/helderheid/zoom
    if ($('setVolume')) $('setVolume').oninput = () => {
      volume = +$('setVolume').value; muted = volume === 0;
      applyVolume();
      const v = $('setVolumeVal'); if (v) v.textContent = String(volume);
    };
    if ($('setBrightness')) $('setBrightness').oninput = () => {
      brightness = +$('setBrightness').value;
      applyVideoFilter();
      const v = $('setBrightnessVal'); if (v) v.textContent = brightness + '%';
    };
    if ($('setZoom')) $('setZoom').oninput = () => {
      zoom = +$('setZoom').value / 10;
      applyZoom();
      const v = $('setZoomVal'); if (v) v.textContent = zoom.toFixed(1) + '×';
    };
    // Snelknop "Wissel camera" op de monitor: stuurt een flip-commando naar
    // de babyunit (voor/achter of volgende lens). De camerakeuze-lijst in de
    // Instellingen blijft beschikbaar voor het kiezen van een specifieke lens.
    if ($('btnFlipCam')) $('btnFlipCam').onclick = () => { sendControl({ cmd: 'flip' }); toast(T('switchCamera')); };
    // Camerakeuze: laat de babyunit naar de gekozen camera wisselen.
    const camSel = $('camSelect');
    if (camSel) camSel.onchange = () => { camActiveId = camSel.value; sendControl({ cmd: 'selectCamera', deviceId: camSel.value }); };
    // LED-lampje (zaklamp) van de babyunit aan/uit (optimistisch; de baby bevestigt via torchState).
    const ledBtn = $('ledToggle');
    if (ledBtn) ledBtn.onclick = () => { torchLastOn = !ledBtn.classList.contains('on'); renderTorchUI(); sendControl({ cmd: 'torch', on: torchLastOn }); };
    renderCameraSelect();
    renderTorchUI();
    const rl2 = $('roomLabel2'); if (rl2) rl2.textContent = currentCode || 'P2P';
    // Stop
    $('btnStop').onclick = () => { if (confirm(T('stopParentQ'))) endSession(true); };
    // Fullscreen
    $('btnFullscreen').onclick = () => {
      const v = $('video');
      if (v.webkitEnterFullscreen && !document.fullscreenElement) { try { v.webkitEnterFullscreen(); return; } catch (e) {} }
      // Geen optional chaining (?.): Safari 12 op iOS 12 kent dat niet en dan
      // faalt dit hele bestand al bij het inlezen — geen enkele knop werkt meer.
      if (!document.fullscreenElement) {
        const fs = $('screen').requestFullscreen || $('screen').webkitRequestFullscreen;
        if (fs) fs.call($('screen'));
      } else {
        const ex = document.exitFullscreen || document.webkitExitFullscreen;
        if (ex) ex.call(document);
      }
    };
    document.addEventListener('fullscreenchange', () => { $('screen').classList.toggle('fs', !!document.fullscreenElement); });
    // Sleep timer-kaart (Off → 15 → 30 → 60) met zichtbaar aftellen
    const sleepLabel = () => {
      if (!sleepEndAt) { $('sleepVal').textContent = T('off2'); return; }
      const left = Math.max(0, sleepEndAt - Date.now());
      const m = Math.floor(left / 60000), s = Math.floor((left % 60000) / 1000);
      $('sleepVal').textContent = m + ':' + String(s).padStart(2, '0');
    };
    $('cardSleep').onclick = () => {
      const seq = [0, 15, 30, 60];
      sleepTimerMin = seq[(seq.indexOf(sleepTimerMin) + 1) % seq.length];
      if (sleepTickerId) { clearInterval(sleepTickerId); sleepTickerId = null; }
      sleepEndAt = sleepTimerMin ? Date.now() + sleepTimerMin * 60000 : 0;
      sendControl({ cmd: 'sleepTimer', min: sleepTimerMin });
      sleepLabel();
      if (sleepTimerMin) sleepTickerId = setInterval(() => {
        sleepLabel();
        if (Date.now() >= sleepEndAt) {
          clearInterval(sleepTickerId); sleepTickerId = null;
          sleepEndAt = 0; sleepTimerMin = 0;
          sendStop(); parentStopMusic(); $('btnLullaby').classList.remove('on');
          sendControl({ cmd: 'sleepTimer', min: 0 });
          sleepLabel();
          addEvent('lullaby', T('evSleepDone'), '');
        }
      }, 1000);
    };
    // Video privacy-kaart (verberg het beeld lokaal)
    $('cardPrivacy').onclick = () => {
      videoHidden = !videoHidden;
      applyPrivacyUI();
    };

    meterLoop(); statsLoop();
    enableWakeLock();
  }

  // ================================================================== BABYUNIT
  let babyStarted = false;
  let facing = 'environment';
  let micOn = true;
  function startBabyDevice() {
    if (babyStarted) return;
    babyStarted = true;
    // kamercode + QR ook op het babydashboard tonen
    const code = currentCode || '';
    ['babyDashCode', 'bRoom', 'bRoomInline'].forEach((id) => { const el = $(id); if (el) el.textContent = code; });
    if (code) renderQR('babyDashQR', location.href.split('#')[0] + '#' + code + '.' + sessionToken, 3);
    const cp = $('copyBabyDash'); if (cp) cp.onclick = () => copyText(code);

    const swCam = $('swCam'), swMic = $('swMic'), swAO = $('swAudioOnly'), swPriv = $('swPrivacy');
    const setVideoEnabled = (on) => {
      if (localStream) localStream.getVideoTracks().forEach((t) => (t.enabled = on));
      if (swCam) swCam.classList.toggle('on', on);
      $('bScreen') && $('bScreen').classList.toggle('privacy', !on);
      sendControl({ cmd: 'videoState', on: on }); // ouderunit toont poster + "Audio only"
    };
    // Camera-toggle
    $('tgCam').onclick = () => { const on = !swCam.classList.contains('on'); setVideoEnabled(on); if (swAO) swAO.classList.toggle('on', !on); if (swPriv) swPriv.classList.toggle('on', !on); };
    // Microfoon-toggle
    $('tgMic').onclick = () => {
      const on = !swMic.classList.contains('on');
      swMic.classList.toggle('on', on); micOn = on;
      if (localStream) localStream.getAudioTracks().forEach((t) => (t.enabled = on));
    };
    // Audio only — beeld uit, geluid aan
    $('tgAudioOnly').onclick = () => { const on = !swAO.classList.contains('on'); swAO.classList.toggle('on', on); setVideoEnabled(!on); if (swPriv) swPriv.classList.toggle('on', on); };
    // Privacy shade — beeld verbergen, geluid houden
    const toggleShade = () => { const on = !swPriv.classList.contains('on'); swPriv.classList.toggle('on', on); setVideoEnabled(!on); if (swAO) swAO.classList.toggle('on', on); };
    $('tgPrivacy').onclick = toggleShade;
    const shadeBtn = $('tgPrivacyBtn'); if (shadeBtn) shadeBtn.onclick = toggleShade;

    // Zichtbare "Wissel camera"-knop op de babyunit (voor/achter of volgende lens)
    const flipCam = $('tgFlipCam');
    if (flipCam) flipCam.onclick = () => babyCycleCamera();

    $('bStop').onclick = () => { if (confirm(T('stopBabyQ'))) endSession(true); };
    enableWakeLock();
    reportBattery();
    reportCameras();
    reportTorch();
  }
  // Terwijl de ouder terugpraat ontstaat er wél een echopad (babyspeaker →
  // babymicrofoon). Alleen dán zetten we de echo-onderdrukking aan; daarna
  // gaat de microfoon weer onbewerkt, zodat zacht ademen hoorbaar blijft.
  let duplexOn = false;
  let duplexBusy = false;
  async function setBabyDuplex(on) {
    on = !!on;
    if (role !== 'baby' || !localStream || duplexBusy || on === duplexOn) return;
    duplexBusy = true;
    try {
      const cur = localStream.getAudioTracks()[0];
      // Eerst de goedkope weg: sommige browsers kunnen de spraakbewerking op
      // een lopend spoor omzetten.
      if (cur && cur.applyConstraints) {
        try {
          await cur.applyConstraints(on ? MIC_DUPLEX : MIC_MONITOR);
          if (!!cur.getSettings().echoCancellation === on) { duplexOn = on; return; }
        } catch (e) { /* onder af te handelen */ }
      }
      // Chrome legt de audiobewerking vast bij het ópenen van het spoor.
      // Omschakelen kan dan alleen door de microfoon opnieuw te openen en het
      // spoor te vervangen — dezelfde aanpak als flipCamera()/recoverBabyTrack().
      const ns = await getMedia({ audio: on ? MIC_DUPLEX : MIC_MONITOR, video: false });
      const nt = ns.getAudioTracks()[0];
      if (!nt) return;
      if (cur) nt.enabled = cur.enabled; // microfoon-uit van de gebruiker respecteren
      const sender = mediaPc && mediaPc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (sender) { try { await sender.replaceTrack(nt); } catch (e) {} }
      if (cur) { try { localStream.removeTrack(cur); cur.stop(); } catch (e) {} }
      localStream.addTrack(nt);
      watchTrackEnd(nt, 'audio');
      // Nieuw ruw spoor: versterkingstrap er opnieuw omheen en het versterkte
      // spoor naar de ouder sturen.
      sloopMicKeten();
      const keten = bouwMicKeten(nt);
      if (keten) {
        micChain = keten;
        try { localStream.removeTrack(nt); localStream.addTrack(keten.uit); } catch (e) {}
        const zender = mediaPc && mediaPc.getSenders().find((x) => x.track && x.track.kind === 'audio');
        if (zender) { try { await zender.replaceTrack(keten.uit); } catch (e) {} }
        startMicGainRegeling();
      }
      duplexOn = on;
    } catch (e) {
      // Lukt het niet, dan blijft de bestaande microfoon gewoon staan.
    } finally {
      duplexBusy = false;
    }
  }

  // ---- camerawissel op de babyunit ----------------------------------------
  // Waarom dit zo omslachtig is: `facingMode` is in de spec een *voorkeur*, geen
  // eis. iPadOS/Safari mag dus doodleuk dezelfde camera teruggeven. Je ziet dan
  // wel iets gebeuren (het spoor wordt vervangen, het beeld hapert) maar je
  // krijgt hetzelfde apparaat terug. Daar bovenop houdt iOS een al geopende
  // camera vast: vraag je een nieuwe aan terwijl het oude spoor nog leeft, dan
  // krijg je gegarandeerd het bezette apparaat. Vandaar: altijd op deviceId met
  // { exact: ... }, altijd het oude spoor éérst stoppen, en achteraf verifiëren
  // dat er echt een ánder apparaat actief is.

  // Onthoudt welke camera we zelf geopend hebben. Safari geeft lang niet altijd
  // een deviceId terug via track.getSettings(), dus we vertrouwen niet blind op
  // de browser om te weten waar we staan.
  let babyCamId = '';
  let switchingCam = false;

  function trackIdent(track) {
    let id = '', fm = '';
    if (track && track.getSettings) {
      try { const s = track.getSettings() || {}; id = s.deviceId || ''; fm = s.facingMode || ''; } catch (e) {}
    }
    return { id: id, facing: fm, label: (track && track.label) || '' };
  }
  // Is dit echt een ánder apparaat? deviceId is het harde bewijs; ontbreekt dat
  // (Safari), dan zeggen label en facingMode genoeg. Is er niets te vergelijken,
  // dan vertrouwen we op de 'exact'-constraint: die had moeten falen als de
  // gevraagde camera niet gegeven kon worden.
  function sameCamera(a, b) {
    if (a.id && b.id) return a.id === b.id;
    if (a.label && b.label) return a.label === b.label;
    if (a.facing && b.facing) return a.facing === b.facing;
    return false;
  }
  // Voor- of achtercamera afleiden uit het apparaatlabel. Labels zijn
  // OS-taalafhankelijk, dus dit is een hulpmiddel bij het kiezen van een
  // kandidaat — nooit het bewijs dat de wissel geslaagd is.
  function camSideFromLabel(label) {
    const s = (label || '').toLowerCase();
    if (/front|facetime|user|selfie|voor|frontal|avant|vorder|anterior|dianteira/.test(s)) return 'user';
    if (/back|rear|environment|world|achter|arri|hinter|trasera|traseira|posteriore|wide|ultra/.test(s)) return 'environment';
    return '';
  }
  // Eén camera openen. Geeft het videospoor terug, of null als het niet lukt.
  async function openCam(videoConstraint) {
    const base = Object.assign({}, camProfiel);
    const v = videoConstraint === true ? true : Object.assign({}, base, videoConstraint);
    try {
      const ns = await getMedia({ audio: false, video: v });
      const t = ns.getVideoTracks()[0];
      if (!t) { ns.getTracks().forEach((x) => { try { x.stop(); } catch (e) {} }); return null; }
      return t;
    } catch (e) { return null; }
  }
  // Het uitgaande videospoor éérst loskoppelen van de WebRTC-zender, dán pas
  // stoppen. Omdat we het oude spoor nu moeten stoppen vóórdat de nieuwe camera
  // wordt aangevraagd (anders geeft iOS de al bezette camera terug), zou de
  // zender anders seconden lang op een beëindigd spoor blijven staan — precies
  // de duur van de getUserMedia-aanvraag. replaceTrack(null) is de nette manier
  // om een zender vast te houden zonder bron. Gemeten in Chromium hervat het
  // coderen in beide volgordes even goed; dit is dus een voorzorg, geen
  // noodgreep. Geeft de zender terug, want na replaceTrack(null) is die niet
  // meer aan zijn spoor terug te vinden.
  async function detachVideoSender() {
    const sender = (mediaPc && mediaPc.getSenders)
      ? mediaPc.getSenders().find((s) => s.track && s.track.kind === 'video')
      : null;
    if (sender) { try { await sender.replaceTrack(null); } catch (e) {} }
    return sender || null;
  }
  // Nieuw videospoor in de uitgaande stream hangen (WebRTC-zender, preview,
  // torch-status) en de bijgehouden camerastatus meebijwerken. `sender` komt uit
  // detachVideoSender(); na een replaceTrack(null) is de zender namelijk niet
  // meer op zijn spoor terug te vinden.
  async function attachVideoTrack(nt, sender) {
    const ot = localStream.getVideoTracks()[0];
    const snd = sender || ((mediaPc && mediaPc.getSenders)
      ? mediaPc.getSenders().find((s) => s.track && s.track.kind === 'video')
      : null);
    if (snd) { try { await snd.replaceTrack(nt); } catch (e) {} }
    if (ot) { try { localStream.removeTrack(ot); ot.stop(); } catch (e) {} }
    // Het beeld moet de camerastand van vóór de wissel volgen: stond de camera
    // uit (privacy shade / audio-only), dan blijft die uit.
    const swCam = $('swCam');
    if (swCam && !swCam.classList.contains('on')) nt.enabled = false;
    localStream.addTrack(nt);
    watchTrackEnd(nt, 'video');
    torchOn = false; // nieuw spoor → LED weer uit
    const info = trackIdent(nt);
    babyCamId = info.id || '';
    if (info.facing === 'user' || info.facing === 'environment') facing = info.facing;
    else { const side = camSideFromLabel(info.label); if (side) facing = side; }
    const pv = $('bPreview'); if (pv) pv.srcObject = localStream;
    reportCameras();
    reportTorch();
  }
  // Zichtbare, blijvende melding onder de "Wissel camera"-knop. Een toast is na
  // drie seconden weg; juist bij een mislukte wissel moet de gebruiker het nog
  // kunnen lezen. Via data-i18n loopt de tekst mee met de taalkeuze.
  const FLIP_NOTE_DEFAULT = 'switchCameraSub';
  let flipNoteTimer = 0;
  function setFlipNote(key, sticky) {
    const el = $('flipCamNote');
    clearTimeout(flipNoteTimer);
    if (!el) return;
    el.setAttribute('data-i18n', key);
    el.textContent = T(key);
    if (!sticky && key !== FLIP_NOTE_DEFAULT) {
      flipNoteTimer = setTimeout(() => setFlipNote(FLIP_NOTE_DEFAULT, true), 6000);
    }
  }
  // Camera's van dit toestel opsommen (alleen die met een bruikbaar deviceId —
  // zonder id kunnen we niet gericht wisselen).
  async function listCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      return devs.filter((d) => d.kind === 'videoinput' && d.deviceId);
    } catch (e) { return []; }
  }
  // Terugvaloptie als het wisselen helemaal niet lukt: haal de oorspronkelijke
  // camera terug, zodat het beeld nooit zwart blijft staan.
  async function restoreCamera(prev, sender) {
    let t = null;
    if (prev.id) t = await openCam({ deviceId: { exact: prev.id } });
    if (!t && prev.side) t = await openCam({ facingMode: prev.side });
    if (!t) t = await openCam(true);
    if (t) await attachVideoTrack(t, sender);
    return !!t;
  }

  // Wissel van camera op de babyunit. Wordt aangeroepen door de zichtbare
  // "Wissel camera"-knop op de babyunit én door het 'flip'-commando dat de
  // ouderunit op afstand stuurt.
  //
  // We mikken op de andere kant (voor ↔ achter) in plaats van blind door de
  // lijst te rouleren: een iPad Pro meldt meerdere achterlenzen, en van de ene
  // achtercamera naar de andere springen ziet er voor de gebruiker uit alsof er
  // niets gebeurt.
  async function babyCycleCamera() {
    if (role !== 'baby' || !localStream || switchingCam) return;
    const oldTrack = localStream.getVideoTracks()[0];
    if (!oldTrack) return;
    switchingCam = true;
    try {
      const cur = trackIdent(oldTrack);
      const curId = cur.id || babyCamId || '';
      const curSide = cur.facing || camSideFromLabel(cur.label) || facing;
      const wantSide = curSide === 'user' ? 'environment' : 'user';
      const cams = await listCameras();

      // Is de huidige camera de enige? Dan is er niets te wisselen — dat is een
      // ander verhaal dan "het wisselen is mislukt" en verdient een eigen tekst.
      if (cams.length === 1) {
        setFlipNote('onlyOneCamera', true);
        toast(T('onlyOneCamera'));
        return;
      }

      // Kandidaten op volgorde: eerst de gewenste kant, dan camera's waarvan we
      // de kant niet uit het label kunnen lezen, dan de rest. De camera waar we
      // nu op staan valt af.
      const isCurrent = (d) => (curId ? d.deviceId === curId : (!!cur.label && d.label === cur.label));
      const others = cams.filter((d) => !isCurrent(d));
      const wanted = [], unknown = [], rest = [];
      others.forEach((d) => {
        const side = camSideFromLabel(d.label);
        if (side === wantSide) wanted.push(d);
        else if (!side) unknown.push(d);
        else rest.push(d);
      });
      const queue = wanted.concat(unknown, rest);

      // Zonder bruikbare apparatenlijst valt er niets gericht te kiezen; dan
      // proberen we alsnog een strikte voor/achter-flip.
      if (!queue.length) {
        const ok = await flipCamera();
        if (!ok) {
          // Alleen "één camera" melden als we dat écht weten. Bij een lege lijst
          // (enumerateDevices geweigerd of niet beschikbaar) weten we het niet,
          // en dan is "wisselen mislukt" het eerlijke antwoord.
          const only = cams.length === 1;
          setFlipNote(only ? 'onlyOneCamera' : 'cameraSwitchFailed', true);
          toast(T(only ? 'onlyOneCamera' : 'cameraSwitchFailed'));
        }
        return;
      }

      // Oude spoor éérst loskoppelen én vrijgeven — anders geeft iOS/iPadOS
      // gewoon de al bezette camera terug in plaats van de gevraagde.
      const prev = { id: curId, side: curSide };
      const sender = await detachVideoSender();
      try { localStream.removeTrack(oldTrack); } catch (e) {}
      try { oldTrack.stop(); } catch (e) {}

      let done = false;
      for (let i = 0; i < queue.length && !done; i++) {
        const nt = await openCam({ deviceId: { exact: queue[i].deviceId } });
        if (!nt) continue;
        // Verifiëren: kregen we écht een ander apparaat? Zo niet, dan dit spoor
        // netjes opruimen en de volgende kandidaat proberen.
        if (sameCamera(trackIdent(nt), cur)) { try { nt.stop(); } catch (e) {} continue; }
        await attachVideoTrack(nt, sender);
        done = true;
      }
      if (done) {
        setFlipNote('cameraSwitched');
        toast(T('cameraSwitched'));
      } else {
        // Niets gelukt: oorspronkelijke camera terughalen, beeld mag niet zwart
        // blijven — en eerlijk melden dat er niet gewisseld is.
        await restoreCamera(prev, sender);
        setFlipNote('cameraSwitchFailed', true);
        toast(T('cameraSwitchFailed'));
      }
    } finally {
      switchingCam = false;
    }
  }
  // Strikte voor/achter-flip. `facingMode: { exact }` is een eis in plaats van
  // een voorkeur: een toestel zonder die kant geeft nu een fout in plaats van
  // stilletjes dezelfde camera. Geeft true terug als er echt gewisseld is.
  async function flipCamera() {
    if (!localStream) return false;
    const oldTrack = localStream.getVideoTracks()[0];
    const cur = trackIdent(oldTrack);
    const curSide = cur.facing || camSideFromLabel(cur.label) || facing;
    const wantSide = curSide === 'user' ? 'environment' : 'user';
    const prev = { id: cur.id || babyCamId || '', side: curSide };
    const sender = await detachVideoSender();
    if (oldTrack) {
      try { localStream.removeTrack(oldTrack); } catch (e) {}
      try { oldTrack.stop(); } catch (e) {}
    }
    let nt = await openCam({ facingMode: { exact: wantSide } });
    if (nt && oldTrack && sameCamera(trackIdent(nt), cur)) { try { nt.stop(); } catch (e) {} nt = null; }
    if (!nt) { await restoreCamera(prev, sender); return false; }
    await attachVideoTrack(nt, sender);
    return true;
  }
  // Nieuwe media-oproep naar de al toegelaten ouderunit. Wordt aangeroepen als
  // die meldt dat er geen beeld binnenkomt. De oude oproep wordt eerst netjes
  // gesloten, anders blijven er twee verbindingen naast elkaar staan.
  let hercallBezig = false;
  async function hercallOuder() {
    if (role !== 'baby' || hercallBezig || shuttingDown) return;
    if (!approvedPeer || !localStream || !peer) return;
    hercallBezig = true;
    try {
      if (mediaPc) { try { mediaPc.close(); } catch (e) {} mediaPc = null; }
      const call = peer.call(approvedPeer, localStream, CALL_OPTS);
      if (call) {
        mediaPc = call.peerConnection || mediaPc;
        watchMediaPc(mediaPc);
        setTimeout(() => tuneAudioSender(call.peerConnection), 1000);
      }
    } catch (e) {
    } finally {
      setTimeout(() => { hercallBezig = false; }, 2000);
    }
  }

  // Herstel van camera/microfoon als het besturingssysteem het spoor hard
  // beëindigt (bv. na lang op de achtergrond of scherm-uit op sommige
  // toestellen) — dezelfde aanpak als flipCamera(), maar automatisch
  // getriggerd in plaats van door een tik van de gebruiker.
  let recoveringVideo = false, recoveringAudio = false;
  function watchTrackEnd(track, kind) {
    track.onended = () => { if (!shuttingDown && role === 'baby') recoverBabyTrack(kind); };
  }
  async function recoverBabyTrack(kind) {
    if (shuttingDown || role !== 'baby' || !localStream) return;
    if (kind === 'video' ? recoveringVideo : recoveringAudio) return;
    // Niet doorheen een lopende camerawissel fietsen: die stopt zelf even het
    // oude spoor, wat hier anders als "camera weggevallen" gelezen wordt.
    if (kind === 'video' && switchingCam) return;
    if (kind === 'video') recoveringVideo = true; else recoveringAudio = true;
    try {
      if (kind === 'video') {
        // Het weggevallen spoor eerst van de zender halen en opruimen: het is al
        // 'ended' en de camera moet vrij zijn vóór we opnieuw aanvragen (zie
        // detachVideoSender).
        const sender = await detachVideoSender();
        const ot = localStream.getVideoTracks()[0];
        if (ot) { try { localStream.removeTrack(ot); ot.stop(); } catch (e) {} }
        // Eerst dezelfde camera terug die we hadden (deviceId is exact), dan
        // pas de zwakkere voorkeuren — zo komt de gebruiker niet na een
        // hapering ineens op een andere lens uit.
        let nt = babyCamId ? await openCam({ deviceId: { exact: babyCamId } }) : null;
        if (!nt) nt = await openCam({ facingMode: facing });
        if (!nt) nt = await openCam(true);
        if (!nt) throw new Error('no camera');
        await attachVideoTrack(nt, sender);
        toast(T('cameraRecovered'));
        return;
      }
      // Onbewerkte microfoon, net als bij het openen: geen AGC/ruisonderdrukking,
      // anders klinkt de babyunit na een herstel ineens anders dan daarvoor.
      const constraints = { audio: MIC_MONITOR, video: false };
      const ns = await getMedia(constraints);
      const nt = ns.getTracks()[0];
      const ot = localStream.getTracks().find((t) => t.kind === kind);
      const sender = mediaPc && mediaPc.getSenders().find((s) => s.track && s.track.kind === kind);
      if (sender) { try { await sender.replaceTrack(nt); } catch (e) {} }
      if (ot) { try { localStream.removeTrack(ot); ot.stop(); } catch (e) {} }
      localStream.addTrack(nt);
      watchTrackEnd(nt, kind);
      if (kind === 'audio') {
        duplexOn = false; // verse microfoon = weer onbewerkt
        // Ook na een herstel weer versterken, anders is de babyunit ineens
        // veel zachter dan daarvoor.
        sloopMicKeten();
        const k = bouwMicKeten(nt);
        if (k) {
          micChain = k;
          try { localStream.removeTrack(nt); localStream.addTrack(k.uit); } catch (e) {}
          const z = mediaPc && mediaPc.getSenders().find((x) => x.track && x.track.kind === 'audio');
          if (z) { try { await z.replaceTrack(k.uit); } catch (e) {} }
          startMicGainRegeling();
        }
      }
      toast(T('cameraRecovered'));
    } catch (e) {
      // Stil laten mislukken — recoverBabyTrack wordt opnieuw geprobeerd
      // zodra de voorgrond-wacht (visibilitychange) het weer detecteert.
    } finally {
      if (kind === 'video') recoveringVideo = false; else recoveringAudio = false;
    }
  }
  // ---- camerakeuze & LED-lampje (bestuurd vanaf de ouderunit) ----
  // De babyunit somt zijn eigen camera's op en meldt ze aan de ouder; de
  // ouder kiest er een. Het LED-lampje (zaklamp) op ondersteunde toestellen
  // gaat via de torch-capability van het videospoor. Sterkte is geen web-
  // capability: torch is enkel aan/uit.
  let torchOn = false;
  async function reportCameras() {
    if (role !== 'baby' || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const cams = devs.filter((d) => d.kind === 'videoinput').map((d) => ({ id: d.deviceId, label: d.label || '' }));
      // Valt terug op de camera die we zelf geopend hebben: Safari laat
      // deviceId in track.getSettings() nogal eens weg, en dan zou de ouderunit
      // de verkeerde regel in de keuzelijst aanwijzen.
      const vt = localStream && localStream.getVideoTracks()[0];
      const activeId = trackIdent(vt).id || babyCamId || '';
      sendControl({ cmd: 'cameraList', cameras: cams, activeId: activeId });
    } catch (e) {}
  }
  function reportTorch() {
    if (role !== 'baby') return;
    let supported = false;
    const vt = localStream && localStream.getVideoTracks()[0];
    if (vt && vt.getCapabilities) { try { supported = !!vt.getCapabilities().torch; } catch (e) {} }
    if (!supported) torchOn = false;
    sendControl({ cmd: 'torchState', supported: supported, on: torchOn });
  }
  // De ouderunit kiest gericht één camera uit de gemelde lijst. Zelfde regels
  // als babyCycleCamera: oude spoor éérst vrijgeven, dan pas de nieuwe camera
  // aanvragen met { exact: deviceId }, en achteraf verifiëren dat er echt een
  // ánder apparaat actief werd. opts.silentFail onderdrukt de foutmelding.
  // Geeft true terug als de camera echt gewisseld is.
  async function selectCamera(deviceId, opts) {
    opts = opts || {};
    if (role !== 'baby' || !localStream || !deviceId || switchingCam) return false;
    const oldTrack = localStream.getVideoTracks()[0];
    const cur = trackIdent(oldTrack);
    // Al op de gevraagde camera → niets te doen (en zeker niet het spoor
    // onderbreken voor een wissel naar hetzelfde apparaat).
    if (cur.id && cur.id === deviceId) { reportCameras(); reportTorch(); return true; }
    switchingCam = true;
    try {
      const prev = { id: cur.id || babyCamId || '', side: cur.facing || camSideFromLabel(cur.label) || facing };
      const sender = await detachVideoSender();
      if (oldTrack) {
        try { localStream.removeTrack(oldTrack); } catch (e) {}
        try { oldTrack.stop(); } catch (e) {}
      }
      let nt = await openCam({ deviceId: { exact: deviceId } });
      if (nt && oldTrack && sameCamera(trackIdent(nt), cur)) { try { nt.stop(); } catch (e) {} nt = null; }
      if (!nt) {
        await restoreCamera(prev, sender);
        if (!opts.silentFail) { setFlipNote('cameraSwitchFailed', true); toast(T('cameraSwitchFailed')); }
        reportCameras();
        reportTorch();
        return false;
      }
      await attachVideoTrack(nt, sender);
      setFlipNote('cameraSwitched');
      toast(T('cameraSwitched'));
      return true;
    } finally {
      switchingCam = false;
    }
  }
  async function setTorch(on) {
    if (role !== 'baby' || !localStream) return;
    const vt = localStream.getVideoTracks()[0];
    try {
      await vt.applyConstraints({ advanced: [{ torch: !!on }] });
      torchOn = !!on;
      toast(torchOn ? T('ledOn') : T('ledOff'));
    } catch (e) {
      torchOn = false;
    }
    reportTorch();
  }
  async function reportBattery(once) {
    const setB = (txt, sub) => { const b1 = $('bBatt'); if (b1) b1.textContent = txt; const s = $('bBattSub'); if (s && sub != null) s.textContent = sub; };
    if (!('getBattery' in navigator)) { setB('N/A', ''); return; }
    try {
      const b = await navigator.getBattery();
      const upd = () => {
        const pct = Math.round(b.level * 100);
        setB(pct + '%', b.charging ? T('charging') : T('onBattery'));
        sendControl({ cmd: 'battery', level: pct, charging: b.charging });
      };
      upd();
      if (!once) { b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd); }
    } catch (e) { setB('N/A', ''); }
  }
  // ------------------------------------------------------------------ wake lock
  // Houdt het scherm wakker zodat de camera/microfoon niet door het
  // besturingssysteem wordt uitgeschakeld zodra het scherm op slot gaat.
  // Native Wake Lock API waar beschikbaar; anders de klassieke "stil
  // filmpje afspelen"-truc als terugval — dat werkt ook op oudere
  // Android-webviews, desktop Firefox en Safari vóór 16.4, die de Wake
  // Lock API niet kennen. (Kan het hele browser-tabblad op de achtergrond
  // gaan — bv. wisselen naar een andere app — dan is er geen webAPI die
  // dat kan voorkomen; zie de uitgebreide babyTip-tekst hieronder.)
  let wl = null;
  let noSleepVideo = null;
  let wakeLockWatchStarted = false;
  function startNoSleepFallback() {
    if (noSleepVideo) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1; canvas.height = 1;
      canvas.getContext('2d').fillRect(0, 0, 1, 1);
      if (!canvas.captureStream) return;
      const stream = canvas.captureStream(1);
      const v = document.createElement('video');
      v.muted = true; v.loop = true; v.setAttribute('playsinline', '');
      v.style.cssText = 'position:fixed;left:-1px;top:-1px;width:1px;height:1px;opacity:0.01;pointer-events:none;';
      v.srcObject = stream;
      document.body.appendChild(v);
      v.play().catch(() => {});
      noSleepVideo = v;
    } catch (e) {}
  }
  function stopNoSleepFallback() {
    if (!noSleepVideo) return;
    try { noSleepVideo.pause(); noSleepVideo.remove(); } catch (e) {}
    noSleepVideo = null;
  }
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wl = await navigator.wakeLock.request('screen');
        wl.addEventListener('release', () => { wl = null; });
        stopNoSleepFallback();
        return;
      }
    } catch (e) { /* bv. tabblad (nog) niet zichtbaar — val terug op de video-truc */ }
    startNoSleepFallback();
  }
  async function enableWakeLock() {
    await requestWakeLock();
    if (wakeLockWatchStarted) return;
    wakeLockWatchStarted = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
    // Periodieke gezondheidscheck: sommige browsers/energiestanden laten de
    // lock los zonder dat er een zichtbaarheidswijziging plaatsvond.
    setInterval(() => {
      if (document.visibilityState === 'visible' && !wl) requestWakeLock();
    }, 20000);
  }

  // ------------------------------------------------------------------ i18n
  if (window.I18n) {
    I18n.init();
    I18n.buildSelector($('langSelectSetup'));
    I18n.buildSelector($('langSelectParent'));
    I18n.buildSelector($('langSelectBaby'));
    // Bij het wisselen van taal de dynamisch gezette teksten herstellen.
    I18n.onChange(() => {
      const set = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
      if (role === 'parent' && parentStarted) {
        if (controlConn && controlConn.open) set('connText', T('connected'));
        set('liveText', nightMode ? T('nightModeBadge') : T('live'));
        set('talkText', talking ? T('talkActive') : T('talkBack'));
        set('alarmText', T('cryAlert'));
        renderChips();
        renderPlaylist();
        renderEventLog();
        renderCameraSelect();
        renderTorchUI();
      } else if (role === 'baby' && babyStarted) {
        if (controlConn && controlConn.open) set('bConn', T('connected'));
      }
    });
  }

  // ------------------------------------------------------ browser-ondersteuning
  // Zonder WebRTC (RTCPeerConnection + getUserMedia) kan de app helemaal
  // niets — toon dat direct en duidelijk, in plaats van pas te falen zodra
  // iemand een rol kiest. Geen polyfill lost dit op: browsers die deze
  // API's nooit hebben geïmplementeerd (bv. Internet Explorer) kunnen deze
  // app niet draaien. Elke browser met WebRTC-steun (alle gangbare
  // browsers vanaf ~2017: Chrome, Firefox, Safari, Edge, Samsung Internet,
  // Opera, ook oudere versies) werkt gewoon.
  const webrtcSupported = !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (!webrtcSupported) {
    const bb = $('browserBlock');
    if (bb) bb.classList.remove('hidden');
    return; // de rest van de app (koppelen, dashboards) heeft WebRTC nodig
  }

  // ------------------------------------------------------------------ wiring

  // Zijbalknavigatie: elke knop toont zijn eigen deelweergave.
  const VIEW_IDS = { monitor: 'dviewMonitor', talk: 'dviewTalk', lullabies: 'dviewLullabies', night: 'dviewNight', alerts: 'dviewAlerts', log: 'dviewLog', settings: 'dviewSettings' };
  document.querySelectorAll('.dnav').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.dnav').forEach((x) => x.classList.toggle('active', x === b));
      Object.keys(VIEW_IDS).forEach((k) => {
        const p = $(VIEW_IDS[k]);
        if (p) p.classList.toggle('active', k === b.dataset.view);
      });
    });
  });
  document.querySelectorAll('#screenParent .dash-gear').forEach((g) => {
    g.addEventListener('click', () => {
      const btn = document.querySelector('.dnav[data-view="settings"]');
      if (btn) btn.click();
    });
  });

  $('pickBaby').onclick = startBaby;
  $('pickParent').onclick = () => { role = 'parent'; showScreen('screenPairParent'); $('parentOfferInput').focus(); };
  // Landing: direct koppelen met code of QR (gaan via de bestaande ouder-flow)
  if ($('homeConnect')) $('homeConnect').onclick = () => {
    const v = ($('homeCode').value || '').trim();
    if (!v) { $('homeCode').focus(); return; }
    $('parentOfferInput').value = v;
    role = 'parent'; showScreen('screenPairParent');
    startParentConnect(v);
  };
  if ($('homeScan')) $('homeScan').onclick = () => {
    role = 'parent'; showScreen('screenPairParent');
    $('parentOfferInput').focus();
    if ($('parentScanBtn')) $('parentScanBtn').click();
  };
  // Decoratieve QR op het startscherm (er is nog geen actieve kamercode vóór
  // het koppelen); encodeert de eigen site-URL zodat scannen nooit stukloopt.
  // De knop op de landingspagina opent de scanner; daar hoort een scan-icoon,
  // geen QR-code van de homepage (die was klein, korrelig en nergens voor nodig).
  $('babyBack').onclick = (e) => { e.preventDefault(); location.reload(); };
  $('parentBack').onclick = (e) => { e.preventDefault(); location.reload(); };
  $('copyBabyOffer').onclick = () => copyText($('babyOfferCode').value);
  $('babyNewCode').onclick = () => openBabyPeer();
  $('parentGenBtn').onclick = () => startParentConnect();
  if ($('phRetry')) $('phRetry').onclick = () => {
    reconnectAttempt = 0;
    setPlaceholderSpinner(true);
    setParentStatus(T('connecting'));
    startParentConnect(currentCode, true);
  };
  $('parentOfferInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') startParentConnect(); });
  // QR groot maken door erop te tikken (veel makkelijker te scannen)
  $('babyQR').onclick = () => openQrZoom($('babyQR').dataset.code);
  $('qrZoomClose').onclick = closeQrZoom;
  $('qrZoom').onclick = (e) => { if (e.target === $('qrZoom') || e.target === $('qrZoomClose')) closeQrZoom(); };
  $('parentScanBtn').onclick = () => {
    $('parentScanWrap').classList.remove('hidden');
    startScanner($('parentScanVideo'), (data) => {
      $('parentScanWrap').classList.add('hidden');
      $('parentOfferInput').value = data;
      startParentConnect(data);
    });
  };

  // Gescande QR opent de app als ouder en verbindt automatisch.
  // De QR bevat "#CODE.token": de korte kamercode plus het toegangstoken.
  // Een oudere QR (alleen "#CODE") blijft ook werken; dan vraagt de babyunit
  // om toestemming, precies zoals bij handmatig intypen.
  laadEigenIce();

  (function autoJoinFromHash() {
    const h = (location.hash || '').replace(/^#/, '').trim();
    if (!h) return;
    if (!/^[A-Za-z0-9]{4,12}(\.[A-Za-z0-9]{8,64})?$/.test(h)) return;
    role = 'parent';
    showScreen('screenPairParent');
    // In het invoerveld hoort alleen de leesbare code, niet het token.
    $('parentOfferInput').value = h.split('.')[0].toUpperCase();
    startParentConnect(h);
  })();

  // ---------------------------------------------------------- toegankelijkheid
  // Alle inline SVG's zijn decoratief; knoppen dragen tekst of aria-label.
  document.querySelectorAll('svg').forEach((s) => s.setAttribute('aria-hidden', 'true'));
  // Div-gebaseerde schakelaars en kaarten ook met het toetsenbord bedienbaar.
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.matches &&
        e.target.matches('[role="switch"], [role="button"]:not(button)')) {
      e.preventDefault();
      e.target.click();
    }
  });
  // aria-checked meebewegen met de visuele switch-status.
  document.addEventListener('click', (e) => {
    const row = e.target && e.target.closest && e.target.closest('[role="switch"]');
    if (row) {
      const sw = row.querySelector('.switch');
      if (sw) row.setAttribute('aria-checked', sw.classList.contains('on') ? 'true' : 'false');
    }
  });

  document.addEventListener('pointerdown', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    const v = $('video'); if (v) v.play().catch(() => {});
  }, { once: true });

  // ------------------------------------------------ voorgrond-wacht (herstel na scherm-uit/achtergrond)
  // Mobiele browsers bevriezen timers en kunnen camera/mic onderbreken
  // zodra het tabblad verborgen is (scherm op slot, even een andere app
  // ervoor). Een lopende herverbindingspoging kan daardoor "vastzitten" in
  // een oude staat. Bij terugkeer naar de voorgrond controleren we de
  // echte status en grijpen we meteen in — in plaats van te wachten op een
  // wachttijd die intussen zinloos is geworden. Dit is de directe fix voor
  // "herverbinden blijft laden, geen beeld meer" na scherm-uit.
  function checkParentHealthOnResume() {
    if (shuttingDown || role !== 'parent' || !parentStarted) return;
    // Nog nooit verbonden geweest en geen poging onderweg: laat de normale
    // flow (of de expliciete mislukt-status met hertik-knop) met rust.
    if (!wasConnected && !reconnectTimer && !connectTimer) return;
    const pcOk = mediaPc && mediaPc.connectionState === 'connected';
    const trackOk = remoteStream && remoteStream.getVideoTracks().some((t) => t.readyState === 'live');
    const heartbeatOk = (Date.now() - lastControlAt) < HEARTBEAT_TIMEOUT * 2;
    if (pcOk && trackOk && heartbeatOk && !reconnectTimer) return; // gezond, niets doen
    clearConnectTimers();
    reconnectAttempt = 0;
    startParentConnect(currentCode, true);
  }
  function checkBabyHealthOnResume() {
    if (shuttingDown || role !== 'baby' || !localStream) return;
    localStream.getTracks().forEach((t) => { if (t.readyState === 'ended') recoverBabyTrack(t.kind); });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Een AudioContext die opgeschort blijft na terugkeer uit de
      // achtergrond bevriest de geluidsmeter en daarmee het huilalarm.
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      if (role === 'parent') { const v = $('video'); if (v) v.play().catch(() => {}); }
      checkParentHealthOnResume();
      checkBabyHealthOnResume();
    }
  });
  // Sommige (vooral oudere iOS Safari-)versies vuren visibilitychange niet
  // altijd betrouwbaar; pageshow/focus als extra vangnet.
  window.addEventListener('pageshow', () => { checkParentHealthOnResume(); checkBabyHealthOnResume(); });
  window.addEventListener('focus', () => { checkParentHealthOnResume(); checkBabyHealthOnResume(); });

  window.addEventListener('pagehide', () => {
    shuttingDown = true;
    if (recorder) try { recorder.stop(); } catch (e) {}
    if (peer) try { peer.destroy(); } catch (e) {}
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
  });
})();
