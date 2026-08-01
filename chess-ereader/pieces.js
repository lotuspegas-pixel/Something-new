/* pieces.js -- Hand-drawn SVG schaakstukken voor de e-reader schaakapp.
 *
 * Pure ES5, geen externe afhankelijkheden, werkt volledig offline.
 *
 * Publieke API (window.PieceSets):
 *
 *   window.PieceSets = {
 *     klassiek: { name: 'Klassiek', render: function (pieceChar) { ... } },
 *     modern:   { name: 'Modern',   render: function (pieceChar) { ... } },
 *     symbool:  { name: 'Symbolen', render: function (pieceChar) { ... } }
 *   };
 *
 * pieceChar is een van K Q R B N P (wit) of k q r b n p (zwart).
 * render() geeft een complete, losstaande <svg>...</svg> string terug.
 *
 * Alle kleuren komen uit CSS custom properties zodat een thema de stukken
 * kan herkleuren zonder dit bestand aan te raken:
 *
 *   --piece-white    vulkleur witte stukken   (fallback #ffffff)
 *   --piece-black    vulkleur zwarte stukken  (fallback #2b2b2b)
 *   --piece-outline  omtreklijn, alle stukken (fallback #111111)
 *   --piece-detail   contrastdetail op donkere stukken (fallback #ffffff)
 */
