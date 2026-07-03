'use strict';

/**
 * End-to-end test voor de SERVERLOZE variant.
 *
 * Simuleert het handmatig koppelen (offer/answer via codes) tussen twee
 * browsers en controleert of er live video stroomt en of een
 * besturingscommando (nachtlamp) aankomt.
 *
 * De serverloze app wordt statisch gehost op /serverless/ door de gewone
 * server (alleen voor testgemak — de app werkt ook als los bestand).
 *
 *   npm start &
 *   npm run test:serverless
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE = (process.env.BASE_URL || 'http://localhost:3000') + '/serverless/';
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
  const browser = await chromium.launch({
    executablePath: findExecutable(),
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const cB = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const cP = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const baby = await cB.newPage();
  const parent = await cP.newPage();

  let fail = false;
  const check = (n, c) => {
    console.log(`${c ? '✅' : '❌'} ${n}`);
    if (!c) fail = true;
  };

  try {
    await baby.goto(BASE);
    await parent.goto(BASE);

    await baby.click('#pickBaby');
    let offer = '';
    for (let i = 0; i < 40; i++) {
      offer = await baby.$eval('#babyOfferCode', (e) => e.value);
      if (offer) break;
      await sleep(300);
    }
    check(`Babyunit genereert koppelcode (${offer.length} tekens)`, offer.length > 0);

    await parent.click('#pickParent');
    await parent.fill('#parentOfferInput', offer);
    await parent.click('#parentGenBtn');
    let answer = '';
    for (let i = 0; i < 40; i++) {
      answer = await parent.$eval('#parentAnswerCode', (e) => e.value);
      if (answer) break;
      await sleep(300);
    }
    check(`Ouderunit genereert antwoordcode (${answer.length} tekens)`, answer.length > 0);

    await baby.fill('#babyAnswerInput', answer);
    await baby.click('#babyConnectBtn');

    let info = {};
    const t = Date.now();
    while (Date.now() - t < 25000) {
      info = await parent.evaluate(() => {
        const v = document.getElementById('video');
        return {
          shown: !document.getElementById('screenParent').classList.contains('hidden'),
          w: v?.videoWidth || 0,
          ready: v?.readyState || 0,
        };
      });
      if (info.w > 0 && info.ready >= 2) break;
      await sleep(400);
    }
    check(`Ouder-monitor toont live video (${info.w}px)`, info.shown && info.w > 0 && info.ready >= 2);

    await sleep(1000);
    // Slaapmuziek: klik op een chip -> ouder→baby→ouder round-trip via datakanaal.
    await parent.click('#chips .chip');
    await sleep(800);
    const lull = await parent.evaluate(() => !!document.querySelector('#chips .chip.on'));
    check('Slaapmuziek round-trip (ouder→baby→ouder)', lull);

    // Babyunit-scherm actief.
    const babyShown = await baby.evaluate(
      () => !document.getElementById('screenBaby').classList.contains('hidden')
    );
    check('Babyunit-scherm actief', babyShown);
  } catch (err) {
    console.error('Testfout:', err);
    fail = true;
  } finally {
    await browser.close();
  }

  console.log(fail ? '\nRESULTAAT: MISLUKT' : '\nRESULTAAT: GESLAAGD');
  process.exit(fail ? 1 : 0);
})();
