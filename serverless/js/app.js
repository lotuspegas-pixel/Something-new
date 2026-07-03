'use strict';

/**
 * Serverloze babyfoon.
 *
 * Twee apparaten koppelen zichzelf via een QR-code of koppelcode (handmatige
 * WebRTC-signalering). Daarna loopt beeld en geluid rechtstreeks peer-to-peer,
 * zonder enige server. Op hetzelfde wifi-netwerk is geen enkele server nodig;
 * over internet wordt een publieke STUN/TURN-server gebruikt (zie README).
 */
(function () {
  // Publieke STUN helpt bij verbindingen buiten hetzelfde netwerk. Op hetzelfde
  // wifi wordt deze niet gebruikt (dan volstaan lokale kandidaten).
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }];

  const $ = (id) => document.getElementById(id);

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

  function fillGrille(el, n) {
    el.innerHTML = '';
    for (let i = 0; i < n; i++) el.appendChild(document.createElement('i'));
  }

  async function getMedia(constraints) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('Camera/microfoon niet beschikbaar. Gebruik https of localhost.');
    }
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  function renderQR(containerId, text) {
    const box = $(containerId);
    try {
      const qr = qrcode(0, 'L');
      qr.addData(text);
      qr.make();
      box.innerHTML = qr.createImgTag(4, 8);
      box.dataset.ok = '1';
    } catch (e) {
      box.innerHTML =
        '<div style="color:#333;font-size:12px;text-align:center;padding:10px">Code te groot voor QR.<br>Gebruik “Kopieer code”.</div>';
      box.dataset.ok = '0';
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('📋 Gekopieerd');
    } catch (e) {
      toast('Kopiëren mislukt — selecteer en kopieer handmatig');
    }
  }

  // QR scannen met de camera.
  let scannerStop = null;
  async function startScanner(videoEl, onResult) {
    stopScanner();
    let stream;
    try {
      stream = await getMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) {
      toast('Kan camera niet openen om te scannen — plak de code');
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

  function waitIce(pc) {
    return new Promise((res) => {
      if (pc.iceGatheringState === 'complete') return res();
      const to = setTimeout(res, 3000); // wacht niet eindeloos op trage relay-kandidaten
      pc.addEventListener('icegatheringstatechange', function h() {
        if (pc.iceGatheringState === 'complete') {
          clearTimeout(to);
          pc.removeEventListener('icegatheringstatechange', h);
          res();
        }
      });
    });
  }

  // ------------------------------------------------------------------ state
  let role = null;
  let pc = null;
  let localStream = null; // baby: camera+mic | parent: mic (talkback)
  let remoteStream = null;
  let controlChannel = null;
  const lullaby = new LullabyPlayer();

  function setupControl(ch) {
    controlChannel = ch;
    ch.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      handleControl(msg);
    };
    ch.onopen = () => {
      if (role === 'baby') reportBattery();
    };
  }
  function sendControl(obj) {
    if (controlChannel && controlChannel.readyState === 'open') {
      try {
        controlChannel.send(JSON.stringify(obj));
      } catch (e) {
        /* noop */
      }
    }
  }

  function onConnState() {
    const st = pc.connectionState;
    if (st === 'connected') {
      if (role === 'baby') {
        showScreen('screenBaby');
        $('bLiveDot').classList.add('live');
        $('bConn').textContent = 'Verbonden met ouderunit';
        $('bOverlay').classList.add('hidden');
        startBabyDevice();
      } else {
        showScreen('screenParent');
        $('pLiveDot').classList.add('live');
        $('pConn').textContent = 'Verbonden';
        $('pOverlay').classList.add('hidden');
        startParentDevice();
      }
    } else if (st === 'failed' || st === 'disconnected') {
      if (role === 'baby') $('bConn').textContent = 'Verbinding onderbroken';
      else $('pConn').textContent = 'Verbinding onderbroken';
    }
  }

  function onRemoteTrack(ev) {
    if (role === 'parent') {
      remoteStream = ev.streams[0];
      $('pVideo').srcObject = remoteStream;
      $('pVideo').play().catch(() => {});
      setupAnalyser(remoteStream);
    } else {
      // Terugpraten van de ouder afspelen op de babyunit.
      if (ev.track.kind === 'audio') {
        let a = document.getElementById('talkbackAudio');
        if (!a) {
          a = document.createElement('audio');
          a.id = 'talkbackAudio';
          a.autoplay = true;
          a.playsInline = true;
          document.body.appendChild(a);
        }
        a.srcObject = ev.streams[0];
        a.play().catch(() => {});
      }
    }
  }

  // ------------------------------------------------------------------ pairing: baby
  async function startBaby() {
    role = 'baby';
    showScreen('screenPairBaby');
    try {
      localStream = await getMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
      });
    } catch (e) {
      toast(e.message || 'Geen toegang tot camera/microfoon');
      showScreen('screenSetup');
      return;
    }
    $('bPreview').srcObject = localStream;

    pc = new RTCPeerConnection({ iceServers: ICE });
    localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
    setupControl(pc.createDataChannel('control', { ordered: true }));
    pc.ontrack = onRemoteTrack;
    pc.onconnectionstatechange = onConnState;

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIce(pc);
    const code = await SignalCodec.pack({ t: 'offer', sdp: pc.localDescription.sdp });
    renderQR('babyQR', code);
    $('babyOfferCode').value = code;
  }

  async function babyConnectAnswer() {
    const code = $('babyAnswerInput').value.trim();
    if (!code) return toast('Plak of scan eerst de antwoordcode');
    try {
      const obj = await SignalCodec.unpack(code);
      if (obj.t !== 'answer') throw new Error('Geen antwoordcode');
      await pc.setRemoteDescription({ type: 'answer', sdp: obj.sdp });
      $('bStep1').classList.add('done');
      $('bStep2').classList.add('done');
      toast('Verbinden…');
    } catch (e) {
      toast('Ongeldige antwoordcode');
    }
  }

  // ------------------------------------------------------------------ pairing: parent
  async function parentAcceptOffer() {
    const code = $('parentOfferInput').value.trim();
    if (!code) return toast('Plak of scan eerst de koppelcode van de baby');
    let obj;
    try {
      obj = await SignalCodec.unpack(code);
      if (obj.t !== 'offer') throw new Error('Geen koppelcode');
    } catch (e) {
      return toast('Ongeldige koppelcode');
    }

    role = 'parent';
    pc = new RTCPeerConnection({ iceServers: ICE });
    pc.ontrack = onRemoteTrack;
    pc.ondatachannel = (e) => {
      if (e.channel.label === 'control') setupControl(e.channel);
    };
    pc.onconnectionstatechange = onConnState;

    await pc.setRemoteDescription({ type: 'offer', sdp: obj.sdp });

    // Microfoon voor terugpraten (optioneel).
    try {
      localStream = await getMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localStream.getAudioTracks().forEach((t) => {
        t.enabled = false;
        pc.addTrack(t, localStream);
      });
    } catch (e) {
      $('pTalk').disabled = true;
      $('pTalk').style.opacity = 0.4;
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitIce(pc);
    const acode = await SignalCodec.pack({ t: 'answer', sdp: pc.localDescription.sdp });
    renderQR('parentQR', acode);
    $('parentAnswerCode').value = acode;
    $('parentAnswerBox').classList.remove('hidden');
    $('pStep1').classList.add('done');
    $('pStep2').classList.add('active');
  }

  // ------------------------------------------------------------------ control commands (op de babyunit)
  function handleControl(msg) {
    if (role === 'baby') {
      switch (msg.cmd) {
        case 'lullaby':
          if (msg.on) lullaby.play(msg.id);
          else lullaby.stop();
          sendControl({ cmd: 'lullabyState', id: lullaby.isPlaying() ? lullaby.currentName() : null });
          break;
        case 'nightlight':
          $('nightlight').classList.toggle('hidden', !msg.on);
          break;
        case 'ping':
          reportBattery(true);
          break;
      }
    } else {
      // ouder ontvangt statusupdates van de baby
      if (msg.cmd === 'battery') {
        $('pBabyBattPct').textContent = msg.level + '%' + (msg.charging ? ' ⚡' : '');
        $('pBabyBatt').style.width = msg.level + '%';
        $('pBabyBatt').style.background = msg.level < 20 ? 'var(--danger)' : 'var(--accent)';
      } else if (msg.cmd === 'lullabyState') {
        $('pLullaby').classList.toggle('active', !!msg.id);
      }
    }
  }

  async function reportBattery(once) {
    if (!('getBattery' in navigator)) {
      $('bBattPct').textContent = 'n.v.t.';
      return;
    }
    try {
      const b = await navigator.getBattery();
      const upd = () => {
        const pct = Math.round(b.level * 100);
        $('bBatt').style.width = pct + '%';
        $('bBattPct').textContent = pct + '%' + (b.charging ? ' ⚡' : '');
        sendControl({ cmd: 'battery', level: pct, charging: b.charging });
      };
      upd();
      if (!once) {
        b.addEventListener('levelchange', upd);
        b.addEventListener('chargingchange', upd);
      }
    } catch (e) {
      $('bBattPct').textContent = 'n.v.t.';
    }
  }

  // ------------------------------------------------------------------ recording (lokaal opslaan)
  let recorder = null;
  let recChunks = [];
  function pickMime() {
    const opts = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ];
    for (const m of opts) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }
  async function saveBlob(blob, prefix) {
    const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    const name = prefix + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.' + ext;
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: 'Video', accept: { [blob.type || 'video/webm']: ['.' + ext] } }],
        });
        const w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        toast('💾 Opname lokaal opgeslagen');
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
    toast('💾 Opname gedownload');
  }
  function toggleRecord(stream, btn, prefix) {
    if (!stream) return toast('Nog geen beeld om op te nemen');
    if (recorder) {
      recorder.stop();
      return;
    }
    if (!window.MediaRecorder) return toast('Opnemen niet ondersteund in deze browser');
    const mime = pickMime();
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch (e) {
      return toast('Opnemen niet ondersteund');
    }
    recChunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) recChunks.push(e.data);
    };
    recorder.onstop = async () => {
      const blob = new Blob(recChunks, { type: recorder.mimeType || 'video/webm' });
      btn.classList.remove('active');
      recorder = null;
      await saveBlob(blob, prefix);
    };
    recorder.start(1000);
    btn.classList.add('active');
    toast('⏺️ Opname gestart');
  }

  // ------------------------------------------------------------------ parent device
  let audioCtx = null;
  let analyser = null;
  let alarmOn = true;
  let nightMode = false;
  let nightlightOn = false;
  let alarmCooldown = 0;
  let talking = false;
  const LED_COUNT = 12;
  let pLeds = [];

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
    const lit = Math.round((level / 100) * LED_COUNT);
    for (let i = 0; i < LED_COUNT; i++) pLeds[i].classList.toggle('on', i < lit);
    let word = 'Stil';
    if (level > 70) word = 'Luid';
    else if (level > 40) word = 'Matig';
    else if (level > 12) word = 'Zacht';
    $('pSound').textContent = level + '% • ' + word;

    const threshold = 100 - Number($('pSens').value);
    const now = Date.now();
    if (alarmOn && level > threshold) {
      $('pScreen').classList.add('alarm');
      if (now > alarmCooldown) {
        alarmCooldown = now + 6000;
        triggerAlarm();
      }
    } else if (now > alarmCooldown - 5000) {
      $('pScreen').classList.remove('alarm');
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
    toast('🔔 Geluid gedetecteerd bij de baby');
  }

  let parentStarted = false;
  function startParentDevice() {
    if (parentStarted) return;
    parentStarted = true;
    fillGrille($('pGrille'), 36);
    $('pLed').innerHTML = '';
    pLeds = [];
    for (let i = 0; i < LED_COUNT; i++) {
      const d = document.createElement('div');
      d.className = 'led ' + (i >= 10 ? 'r' : i >= 7 ? 'y' : 'g');
      $('pLed').appendChild(d);
      pLeds.push(d);
    }
    // volume/helderheid
    const applyVol = () => {
      const v = Number($('pVol').value) / 100;
      $('pVideo').volume = v;
      $('pVideo').muted = v === 0;
      $('pVolVal').textContent = $('pVol').value + '%';
    };
    const applyBri = () => {
      let f = `brightness(${Number($('pBri').value) / 100})`;
      if (nightMode) f += ' grayscale(1) brightness(0.6) contrast(1.1)';
      $('pVideo').style.filter = f;
      $('pBriVal').textContent = $('pBri').value + '%';
    };
    $('pVol').oninput = applyVol;
    $('pBri').oninput = applyBri;
    $('pSens').oninput = () => ($('pSensVal').textContent = 'Gevoel. ' + $('pSens').value);
    applyVol();
    applyBri();
    $('pSensVal').textContent = 'Gevoel. ' + $('pSens').value;

    // talk (druk-en-houd)
    const talkStart = (e) => {
      if (e) e.preventDefault();
      if (!localStream || talking) return;
      talking = true;
      localStream.getAudioTracks().forEach((t) => (t.enabled = true));
      $('pTalk').classList.add('active');
    };
    const talkEnd = () => {
      if (!talking) return;
      talking = false;
      if (localStream) localStream.getAudioTracks().forEach((t) => (t.enabled = false));
      $('pTalk').classList.remove('active');
    };
    $('pTalk').addEventListener('pointerdown', talkStart);
    $('pTalk').addEventListener('pointerup', talkEnd);
    $('pTalk').addEventListener('pointerleave', talkEnd);
    $('pTalk').addEventListener('pointercancel', talkEnd);

    $('pNightlight').onclick = () => {
      nightlightOn = !nightlightOn;
      $('pNightlight').classList.toggle('active', nightlightOn);
      sendControl({ cmd: 'nightlight', on: nightlightOn });
      toast(nightlightOn ? 'Nachtlamp aan bij de baby' : 'Nachtlamp uit');
    };
    $('pNightmode').onclick = () => {
      nightMode = !nightMode;
      $('pNightmode').classList.toggle('active', nightMode);
      applyBri();
    };
    $('pAlarm').onclick = () => {
      alarmOn = !alarmOn;
      $('pAlarm').classList.toggle('active', alarmOn);
      if (!alarmOn) $('pScreen').classList.remove('alarm');
      toast(alarmOn ? 'Geluidsalarm aan' : 'Geluidsalarm uit');
    };
    $('pSnapshot').onclick = () => {
      const v = $('pVideo');
      if (!v.videoWidth) return toast('Nog geen beeld');
      const c = $('scratch');
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => {
        if (b) saveBlob(b, 'babyfoon-foto').catch(() => {});
      }, 'image/png');
    };
    $('pRecord').onclick = () => toggleRecord(remoteStream, $('pRecord'), 'babyfoon-opname');
    $('pStop').onclick = () => {
      if (confirm('Ouderunit stoppen?')) location.reload();
    };
    // lullaby modal
    $('pLullaby').onclick = () => {
      renderLullabyList();
      $('lullabyModal').classList.remove('hidden');
    };

    // klok
    const clock = () =>
      ($('pClock').textContent =
        String(new Date().getHours()).padStart(2, '0') +
        ':' +
        String(new Date().getMinutes()).padStart(2, '0'));
    clock();
    setInterval(clock, 10000);

    // status opvragen bij de baby
    sendControl({ cmd: 'ping' });
    meterLoop();
    enableWakeLock();
  }

  let lullabyPlayingId = null;
  function renderLullabyList() {
    const list = $('lullabyList');
    list.innerHTML = '';
    LullabyPlayer.list().forEach((item) => {
      const row = document.createElement('div');
      row.className = 'lullaby-item' + (lullabyPlayingId === item.id ? ' playing' : '');
      const name = document.createElement('span');
      name.textContent = (item.kind === 'sound' ? '🌊 ' : '🎵 ') + item.label;
      const btn = document.createElement('button');
      const playing = lullabyPlayingId === item.id;
      btn.textContent = playing ? 'Stop' : 'Speel';
      btn.onclick = () => {
        if (playing) {
          sendControl({ cmd: 'lullaby', on: false, id: item.id });
          lullabyPlayingId = null;
        } else {
          sendControl({ cmd: 'lullaby', on: true, id: item.id });
          lullabyPlayingId = item.id;
        }
        $('pLullaby').classList.toggle('active', !!lullabyPlayingId);
        renderLullabyList();
      };
      row.appendChild(name);
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  // ------------------------------------------------------------------ baby device
  let babyStarted = false;
  let facing = 'environment';
  let micOn = true;
  function startBabyDevice() {
    if (babyStarted) return;
    babyStarted = true;
    fillGrille($('bGrille'), 36);
    $('bFlip').onclick = flipCamera;
    $('bMic').onclick = () => {
      micOn = !micOn;
      localStream.getAudioTracks().forEach((t) => (t.enabled = micOn));
      $('bMic').classList.toggle('active', micOn);
      $('bMic').querySelector('.ic').textContent = micOn ? '🎙️' : '🔇';
    };
    $('bRecord').onclick = () => toggleRecord(localStream, $('bRecord'), 'babyunit-opname');
    $('bStop').onclick = () => {
      if (confirm('Babyunit stoppen?')) location.reload();
    };
    enableWakeLock();
    reportBattery();
  }

  async function flipCamera() {
    facing = facing === 'environment' ? 'user' : 'environment';
    try {
      const ns = await getMedia({
        audio: false,
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      const nt = ns.getVideoTracks()[0];
      const ot = localStream.getVideoTracks()[0];
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
      if (sender) await sender.replaceTrack(nt);
      if (ot) {
        localStream.removeTrack(ot);
        ot.stop();
      }
      localStream.addTrack(nt);
      $('bPreview').srcObject = localStream;
      toast('Camera gewisseld');
    } catch (e) {
      facing = facing === 'environment' ? 'user' : 'environment';
      toast('Kan camera niet wisselen');
    }
  }

  // ------------------------------------------------------------------ wake lock
  let wl = null;
  async function enableWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wl = await navigator.wakeLock.request('screen');
        document.addEventListener('visibilitychange', async () => {
          if (document.visibilityState === 'visible' && !wl) {
            try {
              wl = await navigator.wakeLock.request('screen');
            } catch (e) {}
          }
        });
      }
    } catch (e) {}
  }

  // ------------------------------------------------------------------ wiring
  $('pickBaby').onclick = startBaby;
  $('pickParent').onclick = () => {
    role = 'parent';
    showScreen('screenPairParent');
  };
  $('babyBack').onclick = (e) => {
    e.preventDefault();
    location.reload();
  };
  $('parentBack').onclick = (e) => {
    e.preventDefault();
    location.reload();
  };

  $('copyBabyOffer').onclick = () => copyText($('babyOfferCode').value);
  $('copyParentAnswer').onclick = () => copyText($('parentAnswerCode').value);
  $('babyConnectBtn').onclick = babyConnectAnswer;
  $('parentGenBtn').onclick = parentAcceptOffer;

  $('babyScanBtn').onclick = () => {
    $('babyScanWrap').classList.remove('hidden');
    startScanner($('babyScanVideo'), (data) => {
      $('babyScanWrap').classList.add('hidden');
      $('babyAnswerInput').value = data;
      babyConnectAnswer();
    });
  };
  $('parentScanBtn').onclick = () => {
    $('parentScanWrap').classList.remove('hidden');
    startScanner($('parentScanVideo'), (data) => {
      $('parentScanWrap').classList.add('hidden');
      $('parentOfferInput').value = data;
      parentAcceptOffer();
    });
  };

  $('closeLullaby').onclick = () => $('lullabyModal').classList.add('hidden');
  $('lullabyModal').onclick = (e) => {
    if (e.target === $('lullabyModal')) $('lullabyModal').classList.add('hidden');
  };

  // audio ontgrendelen bij eerste interactie
  document.addEventListener(
    'pointerdown',
    () => {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    },
    { once: true }
  );

  window.addEventListener('pagehide', () => {
    if (pc) pc.close();
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
  });
})();
