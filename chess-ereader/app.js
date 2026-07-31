/* UI layer — plain ES5, DOM level 1/2 APIs only, no build step.
   Relies on window.ChessEngine (loaded from chess-engine.js). */

(function () {
  'use strict';

  var C = window.ChessEngine;

  var PIECE_GLYPH = {
    K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
    k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟'
  };

  var game = C.newGame();
  var snapshots = [C.cloneState(game)];
  var selected = null;
  var legalForSelected = [];
  var flipped = false;
  var cursor = 4; // e1
  var lastMove = null;
  var pendingPromotion = null;
  var vsAI = false;
  var aiColor = 'b';
  var aiDepth = 2;
  var aiThinking = false;
  var matchEndedOverride = null;
  var moveToken = 0;

  function $(id) { return document.getElementById(id); }

  function displayIndex(sq) {
    // Returns the square index to render at a given table cell position, honoring flip.
    return sq;
  }

  function buildBoardTable() {
    var table = $('board');
    table.innerHTML = '';
    var r, f, row, td;
    for (var ri = 0; ri < 8; ri++) {
      r = flipped ? ri : 7 - ri;
      row = document.createElement('tr');
      for (var fi = 0; fi < 8; fi++) {
        f = flipped ? 7 - fi : fi;
        var sq = C.sqOf(f, r);
        td = document.createElement('td');
        td.id = 'sq-' + sq;
        td.className = (f + r) % 2 === 0 ? 'sq-dark' : 'sq-light';
        td.setAttribute('data-sq', sq);
        (function (sqCaptured) {
          td.onclick = function () { onSquareClick(sqCaptured); };
        })(sq);
        row.appendChild(td);
      }
      table.appendChild(row);
    }
  }

  function render() {
    var status = C.gameStatus(game);
    var inCheck = status.over ? (status.reason === 'checkmate') : status.inCheck;
    var checkSq = -1;
    if (inCheck) checkSq = C.kingSquare(game.board, game.turn);

    for (var sq = 0; sq < 64; sq++) {
      var td = $('sq-' + sq);
      if (!td) continue;
      var cls = (C.fileOf(sq) + C.rankOf(sq)) % 2 === 0 ? 'sq-dark' : 'sq-light';
      td.className = cls;
      td.innerHTML = '';

      if (lastMove && (sq === lastMove.from || sq === lastMove.to)) {
        td.className += ' sq-lastmove';
      }
      if (sq === checkSq) {
        td.className += ' sq-check';
      }
      if (selected === sq) {
        td.className += ' sq-selected';
      }
      if (sq === cursor) {
        td.className += ' sq-cursor';
      }

      var piece = game.board[sq];
      if (piece) {
        var span = document.createElement('span');
        span.className = 'piece';
        span.textContent = PIECE_GLYPH[piece];
        td.appendChild(span);
      }

      var isDest = false, isCapture = false;
      for (var i = 0; i < legalForSelected.length; i++) {
        if (legalForSelected[i].to === sq) {
          isDest = true;
          if (legalForSelected[i].captured || legalForSelected[i].flag === 'ep') isCapture = true;
        }
      }
      if (isDest) {
        var marker = document.createElement('span');
        marker.className = isCapture ? 'move-ring' : 'move-dot';
        td.appendChild(marker);
      }
    }

    renderStatus(status, inCheck);
    renderMoveList();
    renderFen();
    renderAiControls();
  }

  function renderStatus(status, inCheck) {
    var el = $('status');
    if (matchEndedOverride) {
      el.textContent = matchEndedOverride;
      el.className = '';
      return;
    }
    var turnName = game.turn === 'w' ? 'Wit' : 'Zwart';
    var text;
    if (status.over) {
      if (status.reason === 'checkmate') {
        var winner = status.result === '1-0' ? 'Wit' : 'Zwart';
        text = 'Schaakmat — ' + winner + ' wint';
      } else {
        text = 'Remise (' + dutchReason(status.reason) + ')';
      }
    } else {
      text = turnName + ' aan zet';
      if (inCheck) text += ' — Schaak!';
      if (vsAI && game.turn === aiColor && !aiThinking) text = 'Computer denkt na...';
    }
    el.textContent = text;
    el.className = inCheck ? 'check' : '';
  }

  function dutchReason(reason) {
    if (reason === 'stalemate') return 'pat';
    if (reason === 'fifty-move rule') return '50-zettenregel';
    if (reason === 'threefold repetition') return 'drievoudige zetherhaling';
    if (reason === 'insufficient material') return 'onvoldoende materiaal';
    return reason;
  }

  function renderMoveList() {
    var el = $('movelist');
    var out = '';
    for (var i = 0; i < game.history.length; i++) {
      if (i % 2 === 0) out += (Math.floor(i / 2) + 1) + '. ';
      out += game.history[i].san + ' ';
      if (i % 2 === 1) out += '\n';
    }
    el.textContent = out || '(nog geen zetten)';
    var wrap = $('movelist-wrap');
    wrap.scrollTop = wrap.scrollHeight;
  }

  function renderFen() {
    $('fen-output').value = C.stateToFen(game);
  }

  function renderAiControls() {
    $('ai-toggle').checked = vsAI;
    $('ai-color').disabled = vsAI;
    $('ai-depth').disabled = !vsAI;
  }

  function clearSelection() {
    selected = null;
    legalForSelected = [];
  }

  function onSquareClick(sq) {
    if (pendingPromotion) return;
    if (aiThinking) return;
    if (matchEndedOverride) return;
    var status = C.gameStatus(game);
    if (status.over) return;
    if (vsAI && game.turn === aiColor) return;

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

    if (sq === selected) {
      clearSelection();
      render();
      return;
    }

    if (piece && C.colorOf(piece) === game.turn) {
      selected = sq;
      legalForSelected = movesFrom(sq);
      render();
      return;
    }

    var target = null;
    for (var i = 0; i < legalForSelected.length; i++) {
      if (legalForSelected[i].to === sq) { target = legalForSelected[i]; break; }
    }
    if (!target) {
      clearSelection();
      render();
      return;
    }

    if (target.promotion) {
      pendingPromotion = { from: selected, to: sq, color: C.colorOf(target.piece) };
      showPromoDialog();
      return;
    }

    doMove(selected, sq, null);
  }

  function movesFrom(sq) {
    var all = C.generateLegalMoves(game);
    var out = [];
    for (var i = 0; i < all.length; i++) { if (all[i].from === sq) out.push(all[i]); }
    return out;
  }

  function showPromoDialog() {
    var dlg = $('promo-dialog');
    dlg.classList.remove('hidden');
    var isWhite = pendingPromotion.color === 'w';
    var letters = ['Q', 'R', 'B', 'N'];
    var glyphs = isWhite ? ['♕', '♖', '♗', '♘'] : ['♛', '♜', '♝', '♞'];
    dlg.innerHTML = '<div>Promoveer naar:</div>';
    for (var i = 0; i < letters.length; i++) {
      var btn = document.createElement('button');
      btn.textContent = glyphs[i];
      (function (letter) {
        btn.onclick = function () { resolvePromotion(letter); };
      })(letters[i]);
      dlg.appendChild(btn);
    }
  }

  function resolvePromotion(letter) {
    var p = pendingPromotion;
    pendingPromotion = null;
    $('promo-dialog').classList.add('hidden');
    $('promo-dialog').innerHTML = '';
    doMove(p.from, p.to, letter);
  }

  function doMove(from, to, promotion) {
    var result = C.move(game, from, to, promotion);
    if (!result) { clearSelection(); render(); return; }
    lastMove = { from: from, to: to };
    clearSelection();
    snapshots.push(C.cloneState(game));
    render();
    maybeTriggerAi();
  }

  function maybeTriggerAi() {
    if (!vsAI) return;
    var status = C.gameStatus(game);
    if (status.over) return;
    if (game.turn !== aiColor) return;
    aiThinking = true;
    moveToken++;
    var myToken = moveToken;
    render();
    setTimeout(function () { runAiMove(myToken); }, 30);
  }

  function runAiMove(myToken) {
    if (myToken !== moveToken) return; // superseded by undo/new game/loaded FEN
    var status = C.gameStatus(game);
    if (status.over) { aiThinking = false; render(); return; }
    var best = chooseAiMove(game, aiDepth);
    if (myToken !== moveToken) return;
    aiThinking = false;
    if (best) {
      var result = C.move(game, best.from, best.to, best.promotion);
      if (result) {
        lastMove = { from: best.from, to: best.to };
        snapshots.push(C.cloneState(game));
      }
    }
    render();
  }

  /* ---- Minimal-strength search AI (material + light positional eval) ---- */

  var PIECE_VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 0 };
  var CENTER_BONUS = [
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 1, 1, 1, 1, 1, 1, 0,
    0, 1, 2, 2, 2, 2, 1, 0,
    0, 1, 2, 3, 3, 2, 1, 0,
    0, 1, 2, 3, 3, 2, 1, 0,
    0, 1, 2, 2, 2, 2, 1, 0,
    0, 1, 1, 1, 1, 1, 1, 0,
    0, 0, 0, 0, 0, 0, 0, 0
  ];

  function evaluate(state) {
    var score = 0;
    for (var sq = 0; sq < 64; sq++) {
      var p = state.board[sq];
      if (!p) continue;
      var val = PIECE_VALUE[C.typeOf(p)] + CENTER_BONUS[sq];
      score += C.colorOf(p) === 'w' ? val : -val;
    }
    return score;
  }

  function minimax(state, depth, alpha, beta, maximizing) {
    var legal = C.generateLegalMoves(state);
    if (legal.length === 0) {
      if (C.isInCheck(state, state.turn)) {
        return maximizing ? (-100000 - depth) : (100000 + depth);
      }
      return 0;
    }
    if (depth === 0) return evaluate(state);

    if (maximizing) {
      var best = -Infinity;
      for (var i = 0; i < legal.length; i++) {
        var clone = C.cloneState(state);
        C.applyMove(clone, legal[i]);
        var v = minimax(clone, depth - 1, alpha, beta, false);
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      return best;
    } else {
      var worst = Infinity;
      for (var j = 0; j < legal.length; j++) {
        var clone2 = C.cloneState(state);
        C.applyMove(clone2, legal[j]);
        var v2 = minimax(clone2, depth - 1, alpha, beta, true);
        if (v2 < worst) worst = v2;
        if (worst < beta) beta = worst;
        if (alpha >= beta) break;
      }
      return worst;
    }
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  }

  function chooseAiMove(state, depth) {
    var legal = shuffle(C.generateLegalMoves(state).slice());
    if (legal.length === 0) return null;
    var maximizing = state.turn === 'w';
    var bestScore = maximizing ? -Infinity : Infinity;
    var bestMoves = [];
    for (var i = 0; i < legal.length; i++) {
      var clone = C.cloneState(state);
      C.applyMove(clone, legal[i]);
      var score = minimax(clone, depth - 1, -Infinity, Infinity, !maximizing);
      if (maximizing ? score > bestScore : score < bestScore) {
        bestScore = score;
        bestMoves = [legal[i]];
      } else if (score === bestScore) {
        bestMoves.push(legal[i]);
      }
    }
    return bestMoves[Math.floor(Math.random() * bestMoves.length)];
  }

  /* ---- Keyboard navigation for button/d-pad e-readers ---- */

  function onKeyDown(e) {
    if (matchEndedOverride || pendingPromotion || aiThinking) return;
    var key = e.key;
    var f = C.fileOf(cursor), r = C.rankOf(cursor);
    var moved = true;
    if (key === 'ArrowLeft') { f = Math.max(0, f - 1); }
    else if (key === 'ArrowRight') { f = Math.min(7, f + 1); }
    else if (key === 'ArrowUp') { r = Math.min(7, r + 1); }
    else if (key === 'ArrowDown') { r = Math.max(0, r - 1); }
    else if (key === 'Enter' || key === ' ') { onSquareClick(cursor); return; }
    else { moved = false; }
    if (moved) {
      cursor = C.sqOf(f, r);
      render();
      e.preventDefault();
    }
  }

  /* ---- Controls ---- */

  function newGame() {
    if (aiThinking) return;
    moveToken++;
    game = C.newGame();
    snapshots = [C.cloneState(game)];
    clearSelection();
    lastMove = null;
    pendingPromotion = null;
    matchEndedOverride = null;
    $('promo-dialog').classList.add('hidden');
    $('promo-dialog').innerHTML = '';
    render();
    maybeTriggerAi();
  }

  function undo() {
    if (aiThinking) return;
    if (snapshots.length <= 1) return;
    moveToken++;
    snapshots.pop();
    if (vsAI && snapshots.length > 1) {
      // Undo the AI reply too, landing back on the human's turn.
      var next = C.cloneState(snapshots[snapshots.length - 1]);
      if (next.turn === aiColor) { snapshots.pop(); }
    }
    game = C.cloneState(snapshots[snapshots.length - 1]);
    clearSelection();
    lastMove = null;
    matchEndedOverride = null;
    render();
  }

  function flipBoard() {
    flipped = !flipped;
    buildBoardTable();
    render();
  }

  function loadFen() {
    if (aiThinking) return;
    var input = $('fen-input').value;
    try {
      var loaded = C.fenToState(input);
      // sanity check: must have exactly one king per side
      var wk = 0, bk = 0;
      for (var i = 0; i < 64; i++) {
        if (loaded.board[i] === 'K') wk++;
        if (loaded.board[i] === 'k') bk++;
      }
      if (wk !== 1 || bk !== 1) throw new Error('invalid kings');
      moveToken++;
      game = loaded;
      snapshots = [C.cloneState(game)];
      clearSelection();
      lastMove = null;
      matchEndedOverride = null;
      render();
      maybeTriggerAi();
    } catch (err) {
      alert('Ongeldige FEN-notatie.');
    }
  }

  function copyFen() {
    var el = $('fen-output');
    el.select();
    try { document.execCommand('copy'); } catch (e) { /* clipboard unavailable; text stays selected for manual copy */ }
  }

  function resign() {
    if (matchEndedOverride) return;
    if (!confirm('Weet je zeker dat je wilt opgeven?')) return;
    var winner = game.turn === 'w' ? 'Zwart' : 'Wit';
    matchEndedOverride = 'Opgegeven — ' + winner + ' wint';
    clearSelection();
    render();
  }

  function offerDraw() {
    if (matchEndedOverride) return;
    if (confirm('Bevestig: beide spelers gaan akkoord met remise?')) {
      matchEndedOverride = 'Remise — in onderling overleg';
      clearSelection();
      render();
    }
  }

  function setup() {
    buildBoardTable();
    render();

    $('btn-new').onclick = newGame;
    $('btn-undo').onclick = undo;
    $('btn-flip').onclick = flipBoard;
    $('btn-resign').onclick = resign;
    $('btn-draw').onclick = offerDraw;
    $('btn-load-fen').onclick = loadFen;
    $('btn-copy-fen').onclick = copyFen;

    $('ai-toggle').onchange = function () {
      vsAI = this.checked;
      renderAiControls();
      maybeTriggerAi();
    };
    $('ai-color').onchange = function () {
      aiColor = this.value;
      maybeTriggerAi();
    };
    $('ai-depth').onchange = function () {
      aiDepth = parseInt(this.value, 10);
    };

    document.addEventListener('keydown', onKeyDown);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();
