'use strict';

/**
 * QRKit — QR-weergave, fullscreen-zoom en camerascanner.
 *
 * Bewust vrij van appstatus: alles wat dit module nodig heeft komt binnen
 * als parameter (stream-fabriek, callbacks, fallback-tekst). Vereist de
 * vendor-libs `qrcode` (generator) en `jsQR` (decoder).
 */
(function () {
  const $ = (id) => document.getElementById(id);
  let scannerStop = null;

  // Tekent een QR als <img> met data-URL (geen library-markup injecteren).
  function render(containerId, text, cell, fallbackText) {
    const box = $(containerId);
    if (!box) return;
    if (box.dataset) box.dataset.code = text;
    try {
      const qr = qrcode(0, 'L');
      qr.addData(text);
      qr.make();
      const img = document.createElement('img');
      img.src = qr.createDataURL(cell || 4, 8);
      img.alt = ''; // decoratief: de container draagt het label
      img.setAttribute('aria-hidden', 'true');
      box.replaceChildren(img);
    } catch (e) {
      const d = document.createElement('div');
      d.style.cssText = 'color:#333;font-size:12px;text-align:center;padding:10px';
      d.textContent = fallbackText || '';
      box.replaceChildren(d);
    }
  }

  // Toon de QR groot op het volledige scherm zodat een camera hem makkelijk leest.
  function openZoom(text, fallbackText) {
    if (!text) return;
    render('qrZoomBox', text, 10, fallbackText);
    $('qrZoom').classList.remove('hidden');
  }
  function closeZoom() { $('qrZoom').classList.add('hidden'); }

  /**
   * Camerascanner: leest frames van videoEl via het meegegeven canvas en
   * roept onResult(tekst) bij een herkende QR. getStream levert de
   * camerastream (of gooit); onError wordt bij mislukken aangeroepen.
   */
  async function startScanner(videoEl, canvas, getStream, onResult, onError) {
    stopScanner();
    let stream;
    try {
      stream = await getStream();
    } catch (e) {
      if (onError) onError(e);
      return;
    }
    videoEl.srcObject = stream;
    await videoEl.play().catch(() => {});
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

  window.QRKit = { render, openZoom, closeZoom, startScanner, stopScanner };
})();
