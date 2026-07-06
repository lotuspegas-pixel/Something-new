'use strict';

/**
 * Serverloze babyfoon — Luna Unit.
 *
 * Twee apparaten koppelen zichzelf via een QR-code of koppelcode (handmatige
 * WebRTC-signalering). Daarna loopt beeld en geluid rechtstreeks peer-to-peer,
 * zonder enige server. De QR-code wordt volledig in de browser gemaakt.
 */
(function () {
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
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
  }
  async function getMedia(c) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(T('mediaError'));
    }
    return navigator.mediaDevices.getUserMedia(c);
  }
  function renderQR(containerId, text, cell) {
    const box = $(containerId);
    if (box.dataset) box.dataset.code = text;
    try {
      const qr = qrcode(0, 'L');
      qr.addData(text);
      qr.make();
      box.innerHTML = qr.createImgTag(cell || 4, 8);
    } catch (e) {
      box.innerHTML =
        '<div style="color:#333;font-size:12px;text-align:center;padding:10px">' + T('copyCode') + '</div>';
    }
  }
  // Toon de QR groot op het volledige scherm zodat een camera hem makkelijk leest.
  function openQrZoom(text) {
    if (!text) return;
    renderQR('qrZoomBox', text, 10);
    $('qrZoom').classList.remove('hidden');
  }
  function closeQrZoom() { $('qrZoom').classList.add('hidden'); }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast(T('copied'));
    } catch (e) {
      toast(T('copyFail'));
    }
  }
  let scannerStop = null;
  async function startScanner(videoEl, onResult) {
    stopScanner();
    let stream;
    try {
      stream = await getMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) {
      toast(T('scanFail'));
      return;
    }
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
    const canvas = $('scratch');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    let stopped = false;
    scannerStop = () => {
      stopped = true;
      stream.getTracks().forEach((t) => t.stop());
      scannerStop = null;
    };
    (function loop() {
      if (stopped) return;
      if (videoEl.readyState >= 2 && videoEl.videoWidth) {
        canvas.width = videoEl.videoWidth;
        canvas.height = videoEl.videoHeight;
        ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (res && res.data) {
          scannerStop();
          onResult(res.data);
          return;
        }
      }
      requestAnimationFrame(loop);
    })();
  }
  function stopScanner() {
    if (scannerStop) scannerStop();
  }
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
    conn.on('data', (d) => { if (d && typeof d === 'object') handleControl(d); });
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
    $('bConn').textContent = T('connectedToParent');
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
    sendControl({ cmd: 'ping' });
  }
  function onPeerDrop() {
    if (role === 'parent') {
      $('connDot').classList.add('off');
      $('connText').textContent = T('connectionLost');
    } else if (role === 'baby') {
      $('bConnDot').classList.add('off');
      $('bConn').textContent = T('connectionLost');
    }
  }

  // ------------------------------------------------------------------ besturingscommando's
  function handleControl(msg) {
    if (role === 'baby') {
      switch (msg.cmd) {
        case 'lullaby':
          if (msg.on) { babyStopMusic(); lullaby.play(msg.id); }
          else lullaby.stop();
          sendControl({ cmd: 'lullabyState', id: lullaby.isPlaying() ? lullaby.currentName() : null });
          break;
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
        $('babyBatt').textContent = '🔋 ' + msg.level + '%' + (msg.charging ? '⚡' : '');
      } else if (msg.cmd === 'lullabyState') {
        playing = !!msg.id;
        if (msg.id) {
          const i = tracks.findIndex((t) => t.id === msg.id);
          if (i >= 0) trackIndex = i;
        }
        renderChips();
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
  function openBabyPeer() {
    if (peer) { try { peer.destroy(); } catch (e) {} }
    const code = makeCode(6);
    currentCode = code;
    $('babyCodeText').textContent = '······';
    peer = new Peer(PEER_PREFIX + code, peerOptions());
    peer.on('open', () => {
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
          if (call) mediaPc = call.peerConnection || mediaPc;
        } catch (e) {}
        babyConnected();
        reportBattery();
      });
    });
    peer.on('call', (call) => {
      // terugpraten van de ouder (audio) → afspelen bij de baby
      call.answer();
      if (!mediaPc) mediaPc = call.peerConnection || mediaPc;
      call.on('stream', playTalkback);
    });
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) {} });
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
      toast(e.message || T('mediaError'));
      showScreen('screenSetup');
      role = null;
      return;
    }
    $('bPreview').srcObject = localStream;
    openBabyPeer();
  }

  // ------------------------------------------------------------------ koppelen: ouder
  async function startParentConnect(rawCode) {
    let code = (rawCode != null ? rawCode : $('parentOfferInput').value || '').trim();
    if (code.indexOf('#') >= 0) code = code.slice(code.lastIndexOf('#') + 1).trim();
    code = code.toUpperCase();
    if (!code) return toast(T('pastePairFirst'));
    role = 'parent';
    const pcn = $('parentConnecting');
    if (pcn) pcn.classList.remove('hidden');
    try {
      micStream = await getMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (e) { talkDisabled = true; }
    const babyId = PEER_PREFIX + code;
    peer = new Peer(peerOptions());
    peer.on('open', () => {
      const conn = peer.connect(babyId, { reliable: true });
      attachControl(conn);
      conn.on('open', () => {
        parentConnected();
        if (micStream) {
          try {
            micStream.getAudioTracks().forEach((t) => (t.enabled = false));
            const tcall = peer.call(babyId, micStream);
            if (tcall && !mediaPc) mediaPc = tcall.peerConnection || mediaPc;
          } catch (e) {}
        }
      });
    });
    peer.on('call', (call) => {
      // videobeeld van de baby
      call.answer();
      mediaPc = call.peerConnection || mediaPc;
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
      const pcn = $('parentConnecting');
      if (pcn) pcn.classList.add('hidden');
      role = null;
      toast(T('invalidPair'));
      return;
    }
    if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
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
    $('dbText').textContent = Math.round(30 + level * 0.55) + ' dB';
    const threshold = 100 - sensitivity;
    const now = Date.now();
    if (alarmOn && level > threshold) {
      $('cryAlert').classList.remove('hidden');
      if (now > alarmCooldown) { alarmCooldown = now + 6000; triggerAlarm(); }
    } else if (now > alarmCooldown - 5000) {
      $('cryAlert').classList.add('hidden');
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
    $('zoomVal').textContent = zoom.toFixed(1) + '×';
  }
  function applyVolume() {
    $('video').volume = muted ? 0 : volume / 100;
    $('video').muted = muted || volume === 0;
    $('volHub').textContent = muted ? '⌀' : volume;
    $('volNeedle').style.transform = 'translateX(-50%) rotate(' + (-120 + (volume / 100) * 240) + 'deg)';
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
    box.innerHTML = '';
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
    box.innerHTML = '';
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
      row.innerHTML = '<span class="n">' + (i + 1) + '</span><span class="tt"></span><span class="eq"><i></i><i></i><i></i></span>';
      row.querySelector('.tt').textContent = s.title;
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

  let parentStarted = false;
  function startParentDevice() {
    if (parentStarted) return;
    parentStarted = true;
    vuBars = Array.from($('vu').querySelectorAll('i'));
    if (talkDisabled) { $('btnTalk').style.opacity = 0.45; }

    applyVolume(); applyVideoFilter(); applyZoom();
    setSliderKnob($('sBrightness'), (brightness - 30) / 100);
    setSliderKnob($('sNightlight'), nightlightLevel / 100);
    setSliderKnob($('sSensitivity'), sensitivity / 100);
    $('briReadout').textContent = brightness + '%';
    $('nlReadout').textContent = nightlightOn ? nightlightLevel + '%' : T('off');
    $('sensReadout').textContent = sensitivity + '%';
    renderChips();
    renderPlaylist();

    $('btnMusic').onclick = () => {
      if (musicPlaying) parentStopMusic();
      else parentPlayMusic(musicIndex || 0);
    };
    $('btnPower').onclick = () => { if (confirm(T('stopParentQ'))) location.reload(); };
    $('btnNightmode').onclick = () => {
      // Nachtstand: dimt het eigen beeld EN zet het nachtlampje bij de
      // babyunit aan/uit — één druk op de knop voor beide.
      nightMode = !nightMode;
      nightlightOn = nightMode;
      $('btnNightmode').classList.toggle('on', nightMode);
      applyVideoFilter();
      $('liveText').textContent = nightMode ? T('nightModeBadge') : T('live');
      $('nlReadout').textContent = nightlightOn ? nightlightLevel + '%' : T('off');
      sendNightlightState();
    };
    $('btnFlip').onclick = () => { sendControl({ cmd: 'flip' }); toast(T('cameraSwitched')); };
    $('btnSnapshot').onclick = () => {
      if (!$('video').videoWidth) return toast(T('noImage'));
      $('snapFlash').classList.remove('hidden');
      setTimeout(() => $('snapFlash').classList.add('hidden'), 250);
      const c = $('scratch');
      c.width = $('video').videoWidth; c.height = $('video').videoHeight;
      c.getContext('2d').drawImage($('video'), 0, 0, c.width, c.height);
      c.toBlob((b) => b && saveBlob(b, 'babyfoon-foto', 'png'), 'image/png');
    };
    $('btnFullscreen').onclick = () => {
      // iOS Safari ondersteunt geen Fullscreen API op een <div> — alleen op
      // het <video>-element zelf via de eigen (webkit) videofullscreen.
      const v = $('video');
      if (v.webkitEnterFullscreen && !document.fullscreenElement) {
        try { v.webkitEnterFullscreen(); return; } catch (e) { /* val terug */ }
      }
      if (!document.fullscreenElement) ($('screen').requestFullscreen || $('screen').webkitRequestFullscreen)?.call($('screen'));
      else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    };
    $('btnFsClose').onclick = () => (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    document.addEventListener('fullscreenchange', () => {
      const fs = !!document.fullscreenElement;
      $('screen').classList.toggle('fs', fs);
      $('btnFsClose').classList.toggle('hidden', !fs);
    });
    $('zoomIn').onclick = () => { zoom = Math.min(3, Math.round((zoom + 0.2) * 10) / 10); applyZoom(); };
    $('zoomOut').onclick = () => { zoom = Math.max(1, Math.round((zoom - 0.2) * 10) / 10); applyZoom(); };
    $('btnTalk').onclick = () => {
      if (!micStream) return toast(T('noMic'));
      talking = !talking;
      micStream.getAudioTracks().forEach((t) => (t.enabled = talking));
      $('btnTalk').classList.toggle('on', talking);
      $('talkText').textContent = talking ? T('talkActive') : T('talkIdle');
    };
    $('btnMute').onclick = () => {
      muted = !muted;
      $('btnMute').classList.toggle('active', muted);
      applyVolume();
    };
    $('btnAlarm').onclick = () => {
      alarmOn = !alarmOn;
      $('btnAlarm').classList.toggle('off', !alarmOn);
      $('alarmText').textContent = alarmOn ? T('alarmOn') : T('alarmOff');
      if (!alarmOn) $('cryAlert').classList.add('hidden');
    };
    $('btnRecord').onclick = () => toggleRecord(remoteStream, $('btnRecord'), 'babyfoon-opname');

    bindVertical($('volDial'), (pct) => { volume = Math.round(pct * 100); muted = false; $('btnMute').classList.remove('active'); applyVolume(); });
    bindVertical($('sBrightness'), (pct) => applySlider('sBrightness', pct));
    bindVertical($('sNightlight'), (pct) => applySlider('sNightlight', pct));
    bindVertical($('sSensitivity'), (pct) => applySlider('sSensitivity', pct));

    const clock = () => ($('clock').textContent =
      String(new Date().getHours()).padStart(2, '0') + ':' + String(new Date().getMinutes()).padStart(2, '0'));
    clock(); setInterval(clock, 10000);
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
    $('bFlip').onclick = flipCamera;
    $('bMic').onclick = () => {
      micOn = !micOn;
      localStream.getAudioTracks().forEach((t) => (t.enabled = micOn));
      $('bMic').classList.toggle('active', micOn);
      $('bMic').querySelector('.ic').textContent = micOn ? '🎙️' : '🔇';
    };
    $('bRecord').onclick = () => toggleRecord(localStream, $('bRecord'), 'babyunit-opname');
    $('bStop').onclick = () => { if (confirm(T('stopBabyQ'))) location.reload(); };
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
    if (!('getBattery' in navigator)) { $('bBatt').textContent = '🔋 N/A'; return; }
    try {
      const b = await navigator.getBattery();
      const upd = () => {
        const pct = Math.round(b.level * 100);
        $('bBatt').textContent = '🔋 ' + pct + '%' + (b.charging ? '⚡' : '');
        sendControl({ cmd: 'battery', level: pct, charging: b.charging });
      };
      upd();
      if (!once) { b.addEventListener('levelchange', upd); b.addEventListener('chargingchange', upd); }
    } catch (e) { $('bBatt').textContent = '🔋 N/A'; }
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
    // Bij het wisselen van taal de dynamisch gezette teksten herstellen
    // volgens de huidige status (apply() zet ze eerst terug op de standaard).
    I18n.onChange(() => {
      if (role === 'parent' && parentStarted) {
        if (controlConn && controlConn.open) $('connText').textContent = T('connected');
        $('liveText').textContent = nightMode ? T('nightModeBadge') : T('live');
        $('talkText').textContent = talking ? T('talkActive') : T('talkIdle');
        $('alarmText').textContent = alarmOn ? T('alarmOn') : T('alarmOff');
        $('nlReadout').textContent = nightlightOn ? nightlightLevel + '%' : T('off');
        renderChips();
        renderPlaylist();
      } else if (role === 'baby' && babyStarted) {
        if (controlConn && controlConn.open) $('bConn').textContent = T('connectedToParent');
      }
    });
  }

  // ------------------------------------------------------------------ wiring
  $('pickBaby').onclick = startBaby;
  $('pickParent').onclick = () => { role = 'parent'; showScreen('screenPairParent'); $('parentOfferInput').focus(); };
  $('babyBack').onclick = (e) => { e.preventDefault(); location.reload(); };
  $('parentBack').onclick = (e) => { e.preventDefault(); location.reload(); };
  $('copyBabyOffer').onclick = () => copyText($('babyOfferCode').value);
  $('babyNewCode').onclick = () => openBabyPeer();
  $('parentGenBtn').onclick = () => startParentConnect();
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

  document.addEventListener('pointerdown', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    const v = $('video'); if (v) v.play().catch(() => {});
  }, { once: true });

  window.addEventListener('pagehide', () => {
    if (recorder) try { recorder.stop(); } catch (e) {}
    if (peer) try { peer.destroy(); } catch (e) {}
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
  });
})();
