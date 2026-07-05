'use strict';

/**
 * BabyphoneLink — WebRTC-verbinding tussen de babyunit en de ouderunit.
 *
 * Gebruikt het "perfect negotiation"-patroon zodat de verbinding robuust is,
 * ook als beide kanten tegelijk onderhandelen of het netwerk wisselt
 * (bijv. van wifi naar 4G). Media loopt peer-to-peer; alleen de signalering
 * (offer/answer/ICE) gaat via de server.
 *
 * Rollen:
 *   - 'baby'   : verzendt camera + microfoon, maakt het besturingskanaal aan.
 *   - 'parent' : ontvangt beeld/geluid, verzendt optioneel microfoon (terugpraten).
 * De ouderunit is de "polite" peer.
 */
class BabyphoneLink {
  constructor(opts) {
    this.room = String(opts.room || '').toUpperCase();
    this.role = opts.role === 'baby' ? 'baby' : 'parent';

    // Callbacks
    this.onConnectionState = opts.onConnectionState || (() => {});
    this.onTrack = opts.onTrack || (() => {});
    this.onControl = opts.onControl || (() => {});
    this.onPeerPresence = opts.onPeerPresence || (() => {});
    this.onSignalingState = opts.onSignalingState || (() => {});

    this.localStream = opts.localStream || null;
    this.polite = this.role === 'parent';

    this.pc = null;
    this.ws = null;
    this.iceServers = [];
    this.controlChannel = null;

    this.makingOffer = false;
    this.ignoreOffer = false;

    this._pendingControl = [];
    this._reconnectTimer = null;
    this._recoveryTimer = null;
    this._closed = false;

    // Probeer proactief te herstellen zodra het tabblad weer zichtbaar wordt
    // (bijv. na schermvergrendeling of app-wissel op mobiel — een veelvoorkomend
    // moment waarop wifi/4G/5G is gewisseld terwijl de pagina op de achtergrond stond).
    this._onVisible = () => {
      if (document.visibilityState !== 'visible' || this._closed) return;
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
        this._openSocket();
      } else if (this.pc && this.pc.connectionState !== 'connected') {
        this._attemptRecovery();
      }
    };
    document.addEventListener('visibilitychange', this._onVisible);
  }

  async start() {
    try {
      const res = await fetch('/api/config', { cache: 'no-store' });
      const cfg = await res.json();
      this.iceServers = cfg.iceServers || [];
    } catch (e) {
      // Val terug op enkel STUN als de config niet geladen kan worden.
      this.iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
    }
    this._openSocket();
  }

  setLocalStream(stream) {
    this.localStream = stream;
  }

  // -------------------------------------------------------------------------
  // Signalering via WebSocket
  // -------------------------------------------------------------------------
  _openSocket() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;

    ws.onopen = () => {
      this.onSignalingState('server-connected');
      ws.send(JSON.stringify({ type: 'join', room: this.room, role: this.role }));
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;
      }
      this._onServerMessage(msg);
    };

    ws.onclose = () => {
      this.onSignalingState('server-disconnected');
      if (!this._closed) this._scheduleReconnect();
    };

    ws.onerror = () => {
      this.onSignalingState('server-error');
    };
  }

  _scheduleReconnect() {
    clearTimeout(this._reconnectTimer);
    this._reconnectTimer = setTimeout(() => this._openSocket(), 2000);
  }

  async _onServerMessage(msg) {
    switch (msg.type) {
      case 'joined':
        this.polite = !!msg.polite;
        this.onPeerPresence(!!msg.peerPresent);
        break;
      case 'ready':
        this.onPeerPresence(true);
        this._ensurePeerConnection();
        break;
      case 'peer-left':
        this.onPeerPresence(false);
        this._teardownPeer();
        break;
      case 'kicked':
        // Een nieuwere sessie (bijv. een vernieuwde pagina) heeft deze rol
        // overgenomen. Niet blijven proberen te herverbinden — dat zou de
        // nieuwe sessie er meteen weer uit gooien.
        this._closed = true;
        clearTimeout(this._reconnectTimer);
        clearTimeout(this._recoveryTimer);
        this._teardownPeer();
        this.onSignalingState('kicked');
        break;
      case 'error':
        this.onSignalingState('error:' + msg.reason);
        if (msg.reason === 'role-taken') {
          // Zeldzame race met de opruiming van een verweesde verbinding —
          // de server accepteert normaal altijd de nieuwste sessie, dus dit
          // hoort vanzelf op te lossen. Forceer een verse pogingscyclus.
          clearTimeout(this._reconnectTimer);
          this._reconnectTimer = setTimeout(() => {
            try {
              this.ws.close();
            } catch (e) {
              /* noop */
            }
          }, 1500);
        }
        break;
      case 'signal':
        await this._onSignal(msg.data);
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // PeerConnection + perfect negotiation
  // -------------------------------------------------------------------------
  _ensurePeerConnection() {
    if (this.pc) return this.pc;

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceCandidatePoolSize: 2,
    });
    this.pc = pc;

    // Lokale tracks toevoegen (camera/mic op de babyunit, mic op de ouderunit).
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    // Besturingskanaal (lullaby, nachtlamp, batterij, enz.).
    if (this.role === 'baby') {
      this._setupControlChannel(pc.createDataChannel('control', { ordered: true }));
    } else {
      pc.ondatachannel = (ev) => {
        if (ev.channel.label === 'control') this._setupControlChannel(ev.channel);
      };
    }

    pc.ontrack = (ev) => this.onTrack(ev);

    pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await pc.setLocalDescription();
        this._sendSignal({ description: pc.localDescription });
      } catch (err) {
        console.error('Onderhandelingsfout:', err);
      } finally {
        this.makingOffer = false;
      }
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this._sendSignal({ candidate });
    };

    pc.onconnectionstatechange = () => {
      this.onConnectionState(pc.connectionState);
      if (pc.connectionState === 'connected') {
        this._clearRecoveryTimer();
      } else if (pc.connectionState === 'failed') {
        this._attemptRecovery();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        this._attemptRecovery();
      }
    };

    return pc;
  }

  // Probeer een mislukte verbinding te herstellen. Eerst een ICE-restart
  // (werkt bij de meeste netwerkwissels); als dat niet binnen enkele seconden
  // aanslaat, forceer dan een volledige nieuwe verbinding door de
  // signaleringssocket te sluiten — dat triggert bij beide units een verse
  // 'peer-left' + herverbinding met een gloednieuwe PeerConnection.
  _attemptRecovery() {
    if (!this.pc || this._closed) return;
    try {
      this.pc.restartIce();
    } catch (e) {
      /* noop */
    }
    if (this._recoveryTimer) return;
    this._recoveryTimer = setTimeout(() => {
      this._recoveryTimer = null;
      if (this.pc && this.pc.connectionState !== 'connected') {
        this._teardownPeer();
        try {
          this.ws.close();
        } catch (e) {
          /* noop */
        }
      }
    }, 8000);
  }

  _clearRecoveryTimer() {
    if (this._recoveryTimer) {
      clearTimeout(this._recoveryTimer);
      this._recoveryTimer = null;
    }
  }

  async _onSignal({ description, candidate } = {}) {
    const pc = this._ensurePeerConnection();
    try {
      if (description) {
        const offerCollision =
          description.type === 'offer' &&
          (this.makingOffer || pc.signalingState !== 'stable');

        this.ignoreOffer = !this.polite && offerCollision;
        if (this.ignoreOffer) return;

        await pc.setRemoteDescription(description);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          this._sendSignal({ description: pc.localDescription });
        }
      } else if (candidate) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          if (!this.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      console.error('Signaalverwerkingsfout:', err);
    }
  }

  _sendSignal(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'signal', data }));
    }
  }

  // -------------------------------------------------------------------------
  // Besturingskanaal
  // -------------------------------------------------------------------------
  _setupControlChannel(ch) {
    this.controlChannel = ch;
    ch.onopen = () => {
      const pending = this._pendingControl;
      this._pendingControl = [];
      for (const m of pending) {
        try {
          ch.send(JSON.stringify(m));
        } catch (e) {
          /* noop */
        }
      }
    };
    ch.onmessage = (ev) => {
      try {
        this.onControl(JSON.parse(ev.data));
      } catch (e) {
        /* noop */
      }
    };
  }

  sendControl(obj) {
    const ch = this.controlChannel;
    if (ch && ch.readyState === 'open') {
      try {
        ch.send(JSON.stringify(obj));
      } catch (e) {
        this._pendingControl.push(obj);
      }
    } else {
      this._pendingControl.push(obj);
    }
  }

  // Vervang een uitgaande track (bijv. bij wisselen van camera) zonder de
  // verbinding opnieuw op te bouwen.
  async replaceTrack(newTrack) {
    if (!this.pc) return;
    const sender = this.pc
      .getSenders()
      .find((s) => s.track && s.track.kind === newTrack.kind);
    if (sender) {
      try {
        await sender.replaceTrack(newTrack);
      } catch (e) {
        console.error('replaceTrack mislukt:', e);
      }
    }
  }

  // Geef de sender voor een bepaald type track (audio/video).
  getSender(kind) {
    if (!this.pc) return null;
    return this.pc.getSenders().find((s) => s.track && s.track.kind === kind) || null;
  }

  // -------------------------------------------------------------------------
  // Statistieken (voor signaalsterkte-indicator)
  // -------------------------------------------------------------------------
  async getStats() {
    if (!this.pc) return null;
    const result = { rtt: null, jitter: null, bitrateKbps: null, packetsLost: null };
    try {
      const stats = await this.pc.getStats();
      let inbound = null;
      let pair = null;
      stats.forEach((r) => {
        if (r.type === 'inbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) {
          inbound = r;
        }
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated) {
          pair = r;
        }
      });
      if (pair && typeof pair.currentRoundTripTime === 'number') {
        result.rtt = pair.currentRoundTripTime * 1000; // ms
      }
      if (inbound) {
        result.jitter = typeof inbound.jitter === 'number' ? inbound.jitter * 1000 : null;
        result.packetsLost = inbound.packetsLost ?? null;
        const now = inbound.timestamp;
        const bytes = inbound.bytesReceived || 0;
        if (this._lastInbound) {
          const dt = (now - this._lastInbound.ts) / 1000;
          if (dt > 0) {
            result.bitrateKbps = Math.max(
              0,
              ((bytes - this._lastInbound.bytes) * 8) / 1000 / dt
            );
          }
        }
        this._lastInbound = { ts: now, bytes };
      }
    } catch (e) {
      /* noop */
    }
    return result;
  }

  // -------------------------------------------------------------------------
  // Opruimen
  // -------------------------------------------------------------------------
  _teardownPeer() {
    this._clearRecoveryTimer();
    if (this.pc) {
      try {
        this.pc.close();
      } catch (e) {
        /* noop */
      }
      this.pc = null;
    }
    this.controlChannel = null;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this._lastInbound = null;
  }

  close() {
    this._closed = true;
    clearTimeout(this._reconnectTimer);
    this._clearRecoveryTimer();
    document.removeEventListener('visibilitychange', this._onVisible);
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'bye' }));
      }
    } catch (e) {
      /* noop */
    }
    this._teardownPeer();
    try {
      if (this.ws) this.ws.close();
    } catch (e) {
      /* noop */
    }
  }
}

window.BabyphoneLink = BabyphoneLink;
