'use strict';

/**
 * Gedeelde hulpfuncties voor de babyfoon-app.
 */
const Baby = {
  // Genereer een korte, goed leesbare kamercode (zonder verwarrende tekens).
  generateRoomCode(len = 6) {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    const arr = new Uint32Array(len);
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length];
    return out;
  },

  storage: {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('babyfoon.' + key);
        return v === null ? fallback : v;
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem('babyfoon.' + key, value);
      } catch (e) {
        /* noop */
      }
    },
  },

  // Houd het scherm wakker (belangrijk voor een monitor die aan moet blijven).
  wakeLock: {
    _lock: null,
    async enable() {
      try {
        if ('wakeLock' in navigator) {
          this._lock = await navigator.wakeLock.request('screen');
          this._lock.addEventListener('release', () => {
            this._lock = null;
          });
          // Opnieuw aanvragen wanneer het tabblad weer zichtbaar wordt.
          document.addEventListener('visibilitychange', this._onVisible);
          return true;
        }
      } catch (e) {
        /* wake lock niet beschikbaar */
      }
      return false;
    },
    _onVisible: async () => {
      if (document.visibilityState === 'visible' && !Baby.wakeLock._lock) {
        try {
          Baby.wakeLock._lock = await navigator.wakeLock.request('screen');
        } catch (e) {
          /* noop */
        }
      }
    },
    async disable() {
      document.removeEventListener('visibilitychange', this._onVisible);
      if (this._lock) {
        try {
          await this._lock.release();
        } catch (e) {
          /* noop */
        }
        this._lock = null;
      }
    },
  },

  // Leesbare labels voor verbindingsstatus.
  connLabel(state) {
    return (
      {
        new: 'Verbinden…',
        connecting: 'Verbinden…',
        connected: 'Verbonden',
        disconnected: 'Verbinding onderbroken',
        failed: 'Verbinding mislukt',
        closed: 'Gesloten',
      }[state] || state
    );
  },

  // Vraag mediatoestemming en geef nette foutmeldingen.
  async getMedia(constraints) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        'Camera/microfoon niet beschikbaar. Gebruik HTTPS of localhost.'
      );
    }
    return navigator.mediaDevices.getUserMedia(constraints);
  },

  formatClock(d = new Date()) {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  },
};

window.Baby = Baby;
