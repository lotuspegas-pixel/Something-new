/* UI layer — plain ES5, DOM level 1/2 only, no build step.
   Depends on window.ChessEngine, window.ChessAI, window.PieceSets, window.Themes. */

(function () {
  'use strict';

  var C = window.ChessEngine;
  var AI = window.ChessAI;

  var VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };
  var STORAGE_KEY = 'schaak-ereader-instellingen';

  var settings = {
    theme: 'bos',
    pieceSet: 'toernooi',
    variant: 'standard',
    level: 2,
    vsComputer: true,
    humanColor: 'w',
    showCoords: true
  };

  var game = null;
  var snapshots = [];
  var selected = null;
  var legalForSelected = [];
  var flipped = false;
  var cursor = 4;
  var lastMove = null;
  var pendingPromotion = null;
  var aiThinking = false;
  var moveToken = 0;
  var endedOverride = null;

  function $(id) { return document.getElementById(id); }

  /* ---------- Compatibility with very old e-reader browsers ----------
     The Android 2.x browser used by e-readers such as the Sony PRS-T series
     supports none of CSS custom properties, inline SVG, or vmin units. So the
     theme is *also* written out as a generated stylesheet holding literal
     colour values and pixel sizes, which every browser understands, and the
     pieces fall back to plain text when SVG is missing. */

  var supportsSvg = (function () {
    return !!(document.createElementNS &&
      document.createElementNS('http://www.w3.org/2000/svg', 'svg').createSVGRect);
  })();

  var themeVars = {};

  /* Replace var(--name, fallback) with the literal colour from the theme. */
  function resolveVars(text) {
    return text.replace(/var\(\s*(--[a-z-]+)\s*(?:,\s*([^)]*))?\)/g, function (all, name, fallback) {
      return themeVars[name] || fallback || '#000000';
    });
  }

  function cellPixels() {
    var w = window.innerWidth || document.documentElement.clientWidth || 600;
    var h = window.innerHeight || document.documentElement.clientHeight || 800;
    // Leave room for the status bar and the buttons under the board.
    var size = Math.floor(Math.min(w - 24, h * 0.66) / 8);
    if (size < 24) size = 24;
    if (size > 68) size = 68;
    return size;
  }

  function buildThemeCss() {
    var v = themeVars;
    var cell = cellPixels();
    var css = [];
    function rule(sel, body) { css.push(sel + '{' + body + '}'); }

    rule('html,body', 'background:' + v['--page-bg'] + ';color:' + v['--page-fg']);
    rule('h1', 'border-bottom-color:' + v['--border']);
    rule('#status', 'border-color:' + v['--border'] + ';background:' + v['--panel-bg'] + ';color:' + v['--page-fg']);
    rule('#status.is-check,#status.is-over',
      'background:' + v['--accent'] + ';color:' + v['--accent-fg'] + ';border-color:' + v['--accent']);
    rule('#board', 'border-color:' + v['--border']);
    rule('#board td',
      'width:' + cell + 'px;height:' + cell + 'px;max-width:' + cell + 'px;max-height:' + cell +
      'px;font-size:' + Math.round(cell * 0.78) + 'px');
    rule('#board .sq-light', 'background:' + v['--board-light']);
    rule('#board .sq-dark', 'background:' + v['--board-dark']);
    rule('#board .sq-lastmove', 'background:' + v['--hl-lastmove']);
    rule('#board .sq-check', 'background:' + v['--hl-check']);
    rule('#board .sq-selected', 'outline:4px solid ' + v['--hl-selected'] + ';outline-offset:-4px');
    rule('#board .sq-cursor:after', 'border-color:' + v['--piece-outline']);
    rule('#board .sq-hill:before', 'border-color:' + v['--hl-dot']);
    rule('#board .sq-light .coord', 'color:' + v['--board-dark']);
    rule('#board .sq-dark .coord', 'color:' + v['--board-light']);
    rule('.move-dot', 'background:' + v['--hl-dot']);
    rule('.move-ring', 'border-color:' + v['--hl-dot']);
    // The text pieces are solid glyphs with no outline of their own, so a
    // white piece would nearly vanish on a light square. text-shadow draws a
    // one-pixel contour and is supported even by the oldest e-reader browsers.
    var o = v['--piece-outline'];
    var contour = 'text-shadow:-1px 0 ' + o + ',0 1px ' + o + ',1px 0 ' + o + ',0 -1px ' + o;
    rule('.piece-text', 'font-size:' + Math.round(cell * 0.8) + 'px;line-height:1');
    rule('.piece-text-wit', 'color:' + v['--piece-white'] + ';' + contour);
    rule('.piece-text-zwart', 'color:' + v['--piece-black'] + ';' + contour);
    rule('button,select,input,textarea',
      'border-color:' + v['--border'] + ';background:' + v['--panel-bg'] + ';color:' + v['--page-fg']);
    rule('.btn-primary',
      'background:' + v['--accent'] + ';color:' + v['--accent-fg'] + ';border-color:' + v['--accent']);
    rule('fieldset', 'border-color:' + v['--border'] + ';background:' + v['--panel-bg']);
    rule('#promo-dialog', 'border-color:' + v['--border'] + ';background:' + v['--panel-bg']);
    rule('#movelist-wrap', 'border-color:' + v['--border'] + ';background:' + v['--panel-bg']);
    rule('footer', 'border-top-color:' + v['--border']);
    return css.join('\n');
  }

  function applyTheme(id) {
    var theme = window.Themes.byId(id);
    themeVars = theme.vars;
    // Modern browsers pick this up; old ones ignore it harmlessly.
    if (document.documentElement.style.setProperty) {
      for (var key in theme.vars) {
        if (theme.vars.hasOwnProperty(key)) {
          document.documentElement.style.setProperty(key, theme.vars[key]);
        }
      }
    }
    var el = $('theme-css');
    if (!el) {
      el = document.createElement('style');
      el.id = 'theme-css';
      el.type = 'text/css';
      (document.head || document.getElementsByTagName('head')[0]).appendChild(el);
    }
    var css = buildThemeCss();
    if (el.styleSheet) el.styleSheet.cssText = css; // very old engines
    else el.innerHTML = css;
    document.documentElement.setAttribute('data-theme', theme.id);
    return theme;
  }

  function show(el, visible) { el.className = visible ? '' : 'hidden'; }

  /* ---------- Settings persistence (e-readers may disable storage) ---------- */

  function loadSettings() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      for (var k in settings) {
        if (settings.hasOwnProperty(k) && saved.hasOwnProperty(k)) settings[k] = saved[k];
      }
    } catch (e) { /* storage unavailable or corrupt — defaults are fine */ }
  }

  function saveSettings() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); }
    catch (e) { /* nothing we can do; settings just won't persist */ }
  }

  /* ---------- Rendering ---------- */

  function pieceSvg(pieceChar) {
    var set = window.PieceSets[settings.pieceSet] || window.PieceSets.klassiek;
    if (!supportsSvg && !set.noSvg) set = window.PieceSets.tekst;
    // Old browsers do not understand var() inside SVG attributes either, so
    // the colours are substituted before the markup reaches the DOM.
    return resolveVars(set.render(pieceChar));
  }

  function buildBoardTable() {
    var table = $('board');
    table.innerHTML = '';
    for (var ri = 0; ri < 8; ri++) {
      var r = flipped ? ri : 7 - ri;
      var row = document.createElement('tr');
      for (var fi = 0; fi < 8; fi++) {
        var f = flipped ? 7 - fi : fi;
        var sq = C.sqOf(f, r);
        var td = document.createElement('td');
        td.id = 'sq-' + sq;
        td.setAttribute('data-sq', String(sq));
        (function (target) {
          td.onclick = function () { onSquareClick(target); };
        })(sq);
        row.appendChild(td);
      }
      table.appendChild(row);
    }
  }

  function render() {
    var status = endedOverride ? null : C.gameStatus(game);
    var inCheck = status && !status.over ? status.inCheck : (status && status.reason === 'checkmate');
    var checkSq = -1;
    if (!endedOverride && C.isInCheck(game, game.turn)) checkSq = game.kings[game.turn];

    var isHill = {};
    if (game.variant === 'koth') {
      for (var h = 0; h < C.CENTER_SQUARES.length; h++) isHill[C.CENTER_SQUARES[h]] = true;
    }

    // Destination squares for the current selection; castling is also offered
    // on the rook's own square, which is the Chess960 convention.
    var dests = {};
    for (var i = 0; i < legalForSelected.length; i++) {
      var m = legalForSelected[i];
      var capture = !!m.captured || m.flag === 'ep';
      dests[m.to] = capture ? 'ring' : 'dot';
      if (m.flag === 'castleK' || m.flag === 'castleQ') dests[m.rookFrom] = 'dot';
    }

    for (var sq = 0; sq < 64; sq++) {
      var td = $('sq-' + sq);
      if (!td) continue;
      var f = C.fileOf(sq), r = C.rankOf(sq);
      var cls = ((f + r) & 1) === 0 ? 'sq-dark' : 'sq-light';

      if (lastMove && (sq === lastMove.from || sq === lastMove.to)) cls += ' sq-lastmove';
      if (sq === checkSq) cls += ' sq-check';
      if (isHill[sq]) cls += ' sq-hill';
      if (selected === sq) cls += ' sq-selected';
      if (sq === cursor) cls += ' sq-cursor';
      td.className = cls;

      var html = '';
      var piece = game.board[sq];
      if (piece) html += pieceSvg(piece);
      if (dests[sq]) html += '<span class="' + (dests[sq] === 'ring' ? 'move-ring' : 'move-dot') + '"></span>';

      if (settings.showCoords) {
        var edgeRank = flipped ? 7 : 0;
        var edgeFile = flipped ? 7 : 0;
        if (r === edgeRank) html += '<span class="coord coord-file">' + 'abcdefgh'.charAt(f) + '</span>';
        if (f === edgeFile) html += '<span class="coord coord-rank">' + (r + 1) + '</span>';
      }
      td.innerHTML = html;
    }

    renderStatus(status, inCheck);
    renderMaterial();
    renderMoveList();
    $('fen-output').value = C.stateToFen(game);
    $('btn-undo').disabled = snapshots.length <= 1 || aiThinking;
  }

  function renderStatus(status, inCheck) {
    var el = $('status'), sub = $('subline');
    var subText = '';

    if (endedOverride) {
      el.textContent = endedOverride;
      el.className = 'is-over';
    } else if (status.over) {
      el.textContent = describeEnd(status);
      el.className = 'is-over';
    } else if (aiThinking) {
      el.textContent = 'Computer denkt na…';
      el.className = '';
    } else {
      var turnName = game.turn === 'w' ? 'Wit' : 'Zwart';
      el.textContent = turnName + ' aan zet' + (inCheck ? ' — schaak!' : '');
      el.className = inCheck ? 'is-check' : '';
    }

    if (game.variant === 'threecheck') {
      subText = 'Schaken gegeven — wit: ' + game.checkCount.w + '/3, zwart: ' + game.checkCount.b + '/3';
    } else if (game.variant === 'koth') {
      subText = 'Bereik d4, e4, d5 of e5 met je koning om te winnen';
    } else if (game.variant === 'chess960') {
      subText = 'Chess960 — willekeurige opstelling';
    }
    sub.textContent = subText;
  }

  function describeEnd(status) {
    if (status.reason === 'checkmate') {
      return 'Schaakmat — ' + (status.result === '1-0' ? 'wit' : 'zwart') + ' wint';
    }
    if (status.reason === 'koth') {
      return 'Koning op de heuvel — ' + (status.result === '1-0' ? 'wit' : 'zwart') + ' wint';
    }
    if (status.reason === 'threecheck') {
      return 'Drie schaken — ' + (status.result === '1-0' ? 'wit' : 'zwart') + ' wint';
    }
    var reasons = {
      stalemate: 'pat',
      fifty: '50-zettenregel',
      repetition: 'drievoudige zetherhaling',
      material: 'onvoldoende materiaal'
    };
    return 'Remise — ' + (reasons[status.reason] || status.reason);
  }

  /* Captured material, taken from the moves actually played. */
  function renderMaterial() {
    var byWhite = [], byBlack = [], scoreW = 0, scoreB = 0;
    for (var i = 0; i < game.history.length; i++) {
      var h = game.history[i];
      if (!h.captured) continue;
      var v = VALUE[C.typeOf(h.captured)] || 0;
      if (C.colorOf(h.piece) === 'w') { byWhite.push(h.captured); scoreW += v; }
      else { byBlack.push(h.captured); scoreB += v; }
    }
    $('captured-black').innerHTML = materialHtml(byBlack, scoreB - scoreW);
    $('captured-white').innerHTML = materialHtml(byWhite, scoreW - scoreB);
  }

  function materialHtml(pieces, advantage) {
    var order = { Q: 0, R: 1, B: 2, N: 3, P: 4 };
    pieces.sort(function (a, b) { return order[C.typeOf(a)] - order[C.typeOf(b)]; });
    var glyphs = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
    var html = '';
    for (var i = 0; i < pieces.length; i++) html += glyphs[pieces[i]];
    if (advantage > 0) html += ' <span class="adv">+' + advantage + '</span>';
    return html || '&nbsp;';
  }

  function renderMoveList() {
    var out = '';
    for (var i = 0; i < game.history.length; i++) {
      if (i % 2 === 0) out += (Math.floor(i / 2) + 1) + '. ';
      out += game.history[i].san + (i % 2 === 1 ? '\n' : ' ');
    }
    $('movelist').textContent = out || '(nog geen zetten)';
    var wrap = $('movelist-wrap');
    wrap.scrollTop = wrap.scrollHeight;
  }

  /* ---------- Interaction ---------- */

  function inputLocked() {
    if (pendingPromotion || aiThinking || endedOverride) return true;
    if (C.gameStatus(game).over) return true;
    return settings.vsComputer && game.turn !== settings.humanColor;
  }

  function movesFrom(sq) {
    var all = C.generateLegalMoves(game), out = [];
    for (var i = 0; i < all.length; i++) { if (all[i].from === sq) out.push(all[i]); }
    return out;
  }

  function onSquareClick(sq) {
    if (inputLocked()) return;
    cursor = sq;
    var piece = game.board[sq];

    if (selected === null) {
      if (piece && C.colorOf(piece) === game.turn) {
        selected = sq;
        legalForSelected = movesFrom(sq);
      }
      render();
      return;
    }

    if (sq === selected) { clearSelection(); render(); return; }

    // Find a move landing here (or a castling move triggered via its rook).
    var target = null;
    for (var i = 0; i < legalForSelected.length; i++) {
      var m = legalForSelected[i];
      if (m.to === sq || ((m.flag === 'castleK' || m.flag === 'castleQ') && m.rookFrom === sq)) { target = m; break; }
    }

    if (!target) {
      // Not a legal destination: treat a click on another own piece as reselecting.
      if (piece && C.colorOf(piece) === game.turn) {
        selected = sq;
        legalForSelected = movesFrom(sq);
      } else {
        clearSelection();
      }
      render();
      return;
    }

    if (target.promotion) {
      pendingPromotion = { from: selected, to: target.to, color: C.colorOf(target.piece) };
      showPromoDialog();
      return;
    }
    doMove(selected, target.to === sq ? target.to : sq, null);
  }

  function clearSelection() { selected = null; legalForSelected = []; }

  function showPromoDialog() {
    var dlg = $('promo-dialog');
    show(dlg, true);
    dlg.innerHTML = '<div>Promoveer naar:</div>';
    var isWhite = pendingPromotion.color === 'w';
    var letters = ['Q', 'R', 'B', 'N'];
    for (var i = 0; i < letters.length; i++) {
      var btn = document.createElement('button');
      btn.innerHTML = pieceSvg(isWhite ? letters[i] : letters[i].toLowerCase());
      btn.setAttribute('aria-label', letters[i]);
      (function (letter) { btn.onclick = function () { resolvePromotion(letter); }; })(letters[i]);
      dlg.appendChild(btn);
    }
  }

  function resolvePromotion(letter) {
    var p = pendingPromotion;
    pendingPromotion = null;
    show($('promo-dialog'), false);
    $('promo-dialog').innerHTML = '';
    doMove(p.from, p.to, letter);
  }

  function doMove(from, to, promotion) {
    var played = C.move(game, from, to, promotion);
    if (!played) { clearSelection(); render(); return; }
    lastMove = { from: played.from, to: played.to };
    clearSelection();
    snapshots.push(C.cloneState(game));
    render();
    maybeTriggerAi();
  }

  /* ---------- Computer opponent ---------- */

  function maybeTriggerAi() {
    if (!settings.vsComputer || endedOverride) return;
    if (C.gameStatus(game).over) return;
    if (game.turn === settings.humanColor) return;
    aiThinking = true;
    moveToken++;
    var token = moveToken;
    render();
    // Yield first so the "thinking" state actually paints before the search
    // blocks the thread — on e-ink a repaint is slow and must not be skipped.
    setTimeout(function () { runAi(token); }, 50);
  }

  function runAi(token) {
    if (token !== moveToken) return;
    var best = null;
    try {
      best = AI.chooseMove(game, settings.level);
    } catch (e) {
      aiThinking = false; render();
      return;
    }
    if (token !== moveToken) return; // superseded by undo / new game / loaded FEN
    aiThinking = false;
    if (best) {
      var promo = best.promotion ? C.typeOf(best.promotion) : null;
      var played = C.move(game, best.from, best.to, promo);
      if (played) {
        lastMove = { from: played.from, to: played.to };
        snapshots.push(C.cloneState(game));
      }
    }
    render();
  }

  /* ---------- Keyboard / d-pad ---------- */

  function onKeyDown(e) {
    if (pendingPromotion || aiThinking || endedOverride) return;
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    var key = e.key || e.keyIdentifier;
    var f = C.fileOf(cursor), r = C.rankOf(cursor), moved = true;
    // Arrows are screen-relative, so they must follow the board orientation.
    var dx = flipped ? -1 : 1;

    if (key === 'ArrowLeft' || key === 'Left') f -= dx;
    else if (key === 'ArrowRight' || key === 'Right') f += dx;
    else if (key === 'ArrowUp' || key === 'Up') r += dx;
    else if (key === 'ArrowDown' || key === 'Down') r -= dx;
    else if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
      onSquareClick(cursor);
      if (e.preventDefault) e.preventDefault();
      return;
    } else moved = false;

    if (!moved) return;
    if (f < 0 || f > 7 || r < 0 || r > 7) return;
    cursor = C.sqOf(f, r);
    render();
    if (e.preventDefault) e.preventDefault();
  }

  /* ---------- Commands ---------- */

  function startNewGame() {
    moveToken++;
    aiThinking = false;
    game = C.newGame(settings.variant);
    snapshots = [C.cloneState(game)];
    clearSelection();
    lastMove = null;
    pendingPromotion = null;
    endedOverride = null;
    cursor = settings.humanColor === 'w' ? 4 : 60;
    flipped = settings.vsComputer && settings.humanColor === 'b';
    show($('promo-dialog'), false);
    $('promo-dialog').innerHTML = '';
    buildBoardTable();
    render();
    maybeTriggerAi();
  }

  function undo() {
    if (aiThinking || snapshots.length <= 1) return;
    moveToken++;
    snapshots.pop();
    // Against the computer, step back past its reply so it stays the human's turn.
    if (settings.vsComputer && snapshots.length > 1 &&
        snapshots[snapshots.length - 1].turn !== settings.humanColor) {
      snapshots.pop();
    }
    game = C.cloneState(snapshots[snapshots.length - 1]);
    clearSelection();
    lastMove = null;
    endedOverride = null;
    render();
  }

  function flipBoard() { flipped = !flipped; buildBoardTable(); render(); }

  function resign() {
    if (endedOverride || C.gameStatus(game).over) return;
    if (!window.confirm('Weet je zeker dat je wilt opgeven?')) return;
    endedOverride = 'Opgegeven — ' + (game.turn === 'w' ? 'zwart' : 'wit') + ' wint';
    moveToken++;
    aiThinking = false;
    clearSelection();
    render();
  }

  function offerDraw() {
    if (endedOverride || C.gameStatus(game).over) return;
    var msg = settings.vsComputer
      ? 'De computer neemt alleen remise aan in een gelijke stelling. Toch remise vastleggen?'
      : 'Gaan beide spelers akkoord met remise?';
    if (!window.confirm(msg)) return;
    endedOverride = 'Remise — in onderling overleg';
    moveToken++;
    aiThinking = false;
    clearSelection();
    render();
  }

  function loadFen() {
    if (aiThinking) return;
    var text = $('fen-input').value;
    if (!text || !text.replace(/\s/g, '')) { window.alert('Vul eerst een FEN-notatie in.'); return; }
    var loaded;
    try {
      loaded = C.fenToState(text, settings.variant);
    } catch (err) {
      window.alert('Ongeldige FEN-notatie: ' + (err && err.message ? err.message : 'onbekende fout'));
      return;
    }
    moveToken++;
    aiThinking = false;
    game = loaded;
    snapshots = [C.cloneState(game)];
    clearSelection();
    lastMove = null;
    endedOverride = null;
    render();
    maybeTriggerAi();
  }

  function copyFen() {
    var el = $('fen-output');
    el.focus();
    el.select();
    try { document.execCommand('copy'); }
    catch (e) { /* no clipboard access: the text stays selected for manual copying */ }
  }

  /* ---------- Settings UI ---------- */

  function fillSelect(sel, items, current) {
    sel.innerHTML = '';
    for (var i = 0; i < items.length; i++) {
      var opt = document.createElement('option');
      opt.value = String(items[i].value);
      opt.textContent = items[i].label;
      if (String(items[i].value) === String(current)) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function buildSettings() {
    var themeItems = [];
    for (var i = 0; i < window.Themes.list.length; i++) {
      themeItems.push({ value: window.Themes.list[i].id, label: window.Themes.list[i].name });
    }
    fillSelect($('sel-theme'), themeItems, settings.theme);

    var setItems = [];
    for (var key in window.PieceSets) {
      if (window.PieceSets.hasOwnProperty(key)) {
        setItems.push({ value: key, label: window.PieceSets[key].name });
      }
    }
    fillSelect($('sel-pieces'), setItems, settings.pieceSet);

    var variantItems = [];
    for (var v in C.VARIANT_NAMES) {
      if (C.VARIANT_NAMES.hasOwnProperty(v)) variantItems.push({ value: v, label: C.VARIANT_NAMES[v] });
    }
    fillSelect($('sel-variant'), variantItems, settings.variant);

    var levelItems = [];
    for (var l = 0; l < AI.LEVELS.length; l++) {
      levelItems.push({ value: l, label: (l + 1) + '. ' + AI.LEVELS[l].name + ' — ' + AI.LEVELS[l].hint });
    }
    fillSelect($('sel-level'), levelItems, settings.level);

    fillSelect($('sel-opponent'), [
      { value: 'computer', label: 'Tegen de computer' },
      { value: 'mens', label: 'Twee spelers op dit toestel' }
    ], settings.vsComputer ? 'computer' : 'mens');

    fillSelect($('sel-side'), [
      { value: 'w', label: 'Ik speel wit' },
      { value: 'b', label: 'Ik speel zwart' }
    ], settings.humanColor);

    $('chk-coords').checked = settings.showCoords;
    updateSettingNotes();
  }

  function updateSettingNotes() {
    $('note-theme').textContent = window.Themes.byId(settings.theme).note;
    $('note-variant').textContent = C.VARIANT_RULES[settings.variant] || '';
    $('note-level').textContent = AI.LEVELS[settings.level]
      ? 'Bedenktijd tot ongeveer ' + Math.round(AI.LEVELS[settings.level].timeMs / 1000) + ' seconden per zet.'
      : '';
    $('sel-level').disabled = !settings.vsComputer;
    $('sel-side').disabled = !settings.vsComputer;
  }

  function confirmRestart(question) {
    if (game && game.history.length > 0 && !endedOverride && !C.gameStatus(game).over) {
      return window.confirm(question);
    }
    return true;
  }

  function setup() {
    loadSettings();
    applyTheme(settings.theme);
    buildSettings();

    game = C.newGame(settings.variant);
    snapshots = [C.cloneState(game)];
    flipped = settings.vsComputer && settings.humanColor === 'b';
    cursor = settings.humanColor === 'w' ? 4 : 60;
    buildBoardTable();
    render();
    maybeTriggerAi();

    $('btn-new').onclick = function () {
      if (confirmRestart('Nieuwe partij starten? De huidige partij gaat verloren.')) startNewGame();
    };
    $('btn-undo').onclick = undo;
    $('btn-flip').onclick = flipBoard;
    $('btn-resign').onclick = resign;
    $('btn-draw').onclick = offerDraw;
    $('btn-load-fen').onclick = loadFen;
    $('btn-copy-fen').onclick = copyFen;

    $('btn-settings').onclick = function () {
      var panel = $('settings');
      var hidden = panel.className.indexOf('collapsed') !== -1;
      panel.className = hidden ? '' : 'collapsed';
      this.textContent = hidden ? 'Instellingen verbergen' : 'Instellingen';
    };

    $('sel-theme').onchange = function () {
      settings.theme = this.value;
      applyTheme(settings.theme);
      updateSettingNotes();
      saveSettings();
    };

    $('sel-pieces').onchange = function () {
      settings.pieceSet = this.value;
      saveSettings();
      render();
    };

    $('sel-variant').onchange = function () {
      var chosen = this.value;
      if (!confirmRestart('Een andere variant start een nieuwe partij. Doorgaan?')) {
        this.value = settings.variant;
        return;
      }
      settings.variant = chosen;
      updateSettingNotes();
      saveSettings();
      startNewGame();
    };

    $('sel-level').onchange = function () {
      settings.level = parseInt(this.value, 10) || 0;
      updateSettingNotes();
      saveSettings();
    };

    $('sel-opponent').onchange = function () {
      var wantsComputer = this.value === 'computer';
      if (wantsComputer === settings.vsComputer) return;
      if (!confirmRestart('Van tegenstander wisselen start een nieuwe partij. Doorgaan?')) {
        this.value = settings.vsComputer ? 'computer' : 'mens';
        return;
      }
      settings.vsComputer = wantsComputer;
      updateSettingNotes();
      saveSettings();
      startNewGame();
    };

    $('sel-side').onchange = function () {
      if (this.value === settings.humanColor) return;
      if (!confirmRestart('Van kleur wisselen start een nieuwe partij. Doorgaan?')) {
        this.value = settings.humanColor;
        return;
      }
      settings.humanColor = this.value;
      saveSettings();
      startNewGame();
    };

    $('chk-coords').onchange = function () {
      settings.showCoords = this.checked;
      saveSettings();
      render();
    };

    document.onkeydown = onKeyDown;

    // The board is sized in pixels rather than vmin so that browsers without
    // viewport units still lay it out, which means it has to be recomputed
    // when the window or screen orientation changes.
    var resizeTimer = null;
    window.onresize = function () {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () { applyTheme(settings.theme); }, 200);
    };

    if (!supportsSvg) {
      $('note-pieces').textContent =
        'Deze browser ondersteunt geen SVG, dus de tekststukken worden gebruikt.';
    }
  }

  if (document.readyState === 'loading') {
    if (document.addEventListener) document.addEventListener('DOMContentLoaded', setup, false);
    else window.onload = setup;
  } else {
    setup();
  }
})();
