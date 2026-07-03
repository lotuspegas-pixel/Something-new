'use strict';

/**
 * Luna Unit — ouder-paneel. Koppelt de neumorfe UI aan de echte
 * WebRTC-babyfoonverbinding. Alle knoppen zijn functioneel.
 */
(function () {
  const params = new URLSearchParams(location.search);
  const room = (params.get('room') || Baby.storage.get('lastRoom', '') || '').toUpperCase();
  if (!room) {
    location.href = '/';
    return;
  }
  Baby.storage.set('lastRoom', room);

  const $ = (id) => document.getElementById(id);
  const el = {};
  [
    'btnPower', 'btnNightmode', 'connDot', 'connText', 'clock', 'babyBatt',
    'roomLabel', 'signal', 'rttVal', 'btnFlip', 'btnLocate',
    'screen', 'video', 'nightVeil', 'snapFlash', 'liveBadge', 'liveText',
    'dbText', 'placeholder', 'phText', 'vu', 'btnSnapshot', 'btnFullscreen',
    'zoomOut', 'zoomVal', 'zoomIn', 'btnTalk', 'talkText', 'btnFsClose',
    'volDial', 'volNeedle', 'volHub', 'sBrightness', 'sNightlight', 'sSensitivity',
    'tPrev', 'tPlay', 'tNext', 'tStop', 'btnRecord', 'btnMute', 'btnAlarm',
    'alarmText', 'cryAlert', 'chips', 'errorCard', 'scratch', 'toast',
  ].forEach((id) => (el[id] = $(id)));

  el.roomLabel.textContent = room;

  const vuBars = Array.from(el.vu.querySelectorAll('i'));

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 3000);
  }

  // -------------------------------------------------------------- state
  let link = null;
  let micStream = null;
  let remoteStream = null;
  let audioCtx = null;
  let analyser = null;
  let talking = false;
  let nightMode = false;
  let alarmOn = true;
  let muted = false;
  let zoom = 1.0;
  let volume = 80;
  let brightness = 100; // 30..130
  let nightlight = 0; // 0..100
  let sensitivity = 55; // 0..100 (hoger = gevoeliger)
  let alarmCooldown = 0;

  // slaapmuziek
  const tracks = LullabyPlayer.list();
  let trackIndex = 0;
  let playing = false;

  // -------------------------------------------------------------- verbinding
  function connect() {
    link = new BabyphoneLink({
      room,
      role: 'parent',
      localStream: micStream,
      onConnectionState: (state) => {
        el.connText.textContent = Baby.connLabel(state);
        if (state === 'connected') {
          el.placeholder.classList.add('hidden');
          el.errorCard.classList.add('hidden');
          el.connDot.classList.remove('off');
          el.liveText.textContent = nightMode ? 'NACHTSTAND' : 'LIVE';
          if (link) link.sendControl({ cmd: 'ping' });
        } else if (state === 'failed' || state === 'disconnected') {
          el.connDot.classList.add('off');
          el.liveText.textContent = 'HERVERBINDEN';
          el.errorCard.classList.remove('hidden');
        }
      },
      onPeerPresence: (present) => {
        if (!present) {
          el.placeholder.classList.remove('hidden');
          el.phText.textContent = 'Wachten op babyunit…';
          el.connDot.classList.add('off');
          el.liveText.textContent = 'VERBINDEN…';
          setSignal(0);
          el.rttVal.textContent = '—';
          el.babyBatt.textContent = '🔋 —';
        } else {
          el.phText.textContent = 'Babyunit gevonden, verbinden…';
        }
      },
      onSignalingState: (s) => {
        if (s === 'error:role-taken') {
          el.phText.textContent = 'Er is al een ouderunit in deze kamer';
        }
      },
      onTrack: (ev) => {
        remoteStream = ev.streams[0];
        el.video.srcObject = remoteStream;
        el.video.play().catch(() => {});
        setupAnalyser(remoteStream);
      },
      onControl: (msg) => {
        if (msg.cmd === 'battery') {
          el.babyBatt.textContent = '🔋 ' + msg.level + '%' + (msg.charging ? '⚡' : '');
        } else if (msg.cmd === 'lullabyState') {
          playing = !!msg.id;
          if (msg.id) {
            const i = tracks.findIndex((t) => t.id === msg.id);
            if (i >= 0) trackIndex = i;
          }
          renderTransport();
          renderChips();
        }
      },
    });
    link.start();
  }

  // -------------------------------------------------------------- microfoon (terugpraten)
  async function getMic() {
    try {
      micStream = await Baby.getMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      micStream.getAudioTracks().forEach((t) => (t.enabled = false));
    } catch (e) {
      micStream = null;
      el.btnTalk.style.opacity = 0.45;
      el.btnTalk.title = 'Geen microfoontoegang';
    }
  }

  // -------------------------------------------------------------- geluidsanalyse
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
      for (let i = 0; i < n; i++) {
        const v = (meterBuf[i] - 128) / 128;
        sum += v * v;
      }
      level = Math.min(100, Math.round(Math.sqrt(sum / n) * 300));
    }
    // VU-balken
    for (let i = 0; i < vuBars.length; i++) {
      const jitter = 0.7 + Math.random() * 0.6;
      const h = Math.max(0.12, Math.min(1, (level / 100) * jitter));
      vuBars[i].style.transform = 'scaleY(' + h.toFixed(2) + ')';
    }
    // dB-benadering (30–85 dB)
    el.dbText.textContent = Math.round(30 + level * 0.55) + ' dB';

    // alarm / huilen
    const threshold = 100 - sensitivity;
    const now = Date.now();
    if (alarmOn && level > threshold) {
      el.cryAlert.classList.remove('hidden');
      if (now > alarmCooldown) {
        alarmCooldown = now + 6000;
        triggerAlarm();
      }
    } else if (now > alarmCooldown - 5000) {
      el.cryAlert.classList.add('hidden');
    }
    requestAnimationFrame(meterLoop);
  }

  function triggerAlarm() {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
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
  }

  // -------------------------------------------------------------- signaal
  function setSignal(bars) {
    el.signal.querySelectorAll('i').forEach((i, idx) => i.classList.toggle('on', idx < bars));
  }
  async function statsLoop() {
    if (link) {
      const s = await link.getStats();
      if (s && s.rtt != null) {
        el.rttVal.textContent = Math.round(s.rtt) + ' ms';
        let bars = 4;
        if (s.rtt > 400) bars = 1;
        else if (s.rtt > 250) bars = 2;
        else if (s.rtt > 120) bars = 3;
        setSignal(bars);
      }
    }
    setTimeout(statsLoop, 2000);
  }

  // -------------------------------------------------------------- video-filter
  function applyVideoFilter() {
    let f = 'brightness(' + brightness / 100 + ')';
    if (nightMode) f += ' grayscale(1) brightness(0.6) contrast(1.1)';
    el.video.style.filter = f;
    el.nightVeil.classList.toggle('hidden', !nightMode);
  }
  function applyZoom() {
    el.video.style.transform = 'scale(' + zoom + ')';
    el.zoomVal.textContent = zoom.toFixed(1) + '×';
  }
  function applyVolume() {
    el.video.volume = muted ? 0 : volume / 100;
    el.video.muted = muted || volume === 0;
    el.volHub.textContent = muted ? '⌀' : volume;
    el.volNeedle.style.transform =
      'translateX(-50%) rotate(' + (-120 + (volume / 100) * 240) + 'deg)';
  }

  // -------------------------------------------------------------- schuifregelaars
  function sliderPct(field) {
    // huidige waarde → 0..1 positie
    const map = {
      sBrightness: (brightness - 30) / 100,
      sNightlight: nightlight / 100,
      sSensitivity: sensitivity / 100,
    };
    return map[field];
  }
  function setSliderKnob(elm, pct) {
    elm.querySelector('.knob').style.bottom = (pct * 100).toFixed(1) + '%';
  }
  function applySlider(field, pct) {
    if (field === 'sBrightness') {
      brightness = Math.round(30 + pct * 100);
      applyVideoFilter();
    } else if (field === 'sNightlight') {
      nightlight = Math.round(pct * 100);
      if (link) link.sendControl({ cmd: 'nightlight', on: nightlight > 3, level: nightlight });
    } else if (field === 'sSensitivity') {
      sensitivity = Math.round(pct * 100);
    }
    setSliderKnob($(field), pct);
  }

  function bindVertical(elm, onPct) {
    let active = false;
    const upd = (e) => {
      const r = elm.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height));
      onPct(pct);
    };
    elm.addEventListener('pointerdown', (e) => {
      active = true;
      try { elm.setPointerCapture(e.pointerId); } catch (x) {}
      upd(e);
    });
    elm.addEventListener('pointermove', (e) => active && upd(e));
    elm.addEventListener('pointerup', () => (active = false));
    elm.addEventListener('pointercancel', () => (active = false));
  }

  // -------------------------------------------------------------- slaapmuziek
  function renderChips() {
    el.chips.innerHTML = '';
    tracks.forEach((t, i) => {
      const c = document.createElement('div');
      c.className = 'chip' + (playing && i === trackIndex ? ' on' : '');
      c.textContent = t.label;
      c.onclick = () => selectTrack(i, true);
      el.chips.appendChild(c);
    });
  }
  function renderTransport() {
    el.tPlay.textContent = playing ? '❚❚' : '▶';
    el.tPlay.classList.toggle('on', playing);
  }
  function sendPlay() {
    if (link) link.sendControl({ cmd: 'lullaby', on: true, id: tracks[trackIndex].id });
    playing = true;
    renderTransport();
    renderChips();
  }
  function sendStop() {
    if (link) link.sendControl({ cmd: 'lullaby', on: false, id: tracks[trackIndex].id });
    playing = false;
    renderTransport();
    renderChips();
  }
  function selectTrack(i, autoplay) {
    if (i === trackIndex && playing && autoplay) {
      sendStop();
      return;
    }
    trackIndex = i;
    if (playing || autoplay) sendPlay();
    else {
      renderChips();
    }
  }

  // -------------------------------------------------------------- opnemen
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
        const h = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ accept: { [blob.type || 'application/octet-stream']: ['.' + ext] } }],
        });
        const w = await h.createWritable();
        await w.write(blob);
        await w.close();
        toast('💾 Opgeslagen');
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('💾 Opgeslagen');
  }
  function toggleRecord() {
    if (!remoteStream) return toast('Nog geen beeld om op te nemen');
    if (recorder) {
      recorder.stop();
      return;
    }
    if (!window.MediaRecorder) return toast('Opnemen niet ondersteund');
    const mime = pickMime();
    try {
      recorder = new MediaRecorder(remoteStream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      return toast('Opnemen niet ondersteund');
    }
    recChunks = [];
    recorder.ondataavailable = (e) => e.data && e.data.size && recChunks.push(e.data);
    recorder.onstop = async () => {
      const blob = new Blob(recChunks, { type: recorder.mimeType || 'video/webm' });
      el.btnRecord.classList.remove('active');
      recorder = null;
      const ext = (blob.type || '').includes('mp4') ? 'mp4' : 'webm';
      await saveBlob(blob, 'babyfoon-opname', ext);
    };
    recorder.start(1000);
    el.btnRecord.classList.add('active');
    toast('⏺️ Opname gestart');
  }

  // -------------------------------------------------------------- knoppen wiring
  el.btnPower.onclick = () => {
    if (confirm('Ouderunit stoppen en terug naar het startscherm?')) {
      cleanup();
      location.href = '/';
    }
  };

  el.btnNightmode.onclick = () => {
    nightMode = !nightMode;
    el.btnNightmode.classList.toggle('on', nightMode);
    applyVideoFilter();
    el.liveText.textContent = nightMode ? 'NACHTSTAND' : 'LIVE';
  };

  el.btnFlip.onclick = () => {
    if (link) link.sendControl({ cmd: 'flip' });
    toast('Camera wisselen…');
  };
  el.btnLocate.onclick = () => {
    if (link) link.sendControl({ cmd: 'locate' });
    el.btnLocate.classList.add('active');
    setTimeout(() => el.btnLocate.classList.remove('active'), 2500);
    toast('🔊 Babyunit speelt een toon');
  };

  el.btnSnapshot.onclick = () => {
    if (!el.video.videoWidth) return toast('Nog geen beeld');
    el.snapFlash.classList.remove('hidden');
    setTimeout(() => el.snapFlash.classList.add('hidden'), 250);
    const c = el.scratch;
    c.width = el.video.videoWidth;
    c.height = el.video.videoHeight;
    c.getContext('2d').drawImage(el.video, 0, 0, c.width, c.height);
    c.toBlob((b) => b && saveBlob(b, 'babyfoon-foto', 'png'), 'image/png');
  };

  el.btnFullscreen.onclick = () => {
    if (!document.fullscreenElement) {
      (el.screen.requestFullscreen || el.screen.webkitRequestFullscreen)?.call(el.screen);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    }
  };
  el.btnFsClose.onclick = () => (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  document.addEventListener('fullscreenchange', () => {
    const fs = !!document.fullscreenElement;
    el.screen.classList.toggle('fs', fs);
    el.btnFsClose.classList.toggle('hidden', !fs);
  });

  el.zoomIn.onclick = () => {
    zoom = Math.min(3, Math.round((zoom + 0.2) * 10) / 10);
    applyZoom();
  };
  el.zoomOut.onclick = () => {
    zoom = Math.max(1, Math.round((zoom - 0.2) * 10) / 10);
    applyZoom();
  };

  // terugpraten (klik = aan/uit)
  el.btnTalk.onclick = () => {
    if (!micStream) return toast('Geen microfoontoegang');
    talking = !talking;
    micStream.getAudioTracks().forEach((t) => (t.enabled = talking));
    el.btnTalk.classList.toggle('on', talking);
    el.talkText.textContent = talking ? 'Aan het praten…' : 'Praat tegen baby';
  };

  el.btnMute.onclick = () => {
    muted = !muted;
    el.btnMute.classList.toggle('active', muted);
    applyVolume();
    toast(muted ? 'Geluid gedempt' : 'Geluid aan');
  };

  el.btnAlarm.onclick = () => {
    alarmOn = !alarmOn;
    el.btnAlarm.classList.toggle('off', !alarmOn);
    el.alarmText.textContent = alarmOn ? 'ALARM AAN' : 'ALARM UIT';
    if (!alarmOn) el.cryAlert.classList.add('hidden');
  };

  el.btnRecord.onclick = toggleRecord;

  el.tPlay.onclick = () => (playing ? sendStop() : sendPlay());
  el.tStop.onclick = () => sendStop();
  el.tNext.onclick = () => selectTrack((trackIndex + 1) % tracks.length, false);
  el.tPrev.onclick = () => selectTrack((trackIndex - 1 + tracks.length) % tracks.length, false);

  el.errorCard.onclick = () => {
    el.errorCard.classList.add('hidden');
    if (link) {
      link.close();
      link = null;
    }
    connect();
  };

  // dial + sliders
  bindVertical(el.volDial, (pct) => {
    volume = Math.round(pct * 100);
    muted = false;
    el.btnMute.classList.remove('active');
    applyVolume();
  });
  bindVertical(el.sBrightness, (pct) => applySlider('sBrightness', pct));
  bindVertical(el.sNightlight, (pct) => applySlider('sNightlight', pct));
  bindVertical(el.sSensitivity, (pct) => applySlider('sSensitivity', pct));

  // -------------------------------------------------------------- klok / opruimen
  function tickClock() {
    el.clock.textContent = Baby.formatClock();
  }
  setInterval(tickClock, 10000);
  tickClock();

  function cleanup() {
    if (recorder) try { recorder.stop(); } catch (e) {}
    if (link) link.close();
    if (micStream) micStream.getTracks().forEach((t) => t.stop());
    Baby.wakeLock.disable();
  }
  window.addEventListener('pagehide', cleanup);
  window.addEventListener('beforeunload', cleanup);

  document.addEventListener('pointerdown', () => {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    el.video.play().catch(() => {});
  }, { once: true });

  // -------------------------------------------------------------- start
  (async function init() {
    applyVolume();
    applyVideoFilter();
    applyZoom();
    setSliderKnob(el.sBrightness, sliderPct('sBrightness'));
    setSliderKnob(el.sNightlight, sliderPct('sNightlight'));
    setSliderKnob(el.sSensitivity, sliderPct('sSensitivity'));
    renderChips();
    renderTransport();
    await getMic();
    await Baby.wakeLock.enable();
    connect();
    meterLoop();
    statsLoop();
  })();
})();
