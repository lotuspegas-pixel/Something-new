'use strict';

/**
 * Serverloze babyfoon — Luna Unit.
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
  // Project is de best-effort standaard; vervang voor productie/Plus door
  // een eigen TURN-dienst via window.BABYFOON_ICE of window.BABYFOON_PEER.
  const ICE = window.BABYFOON_ICE ||
    ((window.Plus && Plus.isActive() && Plus.config && Plus.config.turn)
      // Plus: dedicated relay van de eigenaar (betrouwbaarder dan best-effort)
      ? [{ urls: 'stun:stun.l.google.com:19302' }, Plus.config.turn]
      : [
        { urls: 'stun:stun.l.google.com:19302' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turns:openrelay.metered.ca:443?transport=tcp',
          ],
          username: 'openrelayproject',
          credential: 'openrelayproject',
        },
      ]);
  const $ = (id) => document.getElementById(id);
  const T = (k) => (window.I18n ? window.I18n.t(k) : k);
  // Slaapmuziek-ID → i18n-sleutel (labels worden vertaald weergegeven).
  const TRACK_I18N = { regen: 'trackRain', oceaan: 'trackOcean', hartslag: 'trackHeartbeat', witte: 'trackWhite' };
  const trackLabel = (tr) => T(TRACK_I18N[tr.id] || tr.id);

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
  function peerOptions() {
    const opts = { config: { iceServers: ICE }, debug: 0 };
    if (window.BABYFOON_PEER) Object.assign(opts, window.BABYFOON_PEER);
    return opts;
  }

  // ------------------------------------------------------------------ state
  let role = null;
  let peer = null;
  let controlConn = null;   // PeerJS DataConnection (besturingskanaal)
  let mediaPc = null;       // onderliggende RTCPeerConnection (voor statistieken)
  let localStream = null;
  let remoteStream = null;
  let currentCode = null;
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
    conn.on('close', onPeerDrop);
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
  }
  function onPeerDrop() {
    if (shuttingDown) return;
    if (role === 'parent') {
      $('connDot').classList.add('off');
      $('connText').textContent = T('connectionLost');
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
  }
  function setParentStatus(txt) {
    const el = $('connText'); if (el) el.textContent = txt;
    const ph = $('phText'); if (ph) ph.textContent = txt;
  }
  function setPlaceholderSpinner(on) {
    const sp = document.querySelector('#placeholder .spinner');
    if (sp) sp.classList.toggle('hidden', !on);
    const rb = $('phRetry'); if (rb) rb.classList.toggle('hidden', on);
  }
  // Expliciete mislukt-status in plaats van eindeloos "Verbinden…".
  function connectFailed(msgKey) {
    clearConnectTimers();
    const msg = T(msgKey || 'connectFailed');
    const pcn = $('parentConnecting'); if (pcn) pcn.classList.add('hidden');
    const err = $('parentError');
    if (err) { err.textContent = msg; err.classList.remove('hidden'); }
    if (parentStarted) {
      $('connDot').classList.add('off');
      setParentStatus(msg);
      $('placeholder').classList.remove('hidden');
      setPlaceholderSpinner(false);
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
  function connectSucceeded() {
    clearConnectTimers();
    reconnectAttempt = 0;
    wasConnected = true;
    lastControlAt = Date.now();
    const err = $('parentError'); if (err) err.classList.add('hidden');
    setPlaceholderSpinner(true);
  }
  // Het 'close'-event van het datakanaal blijft bij een onnette verbreking
  // (wifi weg, batterij leeg, browser gedood) soms uit. Daarom bewaken we
  // ook de onderliggende RTCPeerConnection-status…
  function watchMediaPc(pc) {
    if (!pc || pc.__bfWatched) return;
    pc.__bfWatched = true;
    pc.addEventListener('connectionstatechange', () => {
      if (shuttingDown) return;
      if (pc.connectionState === 'failed') { onPeerDrop(); return; }
      if (pc.connectionState === 'disconnected') {
        // ICE krijgt even om zelf te herstellen; daarna als verbroken behandelen.
        setTimeout(() => {
          if (!shuttingDown && pc.connectionState === 'disconnected') onPeerDrop();
        }, 4000);
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

  // ------------------------------------------------------------------ besturingscommando's
  function handleControl(msg) {
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
          if (msg.action === 'stop') babyStopMusic();
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
        case 'flip':
          flipCamera();
          break;
        case 'ping':
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
  function openBabyPeer() {
    if (peer) { try { peer.destroy(); } catch (e) {} }
    const code = makeCode(6);
    currentCode = code;
    $('babyCodeText').textContent = '······';
    peer = new Peer(PEER_PREFIX + code, peerOptions());
    peer.on('open', () => {
      babyBrokerAttempt = 0;
      $('babyCodeText').textContent = code;
      $('babyOfferCode').value = code;
      const url = location.href.split('#')[0] + '#' + code;
      renderQR('babyQR', url);
    });
    peer.on('connection', (conn) => {
      attachControl(conn);
      conn.on('open', () => {
        try {
          const call = peer.call(conn.peer, localStream);
          if (call) { mediaPc = call.peerConnection || mediaPc; watchMediaPc(mediaPc); }
        } catch (e) {}
        babyConnected();
        reportBattery();
      });
    });
    peer.on('call', (call) => {
      // terugpraten van de ouder (audio) → afspelen bij de baby
      call.answer();
      if (!mediaPc) { mediaPc = call.peerConnection || mediaPc; watchMediaPc(mediaPc); }
      call.on('stream', playTalkback);
    });
    peer.on('disconnected', () => {
      // Broker kwijt: opnieuw aanmelden met oplopende wachttijd, zodat de
      // kamercode geldig blijft en de ouderunit kan herverbinden.
      if (shuttingDown) return;
      const d = RECONNECT_DELAYS[Math.min(babyBrokerAttempt++, RECONNECT_DELAYS.length - 1)];
      setTimeout(() => { if (!shuttingDown) { try { peer.reconnect(); } catch (e) {} } }, d);
    });
    peer.on('error', (err) => onPeerError(err, 'baby'));
  }
  async function startBaby() {
    role = 'baby';
    showScreen('screenPairBaby');
    try {
      localStream = await getMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } },
      });
    } catch (e) {
      toast(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? T('permissionDenied') : (e.message || T('mediaError')));
      showScreen('screenSetup');
      role = null;
      return;
    }
    $('bPreview').srcObject = localStream;
    openBabyPeer();
  }

  // ------------------------------------------------------------------ koppelen: ouder
  async function startParentConnect(rawCode, isRetry) {
    let code = (rawCode != null ? rawCode : $('parentOfferInput').value || '').trim();
    if (code.indexOf('#') >= 0) code = code.slice(code.lastIndexOf('#') + 1).trim();
    code = code.toUpperCase();
    if (!code) return toast(T('pastePairFirst'));
    currentCode = code; // toon de kamercode in het ouderdashboard
    role = 'parent';
    if (!isRetry) { reconnectAttempt = 0; }
    const err0 = $('parentError'); if (err0) err0.classList.add('hidden');
    const pcn = $('parentConnecting');
    if (pcn) pcn.classList.remove('hidden');
    // Bij herverbinden: oude peer volledig opruimen en opnieuw beginnen.
    if (peer) { try { peer.destroy(); } catch (e) {} peer = null; controlConn = null; mediaPc = null; }
    if (!micStream && !talkDisabled) {
      try {
        micStream = await getMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
      } catch (e) { talkDisabled = true; }
    }
    // Nooit eindeloos "Verbinden…": na 20 s expliciet mislukt of opnieuw.
    clearConnectTimers();
    connectTimer = setTimeout(() => {
      if (controlConn && controlConn.open) return;
      if (wasConnected || isRetry) scheduleParentReconnect();
      else connectFailed();
    }, CONNECT_TIMEOUT);
    const babyId = PEER_PREFIX + code;
    peer = new Peer(peerOptions());
    peer.on('open', () => {
      const conn = peer.connect(babyId, { reliable: true });
      attachControl(conn);
      conn.on('open', () => {
        connectSucceeded();
        parentConnected();
        if (micStream) {
          try {
            micStream.getAudioTracks().forEach((t) => (t.enabled = talking));
            const tcall = peer.call(babyId, micStream);
            if (tcall && !mediaPc) { mediaPc = tcall.peerConnection || mediaPc; watchMediaPc(mediaPc); }
          } catch (e) {}
        }
      });
    });
    peer.on('call', (call) => {
      // videobeeld van de baby
      call.answer();
      mediaPc = call.peerConnection || mediaPc;
      watchMediaPc(mediaPc);
      call.on('stream', (s) => {
        remoteStream = s;
        $('video').srcObject = s;
        $('video').play().catch(() => {});
        setupAnalyser(s);
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
  let audioCtx = null;
  let analyser = null;
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
  const tracks = LullabyPlayer.list();
  let trackIndex = 0;
  let playing = false;
  let vuBars = [];

  // muziek-playlist (mp3's uit de map "music/")
  let musicList = null;       // [{ file, title }]
  let musicIndex = 0;
  let musicPlaying = false;   // ouder: spiegelt de babyunit-status
  let musicAudio = null;      // baby: <audio>-element
  let musicBabyPlaying = false;
  let musicErr = 0;

  function setupAnalyser(stream) {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
      }
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const src = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.6;
      src.connect(analyser);
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
      musicAudio.addEventListener('ended', () => babyPlayMusic(musicIndex + 1));
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
  async function renderPlaylist() {
    const box = $('playlist');
    if (!box) return;
    const list = await loadPlaylist();
    box.replaceChildren();
    if (!list.length) {
      const d = document.createElement('div');
      d.className = 'playlist-empty';
      d.textContent = T('musicEmpty');
      box.appendChild(d);
      updateMusicUI();
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
    updateMusicUI();
  }
  function updateMusicUI() {
    const btn = $('btnMusic');
    if (!btn) return;
    btn.classList.toggle('on', musicPlaying);
    $('musicBtnText').textContent = musicPlaying ? T('musicStop') : T('musicPlay');
    btn.querySelector('.ic-play').classList.toggle('hidden', musicPlaying);
    btn.querySelector('.ic-stop').classList.toggle('hidden', !musicPlaying);
    $('playlist').querySelectorAll('.track').forEach((r, i) =>
      r.classList.toggle('on', musicPlaying && i === musicIndex));
  }
  function parentPlayMusic(i) {
    if (musicPlaying && i === musicIndex) { parentStopMusic(); return; }
    musicIndex = i; musicPlaying = true;
    sendControl({ cmd: 'music', action: 'play', index: i });
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
      recorder = null;
      await saveBlob(blob, prefix, (blob.type || '').includes('mp4') ? 'mp4' : 'webm');
    };
    recorder.start(1000);
    btn.classList.add('active');
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
  function startParentDevice() {
    if (parentStarted) return;
    parentStarted = true;
    vuBars = $('vu') ? Array.from($('vu').querySelectorAll('i')) : [];
    buildAudioMeter();
    if (talkDisabled) { $('btnTalk').style.opacity = 0.5; }
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
      if (!micStream) return toast(T('noMic'));
      talking = !talking;
      micStream.getAudioTracks().forEach((t) => (t.enabled = talking));
      setTalkUI();
      if (talking) addEvent('talk', T('evTalk'), T('evTalkSub'));
    };
    $('btnTalk').onclick = toggleTalk;
    if ($('talkBig')) $('talkBig').onclick = toggleTalk;
    // Lullaby (eerste slaapliedje aan/uit)
    $('btnLullaby').onclick = () => {
      if (playing) { sendStop(); $('btnLullaby').classList.remove('on'); }
      else { trackIndex = 0; sendPlay(); $('btnLullaby').classList.add('on'); addEvent('lullaby', T('evLullaby'), tracks[0] ? trackLabel(tracks[0]) : ''); }
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
    const rl2 = $('roomLabel2'); if (rl2) rl2.textContent = currentCode || 'P2P';
    // Stop
    $('btnStop').onclick = () => { if (confirm(T('stopParentQ'))) { shuttingDown = true; location.reload(); } };
    // Fullscreen
    $('btnFullscreen').onclick = () => {
      const v = $('video');
      if (v.webkitEnterFullscreen && !document.fullscreenElement) { try { v.webkitEnterFullscreen(); return; } catch (e) {} }
      if (!document.fullscreenElement) ($('screen').requestFullscreen || $('screen').webkitRequestFullscreen)?.call($('screen'));
      else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
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
    if (code) renderQR('babyDashQR', location.href.split('#')[0] + '#' + code, 3);
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

    $('bStop').onclick = () => { if (confirm(T('stopBabyQ'))) { shuttingDown = true; location.reload(); } };
    enableWakeLock();
    reportBattery();
  }
  async function flipCamera() {
    facing = facing === 'environment' ? 'user' : 'environment';
    try {
      const ns = await getMedia({ audio: false, video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } });
      const nt = ns.getVideoTracks()[0];
      const ot = localStream.getVideoTracks()[0];
      const sender = mediaPc && mediaPc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(nt);
      if (ot) { localStream.removeTrack(ot); ot.stop(); }
      localStream.addTrack(nt);
      $('bPreview').srcObject = localStream;
      toast(T('cameraSwitched'));
    } catch (e) {
      facing = facing === 'environment' ? 'user' : 'environment';
      toast(T('cannotSwitch'));
    }
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
  let wl = null;
  async function enableWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wl = await navigator.wakeLock.request('screen');
        document.addEventListener('visibilitychange', async () => {
          if (document.visibilityState === 'visible' && !wl) {
            try { wl = await navigator.wakeLock.request('screen'); } catch (e) {}
          }
        });
      }
    } catch (e) {}
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
      } else if (role === 'baby' && babyStarted) {
        if (controlConn && controlConn.open) set('bConn', T('connected'));
      }
    });
  }

  // ------------------------------------------------------------------ wiring
  // ------------------------------------------------------------- Plus (P2.2)
  (function initPlusUI() {
    if (!window.Plus) return;
    const st = $('plusState'), up = $('plusUpgrade'), mg = $('plusManage'), rs = $('plusRestore');
    const cfg = Plus.config;
    const paint = () => {
      if (!st) return;
      if (Plus.isActive()) {
        st.textContent = T('plusActive'); st.classList.add('ok'); st.classList.remove('hidden');
        if (up) up.classList.add('hidden');
        if (mg && cfg && cfg.portalUrl) mg.classList.remove('hidden');
        if (rs) rs.classList.add('hidden');
      } else if (Plus.configured()) {
        st.classList.add('hidden');
        if (up) up.classList.remove('hidden');
        if (rs && cfg.verifyUrl) rs.classList.remove('hidden');
      } // niet geconfigureerd: rustige "binnenkort"-status, niets kapot
    };
    if (up) up.onclick = async () => {
      const email = prompt(T('plusEmailQ'));
      if (!email) return;
      try {
        const r = await fetch(cfg.checkoutUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) });
        const d = await r.json();
        if (d && d.url) location.href = d.url; else toast(T('plusError'));
      } catch (e) { toast(T('plusError')); }
    };
    if (mg) mg.onclick = async () => {
      const rec = Plus.read();
      const email = (rec && rec.email) || prompt(T('plusEmailQ'));
      if (!email) return;
      try {
        const r = await fetch(cfg.portalUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email }) });
        const d = await r.json();
        if (d && d.url) location.href = d.url; else toast(T('plusError'));
      } catch (e) { toast(T('plusError')); }
    };
    if (rs) rs.onclick = async () => {
      const email = prompt(T('plusEmailQ'));
      if (!email) return;
      const ok = await Plus.restore(email).catch(() => false);
      toast(ok ? T('plusActive') : T('plusNotFound'));
      paint();
    };
    // Terug uit Stripe Checkout (?plus_session=…): token ophalen met de sessie.
    try {
      const q = new URLSearchParams(location.search);
      const sess = q.get('plus_session');
      if (sess && cfg && cfg.verifyUrl) {
        fetch(cfg.verifyUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sess }) })
          .then((r) => r.json())
          .then((d) => { if (d && d.token) { Plus.store(d.token); toast(T('plusActive')); paint(); } })
          .catch(() => {});
        q.delete('plus_session');
        const rest = q.toString();
        history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
      }
    } catch (e) {}
    paint();
  })();

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
  if ($('homeQrPreview')) QRKit.render('homeQrPreview', location.href.split('#')[0], 4);
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

  // Gescande QR met #code opent de app als ouder en verbindt automatisch.
  (function autoJoinFromHash() {
    const h = (location.hash || '').replace(/^#/, '').trim();
    if (h && /^[A-Za-z0-9]{4,12}$/.test(h)) {
      role = 'parent';
      showScreen('screenPairParent');
      $('parentOfferInput').value = h.toUpperCase();
      startParentConnect(h);
    }
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

  window.addEventListener('pagehide', () => {
    shuttingDown = true;
    if (recorder) try { recorder.stop(); } catch (e) {}
    if (peer) try { peer.destroy(); } catch (e) {}
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
  });
})();
