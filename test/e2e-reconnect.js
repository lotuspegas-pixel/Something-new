'use strict';

/**
 * End-to-end test voor herverbinden na een verbroken verbinding.
 *
 * Simuleert precies het gerapporteerde scenario: een ouderunit verliest
 * abrupt de verbinding (netwerkuitval — geen nette 'bye', zoals bij wifi/4G-
 * wissel of het sluiten van een dood tabblad) en er wordt vrijwel meteen een
 * nieuwe sessie voor dezelfde kamer geopend (bijv. door de pagina te
 * verversen). Dit moet altijd lukken — nooit een blijvende
 * "er is al een ouderunit in deze kamer"-melding.
 *
 *   npm start &
 *   node test/e2e-reconnect.js
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3000/legacy';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function findExecutable() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  try {
    for (const dir of fs.readdirSync('/opt/pw-browsers')) {
      if (dir.startsWith('chromium-')) {
        const p = path.join('/opt/pw-browsers', dir, 'chrome-linux', 'chrome');
        if (fs.existsSync(p)) return p;
      }
    }
  } catch (e) {
    /* niet gevonden */
  }
  return undefined;
}

(async () => {
  const room = 'RECON' + Math.floor(Math.random() * 900 + 100);
  const browser = await chromium.launch({
    executablePath: findExecutable(),
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  let fail = false;
  const check = (n, c) => {
    console.log(`${c ? '✅' : '❌'} ${n}`);
    if (!c) fail = true;
  };

  try {
    const cB = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const baby = await cB.newPage();
    await baby.goto(`${BASE}/baby.html?room=${room}`);
    await sleep(1000);

    const cP1 = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const parent1 = await cP1.newPage();
    await parent1.goto(`${BASE}/parent.html?room=${room}`);

    let t = Date.now();
    while (Date.now() - t < 20000) {
      const w = await parent1.evaluate(() => document.getElementById('video')?.videoWidth || 0);
      if (w > 0) break;
      await sleep(400);
    }
    const w1 = await parent1.evaluate(() => document.getElementById('video')?.videoWidth || 0);
    check(`Eerste ouderunit verbindt (${w1}px)`, w1 > 0);

    // Simuleer "wifi valt uit, pagina wordt ververst": sluit de eerste tab
    // abrupt (geen nette 'bye') en open direct een nieuwe ouder-sessie voor
    // dezelfde kamer, ruim voordat de heartbeat de oude zou opruimen.
    await cP1.close();
    await sleep(300);

    const cP2 = await browser.newContext({ permissions: ['camera', 'microphone'] });
    const parent2 = await cP2.newPage();
    await parent2.goto(`${BASE}/parent.html?room=${room}`);

    t = Date.now();
    let w2 = 0;
    while (Date.now() - t < 20000) {
      w2 = await parent2.evaluate(() => document.getElementById('video')?.videoWidth || 0);
      if (w2 > 0) break;
      await sleep(400);
    }
    check(`Nieuwe sessie verbindt direct na "netwerkuitval" (${w2}px)`, w2 > 0);
  } catch (err) {
    console.error('Testfout:', err);
    fail = true;
  } finally {
    await browser.close();
  }

  console.log(fail ? '\nRESULTAAT: MISLUKT' : '\nRESULTAAT: GESLAAGD');
  process.exit(fail ? 1 : 0);
})();