(function (global) {
  'use strict';

  var C_WHITE = 'var(--piece-white, #ffffff)';
  var C_BLACK = 'var(--piece-black, #2b2b2b)';
  var C_LINE = 'var(--piece-outline, #111111)';
  var C_DETAIL = 'var(--piece-detail, #ffffff)';

  /* ---------------------------------------------------------------- utils */

  /* Uppercase == wit stuk. */
  function isWhitePiece(ch) {
    return ch >= 'A' && ch <= 'Z';
  }

  function bodyFill(white) {
    return white ? C_WHITE : C_BLACK;
  }

  /* Binnenlijnen: op een wit stuk zijn dat gewoon omtreklijnen, op een
     donker stuk moeten ze juist licht zijn om nog leesbaar te blijven. */
  function detailColor(white) {
    return white ? C_LINE : C_DETAIL;
  }

  /* Bouwt de losstaande <svg> wrapper. */
  function wrap(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 45 45"' +
      ' class="piece-svg" width="100%" height="100%"' +
      ' preserveAspectRatio="xMidYMid meet"' +
      ' aria-hidden="true" focusable="false">' + inner + '</svg>';
  }

  /* Groep met de gevulde vormen (vulkleur + omtrek). */
  function shapeGroup(white, sw, inner) {
    return '<g fill="' + bodyFill(white) + '" stroke="' + C_LINE +
      '" stroke-width="' + sw + '" stroke-linejoin="round"' +
      ' stroke-linecap="round">' + inner + '</g>';
  }

  /* Groep met alleen binnenlijnen (geen vulling). */
  function lineGroup(white, sw, inner) {
    return '<g fill="none" stroke="' + detailColor(white) +
      '" stroke-width="' + sw + '" stroke-linejoin="round"' +
      ' stroke-linecap="round">' + inner + '</g>';
  }

  /* ============================================================== KLASSIEK
   * Staunton-silhouetten, in de geest van een gedrukt schaakdiagram.
   * Alle padgegevens zijn met de hand uitgezet in de 45x45 viewBox.
   */

  var klassiekShapes = {
    /* Pion: bolkop, korte hals, uitlopende voet. */
    p: '<circle cx="22.5" cy="11.4" r="4.7"/>' +
       '<path d="M 22.5,15.6' +
       ' C 19.3,15.6 17.0,17.7 17.0,20.4' +
       ' C 17.0,22.2 18.0,23.7 19.6,24.6' +
       ' C 16.0,26.0 11.4,30.6 11.4,39.5' +
       ' L 33.6,39.5' +
       ' C 33.6,30.6 29.0,26.0 25.4,24.6' +
       ' C 27.0,23.7 28.0,22.2 28.0,20.4' +
       ' C 28.0,17.7 25.7,15.6 22.5,15.6 Z"/>',

    /* Toren: kantelen, schuine kraag, recht lichaam, brede voet. */
    r: '<path d="M 9.2,8.2 L 14.4,8.2 L 14.4,11.7 L 19.9,11.7 L 19.9,8.2' +
       ' L 25.1,8.2 L 25.1,11.7 L 30.6,11.7 L 30.6,8.2 L 35.8,8.2' +
       ' L 35.8,14.3 L 9.2,14.3 Z"/>' +
       '<path d="M 9.2,14.3 L 35.8,14.3 L 32.6,17.6 L 12.4,17.6 Z"/>' +
       '<path d="M 12.4,17.6 L 32.6,17.6 L 31.3,30.2 L 13.7,30.2 Z"/>' +
       '<path d="M 13.7,30.2 L 31.3,30.2 L 34.4,33.7 L 10.6,33.7 Z"/>' +
       '<path d="M 10.6,33.7 L 34.4,33.7' +
       ' C 35.6,35.6 36.4,37.5 36.7,39.5 L 8.3,39.5' +
       ' C 8.6,37.5 9.4,35.6 10.6,33.7 Z"/>',

    /* Paard: paardenkop en profil, naar links kijkend. */
    n: '<path d="M 10.0,22.0' +
       ' C 11.4,18.6 14.0,15.0 17.4,12.4' +
       ' C 18.6,11.2 20.0,10.6 21.0,10.2' +
       ' L 19.8,5.4 L 23.8,9.2 L 26.8,5.8 L 28.6,11.6' +
       ' C 31.0,14.4 32.4,18.6 33.0,23.2' +
       ' C 33.4,26.6 33.6,30.2 33.6,33.4' +
       ' L 11.4,33.4' +
       ' C 11.4,31.8 12.4,30.4 14.2,29.0' +
       ' C 16.4,27.2 18.4,25.0 19.4,22.6' +
       ' C 18.0,24.0 16.4,25.0 15.0,24.8' +
       ' C 14.0,24.6 13.7,23.8 14.2,22.6' +
       ' C 13.0,23.8 11.6,24.6 10.6,24.4' +
       ' C 9.8,24.2 9.6,23.4 10.0,22.0 Z"/>' +
       '<path d="M 11.4,33.4 L 33.6,33.4' +
       ' C 34.9,35.4 35.7,37.4 36.0,39.5 L 9.0,39.5' +
       ' C 9.3,37.4 10.1,35.4 11.4,33.4 Z"/>',
    nDetail:
       '<circle cx="17.0" cy="17.6" r="1.4" stroke-width="0.5"/>' +
       '<circle cx="11.9" cy="21.5" r="0.7" stroke-width="0.5"/>' +
       '<path d="M 23.4,10.4 C 26.8,13.2 29.2,17.0 30.4,21.6" fill="none"/>' +
       '<path d="M 25.8,10.6 L 27.6,12.6" fill="none"/>' +
       '<path d="M 28.0,14.0 L 29.8,16.2" fill="none"/>',

    /* Loper: bol, mijter met diagonale spleet, kraag, voet. */
    b: '<circle cx="22.5" cy="7.6" r="2.5"/>' +
       '<path d="M 22.5,9.6' +
       ' C 26.0,12.4 29.6,17.0 29.6,21.0' +
       ' C 29.6,24.4 26.4,26.2 22.5,26.2' +
       ' C 18.6,26.2 15.4,24.4 15.4,21.0' +
       ' C 15.4,17.0 19.0,12.4 22.5,9.6 Z"/>' +
       '<path d="M 16.6,26.2 L 28.4,26.2 L 29.8,30.2 L 15.2,30.2 Z"/>' +
       '<path d="M 15.2,30.2 L 29.8,30.2' +
       ' C 32.4,32.4 34.4,35.9 35.0,39.5 L 10.0,39.5' +
       ' C 10.6,35.9 12.6,32.4 15.2,30.2 Z"/>',
    bDetail:
       '<path d="M 22.9,12.6 L 27.4,19.2" fill="none"/>',

    /* Dame: kroon met vijf punten en bollen, band, brede voet. */
    q: '<circle cx="8.0" cy="12.0" r="2.4"/>' +
       '<circle cx="15.2" cy="8.9" r="2.4"/>' +
       '<circle cx="22.5" cy="7.6" r="2.6"/>' +
       '<circle cx="29.8" cy="8.9" r="2.4"/>' +
       '<circle cx="37.0" cy="12.0" r="2.4"/>' +
       '<path d="M 9.8,26.2' +
       ' C 16.4,24.8 28.6,24.8 35.2,26.2' +
       ' L 37.6,14.2 L 30.2,25.2 L 30.0,11.2 L 25.0,24.8' +
       ' L 22.5,10.0 L 20.0,24.8 L 15.0,11.2 L 14.8,25.2 L 7.4,14.2 Z"/>' +
       '<path d="M 9.8,26.2 C 16.4,24.8 28.6,24.8 35.2,26.2' +
       ' L 34.0,30.8 L 11.0,30.8 Z"/>' +
       '<path d="M 11.0,30.8 L 34.0,30.8' +
       ' C 36.4,33.2 38.0,36.3 38.4,39.5 L 6.6,39.5' +
       ' C 7.0,36.3 8.6,33.2 11.0,30.8 Z"/>',
    qDetail:
       '<path d="M 12.4,29.0 C 18.4,27.6 26.6,27.6 32.6,29.0" fill="none"/>',

    /* Koning: kruis, mijter, brede schouders, voet. */
    k: '<path d="M 12.4,32.2 L 32.6,32.2' +
       ' C 35.2,34.4 37.3,36.9 37.9,39.5 L 7.1,39.5' +
       ' C 7.7,36.9 9.8,34.4 12.4,32.2 Z"/>' +
       '<path d="M 19.8,25.2' +
       ' C 17.6,21.6 12.6,19.8 9.6,22.6' +
       ' C 6.2,25.8 9.2,29.4 12.4,30.8' +
       ' L 12.4,32.6 L 32.6,32.6 L 32.6,30.8' +
       ' C 35.8,29.4 38.8,25.8 35.4,22.6' +
       ' C 32.4,19.8 27.4,21.6 25.2,25.2 Z"/>' +
       '<path d="M 22.5,12.8' +
       ' C 19.6,12.8 17.6,15.2 17.6,18.2' +
       ' C 17.6,21.2 18.8,23.4 19.7,25.4' +
       ' L 25.3,25.4' +
       ' C 26.2,23.4 27.4,21.2 27.4,18.2' +
       ' C 27.4,15.2 25.4,12.8 22.5,12.8 Z"/>' +
       '<path d="M 21.1,4.2 L 23.9,4.2 L 23.9,7.8 L 27.5,7.8 L 27.5,10.6' +
       ' L 23.9,10.6 L 23.9,14.4 L 21.1,14.4 L 21.1,10.6 L 17.5,10.6' +
       ' L 17.5,7.8 L 21.1,7.8 Z"/>',
    kDetail:
       '<path d="M 12.6,30.2 C 18.4,27.4 26.6,27.4 32.4,30.2" fill="none"/>' +
       '<path d="M 12.2,26.6 C 15.0,24.4 18.0,24.6 20.2,26.8" fill="none"/>' +
       '<path d="M 32.8,26.6 C 30.0,24.4 27.0,24.6 24.8,26.8" fill="none"/>'
  };

  function renderKlassiek(ch) {
    var white = isWhitePiece(ch);
    var key = ch.toLowerCase();
    var shapes = klassiekShapes[key];
    if (!shapes) { return wrap(''); }
    var detail = klassiekShapes[key + 'Detail'];
    var out = shapeGroup(white, 1.4, shapes);
    if (detail) { out += lineGroup(white, 1.0, detail); }
    return wrap(out);
  }

  /* ================================================================ MODERN
   * Vlakker en geometrischer: minder lijnen, dikkere vormen, ook op een
   * traag scherm en op klein formaat nog goed te herkennen.
   */

  var modernShapes = {
    /* Pion: bol op een trapezium met een blokvoet. */
    p: '<circle cx="22.5" cy="13.0" r="5.6"/>' +
       '<path d="M 18.4,18.6 L 26.6,18.6 L 29.4,31.0 L 15.6,31.0 Z"/>' +
       '<path d="M 12.8,31.0 L 32.2,31.0 L 34.6,39.4 L 10.4,39.4 Z"/>',

    /* Toren: één blokkig silhouet met vierkante kantelen. */
    r: '<path d="M 9.6,8.4 L 15.0,8.4 L 15.0,12.6 L 19.8,12.6 L 19.8,8.4' +
       ' L 25.2,8.4 L 25.2,12.6 L 30.0,12.6 L 30.0,8.4 L 35.4,8.4' +
       ' L 35.4,17.6 L 31.8,17.6 L 31.8,30.6 L 35.0,30.6 L 35.0,39.4' +
       ' L 10.0,39.4 L 10.0,30.6 L 13.2,30.6 L 13.2,17.6 L 9.6,17.6 Z"/>',

    /* Paard: hoekige, gefacetteerde paardenkop. */
    n: '<path d="M 20.0,6.2 L 22.8,11.2 L 26.4,8.0 L 29.0,13.8' +
       ' C 31.8,17.6 32.9,22.2 32.9,26.4 L 32.9,30.6 L 13.4,30.6' +
       ' C 13.4,29.0 13.9,27.8 14.8,26.6' +
       ' L 11.0,25.8 L 9.6,24.0 L 10.6,21.0 L 15.4,13.4 Z"/>' +
       '<path d="M 12.4,30.6 L 32.9,30.6 L 35.0,39.4 L 10.0,39.4 Z"/>',
    nDetail:
       '<circle cx="17.6" cy="17.4" r="1.6" stroke-width="0.5"/>' +
       '<path d="M 23.8,12.6 C 27.4,15.6 29.8,19.4 30.8,23.8" fill="none"/>',

    /* Loper: bol op een afgeronde punt, met blokvoet. */
    b: '<circle cx="22.5" cy="8.0" r="3.0"/>' +
       '<path d="M 22.5,10.6' +
       ' C 27.4,15.0 30.0,20.2 30.0,24.2' +
       ' C 30.0,27.4 26.8,29.2 22.5,29.2' +
       ' C 18.2,29.2 15.0,27.4 15.0,24.2' +
       ' C 15.0,20.2 17.6,15.0 22.5,10.6 Z"/>' +
       '<path d="M 13.0,29.4 L 32.0,29.4 L 34.6,39.4 L 10.4,39.4 Z"/>',
    bDetail:
       '<path d="M 22.8,15.4 L 27.0,21.6" fill="none"/>',

    /* Dame: zaagtandkroon met bollen op de punten. */
    q: '<circle cx="8.6" cy="12.4" r="2.8"/>' +
       '<circle cx="22.5" cy="8.0" r="3.0"/>' +
       '<circle cx="36.4" cy="12.4" r="2.8"/>' +
       '<path d="M 8.6,14.4 L 13.8,24.0 L 22.5,10.6 L 31.2,24.0' +
       ' L 36.4,14.4 L 33.4,29.4 L 11.6,29.4 Z"/>' +
       '<path d="M 12.0,29.6 L 33.0,29.6 L 35.8,39.4 L 9.2,39.4 Z"/>',

    /* Koning: dik kruis boven een brede, vlakke romp. */
    k: '<path d="M 20.6,4.4 L 24.4,4.4 L 24.4,8.4 L 28.4,8.4 L 28.4,12.2' +
       ' L 24.4,12.2 L 24.4,16.2 L 20.6,16.2 L 20.6,12.2 L 16.6,12.2' +
       ' L 16.6,8.4 L 20.6,8.4 Z"/>' +
       '<path d="M 22.5,16.0' +
       ' C 17.0,16.0 12.4,19.4 12.4,24.2 L 12.4,30.2 L 32.6,30.2' +
       ' L 32.6,24.2 C 32.6,19.4 28.0,16.0 22.5,16.0 Z"/>' +
       '<path d="M 11.2,30.0 L 33.8,30.0 L 36.4,39.4 L 8.6,39.4 Z"/>',
    kDetail:
       '<path d="M 14.4,25.4 L 30.6,25.4" fill="none"/>'
  };

  function renderModern(ch) {
    var white = isWhitePiece(ch);
    var key = ch.toLowerCase();
    var shapes = modernShapes[key];
    if (!shapes) { return wrap(''); }
    var detail = modernShapes[key + 'Detail'];
    var out = shapeGroup(white, 1.5, shapes);
    if (detail) { out += lineGroup(white, 1.1, detail); }
    return wrap(out);
  }

  /* =============================================================== SYMBOOL
   * Zo licht mogelijk voor oude/trage e-readers: één <text> met het
   * Unicode-schaakteken, gecentreerd in de 45x45 viewBox.
   */

  /* Beide kleuren gebruiken de *gevulde* glyphs. De open contourtekens
     (♔♕♖♗♘♙) zijn veel lichter van gewicht dan de gevulde, waardoor wit en
     zwart er als twee verschillende sets uitzien. Door voor allebei de gevulde
     vorm te nemen en die simpelweg wit of zwart te vullen, krijg je één set
     met gelijk silhouet — precies zoals bij de getekende sets. */
  var GLYPHS = {
    K: '♚', Q: '♛', R: '♜',
    B: '♝', N: '♞', P: '♟',
    k: '♚', q: '♛', r: '♜',
    b: '♝', n: '♞', p: '♟'
  };

  var GLYPH_FONT = '"DejaVu Sans","Segoe UI Symbol","Arial Unicode MS",' +
    'FreeSerif,serif';

  function renderSymbool(ch) {
    var glyph = GLYPHS[ch];
    if (!glyph) { return wrap(''); }
    var white = isWhitePiece(ch);
    /* Een omtreklijn houdt het witte stuk leesbaar op een licht veld en het
       zwarte stuk op een donker veld. */
    return wrap('<text x="22.5" y="35.2" text-anchor="middle"' +
      ' font-size="34" font-family=' + "'" + GLYPH_FONT + "'" +
      ' fill="' + bodyFill(white) + '"' +
      ' stroke="' + C_LINE + '" stroke-width="0.9"' +
      ' stroke-linejoin="round" paint-order="stroke">' + glyph + '</text>');
  }

  /* ================================================================= TEKST
   * Helemaal zonder SVG: de oudste e-readerbrowsers (bijvoorbeeld de
   * Android 2.x-browser van de Sony PRS-T-serie) kunnen geen inline SVG
   * tonen en laten het bord dan leeg. Deze set gebruikt gewone HTML-tekst en
   * werkt daardoor overal. app.js schakelt hier automatisch naartoe als de
   * browser geen SVG blijkt te ondersteunen.
   */

  function renderTekst(ch) {
    var glyph = GLYPHS[ch];
    if (!glyph) { return ''; }
    return '<span class="piece-text piece-text-' +
      (isWhitePiece(ch) ? 'wit' : 'zwart') + '">' + glyph + '</span>';
  }

  /* ---------------------------------------------------------------- export */

  global.PieceSets = {
    klassiek: { name: 'Klassiek', render: renderKlassiek },
    modern: { name: 'Modern', render: renderModern },
    symbool: { name: 'Symbolen', render: renderSymbool },
    tekst: { name: 'Tekst (oude e-readers)', render: renderTekst, noSvg: true }
  };

}(typeof window !== 'undefined' ? window : this));
