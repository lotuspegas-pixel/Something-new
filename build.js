'use strict';

/**
 * Productie-build voor de serverloze variant.
 *
 * Maakt een volledige deploy-map met:
 *  - één zelfstandig `index.html` (CSS + lettertypes als base64 + alle JS
 *    inline — geen enkele externe verwijzing meer);
 *  - de statische bijpagina's (legal, how-it-works) en SEO-bestanden
 *    (robots, sitemap, llms.txt, manifest, iconen, og-image);
 *  - de map `music/` met de mp3-playlist.
 *
 *   node build.js [uitvoermap]     (standaard: ./dist)
 */

const fs = require('fs');
const path = require('path');

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

// 1. CSS (basis + dashboards) met lettertypes als base64 data-URI's
const inlineFont = (file) =>
  `url(data:font/woff2;base64,${fs.readFileSync(path.join(SL, 'fonts', file)).toString('base64')})`;

const cssFiles = ['luna.css', 'dash.css'];
const css = cssFiles.map((f) =>
  stripCss(fs.readFileSync(path.join(SL, f), 'utf8'))
    .replace(/url\(['"]?fonts\/([^'")]+)['"]?\)/g, (m, file) => inlineFont(file))
).join('\n');

// brand-theme.css staat in assets/, dus zijn url()'s zijn relatief aan die map:
// ../fonts/... wordt ingesloten, brand/... wordt herschreven naar assets/brand/...
const brandCss = stripCss(fs.readFileSync(path.join(SL, 'assets', 'brand-theme.css'), 'utf8'))
  .replace(/url\(['"]?\.\.\/fonts\/([^'")]+)['"]?\)/g, (m, file) => inlineFont(file))
  .replace(/url\(['"]?(brand\/[^'")]+)['"]?\)/g, (m, p) => `url("assets/${p}")`);

// 2. Alle JS inline, in de volgorde van index.html
const scripts = ['vendor/qrcode.js', 'vendor/jsQR.js', 'vendor/peerjs.min.js',
  'js/i18n.js', 'js/lullaby.js', 'js/qr.js', 'js/app.js'];
const uitgeleverd = {};   // bestand -> de JS-tekst die echt in index.html komt
const inlineScripts = scripts.map((s) => {
  const bron = fs.readFileSync(path.join(SL, s), 'utf8');
  uitgeleverd[s] = eigenJs(s) ? stripJs(bron) : bron;
  const code = uitgeleverd[s].replace(/<\/script/gi, '<\\/script');
  return '<script>\n' + code + '\n</script>';
}).join('\n');

// 3. index.html samenstellen (functie-replacements zodat $ letterlijk blijft)
let html = stripHtml(fs.readFileSync(path.join(SL, 'index.html'), 'utf8'));
html = html.replace(
  /<link rel="stylesheet" href="luna\.css"[^>]*>\s*<link rel="stylesheet" href="dash\.css"[^>]*>\s*<link rel="stylesheet" href="assets\/brand-theme\.css"[^>]*>/,
  () => '<style>\n' + css + '\n' + brandCss + '\n</style>'
);
html = html.replace(
  /<script src="vendor\/qrcode\.js"><\/script>[\s\S]*?<script src="js\/app\.js"><\/script>/,
  () => inlineScripts
);

// 4. Deploy-map vullen
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'index.html'), html);

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
// lettertypes: index.html heeft ze inline, maar de bijpagina's laden assets/brand-theme.css
// van schijf en die verwijst naar ../fonts/ — zonder deze map vallen ze terug op systeemfonts
fs.cpSync(path.join(SL, 'fonts'), path.join(OUT, 'fonts'), { recursive: true });

const kb = (f) => Math.round(fs.statSync(f).size / 1024);
console.log('Build →', OUT);
console.log('  index.html', kb(path.join(OUT, 'index.html')) + ' KB (zelfstandig)');
console.log('  bijpagina’s + SEO:', copies.length, 'bestanden; music/:', fs.readdirSync(path.join(OUT, 'music')).length, 'items');

// Sanity: geen externe script/style-verwijzingen meer in index.html.
// Uitzondering: het Google AdSense-script móét extern van googlesyndication
// geladen worden (advertenties kun je niet inline meebundelen).
const extTags = (html.match(/<(?:script[^>]*\bsrc|link[^>]*rel="stylesheet"[^>]*\bhref)="(?!data:)[^"]+"/gi) || [])
  .filter((t) => !/googlesyndication\.com/i.test(t));
if (extTags.length) {
  console.error('Externe verwijzingen over:', extTags.join(' | '));
  process.exit(1);
}
console.log('  externe script/style-verwijzingen: GEEN ✓');

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
