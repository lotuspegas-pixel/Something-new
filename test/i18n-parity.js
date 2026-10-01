'use strict';

/**
 * Poort voor de meertaligheid.
 *
 * Twee controles, allebei zonder browser:
 *
 *  1. Elke taal kent élke sleutel die in het Engels bestaat. Ontbrekende
 *     sleutels vallen stil terug op Engels — precies waardoor het
 *     toestemmingsvenster (het enige beveiligingsbesluit in de app) in 18 talen
 *     onopgemerkt Engels bleef.
 *  2. Elke sleutel die `index.html` (data-i18n / -ph / -title) of de JS (`T('…')`)
 *     opvraagt, bestaat in het Engels. Zonder deze controle verscheen de ruwe
 *     sleutelnaam als melding op het scherm (zoals ooit "cameraRecovered").
 *
 *   npm run test:i18n
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'serverless');
const I18N = path.join(ROOT, 'js', 'i18n.js');

// i18n.js is een IIFE zonder export. De tabel eruit halen zonder browser: de
// bronregel die `window.I18n` zet uitbreiden en het geheel in een nep-DOM
// draaien. Zo testen we de échte tabel en niet een kopie ervan.
function laadTabellen() {
  let src = fs.readFileSync(I18N, 'utf8');
  const marker = 'window.I18n = I18n;';
  if (src.indexOf(marker) < 0) throw new Error('i18n.js: marker "' + marker + '" niet gevonden');
  src = src.replace(marker, 'window.__S = S; ' + marker);
  const el = () => ({
    setAttribute() {}, getAttribute() { return ''; }, appendChild() {}, addEventListener() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  });
  const doc = {
    documentElement: el(), head: el(), title: '',
    querySelector: () => null, querySelectorAll: () => [], createElement: () => el(),
  };
  const win = {
    document: doc,
    localStorage: { getItem: () => null, setItem: () => {} },
    navigator: { language: 'en' },
    location: { search: '', href: 'http://localhost/' },
  };
  const fn = new Function('window', 'document', 'navigator', 'localStorage', 'location', 'URLSearchParams', src);
  fn(win, doc, win.navigator, win.localStorage, win.location, URLSearchParams);
  if (!win.__S || !win.__S.en) throw new Error('i18n.js: taaltabel niet gevonden');
  return win.__S;
}

function verzamelVerwijzingen() {
  const refs = new Set();
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/data-i18n(?:-ph|-title)?="([^"]+)"/g)) refs.add(m[1]);
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
    for (const m of src.matchAll(/\bT\(\s*'([A-Za-z0-9_]+)'\s*\)/g)) refs.add(m[1]);
    for (const m of src.matchAll(/\bI18n\.t\(\s*'([A-Za-z0-9_]+)'\s*\)/g)) refs.add(m[1]);
  }
  return [...refs];
}

let fail = false;
const check = (n, c) => { console.log((c ? '✅' : '❌') + ' ' + n); if (!c) fail = true; };

const S = laadTabellen();
const talen = Object.keys(S);
const enSleutels = Object.keys(S.en);

const ontbreekt = [];
for (const c of talen) {
  if (c === 'en') continue;
  for (const k of enSleutels) if (!(k in S[c])) ontbreekt.push(c + '.' + k);
}
check('Alle ' + talen.length + ' talen kennen alle ' + enSleutels.length + ' Engelse sleutels'
  + (ontbreekt.length ? ' — ontbreekt: ' + ontbreekt.slice(0, 12).join(', ') + (ontbreekt.length > 12 ? ' …(' + ontbreekt.length + ')' : '') : ''),
ontbreekt.length === 0);

const refs = verzamelVerwijzingen();
const onbekend = refs.filter((k) => !(k in S.en)).sort();
check('Alle ' + refs.length + ' gebruikte sleutels bestaan in het Engels'
  + (onbekend.length ? ' — onbekend: ' + onbekend.join(', ') : ''),
onbekend.length === 0);

// Een sleutel waarvan de tekst in ÉLKE taal gelijk is aan de sleutelnaam zelf
// is in werkelijkheid geen vertaling maar de terugval van t(). Dat lijkt in het
// Engels goed te gaan (zoals ooit bij `or`) en blijft in de andere 29 talen
// onopgemerkt Engels. Een sleutel als `or` die in het Engels toevallig gelijk
// is aan zijn naam maar elders wél vertaald is, is prima.
const schijnvertaling = enSleutels.filter((k) => talen.every((c) => S[c][k] === k));
check('Geen sleutel die in alle talen alleen zijn eigen naam toont'
  + (schijnvertaling.length ? ' — ' + schijnvertaling.join(', ') : ''),
schijnvertaling.length === 0);

// Verdachte terugval: een taal die letterlijk hetzelfde zegt als het Engels op
// een zin die zeker vertaald hoort te zijn. Alleen de toestemmingsdialoog, want
// dat is het enige beveiligingsbesluit in de app.
const kritiek = ['approveTitle', 'approveAsk', 'approveAllow', 'approveDeny', 'authRefused'];
const zelfdeAlsEngels = [];
for (const c of talen) {
  if (c === 'en') continue;
  for (const k of kritiek) if (S[c][k] === S.en[k]) zelfdeAlsEngels.push(c + '.' + k);
}
check('Toestemmingsvenster is in geen enkele taal nog letterlijk Engels'
  + (zelfdeAlsEngels.length ? ' — ' + zelfdeAlsEngels.join(', ') : ''),
zelfdeAlsEngels.length === 0);

console.log('\nRESULTAAT: ' + (fail ? 'MISLUKT' : 'GESLAAGD'));
process.exit(fail ? 1 : 0);
