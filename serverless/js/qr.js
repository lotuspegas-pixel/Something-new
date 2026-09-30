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

  // Breedte waarop we het beeld aftasten. De achtercamera van een
  // Android-telefoon levert vaak 1280×720 of meer, en getImageData op zo'n
  // vlak kost per beeldje meer tijd dan er tussen twee beeldjes zit: de
  // scanner liep dan achter de feiten aan en voelde alsof hij vastliep.
  // 640 px breed is ruim genoeg om een QR-code te lezen.
  const SCAN_BREEDTE = 640;

  /**
   * Camerascanner: leest frames van videoEl via het meegegeven canvas en
   * roept onResult(tekst) bij een herkende QR. getStream levert de
   * camerastream (of gooit); onError wordt bij mislukken aangeroepen.
   */
  async function startScanner(videoEl, canvas, getStream, onResult, onError) {
    stopScanner();
    // Zonder de decoder valt er niets te scannen. Dat stil laten mislukken gaf
    // een scherm met cameralicht waar nooit iets gebeurde: de fout viel binnen
    // een requestAnimationFrame-lus en kwam nergens terug.
    if (typeof jsQR !== 'function') {
      if (onError) onError(new Error('jsQR ontbreekt'));
      return;
    }
    let stream;
    try {
      stream = await getStream();
    } catch (e) {
      if (onError) onError(e);
      return;
    }
    videoEl.srcObject = stream;
    // play() geeft in oudere Android-WebViews geen belofte terug. Dan wierp
    // `.catch` van undefined een TypeError en startte de scanner helemaal niet.
    try {
      const p = videoEl.play();
      if (p && p.then) await p.catch(() => {});
    } catch (e) { /* zonder play() proberen we het alsnog op de beeldjes */ }
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
      if (onError) onError(new Error('geen 2d-context'));
      return;
    }
    let stopped = false;
    scannerStop = () => {
      stopped = true;
      try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
      // Ook het videovenster losmaken: blijft srcObject op een gestopte stream
      // staan, dan houdt Android het camera-icoon in de statusbalk aan.
      try { videoEl.srcObject = null; } catch (e) {}
      scannerStop = null;
    };
    (function loop() {
      if (stopped) return;
      if (videoEl.readyState >= 2 && videoEl.videoWidth) {
        const schaal = Math.min(1, SCAN_BREEDTE / videoEl.videoWidth);
        canvas.width = Math.max(1, Math.round(videoEl.videoWidth * schaal));
        canvas.height = Math.max(1, Math.round(videoEl.videoHeight * schaal));
        try {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
          if (res && res.data) {
            scannerStop();
            onResult(res.data);
            return;
          }
        } catch (e) {
          // Eén mislukt beeldje (het spoor viel even weg) is geen reden om te
          // stoppen; blijft het misgaan, dan ziet de gebruiker dat aan het
          // uitblijven van een resultaat en kan hij de code intypen.
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
