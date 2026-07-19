'use strict';

/**
 * End-to-end test voor de babyfoon.
 *
 * Start twee browsers (babyunit + ouderunit) met een nep-camera, en
 * controleert of:
 *   1. er daadwerkelijk video van de baby bij de ouder aankomt;
 *   2. besturingscommando's (nachtlamp) via het datakanaal aankomen;
 *   3. terugpraten de microfoon activeert.
 *
 * Vereist een draaiende server (standaard http://localhost:3000).
 *
 *   npm start &   # server
 *   npm test
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:3000/legacy';

// Zoek een bruikbare Chromium (bijv. een vooraf geïnstalleerde in de omgeving).
function findExecutable() {
  if (process.env.PW_CHROMIUM) return process.env.PW_CHROMIUM;
  const roots = ['/opt/pw-browsers'];
  for (const root of roots) {
    try {
      for (const dir of fs.readdirSync(root)) {
        if (dir.startsWith('chromium-')) {
          const p = path.join(root, dir, 'chrome-linux', 'chrome');
          if (fs.existsSync(p)) return p;
        }
      }
    } catch (e) {
      /* map bestaat niet */
    }
  }
  return undefined; // laat Playwright zijn eigen download gebruiken
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const room = 'E2E' + Math.floor(Math.random() * 900 + 100);
  const executablePath = findExecutable();

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  const ctxBaby = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const ctxParent = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const baby = await ctxBaby.newPage();
  const parent = await ctxParent.newPage();

  let failed = false;
  const check = (name, cond) => {
    console.log(`${cond ? '✅' : '❌'} ${name}`);
    if (!cond) failed = true;
  };

  try {
    await baby.goto(`${BASE}/baby.html?room=${room}`);
    await sleep(1500);
    await parent.goto(`${BASE}/parent.html?room=${room}`);

    // 1. Wacht tot er video bij de ouder binnenkomt.
    let info = {};
    const start = Date.now();
    while (Date.now() - start < 25000) {
      info = await parent.evaluate(() => {
        const v = document.getElementById('video');
        return { w: v?.videoWidth || 0, ready: v?.readyState || 0 };
      });
      if (info.w > 0 && info.ready >= 2) break;
      await sleep(500);
    }
    check(`Live video bij ouderunit (${info.w}px)`, info.w > 0 && info.ready >= 2);

    const babyConn = await baby.evaluate(
      () => document.getElementById('connText')?.textContent || ''
    );
    check('Babyunit meldt verbinding', /Verbonden/.test(babyConn));

    await sleep(1000); // datakanaal laten openen

    // 2. Nachtlamp op afstand (druk op de Nachtstand-knop — aan/uit-knop,
    // geen schuifbalk meer).
    await parent.click('#btnNightmode');
    await sleep(700);
    const nl = await baby.evaluate(
      () => !document.getElementById('nightlight').classList.contains('hidden')
    );
    check('Nachtlamp-commando komt aan bij baby', nl);

    // 3. Slaapmuziek: klik op een chip -> gaat naar baby en terug (datakanaal heen en weer).
    await parent.click('#chips .chip');
    await sleep(800);
    const lull = await parent.evaluate(
      () => !!document.querySelector('#chips .chip.on')
    );
    check('Slaapmuziek round-trip (ouder→baby→ouder)', lull);

    // 4. Terugpraten activeert de microfoon.
    await parent.click('#btnTalk');
    await sleep(300);
    const talking = await parent.evaluate(() =>
      document.getElementById('btnTalk').classList.contains('on')
    );
    check('Terugpraten activeert microfoon', talking);
  } catch (err) {
    console.error('Testfout:', err);
    failed = true;
  } finally {
    await browser.close();
  }

  console.log(failed ? '\nRESULTAAT: MISLUKT' : '\nRESULTAAT: GESLAAGD');
  process.exit(failed ? 1 : 0);
})();
