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

  /* ============================================================== TOERNOOI
   * Moderne "toernooi"-set: bolle, afgeronde vormen met een stevige donkere
   * omtreklijn, een aparte afgeronde voetplaat onder de stukken en een
   * schaduwvlak langs de rechterkant voor een 3D-reliefeffect.
   *
   * Het schaduwvlak is een half-transparant zwart overlay-vlak. Daardoor
   * werkt het op zowel lichte als donkere stukken zonder extra themakleuren.
   * Het wordt afgeknipt op de romp zodat het nooit buiten het stuk valt.
   *
   * De pion heeft (net als in het voorbeeld) geen losse voetplaat maar een
   * romp die zelf tot een brede voet uitwaaiert, met een kraag als hals.
   */

  var T_SW = 1.4;             /* omtreklijndikte */
  var T_SHADE = 'rgba(0,0,0,0.17)';

  /* De voetplaat is voor alle stukken identiek. */
  var toernooiVoet =
    'M 13.4,33.1 L 31.6,33.1' +
    ' C 33.7,33.8 34.9,36.0 34.9,38.1 L 34.9,39.7 L 10.1,39.7 L 10.1,38.1' +
    ' C 10.1,36.0 11.3,33.8 13.4,33.1 Z';

  var toernooiShapes = {

    /* --------------------------------------------------------------- pion
       Bolle kop, een brede kraag als hals en een romp die vloeiend
       uitwaaiert naar een brede voet. */
    p: '<path d="M 21.06,21.3 A 5.3,5.3 0 1,1 23.94,21.3 Z"/>' +
       '<path d="M 19.3,24.4' +
       ' C 19.3,27.6 18.3,29.7 15.6,31.8' +
       ' C 13.0,33.9 11.3,36.3 11.3,39.7' +
       ' L 33.7,39.7' +
       ' C 33.7,36.3 32.0,33.9 29.4,31.8' +
       ' C 26.7,29.7 25.7,27.6 25.7,24.4 Z"/>' +
       '<path d="M 17.8,21.3 L 27.2,21.3' +
       ' C 28.6,21.6 29.2,22.4 29.2,23.2' +
       ' C 29.2,24.0 28.8,24.6 28.0,25.1' +
       ' L 17.0,25.1' +
       ' C 16.2,24.6 15.8,24.0 15.8,23.2' +
       ' C 15.8,22.4 16.4,21.6 17.8,21.3 Z"/>',
    pShade:
       '<path d="M 22.5,24.8 L 25.7,24.8' +
       ' C 25.7,27.6 26.7,29.7 29.4,31.8' +
       ' C 32.0,33.9 33.7,36.3 33.7,39.7' +
       ' L 29.6,39.7' +
       ' C 29.6,36.0 28.0,33.4 25.6,31.2' +
       ' C 23.6,29.3 22.5,27.4 22.5,24.8 Z"/>' +
       '<path d="M 24.8,12.2 C 27.2,13.6 28.0,17.4 26.2,19.8' +
       ' C 25.2,21.0 23.4,21.4 22.0,20.8' +
       ' C 25.0,19.8 26.6,15.6 24.8,12.2 Z"/>',
    pNoVoet: true,

    /* -------------------------------------------------------------- toren
       Brede kanteelkap met twee inkepingen, romp die licht uitwaaiert. */
    r: '<path d="M 15.4,18.6' +
       ' C 13.4,17.9 12.1,17.3 12.1,16.0 L 12.1,10.0' +
       ' Q 12.1,8.9 13.2,8.9 L 15.1,8.9 Q 16.2,8.9 16.2,10.0 L 16.2,13.0' +
       ' L 19.6,13.0 L 19.6,9.4 Q 19.6,8.3 20.7,8.3 L 24.3,8.3' +
       ' Q 25.4,8.3 25.4,9.4 L 25.4,13.0 L 28.8,13.0 L 28.8,10.0' +
       ' Q 28.8,8.9 29.9,8.9 L 31.8,8.9 Q 32.9,8.9 32.9,10.0 L 32.9,16.0' +
       ' C 32.9,17.3 31.6,17.9 29.6,18.6 Z"/>' +
       '<path d="M 15.4,18.4' +
       ' C 15.0,24.0 14.5,29.0 14.0,34.0 L 31.0,34.0' +
       ' C 30.5,29.0 30.0,24.0 29.6,18.4 Z"/>',
    rShade:
       '<path d="M 30.4,8.9 L 31.8,8.9 Q 32.9,8.9 32.9,10.0 L 32.9,16.0' +
       ' C 32.9,17.3 31.6,17.9 29.6,18.6 L 27.0,18.6' +
       ' C 29.8,17.4 31.0,15.4 30.8,12.4 Z"/>' +
       '<path d="M 21.4,18.8 L 29.6,18.8' +
       ' C 30.0,24.0 30.5,29.2 31.0,34.0 L 27.3,34.0' +
       ' C 27.2,27.6 25.4,22.4 21.4,18.8 Z"/>',

    /* -------------------------------------------------------------- paard
       Paardenkop en profil, naar links kijkend: punt oor, gebogen voorhoofd,
       stompe snuit linksonder en een hals die naar rechtsonder wegzwaait. */
    n: '<path d="M 18.3,5.3' +
       ' C 17.5,6.6 16.8,7.4 16.3,8.4' +
       ' C 14.6,9.9 13.2,11.6 12.9,14.2' +
       ' C 12.4,16.0 10.9,17.4 9.9,19.0' +
       ' C 9.0,20.7 7.9,21.9 7.7,23.1' +
       ' C 7.4,24.5 8.2,25.6 9.8,26.1' +
       ' C 11.2,26.6 12.7,26.5 13.9,25.9' +
       ' C 14.4,25.0 15.5,24.1 17.0,23.3' +
       ' C 19.2,22.5 21.0,21.5 22.1,20.0' +
       ' C 23.2,22.2 22.2,24.6 19.8,26.6' +
       ' C 18.0,28.2 15.6,30.4 15.0,33.6' +
       ' L 33.5,33.6' +
       ' C 33.9,31.0 35.2,29.0 35.2,25.0' +
       ' C 35.2,20.4 34.2,15.6 30.4,12.6' +
       ' C 29.4,10.4 27.0,9.0 24.2,8.5' +
       ' L 22.9,9.7' +
       ' L 21.2,7.0 Z"/>',
    nShade:
       '<path d="M 25.2,10.2' +
       ' C 29.8,13.4 32.2,18.0 32.2,23.6' +
       ' C 32.2,27.6 30.0,30.8 27.4,33.8' +
       ' L 33.8,33.8' +
       ' C 34.2,31.0 35.4,29.0 35.4,25.0' +
       ' C 35.4,20.4 34.0,15.8 30.6,12.0' +
       ' C 28.6,9.8 26.6,8.6 24.5,8.3 Z"/>' +
       '<path d="M 20.2,15.4' +
       ' C 21.6,17.0 22.0,18.5 21.6,20.2' +
       ' C 21.0,21.7 19.6,22.7 17.4,23.5' +
       ' C 19.4,22.2 20.4,20.8 20.6,19.4' +
       ' C 20.8,18.0 20.6,16.6 20.2,15.4 Z"/>',
    nDetail:
       '<path d="M 19.8,13.0' +
       ' C 20.6,14.2 20.2,15.5 18.9,15.8' +
       ' C 17.9,16.0 17.1,16.4 16.5,17.0' +
       ' C 16.5,15.6 16.9,14.4 17.6,13.5' +
       ' C 18.3,12.6 19.2,12.2 19.8,13.0 Z"/>',

    /* -------------------------------------------------------------- loper
       Gladde uivorm met een gebogen spleet en een bolletje bovenop. */
    b: '<path d="M 16.0,33.8 L 15.2,32.4' +
       ' C 12.9,30.2 12.1,26.4 12.3,22.6' +
       ' C 12.5,18.6 14.4,14.9 17.3,12.3' +
       ' C 18.1,11.6 19.2,10.4 19.9,9.7' +
       ' A 3.1,3.1 0 1,1 23.7,10.2' +
       ' C 22.6,12.6 20.9,17.2 20.6,22.0' +
       ' C 20.4,22.8 21.2,23.3 22.1,23.3' +
       ' C 23.0,23.3 24.4,23.0 24.5,22.0' +
       ' C 24.9,17.1 26.0,13.6 27.4,11.2' +
       ' C 29.8,13.8 32.4,17.4 32.6,22.0' +
       ' C 32.8,26.4 31.4,30.2 29.6,32.4 L 28.8,33.8 Z"/>',
    bShade:
       '<path d="M 27.4,11.2' +
       ' C 29.8,13.8 32.4,17.4 32.6,22.0' +
       ' C 32.9,26.4 31.4,30.2 29.6,32.4' +
       ' L 25.4,32.4' +
       ' C 27.8,30.0 29.4,26.4 29.3,22.4' +
       ' C 29.2,18.6 28.2,14.8 26.4,12.3 Z"/>' +
       '<path d="M 22.6,13.4' +
       ' C 21.4,16.6 20.8,19.6 20.7,22.6' +
       ' L 18.9,22.6' +
       ' C 19.0,19.4 19.7,16.3 20.9,13.4 Z"/>',

    /* --------------------------------------------------------------- dame
       Kroon met vier punten, elk met een bol, en V-inkepingen ertussen. */
    q: '<path d="M 14.9,33.8' +
       ' L 7.6,18.9' +
       ' A 3.5,3.5 0 1,1 10.0,18.9' +
       ' L 16.8,20.8' +
       ' L 15.8,12.0' +
       ' A 3.65,3.65 0 1,1 19.2,12.0' +
       ' L 22.5,19.8' +
       ' L 25.8,12.0' +
       ' A 3.65,3.65 0 1,1 29.2,12.0' +
       ' L 28.2,20.8' +
       ' L 35.0,18.9' +
       ' A 3.5,3.5 0 1,1 37.4,18.9' +
       ' L 30.1,33.8 Z"/>',
    qShade:
       '<path d="M 37.4,18.9 L 30.1,33.8 L 26.2,33.8' +
       ' C 29.8,28.4 32.6,23.4 34.0,17.6 Z"/>' +
       '<path d="M 28.4,10.8 C 30.8,12.2 31.0,15.2 29.2,16.6' +
       ' L 29.6,13.2 Z"/>' +
       '<path d="M 18.4,10.8 C 20.8,12.2 21.0,15.2 19.2,16.6' +
       ' L 19.6,13.2 Z"/>' +
       '<path d="M 9.4,17.6 C 11.6,16.2 12.0,13.6 10.6,12.0' +
       ' C 12.8,12.8 13.4,15.6 12.0,17.6 Z"/>',

    /* ------------------------------------------------------------- koning
       Kruis bovenop, brede kroon met twee boogvormige uitsparingen. */
    k: '<path d="M 20.5,4.2 L 25.0,4.2 L 25.0,7.1 L 27.7,7.1 L 27.7,11.1' +
       ' L 25.0,11.1 L 25.0,15.0 L 20.5,15.0 L 20.5,11.1 L 17.8,11.1' +
       ' L 17.8,7.1 L 20.5,7.1 Z"/>' +
       '<path d="M 20.3,14.6' +
       ' C 18.4,13.1 15.8,12.5 13.0,13.3' +
       ' C 9.0,13.8 6.2,15.8 5.7,19.4' +
       ' C 5.2,22.7 6.5,26.1 9.3,28.9' +
       ' C 11.6,31.0 12.8,32.3 13.2,33.7' +
       ' L 31.8,33.7' +
       ' C 32.2,32.3 33.4,31.0 35.7,28.9' +
       ' C 38.5,26.1 39.8,22.7 39.3,19.4' +
       ' C 38.8,15.8 36.0,13.8 32.0,13.3' +
       ' C 29.2,12.5 26.6,13.1 24.7,14.6 Z' +
       ' M 19.2,20.6' +
       ' C 18.4,19.2 16.4,18.7 14.8,19.8' +
       ' C 13.2,20.8 12.6,23.0 14.4,25.0' +
       ' C 15.8,26.5 17.6,27.2 19.2,27.4 Z' +
       ' M 25.8,20.6' +
       ' C 26.6,19.2 28.6,18.7 30.2,19.8' +
       ' C 31.8,20.8 32.4,23.0 30.6,25.0' +
       ' C 29.2,26.5 27.4,27.2 25.8,27.4 Z"/>',
    kShade:
       '<path d="M 34.6,14.2' +
       ' C 37.6,15.4 39.0,17.4 39.3,19.4' +
       ' C 39.8,22.7 38.5,26.1 35.7,28.9' +
       ' C 33.4,31.0 32.2,32.3 31.8,33.7' +
       ' L 29.4,33.7' +
       ' C 30.0,31.8 31.2,30.4 33.4,28.2' +
       ' C 36.0,25.6 37.4,22.4 37.2,19.2' +
       ' C 37.1,17.4 36.2,15.6 34.6,14.2 Z"/>'
  };

  function renderToernooi(ch) {
    var white = isWhitePiece(ch);
    var key = ch.toLowerCase();
    var shapes = toernooiShapes[key];
    if (!shapes) { return wrap(''); }

    var fill = bodyFill(white);
    var clipId = 'toernooi-clip-' + key;
    var out = '';

    /* Het schaduwvlak wordt afgeknipt op de romp zelf, zodat het nooit
       buiten het stuk op het bord terechtkomt. Het id hangt alleen van de
       stuksoort af: identieke stukken delen dus dezelfde (identieke)
       clipPath, wat geen probleem is. */
    out += '<defs><clipPath id="' + clipId + '" clip-rule="evenodd">' +
      shapes + '</clipPath></defs>';

    /* 1. gevulde vormen met omtrek */
    out += '<g fill="' + fill + '" fill-rule="evenodd" stroke="' + C_LINE +
      '" stroke-width="' + T_SW + '" stroke-linejoin="round"' +
      ' stroke-linecap="round">' + shapes + '</g>';

    /* 2. schaduwvlak (half-transparant zwart, geen omtrek) */
    var shade = toernooiShapes[key + 'Shade'];
    if (shade) {
      out += '<g clip-path="url(#' + clipId + ')" fill="' + T_SHADE +
        '" fill-rule="evenodd" stroke="none">' + shade + '</g>';
    }

    /* 3. omtrek opnieuw, zodat de schaduw de lijnen niet vertroebelt */
    out += '<g fill="none" stroke="' + C_LINE + '" stroke-width="' + T_SW +
      '" stroke-linejoin="round" stroke-linecap="round">' + shapes + '</g>';

    /* 4. voetplaat, bovenop de romp */
    if (!toernooiShapes[key + 'NoVoet']) {
      out += '<g fill="' + fill + '" stroke="' + C_LINE + '" stroke-width="' +
        T_SW + '" stroke-linejoin="round" stroke-linecap="round"><path d="' +
        toernooiVoet + '"/></g>';
    }

    /* 5. losse details (oog van het paard) */
    var detail = toernooiShapes[key + 'Detail'];
    if (detail) {
      out += '<g fill="' + C_LINE + '" stroke="none">' + detail + '</g>';
    }

    return wrap(out);
  }

  /* ---------------------------------------------------------------- export */

  global.PieceSets = {
    klassiek: { name: 'Klassiek', render: renderKlassiek },
    modern: { name: 'Modern', render: renderModern },
    symbool: { name: 'Symbolen', render: renderSymbool },
    toernooi: { name: 'Toernooi', render: renderToernooi },
    tekst: { name: 'Tekst (oude e-readers)', render: renderTekst, noSvg: true }
  };

}(typeof window !== 'undefined' ? window : this));
