'use strict';

/**
 * Productie-build voor de serverloze variant.
 *
 * Maakt een volledige deploy-map met:
 *  - een kleine `index.html` (HTML, JSON-LD en twee kleine inline scripts) die
 *    naar de CSS en de JavaScript VERWIJST in plaats van ze te bevatten;
 *  - `css/site.<hash>.css` en `js/<naam>.<hash>.js`: de stijl en elk script als
 *    eigen bestand, met een hash van de inhoud in de naam;
 *  - de statische bijpagina's (legal, how-it-works) en SEO-bestanden
 *    (robots, sitemap, llms.txt, manifest, iconen, og-image);
 *  - de map `music/` met de mp3-playlist.
 *
 * WAAROM NIET MEER ALLES IN ÉÉN BESTAND. Eerder zat alles inline: 1,7 miljoen
 * tekens, waarvan nog geen 6.000 zichtbare tekst. Een AI-assistent die de pagina
 * als tekst leest betaalt voor elk teken (ruim 375.000 tokens), en een browser
 * kon de code niet bewaren: elk bezoek haalde alles opnieuw op. Met de hash in
 * de bestandsnaam is bewaren veilig: verandert de code, dan verandert de naam,
 * en een oude gecachete app.js kan nooit met een nieuwe index.html botsen.
 * De scripts blijven elk een eigen bestand (niet samengevoegd), in dezelfde
 * volgorde als voorheen, zodat een fout in het ene het andere niet meeneemt en
 * een "use strict" bovenaan het ene niet voor het andere gaat gelden.
 *
 *   node build.js [uitvoermap]     (standaard: ./dist)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SL = path.join(__dirname, 'serverless');
const OUT = path.resolve(process.argv[2] || path.join(__dirname, 'dist'));

let acorn = null;
try { acorn = require('acorn'); } catch (e) { /* hieronder afgehandeld */ }
if (!acorn) {
  console.error('acorn ontbreekt; kan de JS niet verwerken en de browsercompatibiliteit niet controleren.');
  console.error('Draai eerst: npm install');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Commentaar eruit in wat we UITLEVEREN. De broncode in serverless/ blijft
// zoals hij is; alleen de gebouwde index.html wordt kleiner.
//
// Waarom: een kwart van app.js en van de CSS is uitleg voor ons, en die gaat
// nu bij elk bezoek mee over de lijn. Voor een bezoeker maakt het niets uit,
// maar een AI-assistent die de pagina als tekst leest betaalt voor elk teken
// (de pagina is ~1,7 miljoen tekens, waarvan nog geen 6.000 zichtbare tekst).
//
// Bewust met de parser en niet met een zoekpatroon: een `//` in een
// tekenreeks, een sjabloon of een reguliere expressie is geen commentaar, en
// alleen een parser weet dat. Commentaar dat met `/*!` begint of @license of
// @preserve noemt blijft staan.
// ---------------------------------------------------------------------------
function stripJs(src) {
  const comments = [];
  acorn.parse(src, { ecmaVersion: 2018, onComment: (block, text, start, end) => comments.push({ block, text, start, end }) });
  let out = '', pos = 0;
  for (const c of comments) {
    if (c.block && /^!|@license|@preserve/.test(c.text)) continue;
    const ls = src.lastIndexOf('\n', c.start - 1) + 1;
    let nl = src.indexOf('\n', c.end); if (nl < 0) nl = src.length;
    const heleRegel = /^[ \t]*$/.test(src.slice(ls, c.start)) && /^[ \t\r]*$/.test(src.slice(c.end, nl));
    if (heleRegel && ls >= pos) {
      out += src.slice(pos, ls);
      pos = Math.min(nl + 1, src.length);
    } else {
      out += src.slice(pos, c.start);
      pos = c.end;
      // Een blokcommentaar met een regeleinde telt voor JavaScript als regeleinde
      // (`return /*\n*/ x`); een spatie zou dat veranderen.
      if (c.block) out += /\n/.test(src.slice(c.start, c.end)) ? '\n' : ' ';
      else out = out.replace(/[ \t]+$/, '');
    }
  }
  return out + src.slice(pos);
}
function stripCss(src) {
  return src.replace(/\/\*(?!!)[\s\S]*?\*\//g, '').replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, '\n\n');
}
function stripHtml(src) {
  // Scripts en stijlen blijven onaangeroerd; alleen losse HTML-commentaar gaat eruit.
  return src.replace(/(<script\b[\s\S]*?<\/script>)|(<style\b[\s\S]*?<\/style>)|<!--(?!\[if)[\s\S]*?-->/gi,
    (m, sc, st) => sc || st || '');
}
const eigenJs = (f) => f.indexOf('vendor/') !== 0;

// 1. CSS (basis + dashboards + merk) als één bestand in css/. De url()'s moeten
// kloppen vanuit die map, dus één niveau omhoog:
//   luna/dash:   fonts/x.woff2            -> ../fonts/x.woff2
//                assets/brand/x.png       -> ../assets/brand/x.png
//   brand-theme: ../fonts/x.woff2 (blijft; stond al relatief aan assets/, even diep)
//                brand/x.png              -> ../assets/brand/x.png
// De lettertypes blijven losse bestanden (niet meer als base64 ingesloten): dat
// scheelt 260 KB tekst in de pagina en de browser bewaart ze apart.
const cssFiles = ['luna.css', 'dash.css'];
const lunaCss = cssFiles.map((f) =>
  stripCss(fs.readFileSync(path.join(SL, f), 'utf8'))
    .replace(/url\((['"]?)fonts\//g, 'url($1../fonts/')
    .replace(/url\((['"]?)assets\/brand\//g, 'url($1../assets/brand/')
).join('\n');
const brandCss = stripCss(fs.readFileSync(path.join(SL, 'assets', 'brand-theme.css'), 'utf8'))
  .replace(/url\((['"]?)brand\//g, 'url($1../assets/brand/');
const css = lunaCss + '\n' + brandCss;
const hash = (tekst) => crypto.createHash('sha1').update(tekst).digest('hex').slice(0, 10);
const cssNaam = 'css/site.' + hash(css) + '.css';

// 2. Alle JS inline, in de volgorde van index.html
const scripts = ['vendor/qrcode.js', 'vendor/jsQR.js', 'vendor/peerjs.min.js',
  'js/i18n.js', 'js/lullaby.js', 'js/qr.js', 'js/app.js'];
const uitgeleverd = {};   // bronbestand -> de JS-tekst die echt wordt uitgeleverd
const jsNaam = {};       // bronbestand -> js/<naam>.<hash>.js
scripts.forEach((s) => {
  const bron = fs.readFileSync(path.join(SL, s), 'utf8');
  uitgeleverd[s] = eigenJs(s) ? stripJs(bron) : bron;
  jsNaam[s] = 'js/' + path.basename(s, '.js') + '.' + hash(uitgeleverd[s]) + '.js';
});
const scriptTags = scripts.map((s) => '<script src="' + jsNaam[s] + '"></script>').join('\n    ');

// 3. index.html samenstellen (functie-replacements zodat $ letterlijk blijft)
let html = stripHtml(fs.readFileSync(path.join(SL, 'index.html'), 'utf8'));
// De twee lettertypen die op elke pagina meteen nodig zijn worden vooraf
// opgehaald, anders ziet de bezoeker kort de systeemletter voor de echte
// (de lettertypen zaten eerst in de pagina zelf en waren er dus direct).
const fontPreload = ['nunito-latin', 'quicksand-latin'].map((f) =>
  '<link rel="preload" href="fonts/' + f + '.woff2" as="font" type="font/woff2" crossorigin />').join('\n    ');
const na = html.replace(
  /<link rel="stylesheet" href="luna\.css"[^>]*>\s*<link rel="stylesheet" href="dash\.css"[^>]*>\s*<link rel="stylesheet" href="assets\/brand-theme\.css"[^>]*>/,
  () => fontPreload + '\n    <link rel="stylesheet" href="' + cssNaam + '" />'
);
if (na === html) { console.error('De drie stylesheet-links in index.html zijn niet gevonden; de bouw kan ze niet vervangen.'); process.exit(1); }
html = na;
const na2 = html.replace(
  /<script src="vendor\/qrcode\.js"><\/script>[\s\S]*?<script src="js\/app\.js"><\/script>/,
  () => scriptTags
);
if (na2 === html) { console.error('Het blok met de zeven script-tags in index.html is niet gevonden; de bouw kan het niet vervangen.'); process.exit(1); }
html = na2;

// 4. Deploy-map vullen
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);
fs.mkdirSync(path.join(OUT, 'css'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'js'), { recursive: true });
fs.writeFileSync(path.join(OUT, cssNaam), css);
scripts.forEach((s) => fs.writeFileSync(path.join(OUT, jsNaam[s]), uitgeleverd[s]));

const copies = [
  'privacy.html', 'terms.html', 'contact.html', 'accessibility.html',
  'how-it-works.html', 'blog.html', 'security.html', 'about.html', 'robots.txt', 'sitemap.xml', 'llms.txt', 'index.md', 'manifest.webmanifest',
  'favicon-32.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'og-image.jpg',
  '.htaccess', 'LEES-DIT-EERST.txt', 'contact-send.php',
  // app.js haalt dit bij élke paginalading op; zonder bestand gaf dat een 404
  // in de console van zowel de baby- als de ouderunit.
  'turn.json',
];
for (const f of copies) fs.copyFileSync(path.join(SL, f), path.join(OUT, f));
fs.cpSync(path.join(SL, 'music'), path.join(OUT, 'music'), { recursive: true });
// merk-/product-afbeeldingen (logo, camera, hero) — nodig voor de homepage
fs.cpSync(path.join(SL, 'assets'), path.join(OUT, 'assets'), { recursive: true });
// lettertypen: de gebundelde css en de bijpagina's (assets/brand-theme.css) verwijzen
// ernaar via ../fonts/ — zonder deze map vallen ze terug op systeemfonts
fs.cpSync(path.join(SL, 'fonts'), path.join(OUT, 'fonts'), { recursive: true });

const kb = (f) => Math.round(fs.statSync(f).size / 1024);
console.log('Build →', OUT);
console.log('  index.html', kb(path.join(OUT, 'index.html')) + ' KB, ' + cssNaam + ' ' + kb(path.join(OUT, cssNaam)) + ' KB, ' + scripts.length + ' scripts in js/ (' + Math.round(scripts.reduce((a, f) => a + Buffer.byteLength(uitgeleverd[f]), 0) / 1024) + ' KB)');
console.log('  bijpagina’s + SEO:', copies.length, 'bestanden; music/:', fs.readdirSync(path.join(OUT, 'music')).length, 'items');

// Sanity: elke script- en stylesheet-verwijzing in index.html moet (1) naar een
// bestand wijzen dat er echt is, en (2) niet naar een andere host. Eerder was
// "geen enkele verwijzing" de regel omdat alles inline zat; nu is de regel dat
// niets stuk of extern is. Uitzondering: het Google AdSense-script móét extern
// van googlesyndication geladen worden (advertenties kun je niet bundelen).
{
  const verw = [];
  html.replace(/<script\b[^>]*\bsrc="([^"]+)"/gi, (m, u) => { verw.push(u); return m; });
  html.replace(/<link\b[^>]*rel="(?:stylesheet|preload)"[^>]*\bhref="([^"]+)"/gi, (m, u) => { verw.push(u); return m; });
  const stuk = [];
  for (const u of verw) {
    if (/^data:/i.test(u) || /googlesyndication\.com/i.test(u)) continue;
    if (/^(?:https?:)?\/\//i.test(u)) { stuk.push('externe host: ' + u); continue; }
    if (!fs.existsSync(path.join(OUT, u.split('?')[0]))) stuk.push('bestand ontbreekt: ' + u);
  }
  if (stuk.length) {
    console.error('Verwijzingen in index.html kloppen niet:\n  ' + stuk.join('\n  '));
    process.exit(1);
  }
  console.log('  verwijzingen in index.html: ' + verw.length + ', allemaal naar bestanden die er zijn, geen externe host ✓');
}

// Sanity: tokenbudget. Dit is de reden dat de code uit de pagina is gehaald; zonder
// grens kruipt hij ongemerkt terug (een nieuw inline script, een ingesloten
// lettertype). Boven de grens faalt de bouw, met wat er het grootst is.
{
  const MAX = 160 * 1024;
  const n = Buffer.byteLength(html);
  if (n > MAX) {
    const blokken = [];
    html.replace(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, t, inh) => { blokken.push([Buffer.byteLength(inh), t]); return m; });
    blokken.sort((a, b2) => b2[0] - a[0]);
    console.error('index.html is ' + Math.round(n / 1024) + ' KB, boven de grens van ' + (MAX / 1024) + ' KB (tokenbudget voor AI-assistenten).');
    console.error('Grootste inline blokken: ' + blokken.slice(0, 3).map((b3) => b3[1] + ' ' + Math.round(b3[0] / 1024) + ' KB').join(', '));
    process.exit(1);
  }
  console.log('  index.html ' + Math.round(n / 1024) + ' KB, onder de grens van ' + (MAX / 1024) + ' KB ✓');
}

// Sanity: alle JS moet leesbaar zijn voor de oudste browser die we willen
// bedienen — Safari 12 (iOS 12, 2018), dat ES2018 spreekt. Iets nieuwers is
// geen fout tijdens het uitvoeren maar bij het INLEZEN: het hele bestand wordt
// dan ongeldig en er wordt geen enkele knop aangekoppeld. De pagina rendert
// wel gewoon door, dus je ziet een normale maar volledig dode website.
//
// Dit gebeurde echt: eerst een `?.` in app.js en peerjs, daarna een
// `static NOTE = {}` in lullaby.js. Een eerdere controle met zoekpatronen
// miste dat tweede geval volledig — daarom staat hier nu een echte parser.
{
  const stuk = [];
  for (const f of scripts) {
    // Wat hier gekeurd wordt is de tekst die echt in index.html terechtkomt.
    const src = uitgeleverd[f];
    try {
      acorn.parse(src, { ecmaVersion: 2018 });
    } catch (e) {
      const pos = e.pos || 0;
      const regel = src.slice(0, pos).split('\n').length;
      stuk.push(f + ' (regel ' + regel + '): ' + e.message + '\n      rond: ' +
        JSON.stringify(src.slice(Math.max(0, pos - 60), pos + 60).replace(/\n/g, ' ')));
    }
  }
  if (stuk.length) {
    console.error('Te nieuwe JS-syntaxis voor Safari 12 (iOS 12):\n  ' + stuk.join('\n  '));
    process.exit(1);
  }
  console.log('  JS leesbaar voor Safari 12 (ES2018, ' + scripts.length + ' bestanden): JA ✓');
}

// Sanity: het weghalen van commentaar mag het programma niet veranderen. De
// syntaxisboom (zonder posities) van het uitgeleverde bestand moet gelijk zijn
// aan die van de bron. Dit is geen steekproef: het is een bewijs per bestand.
{
  const boom = (src) => JSON.stringify(acorn.parse(src, { ecmaVersion: 2018 }),
    (k, v) => (k === 'start' || k === 'end' ? undefined : v));
  const anders = [];
  let voor = 0, na = 0;
  for (const f of scripts.filter(eigenJs)) {
    const bron = fs.readFileSync(path.join(SL, f), 'utf8');
    voor += bron.length; na += uitgeleverd[f].length;
    if (boom(bron) !== boom(uitgeleverd[f])) anders.push(f);
  }
  if (anders.length) {
    console.error('Het weghalen van commentaar heeft de code veranderd in: ' + anders.join(', '));
    process.exit(1);
  }
  console.log('  commentaar eruit: eigen JS ' + Math.round(voor / 1024) + ' KB → ' + Math.round(na / 1024) +
    ' KB, syntaxisboom identiek ✓');
}
