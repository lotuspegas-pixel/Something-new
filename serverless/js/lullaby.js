'use strict';

/**
 * Kalmerende geluiden en witte ruis, gegenereerd met de Web Audio API.
 * Geen externe geluidsbestanden nodig. Draait op de pet-cam zodat het
 * geluid uit de speaker bij het huisdier komt (en via de stream naar de eigenaar).
 */
class LullabyPlayer {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.current = null; // { stop() }
    this.name = null;
    this._noteTimer = null;
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this._ensureCtx();
    this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  isPlaying() {
    return !!this.current;
  }

  currentName() {
    return this.name;
  }

  // Frequenties (in Hz) voor noten.
  static NOTE = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0,
    A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25,
    G3: 196.0, A3: 220.0, F3: 174.61, E3: 164.81,
  };

  static MELODIES = {
    twinkle: {
      label: 'Twinkle Twinkle',
      tempo: 480,
      notes: [
        'C4', 'C4', 'G4', 'G4', 'A4', 'A4', 'G4', '-',
        'F4', 'F4', 'E4', 'E4', 'D4', 'D4', 'C4', '-',
        'G4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', '-',
        'G4', 'G4', 'F4', 'F4', 'E4', 'E4', 'D4', '-',
      ],
    },
    brahms: {
      label: 'Rustmelodie (Brahms)',
      tempo: 520,
      notes: [
        'E4', 'E4', 'G4', '-', 'E4', 'E4', 'G4', '-',
        'E4', 'G4', 'C5', 'B4', 'A4', 'A4', 'G4', '-',
        'D4', 'E4', 'F4', 'D4', 'E4', 'F4', '-', 'F4',
        'A4', 'G4', 'F4', 'E4', 'D4', '-', 'C4', '-',
      ],
    },
    frere: {
      label: 'Frère Jacques',
      tempo: 460,
      notes: [
        'C4', 'D4', 'E4', 'C4', 'C4', 'D4', 'E4', 'C4',
        'E4', 'F4', 'G4', '-', 'E4', 'F4', 'G4', '-',
        'G4', 'A4', 'G4', 'F4', 'E4', 'C4', 'G4', 'A4',
        'G4', 'F4', 'E4', 'C4', 'C4', 'G3', 'C4', '-',
      ],
    },
  };

  static SOUNDS = {
    regen: { label: 'Regen', type: 'rain' },
    oceaan: { label: 'Oceaan', type: 'ocean' },
    hartslag: { label: 'Hartslag', type: 'heartbeat' },
    witte: { label: 'Witte ruis', type: 'noise', color: 'white' },
  };

  // Vaste volgorde voor de kalmeermuziek-bediening (vorige/volgende).
  static ORDER = ['regen', 'oceaan', 'hartslag', 'witte'];

  static list() {
    return LullabyPlayer.ORDER.map((id) => ({
      id,
      label: LullabyPlayer.SOUNDS[id].label,
      kind: 'sound',
    }));
  }

  play(id) {
    this._ensureCtx();
    this.stop();
    if (LullabyPlayer.MELODIES[id]) {
      this._playMelody(id);
    } else if (LullabyPlayer.SOUNDS[id]) {
      this._playSound(id);
    } else {
      return false;
    }
    this.name = id;
    return true;
  }

  _playMelody(id) {
    const mel = LullabyPlayer.MELODIES[id];
    const ctx = this.ctx;
    let i = 0;
    let stopped = false;

    const playNext = () => {
      if (stopped) return;
      const note = mel.notes[i % mel.notes.length];
      i++;
      const dur = mel.tempo / 1000;
      if (note !== '-') {
        const freq = LullabyPlayer.NOTE[note] || 440;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        // Zacht in- en uitfaden (glockenspiel-achtig, rustgevend).
        const t = ctx.currentTime;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.9, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.95);
        osc.connect(gain).connect(this.master);
        osc.start(t);
        osc.stop(t + dur);
      }
      this._noteTimer = setTimeout(playNext, mel.tempo);
    };

    playNext();
    this.current = {
      stop: () => {
        stopped = true;
        clearTimeout(this._noteTimer);
      },
    };
  }

  _whiteNoiseSource() {
    const ctx = this.ctx;
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    return src;
  }

  _playSound(id) {
    const s = LullabyPlayer.SOUNDS[id];
    const ctx = this.ctx;

    if (s.type === 'rain') {
      // Regen: witte ruis met hoogdoorlaatfilter (sissend) + zachte druppels.
      const src = this._whiteNoiseSource();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1000;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7000;
      const gain = ctx.createGain();
      gain.gain.value = 0.4;
      src.connect(hp).connect(lp).connect(gain).connect(this.master);
      src.start();
      this.current = { stop: () => src.stop() };
      return;
    }

    if (s.type === 'ocean') {
      // Oceaan: laaggefilterde ruis met trage golfslag (LFO op het volume).
      const src = this._whiteNoiseSource();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 550;
      const gain = ctx.createGain();
      gain.gain.value = 0.28;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.12; // ~8 sec per golf
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.22;
      lfo.connect(lfoGain).connect(gain.gain);
      src.connect(lp).connect(gain).connect(this.master);
      src.start();
      lfo.start();
      this.current = {
        stop: () => {
          src.stop();
          lfo.stop();
        },
      };
      return;
    }

    if (s.type === 'noise') {
      const bufferSize = 2 * ctx.sampleRate;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      if (s.color === 'white') {
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      } else {
        // Roze ruis (Paul Kellett-benadering).
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + white * 0.0555179;
          b1 = 0.99332 * b1 + white * 0.0750759;
          b2 = 0.969 * b2 + white * 0.153852;
          b3 = 0.8665 * b3 + white * 0.3104856;
          b4 = 0.55 * b4 + white * 0.5329522;
          b5 = -0.7616 * b5 - white * 0.016898;
          data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
          b6 = white * 0.115926;
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      src.connect(gain).connect(this.master);
      src.start();
      this.current = { stop: () => src.stop() };
    } else if (s.type === 'heartbeat') {
      let stopped = false;
      const beat = () => {
        if (stopped) return;
        const t = ctx.currentTime;
        const thump = (delay, freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.value = freq;
          gain.gain.setValueAtTime(0.0001, t + delay);
          gain.gain.exponentialRampToValueAtTime(0.8, t + delay + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.18);
          osc.connect(gain).connect(this.master);
          osc.start(t + delay);
          osc.stop(t + delay + 0.2);
        };
        thump(0, 60);
        thump(0.22, 50);
        this._noteTimer = setTimeout(beat, 1000);
      };
      beat();
      this.current = {
        stop: () => {
          stopped = true;
          clearTimeout(this._noteTimer);
        },
      };
    }
  }

  stop() {
    if (this.current) {
      try {
        this.current.stop();
      } catch (e) {
        /* noop */
      }
      this.current = null;
      this.name = null;
    }
    clearTimeout(this._noteTimer);
  }
}

window.LullabyPlayer = LullabyPlayer;
