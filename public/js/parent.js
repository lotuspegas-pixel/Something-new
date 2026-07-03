'use strict';

/**
 * Ouderunit — de monitor. Ontvangt live beeld/geluid van de babyunit,
 * toont een geluids-LED-meter, waarschuwt bij geluid, en kan terugpraten,
 * slaapliedjes/nachtlamp op afstand bedienen, foto's maken en meer.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const room = (params.get('room') || Baby.storage.get('lastRoom', '') || '')
    .toUpperCase();

  if (!room) {
    location.href = '/';
    return;
  }
  Baby.storage.set('lastRoom', room);

  const el = {
    device: document.getElementById('device'),
    screen: document.getElementById('screen'),
    video: document.getElementById('remoteVideo'),
    overlay: document.getElementById('overlay'),
    spinner: document.getElementById('spinner'),
    statusBig: document.getElementById('statusBig'),
    statusSub: document.getElementById('statusSub'),
    roomLabel: document.getElementById('roomLabel'),
    hudState: document.getElementById('hudState'),
    liveDot: document.getElementById('liveDot'),
    ledColumn: document.getElementById('ledColumn'),
    soundValue: document.getElementById('soundValue'),
    connValue: document.getElementById('connValue'),
    signal: document.getElementById('signal'),
    babyBattFill: document.getElementById('babyBattFill'),
    babyBattPct: document.getElementById('babyBattPct'),
    clock: document.getElementById('clock'),
    btnTalk: document.getElementById('btnTalk'),
    btnLullaby: document.getElementById('btnLullaby'),
    btnNightlight: document.getElementById('btnNightlight'),
    btnSnapshot: document.getElementById('btnSnapshot'),
    btnNightmode: document.getElementById('btnNightmode'),
    btnAlarm: document.getElementById('btnAlarm'),
    btnFullscreen: document.getElementById('btnFullscreen'),
    btnStop: document.getElementById('btnStop'),
    volume: document.getElementById('volume'),
    volVal: document.getElementById('volVal'),
    brightness: document.getElementById('brightness'),
    briVal: document.getElementById('briVal'),
    sensitivity: document.getElementById('sensitivity'),
    sensVal: document.getElementById('sensVal'),
    lullabyModal: document.getElementById('lullabyModal'),
    lullabyList: document.getElementById('lullabyList'),
    lullabyVolume: document.getElementById('lullabyVolume'),
    closeLullaby: document.getElementById('closeLullaby'),
    snapCanvas: document.getElementById('snapCanvas'),
    grille: document.getElementById('grille'),
    toast: document.getElementById('toast'),
  };

  el.roomLabel.textContent = 'Kamer ' + room;

  // Luidsprekerrooster.
  el.grille.innerHTML = '';
  for (let i = 0; i < 36; i++) el.grille.appendChild(document.createElement('i'));

  // LED-meter opbouwen (12 leds: groen/geel/rood).
  const LED_COUNT = 12;
  const leds = [];
  for (let i = 0; i < LED_COUNT; i++) {
    const d = document.createElement('div');
    d.className = 'led ' + (i >= 10 ? 'r' : i >= 7 ? 'y' : 'g');
    el.ledColumn.appendChild(d);
    leds.push(d);
  }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 3000);
  }

  // State
  let link = null;
  let micStream = null;
  let remoteStream = null;
  let talking = false;
  let nightlightOn = false;
  let nightMode = false;
  let alarmOn = true;
  let lullabyPlayingId = null;
  let audioCtx = null;
  let analyser = null;
  let alarmCooldown = 0;

  el.btnAlarm.classList.add('active');

  // -------------------------------------------------------------------------
  // Microfoon voor terugpraten (optioneel)
  // -------------------------------------------------------------------------
  async function getMic() {
    try {
      micStream = await Baby.getMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      // Standaard uit (alleen actief tijdens indrukken van "Praten").
      micStream.getAudioTracks().forEach((t) => (t.enabled = false));
    } catch (e) {
      micStream = null;
      el.btnTalk.disabled = true;
      el.btnTalk.style.opacity = 0.4;
      toast('Terugpraten uit (geen microfoontoegang)');
    }
  }

  // -------------------------------------------------------------------------
  // Verbinding
  // -------------------------------------------------------------------------
  function connect() {
    link = new BabyphoneLink({
      room,
      role: 'parent',
      localStream: micStream,
      onConnectionState: (state) => {
        el.connValue.textContent = Baby.connLabel(state);
        if (state === 'connected') {
          el.overlay.classList.add('hidden');
          el.liveDot.classList.add('live');
          el.hudState.textContent = 'LIVE';
          // Vraag actuele status van de babyunit op.
          if (link) link.sendControl({ cmd: 'ping' });
        } else if (state === 'failed' || state === 'disconnected') {
          el.liveDot.classList.remove('live');
          el.hudState.textContent = 'HERVERBINDEN';
        }
      },
      onPeerPresence: (present) => {
        if (!present) {
          el.overlay.classList.remove('hidden');
          el.spinner.style.display = '';
          el.statusBig.textContent = 'Wachten op babyunit…';
          el.statusSub.textContent = 'Kamer ' + room + ' — babyunit nog niet online';
          el.liveDot.classList.remove('live');
          setSignal(0);
          el.babyBattPct.textContent = '—';
          el.babyBattFill.style.width = '0%';
        } else {
          el.statusBig.textContent = 'Babyunit gevonden, verbinden…';
        }
      },
      onSignalingState: (s) => {
        if (s === 'error:role-taken') {
          el.statusBig.textContent = 'Er is al een ouderunit in deze kamer';
          el.statusSub.textContent = 'Sluit de andere ouderunit of gebruik een andere kamer.';
          el.spinner.style.display = 'none';
        }
      },
      onTrack: (ev) => {
        remoteStream = ev.streams[0];
        el.video.srcObject = remoteStream;
        el.video.play().catch(() => showTapToStart());
        setupAnalyser(remoteStream);
      },
      onControl: (msg) => {
        if (msg.cmd === 'battery') {
          const pct = msg.level;
          el.babyBattPct.textContent = pct + '%' + (msg.charging ? ' ⚡' : '');
          el.babyBattFill.style.width = pct + '%';
          el.babyBattFill.style.background =
            pct < 20 ? 'var(--danger)' : 'var(--accent)';
        } else if (msg.cmd === 'lullabyState') {
          lullabyPlayingId = msg.id;
          el.btnLullaby.classList.toggle('active', !!msg.id);
          renderLullabyList();
        }
      },
    });
    link.start();
  }

  // Sommige browsers blokkeren automatisch afspelen van geluid tot een klik.
  function showTapToStart() {
    el.statusBig.textContent = 'Tik om geluid in te schakelen';
    el.spinner.style.display = 'none';
    el.overlay.classList.remove('hidden');
    const start = () => {
      el.video.play().catch(() => {});
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      el.overlay.classList.add('hidden');
    };
    el.overlay.addEventListener('click', start, { once: true });
  }

  // -------------------------------------------------------------------------
  // Geluidsanalyse (VU-meter + alarm)
  // -------------------------------------------------------------------------
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
      // Niet met destination verbinden: afspelen gebeurt via het <video>-element.
    } catch (e) {
      analyser = null;
    }
  }

  const buf = new Uint8Array(256);
  function meterLoop() {
    let level = 0;
    if (analyser) {
      analyser.getByteTimeDomainData(buf.subarray(0, analyser.fftSize / 2));
      const n = analyser.fftSize / 2;
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / n);
      // Naar 0-100 schalen met een prettige curve.
      level = Math.min(100, Math.round(rms * 300));
    }
    updateLeds(level);
    updateSoundValue(level);
    checkAlarm(level);
    requestAnimationFrame(meterLoop);
  }

  function updateLeds(level) {
    const lit = Math.round((level / 100) * LED_COUNT);
    for (let i = 0; i < LED_COUNT; i++) {
      leds[i].classList.toggle('on', i < lit);
    }
  }

  function updateSoundValue(level) {
    let word = 'Stil';
    if (level > 70) word = 'Luid';
    else if (level > 40) word = 'Matig';
    else if (level > 12) word = 'Zacht';
    el.soundValue.textContent = level + '% • ' + word;
    el.soundValue.classList.toggle('alert', level > (100 - Number(el.sensitivity.value)));
  }

  function checkAlarm(level) {
    if (!alarmOn) {
      el.screen.classList.remove('alarm');
      return;
    }
    const threshold = 100 - Number(el.sensitivity.value);
    const now = Date.now();
    if (level > threshold) {
      el.screen.classList.add('alarm');
      if (now > alarmCooldown) {
        alarmCooldown = now + 6000;
        triggerAlarm();
      }
    } else if (now > alarmCooldown - 5000) {
      el.screen.classList.remove('alarm');
    }
  }

  function triggerAlarm() {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    // Waarschuwingstoon (los van het monitorvolume).
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
      }
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
    } catch (e) {
      /* noop */
    }
    toast('🔔 Geluid gedetecteerd bij de baby');
  }

  // -------------------------------------------------------------------------
  // Signaalsterkte (uit WebRTC-statistieken)
  // -------------------------------------------------------------------------
  function setSignal(bars) {
    el.signal.querySelectorAll('i').forEach((i, idx) => {
      i.classList.toggle('on', idx < bars);
    });
  }

  async function statsLoop() {
    if (link) {
      const s = await link.getStats();
      if (s && s.rtt != null) {
        let bars = 4;
        if (s.rtt > 400) bars = 1;
        else if (s.rtt > 250) bars = 2;
        else if (s.rtt > 120) bars = 3;
        if (s.packetsLost && s.bitrateKbps != null && s.bitrateKbps < 30) {
          bars = Math.min(bars, 1);
        }
        setSignal(bars);
      }
    }
    setTimeout(statsLoop, 2000);
  }

  // -------------------------------------------------------------------------
  // Knoppen
  // -------------------------------------------------------------------------
  // Terugpraten (druk-en-houd).
  function talkStart(e) {
    if (e) e.preventDefault();
    if (!micStream || talking) return;
    talking = true;
    micStream.getAudioTracks().forEach((t) => (t.enabled = true));
    el.btnTalk.classList.add('active');
  }
  function talkEnd() {
    if (!talking) return;
    talking = false;
    if (micStream) micStream.getAudioTracks().forEach((t) => (t.enabled = false));
    el.btnTalk.classList.remove('active');
  }
  el.btnTalk.addEventListener('pointerdown', talkStart);
  el.btnTalk.addEventListener('pointerup', talkEnd);
  el.btnTalk.addEventListener('pointerleave', talkEnd);
  el.btnTalk.addEventListener('pointercancel', talkEnd);

  // Nachtlamp op afstand.
  el.btnNightlight.addEventListener('click', () => {
    nightlightOn = !nightlightOn;
    el.btnNightlight.classList.toggle('active', nightlightOn);
    if (link) link.sendControl({ cmd: 'nightlight', on: nightlightOn });
    toast(nightlightOn ? 'Nachtlamp aan bij de baby' : 'Nachtlamp uit');
  });

  // Nachtstand (scherm dimmen + grijstinten voor rust in het donker).
  el.btnNightmode.addEventListener('click', () => {
    nightMode = !nightMode;
    el.btnNightmode.classList.toggle('active', nightMode);
    applyVideoFilter();
    toast(nightMode ? 'Nachtstand aan' : 'Nachtstand uit');
  });

  // Geluidsalarm aan/uit.
  el.btnAlarm.addEventListener('click', () => {
    alarmOn = !alarmOn;
    el.btnAlarm.classList.toggle('active', alarmOn);
    if (!alarmOn) el.screen.classList.remove('alarm');
    toast(alarmOn ? 'Geluidsalarm aan' : 'Geluidsalarm uit');
  });

  // Foto maken (momentopname van het beeld).
  el.btnSnapshot.addEventListener('click', () => {
    if (!remoteStream || !el.video.videoWidth) {
      toast('Nog geen beeld om vast te leggen');
      return;
    }
    const c = el.snapCanvas;
    c.width = el.video.videoWidth;
    c.height = el.video.videoHeight;
    c.getContext('2d').drawImage(el.video, 0, 0, c.width, c.height);
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        'babyfoon-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast('📸 Foto opgeslagen');
    }, 'image/png');
  });

  // Volledig scherm.
  el.btnFullscreen.addEventListener('click', () => {
    const target = el.screen;
    if (!document.fullscreenElement) {
      (target.requestFullscreen || target.webkitRequestFullscreen)?.call(target);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
  });

  // Stoppen.
  el.btnStop.addEventListener('click', () => {
    if (confirm('Ouderunit stoppen en terug naar het startscherm?')) {
      cleanup();
      location.href = '/';
    }
  });

  // -------------------------------------------------------------------------
  // Schuifregelaars
  // -------------------------------------------------------------------------
  function applyVolume() {
    const v = Number(el.volume.value) / 100;
    el.video.volume = v;
    el.video.muted = v === 0;
    el.volVal.textContent = el.volume.value + '%';
  }
  el.volume.addEventListener('input', applyVolume);

  function applyVideoFilter() {
    const b = Number(el.brightness.value) / 100;
    let filter = `brightness(${b})`;
    if (nightMode) filter += ' grayscale(1) brightness(0.6) contrast(1.1)';
    el.video.style.filter = filter;
    el.briVal.textContent = el.brightness.value + '%';
  }
  el.brightness.addEventListener('input', applyVideoFilter);

  el.sensitivity.addEventListener('input', () => {
    el.sensVal.textContent = 'Gevoel. ' + el.sensitivity.value;
  });

  // -------------------------------------------------------------------------
  // Slaapliedjes-modaal
  // -------------------------------------------------------------------------
  function renderLullabyList() {
    el.lullabyList.innerHTML = '';
    LullabyPlayer.list().forEach((item) => {
      const row = document.createElement('div');
      row.className = 'lullaby-item' + (lullabyPlayingId === item.id ? ' playing' : '');
      const name = document.createElement('span');
      name.textContent = (item.kind === 'sound' ? '🌊 ' : '🎵 ') + item.label;
      const btn = document.createElement('button');
      const isPlaying = lullabyPlayingId === item.id;
      btn.textContent = isPlaying ? 'Stop' : 'Speel';
      btn.addEventListener('click', () => {
        if (isPlaying) {
          if (link) link.sendControl({ cmd: 'lullaby', on: false, id: item.id });
          lullabyPlayingId = null;
        } else {
          if (link) link.sendControl({ cmd: 'lullaby', on: true, id: item.id });
          lullabyPlayingId = item.id;
        }
        el.btnLullaby.classList.toggle('active', !!lullabyPlayingId);
        renderLullabyList();
      });
      row.appendChild(name);
      row.appendChild(btn);
      el.lullabyList.appendChild(row);
    });
  }

  el.btnLullaby.addEventListener('click', () => {
    renderLullabyList();
    el.lullabyModal.classList.remove('hidden');
  });
  el.closeLullaby.addEventListener('click', () =>
    el.lullabyModal.classList.add('hidden')
  );
  el.lullabyModal.addEventListener('click', (e) => {
    if (e.target === el.lullabyModal) el.lullabyModal.classList.add('hidden');
  });
  el.lullabyVolume.addEventListener('input', () => {
    if (link)
      link.sendControl({
        cmd: 'lullabyVolume',
        value: Number(el.lullabyVolume.value) / 100,
      });
  });

  // -------------------------------------------------------------------------
  // Klok + opruimen
  // -------------------------------------------------------------------------
  function tickClock() {
    el.clock.textContent = Baby.formatClock();
  }
  setInterval(tickClock, 10000);
  tickClock();

  function cleanup() {
    if (link) link.close();
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
    Baby.wakeLock.disable();
  }
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('beforeunload', cleanup);

  // Eerste gebruikersinteractie: audio ontgrendelen.
  document.addEventListener(
    'pointerdown',
    () => {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      el.video.play().catch(() => {});
    },
    { once: true }
  );

  // -------------------------------------------------------------------------
  // Opstarten
  // -------------------------------------------------------------------------
  (async function init() {
    applyVolume();
    applyVideoFilter();
    el.sensVal.textContent = 'Gevoel. ' + el.sensitivity.value;
    await getMic();
    await Baby.wakeLock.enable();
    connect();
    meterLoop();
    statsLoop();
  })();
})();
