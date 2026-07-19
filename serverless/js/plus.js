'use strict';

/**
 * PetCam Plus — licht entitlement-systeem, bewust ZONDER accounts.
 *
 * De kernbelofte van het product is "geen account, geen server, geen opslag".
 * Betalen mag die belofte niet breken. Daarom:
 *
 *  - Stripe Checkout (gehost) verwerkt de betaling, gekoppeld aan een e-mail.
 *  - Eén kleine serverless-functie (zie /functions) geeft na betaling een
 *    ondertekend, tijdelijk token terug. Dat token staat alleen in
 *    localStorage op dit apparaat — precies zoals de taalkeuze.
 *  - De functie beantwoordt uitsluitend "is dit e-mailadres Plus?" en raakt
 *    nooit WebRTC-media aan: het factuur-vlak en het media-vlak blijven
 *    volledig gescheiden.
 *
 * Configuratie door de site-eigenaar (onaangepast = Plus-UI toont "binnenkort"):
 *   window.PETCAM_BILLING = {
 *     checkoutUrl: 'https://billing.petcam.online/checkout',
 *     verifyUrl:   'https://billing.petcam.online/verify',
 *     portalUrl:   'https://billing.petcam.online/portal',
 *     turn: { urls: ['turns:relay.petcam.online:443'], username: '…', credential: '…' },
 *   };
 */
(function () {
  const KEY = 'petcam.plus';
  const CFG = window.PETCAM_BILLING || null;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function write(v) {
    try { v ? localStorage.setItem(KEY, JSON.stringify(v)) : localStorage.removeItem(KEY); } catch (e) {}
  }
  // Leest de payload van een JWT (base64url). De echte handtekening wordt
  // door de serverless-functie gecontroleerd; hier volstaat vorm + vervaltijd
  // omdat Plus-features toch client-side aan/uit gaan.
  function decode(token) {
    try {
      const p = String(token).split('.');
      if (p.length !== 3) return null;
      return JSON.parse(atob(p[1].replace(/-/g, '+').replace(/_/g, '/')));
    } catch (e) { return null; }
  }
  function isActive() {
    const rec = read();
    if (!rec || !rec.token) return false;
    const pl = decode(rec.token);
    return !!(pl && pl.plan === 'plus' && pl.exp * 1000 > Date.now());
  }
  function configured() { return !!(CFG && CFG.checkoutUrl); }

  // Token verversen/herstellen op een (nieuw) apparaat: e-mail → token.
  async function restore(email) {
    if (!CFG || !CFG.verifyUrl) return false;
    const r = await fetch(CFG.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email }),
    });
    if (!r.ok) return false;
    const d = await r.json().catch(() => null);
    if (d && d.token) { write({ token: d.token, email: email }); return isActive(); }
    return false;
  }

  // Na terugkeer uit Stripe Checkout: ?plus_token=…&plus_email=… opvangen en
  // meteen weer uit de adresbalk halen.
  (function captureFromUrl() {
    try {
      const q = new URLSearchParams(location.search);
      const t = q.get('plus_token');
      if (t) {
        write({ token: t, email: q.get('plus_email') || '' });
        q.delete('plus_token'); q.delete('plus_email');
        const rest = q.toString();
        history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
      }
    } catch (e) {}
  })();

  window.Plus = {
    isActive: isActive,
    configured: configured,
    config: CFG,
    read: read,
    decode: decode,
    restore: restore,
    store: function (token, email) { write({ token: token, email: email || '' }); },
    clear: function () { write(null); },
  };
})();
