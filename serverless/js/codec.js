'use strict';

/**
 * Codec voor koppelcodes (serverloze variant).
 *
 * Zet de WebRTC-verbindingsgegevens (SDP) om naar een compacte, deelbare
 * tekst. Comprimeert met deflate waar beschikbaar zodat de code in een
 * QR-code past. De code begint met een marker:
 *   'D' = deflate-gecomprimeerd, 'R' = ruw (geen compressie).
 */
const SignalCodec = {
  _b64FromBytes(bytes) {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  },

  _bytesFromB64(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },

  async pack(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream !== 'undefined') {
      try {
        const cs = new CompressionStream('deflate-raw');
        const buf = await new Response(
          new Blob([bytes]).stream().pipeThrough(cs)
        ).arrayBuffer();
        return 'D' + this._b64FromBytes(new Uint8Array(buf));
      } catch (e) {
        /* val terug op ruw */
      }
    }
    return 'R' + this._b64FromBytes(bytes);
  },

  async unpack(code) {
    code = String(code).trim().replace(/\s+/g, '');
    const marker = code[0];
    const data = this._bytesFromB64(code.slice(1));
    let bytes = data;
    if (marker === 'D') {
      const ds = new DecompressionStream('deflate-raw');
      const buf = await new Response(
        new Blob([data]).stream().pipeThrough(ds)
      ).arrayBuffer();
      bytes = new Uint8Array(buf);
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  },
};

window.SignalCodec = SignalCodec;
