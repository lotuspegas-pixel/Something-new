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

  // Na hoeveel stilte de scanner zelf iets zegt. Er zijn omstandigheden
  // waarin scannen gewoon niet kán — een weerspiegeling op het scherm, op
  // armlengte en met een bewogen hand tegelijk — en dan moet de app dat
  // zeggen in plaats van een camerabeeld te laten staan waar nooit iets
  // gebeurt. De scanner blijft ondertussen gewoon doorlopen: het gaat om de
  // terugkoppeling, niet om afbreken.
  const HINT_1_MS = 6000;
  const HINT_2_MS = 15000;

  /**
   * Camerascanner: leest frames van videoEl via het meegegeven canvas en
   * roept onResult(tekst) bij een herkende QR. getStream levert de
   * camerastream (of gooit); onError wordt bij mislukken aangeroepen.
   * onHint(niveau) wordt aangeroepen met 1 en later 2 zolang er niets
   * gelezen is, en met 0 zodra de scanner stopt.
   */
  async function startScanner(videoEl, canvas, getStream, onResult, onError, onHint) {
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
    // Twee klokken die een hint geven als er niets gelezen wordt. Ze breken
    // niets af; ze zorgen alleen dat de gebruiker niet eindeloos naar een
    // camerabeeld staat te turen zonder te weten dat hij de code ook gewoon
    // kan intypen.
    const hint = (n) => {
      if (!onHint) return;
      try { onHint(n); } catch (e) {
        // Een kapotte hint mag de scanner niet meeslepen; die blijft lezen.
        // Wel zichtbaar maken dat er iets misging, anders is "er komt geen
        // hint" niet te onderscheiden van "de hint is uitgezet".
        if (onError) onError(e);
      }
    };
    const hintTimers = [
      setTimeout(() => { if (!stopped) hint(1); }, HINT_1_MS),
      setTimeout(() => { if (!stopped) hint(2); }, HINT_2_MS),
    ];
    const stopHints = () => { hintTimers.forEach((t) => clearTimeout(t)); };
    scannerStop = () => {
      stopped = true;
      stopHints();
      hint(0);
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
