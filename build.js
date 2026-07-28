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

// 1. CSS (basis + dashboards) met lettertypes als base64 data-URI's
const inlineFont = (file) =>
  `url(data:font/woff2;base64,${fs.readFileSync(path.join(SL, 'fonts', file)).toString('base64')})`;

const cssFiles = ['luna.css', 'dash.css'];
const css = cssFiles.map((f) =>
  fs.readFileSync(path.join(SL, f), 'utf8')
    .replace(/url\(['"]?fonts\/([^'")]+)['"]?\)/g, (m, file) => inlineFont(file))
).join('\n');

// brand-theme.css staat in assets/, dus zijn url()'s zijn relatief aan die map:
// ../fonts/... wordt ingesloten, brand/... wordt herschreven naar assets/brand/...
const brandCss = fs.readFileSync(path.join(SL, 'assets', 'brand-theme.css'), 'utf8')
  .replace(/url\(['"]?\.\.\/fonts\/([^'")]+)['"]?\)/g, (m, file) => inlineFont(file))
  .replace(/url\(['"]?(brand\/[^'")]+)['"]?\)/g, (m, p) => `url("assets/${p}")`);

// 2. Alle JS inline, in de volgorde van index.html
const scripts = ['vendor/qrcode.js', 'vendor/jsQR.js', 'vendor/peerjs.min.js',
  'js/i18n.js', 'js/lullaby.js', 'js/qr.js', 'js/app.js'];
const inlineScripts = scripts.map((s) => {
  const code = fs.readFileSync(path.join(SL, s), 'utf8').replace(/<\/script/gi, '<\\/script');
  return '<script>\n' + code + '\n</script>';
}).join('\n');

// 3. index.html samenstellen (functie-replacements zodat $ letterlijk blijft)
let html = fs.readFileSync(path.join(SL, 'index.html'), 'utf8');
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
  'how-it-works.html', 'blog.html', 'robots.txt', 'ads.txt', 'sitemap.xml', 'llms.txt', 'manifest.webmanifest',
  'favicon-32.png', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'og-image.jpg',
  '.htaccess', 'LEES-DIT-EERST.txt', 'contact-send.php',
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
