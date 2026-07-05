'use strict';

/**
 * Babyunit — verzendt camera + microfoon naar de ouderunit en voert
 * besturingscommando's uit (slaapliedjes, nachtlamp, camera wisselen, lamp).
 */
(function () {
  const params = new URLSearchParams(location.search);
  const room = (params.get('room') || Baby.storage.get('lastRoom', '') || '')
    .toUpperCase();

  if (!room) {
    location.href = '/';
    return;
  }

  const el = {
    preview: document.getElementById('preview'),
    overlay: document.getElementById('overlay'),
    statusBig: document.getElementById('statusBig'),
    statusSub: document.getElementById('statusSub'),
    connText: document.getElementById('connText'),
    roomLabel: document.getElementById('roomLabel'),
    liveDot: document.getElementById('liveDot'),
    battFill: document.getElementById('battFill'),
    battPct: document.getElementById('battPct'),
    btnFlip: document.getElementById('btnFlip'),
    btnMic: document.getElementById('btnMic'),
    btnTorch: document.getElementById('btnTorch'),
    btnStop: document.getElementById('btnStop'),
    grille: document.getElementById('grille'),
    nightlight: document.getElementById('nightlight'),
    toast: document.getElementById('toast'),
    screen: document.getElementById('screen'),
    pairCard: document.getElementById('pairCard'),
    pairQR: document.getElementById('pairQR'),
    pairCode: document.getElementById('pairCode'),
  };

  el.roomLabel.textContent = 'Kamer ' + room;

  // Koppelen: korte kamercode + scanbare QR (bevat alleen een kort linkje,
  // zodat de QR spaarzaam en goed leesbaar blijft).
  if (el.pairCode) el.pairCode.textContent = room;
  if (el.pairQR) {
    const link = location.origin + '/parent.html?room=' + encodeURIComponent(room);
    fetch('/api/qr?data=' + encodeURIComponent(link))
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((svg) => {
        el.pairQR.innerHTML = svg;
      })
      .catch(() => {
        el.pairQR.innerHTML =
          '<div style="color:#333;font-size:12px;text-align:center;padding:10px">QR niet beschikbaar</div>';
      });
  }
  function showPairing(show) {
    if (el.pairCard) el.pairCard.classList.toggle('hidden', !show);
  }

  // Luidsprekerrooster tekenen.
  el.grille.innerHTML = '';
  for (let i = 0; i < 36; i++) el.grille.appendChild(document.createElement('i'));

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 3000);
  }

  const lullaby = new LullabyPlayer();

  let localStream = null;
  let facing = 'environment';
  let micOn = true;
  let torchOn = false;
  let link = null;
  let talkbackAudio = null;
  let everConnected = false;

  // -------------------------------------------------------------------------
  // Media starten
  // -------------------------------------------------------------------------
  async function startMedia() {
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: {
        facingMode: facing,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
    };
    localStream = await Baby.getMedia(constraints);
    el.preview.srcObject = localStream;
    updateTorchButton();
  }

  function updateTorchButton() {
    const track = localStream && localStream.getVideoTracks()[0];
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    if (caps && 'torch' in caps) {
      el.btnTorch.disabled = false;
    } else {
      el.btnTorch.disabled = true;
      torchOn = false;
      el.btnTorch.classList.remove('active');
    }
  }

  // -------------------------------------------------------------------------
  // Verbinding
  // -------------------------------------------------------------------------
  function connect() {
    link = new BabyphoneLink({
      room,
      role: 'baby',
      localStream,
      onConnectionState: (state) => {
        if (state === 'connected') {
          everConnected = true;
          el.overlay.classList.add('hidden');
          el.liveDot.classList.add('live');
          el.connText.textContent = 'Verbonden met ouderunit';
          showPairing(false);
        } else if (state === 'connecting' || state === 'new') {
          el.connText.textContent = 'Verbinden met ouderunit…';
        } else if (state === 'disconnected' || state === 'failed') {
          el.liveDot.classList.remove('live');
          el.connText.textContent = 'Verbinding hersteld wordt…';
        }
      },
      onPeerPresence: (present) => {
        if (present) {
          el.connText.textContent = 'Ouderunit gevonden, verbinden…';
        } else {
          el.liveDot.classList.remove('live');
          el.connText.textContent = everConnected
            ? 'Verbinding onderbroken — opnieuw verbinden…'
            : 'Wachten op ouderunit…';
          // Was er al eerder een succesvolle verbinding, toon dan niet meteen
          // weer het volledige koppelscherm — de verbinding herstelt zichzelf
          // op de achtergrond zodra de ouderunit terugkomt.
          if (!everConnected) {
            el.overlay.classList.remove('hidden');
            el.statusBig.textContent = 'Wachten op ouderunit…';
            el.statusSub.textContent = 'Kamer ' + room;
            showPairing(true);
          }
        }
      },
      onSignalingState: (s) => {
        if (s === 'error:role-taken') {
          el.statusBig.textContent = 'Er is al een babyunit in deze kamer';
          el.statusSub.textContent = 'Gebruik een andere kamercode.';
        } else if (s === 'kicked') {
          el.connText.textContent = 'Overgenomen door een andere sessie';
          el.statusBig.textContent = 'Deze babyunit is elders geopend';
          el.statusSub.textContent = 'Sluit dit tabblad of start opnieuw.';
          el.overlay.classList.remove('hidden');
        }
      },
      onTrack: (ev) => {
        // Terugpraten van de ouder: speel het inkomende geluid af.
        if (ev.track.kind === 'audio') {
          if (!talkbackAudio) {
            talkbackAudio = document.createElement('audio');
            talkbackAudio.autoplay = true;
            talkbackAudio.playsInline = true;
            document.body.appendChild(talkbackAudio);
          }
          talkbackAudio.srcObject = ev.streams[0];
          talkbackAudio.play().catch(() => {});
        }
      },
      onControl: handleControl,
    });

    link.start();
    reportBattery();
  }

  // -------------------------------------------------------------------------
  // Besturingscommando's van de ouderunit
  // -------------------------------------------------------------------------
  function handleControl(msg) {
    switch (msg.cmd) {
      case 'lullaby':
        if (msg.on) {
          lullaby.play(msg.id);
          toast('🎵 Slaapliedje aan');
        } else {
          lullaby.stop();
          toast('Slaapliedje uit');
        }
        sendLullabyState();
        break;
      case 'lullabyVolume':
        lullaby.setVolume(msg.value);
        break;
      case 'nightlight': {
        const on = !!msg.on;
        el.nightlight.classList.toggle('hidden', !on);
        if (on) {
          const lvl = msg.level == null ? 60 : msg.level;
          el.nightlight.style.opacity = Math.max(0.12, lvl / 100).toFixed(2);
        }
        // Probeer ook de fysieke flitser als lichtbron (stil — geen foutmelding
        // als het apparaat dit niet ondersteunt).
        setTorch(on, { silent: true });
        break;
      }
      case 'flip':
        flipCamera();
        break;
      case 'torch':
        setTorch(msg.on);
        break;
      case 'ping':
        // Ouder vraagt om status.
        reportBattery(true);
        sendLullabyState();
        break;
      default:
        break;
    }
  }

  function sendLullabyState() {
    if (link) {
      link.sendControl({
        cmd: 'lullabyState',
        id: lullaby.isPlaying() ? lullaby.currentName() : null,
      });
    }
  }

  // -------------------------------------------------------------------------
  // Camera wisselen
  // -------------------------------------------------------------------------
  async function flipCamera() {
    facing = facing === 'environment' ? 'user' : 'environment';
    try {
      const newStream = await Baby.getMedia({
        audio: false,
        video: {
          facingMode: facing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      const newTrack = newStream.getVideoTracks()[0];
      const oldTrack = localStream.getVideoTracks()[0];
      if (oldTrack) {
        localStream.removeTrack(oldTrack);
        oldTrack.stop();
      }
      localStream.addTrack(newTrack);
      el.preview.srcObject = localStream;
      if (link) await link.replaceTrack(newTrack);
      torchOn = false;
      updateTorchButton();
      toast('Camera gewisseld');
    } catch (e) {
      // Terug naar vorige stand als wisselen niet lukt.
      facing = facing === 'environment' ? 'user' : 'environment';
      toast('Kan camera niet wisselen');
    }
  }

  // -------------------------------------------------------------------------
  // Zaklamp (torch)
  // -------------------------------------------------------------------------
  async function setTorch(on, opts) {
    const track = localStream && localStream.getVideoTracks()[0];
    if (!track || !track.applyConstraints) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
      torchOn = on;
      el.btnTorch.classList.toggle('active', on);
    } catch (e) {
      if (!(opts && opts.silent)) toast('Lamp niet ondersteund');
    }
  }

  // -------------------------------------------------------------------------
  // Batterij rapporteren aan de ouderunit
  // -------------------------------------------------------------------------
  async function reportBattery(once) {
    if (!('getBattery' in navigator)) {
      el.battPct.textContent = 'n.v.t.';
      return;
    }
    try {
      const batt = await navigator.getBattery();
      const update = () => {
        const pct = Math.round(batt.level * 100);
        el.battFill.style.width = pct + '%';
        el.battFill.style.background =
          pct < 20 ? 'var(--danger)' : 'var(--accent)';
        el.battPct.textContent = pct + '%' + (batt.charging ? ' ⚡' : '');
        if (link) {
          link.sendControl({
            cmd: 'battery',
            level: pct,
            charging: batt.charging,
          });
        }
      };
      update();
      if (!once) {
        batt.addEventListener('levelchange', update);
        batt.addEventListener('chargingchange', update);
      }
    } catch (e) {
      el.battPct.textContent = 'n.v.t.';
    }
  }

  // -------------------------------------------------------------------------
  // Knoppen
  // -------------------------------------------------------------------------
  el.btnFlip.addEventListener('click', flipCamera);

  el.btnMic.addEventListener('click', () => {
    micOn = !micOn;
    const track = localStream && localStream.getAudioTracks()[0];
    if (track) track.enabled = micOn;
    el.btnMic.classList.toggle('active', micOn);
    el.btnMic.querySelector('.ic').textContent = micOn ? '🎙️' : '🔇';
    toast(micOn ? 'Microfoon aan' : 'Microfoon uit');
  });
  el.btnMic.classList.add('active');

  el.btnTorch.addEventListener('click', () => setTorch(!torchOn));

  el.btnStop.addEventListener('click', () => {
    if (confirm('Babyunit stoppen en terug naar het startscherm?')) {
      cleanup();
      location.href = '/';
    }
  });

  function cleanup() {
    lullaby.stop();
    if (link) link.close();
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    Baby.wakeLock.disable();
  }

  window.addEventListener('pagehide', cleanup);
  window.addEventListener('beforeunload', cleanup);

  // -------------------------------------------------------------------------
  // Opstarten
  // -------------------------------------------------------------------------
  (async function init() {
    try {
      el.statusBig.textContent = 'Camera starten…';
      await startMedia();
      el.statusBig.textContent = 'Wachten op ouderunit…';
      el.statusSub.textContent = 'Kamer ' + room;
      await Baby.wakeLock.enable();
      connect();
    } catch (e) {
      el.overlay.querySelector('.spinner').style.display = 'none';
      el.statusBig.textContent = 'Kan camera/microfoon niet openen';
      el.statusSub.textContent =
        (e && e.message) || 'Geef toestemming en gebruik https of localhost.';
      el.connText.textContent = 'Geen toegang tot camera/microfoon';
    }
  })();
})();
