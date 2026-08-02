/* Chess rules engine — plain ES5, no dependencies.
   Board: array of 64 squares, index = rank*8+file, rank 0 = rank "1", file 0 = "a".
   Piece codes: 'P','N','B','R','Q','K' = white, lowercase = black. null = empty.

   Supports variants: standard, chess960, koth (King of the Hill), threecheck.
   Castling is implemented Chess960-style throughout; standard chess is simply
   Chess960 position #518, so one code path serves both. */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChessEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FILES = 'abcdefgh';
  var CENTER_SQUARES = [27, 28, 35, 36]; // d4 e4 d5 e5

  function fileOf(sq) { return sq & 7; }
  function rankOf(sq) { return sq >> 3; }
  function sqOf(file, rank) { return rank * 8 + file; }
  function inBoard(file, rank) { return file >= 0 && file <= 7 && rank >= 0 && rank <= 7; }
  function squareName(sq) { return FILES.charAt(fileOf(sq)) + (rankOf(sq) + 1); }
  function parseSquareName(name) {
    return sqOf(FILES.indexOf(name.charAt(0)), parseInt(name.charAt(1), 10) - 1);
  }
  function isWhitePiece(p) { return p >= 'A' && p <= 'Z'; }
  function colorOf(p) { return isWhitePiece(p) ? 'w' : 'b'; }
  function typeOf(p) { return p.toUpperCase(); }
  function opponent(c) { return c === 'w' ? 'b' : 'w'; }

  var ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  var QUEEN_DIRS = ROOK_DIRS.concat(BISHOP_DIRS);
  var KNIGHT_JUMPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

  var VARIANT_NAMES = {
    standard: 'Standaard schaak',
    chess960: 'Chess960 (Fischer Random)',
    koth: 'King of the Hill',
    threecheck: 'Drie schaken'
  };

  var VARIANT_RULES = {
    standard: 'De klassieke regels. Zet de koning schaakmat om te winnen.',
    chess960: 'De stukken op de achterste rij staan willekeurig opgesteld (lopers op verschillende kleuren, koning tussen de torens). Rokeren mag nog steeds: de koning eindigt op g1/c1, de toren op f1/d1.',
    koth: 'Je wint ook meteen als je koning een van de vier centrumvelden (d4, e4, d5, e5) veilig bereikt. Schaakmat wint natuurlijk ook.',
    threecheck: 'Je wint zodra je de vijandelijke koning drie keer schaak hebt gezet. Verder gelden de normale regels.'
  };

  /* ---------------- State ---------------- */

  function emptyBoard() {
    var b = new Array(64);
    for (var i = 0; i < 64; i++) b[i] = null;
    return b;
  }

  function makeState(board, variant) {
    var state = {
      board: board,
      turn: 'w',
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      ep: null,
      halfmove: 0,
      fullmove: 1,
      variant: variant || 'standard',
      checkCount: { w: 0, b: 0 },
      initial: null,
      kings: { w: -1, b: -1 },
      history: [],
      repetition: {}
    };
    deriveInitialFiles(state);
    refreshKings(state);
    return state;
  }

  /* Work out where the king and the two castling rooks started, so Chess960-style
     castling and rights-tracking work for any back-rank arrangement. Derived per
     colour from its own back rank: a king that has already moved off its home rank
     must not corrupt the other colour's rook files. */
  function deriveInitialFiles(state) {
    state.initial = { w: deriveSideFiles(state.board, 0, 'K', 'R'), b: deriveSideFiles(state.board, 7, 'k', 'r') };
  }

  function deriveSideFiles(board, rank, kingChar, rookChar) {
    var kingFile = -1, f;
    for (f = 0; f < 8; f++) { if (board[sqOf(f, rank)] === kingChar) { kingFile = f; break; } }
    if (kingFile === -1) return { kingFile: 4, qRookFile: 0, kRookFile: 7 };
    var qRookFile = 0, kRookFile = 7;
    for (f = kingFile - 1; f >= 0; f--) { if (board[sqOf(f, rank)] === rookChar) { qRookFile = f; break; } }
    for (f = kingFile + 1; f <= 7; f++) { if (board[sqOf(f, rank)] === rookChar) { kRookFile = f; break; } }
    return { kingFile: kingFile, qRookFile: qRookFile, kRookFile: kRookFile };
  }

  function refreshKings(state) {
    state.kings.w = -1;
    state.kings.b = -1;
    for (var i = 0; i < 64; i++) {
      if (state.board[i] === 'K') state.kings.w = i;
      else if (state.board[i] === 'k') state.kings.b = i;
    }
  }

  function standardBackrank() {
    return ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
  }

  function buildFromBackrank(backrank) {
    var b = emptyBoard();
    for (var f = 0; f < 8; f++) {
      b[sqOf(f, 0)] = backrank[f];
      b[sqOf(f, 1)] = 'P';
      b[sqOf(f, 6)] = 'p';
      b[sqOf(f, 7)] = backrank[f].toLowerCase();
    }
    return b;
  }

  /* Random Chess960 back rank: bishops on opposite colours, king between the rooks. */
  function randomBackrank() {
    var slots = [null, null, null, null, null, null, null, null];
    function freeSlots() {
      var out = [];
      for (var i = 0; i < 8; i++) { if (slots[i] === null) out.push(i); }
      return out;
    }
    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    var lightSquares = [1, 3, 5, 7], darkSquares = [0, 2, 4, 6];
    slots[pick(lightSquares)] = 'B';
    slots[pick(darkSquares)] = 'B';

    var free = freeSlots();
    slots[pick(free)] = 'Q';

    free = freeSlots();
    slots[pick(free)] = 'N';
    free = freeSlots();
    slots[pick(free)] = 'N';

    free = freeSlots(); // exactly three left: rook, king, rook
    slots[free[0]] = 'R';
    slots[free[1]] = 'K';
    slots[free[2]] = 'R';
    return slots;
  }

  function newGame(variant) {
    variant = variant || 'standard';
    var backrank = variant === 'chess960' ? randomBackrank() : standardBackrank();
    return makeState(buildFromBackrank(backrank), variant);
  }

  function cloneState(s) {
    return {
      board: s.board.slice(),
      turn: s.turn,
      castling: { wK: s.castling.wK, wQ: s.castling.wQ, bK: s.castling.bK, bQ: s.castling.bQ },
      ep: s.ep,
      halfmove: s.halfmove,
      fullmove: s.fullmove,
      variant: s.variant,
      checkCount: { w: s.checkCount.w, b: s.checkCount.b },
      initial: {
        w: { kingFile: s.initial.w.kingFile, qRookFile: s.initial.w.qRookFile, kRookFile: s.initial.w.kRookFile },
        b: { kingFile: s.initial.b.kingFile, qRookFile: s.initial.b.qRookFile, kRookFile: s.initial.b.kRookFile }
      },
      kings: { w: s.kings.w, b: s.kings.b },
      history: s.history.slice(),
      repetition: copyMap(s.repetition)
    };
  }

  function copyMap(m) {
    var out = {};
    for (var k in m) { if (m.hasOwnProperty(k)) out[k] = m[k]; }
    return out;
  }

  /* ---------------- Attack detection ---------------- */

  function isSquareAttacked(board, sq, byColor) {
    var f = fileOf(sq), r = rankOf(sq), i, tf, tr, t;

    var pawnRank = r + (byColor === 'w' ? -1 : 1);
    if (pawnRank >= 0 && pawnRank <= 7) {
      var pawnChar = byColor === 'w' ? 'P' : 'p';
      if (f > 0 && board[sqOf(f - 1, pawnRank)] === pawnChar) return true;
      if (f < 7 && board[sqOf(f + 1, pawnRank)] === pawnChar) return true;
    }

    var knightChar = byColor === 'w' ? 'N' : 'n';
    for (i = 0; i < 8; i++) {
      tf = f + KNIGHT_JUMPS[i][0]; tr = r + KNIGHT_JUMPS[i][1];
      if (inBoard(tf, tr) && board[sqOf(tf, tr)] === knightChar) return true;
    }

    var kingChar = byColor === 'w' ? 'K' : 'k';
    for (i = 0; i < 8; i++) {
      tf = f + QUEEN_DIRS[i][0]; tr = r + QUEEN_DIRS[i][1];
      if (inBoard(tf, tr) && board[sqOf(tf, tr)] === kingChar) return true;
    }

    for (i = 0; i < 4; i++) {
      tf = f; tr = r;
      for (;;) {
        tf += ROOK_DIRS[i][0]; tr += ROOK_DIRS[i][1];
        if (!inBoard(tf, tr)) break;
        t = board[sqOf(tf, tr)];
        if (t) {
          if (colorOf(t) === byColor) { var tt = typeOf(t); if (tt === 'R' || tt === 'Q') return true; }
          break;
        }
      }
    }
    for (i = 0; i < 4; i++) {
      tf = f; tr = r;
      for (;;) {
        tf += BISHOP_DIRS[i][0]; tr += BISHOP_DIRS[i][1];
        if (!inBoard(tf, tr)) break;
        t = board[sqOf(tf, tr)];
        if (t) {
          if (colorOf(t) === byColor) { var bt = typeOf(t); if (bt === 'B' || bt === 'Q') return true; }
          break;
        }
      }
    }
    return false;
  }

  function isInCheck(state, color) {
    var ks = state.kings[color];
    if (ks < 0) return false;
    return isSquareAttacked(state.board, ks, opponent(color));
  }

  /* ---------------- Move generation ---------------- */

  function generatePseudoMoves(state) {
    var board = state.board, turn = state.turn, moves = [], sq, piece;
    for (sq = 0; sq < 64; sq++) {
      piece = board[sq];
      if (!piece || colorOf(piece) !== turn) continue;
      var type = typeOf(piece);
      var f = fileOf(sq), r = rankOf(sq);

      if (type === 'P') {
        var dir = turn === 'w' ? 1 : -1;
        var startRank = turn === 'w' ? 1 : 6;
        var promoRank = turn === 'w' ? 7 : 0;
        var oneRank = r + dir;
        if (oneRank >= 0 && oneRank <= 7) {
          var oneSq = sqOf(f, oneRank);
          if (!board[oneSq]) {
            addPawnMove(moves, sq, oneSq, piece, null, oneRank === promoRank, null);
            if (r === startRank && !board[sqOf(f, r + 2 * dir)]) {
              moves.push(mkMove(sq, sqOf(f, r + 2 * dir), piece, null, null, 'double'));
            }
          }
          for (var d = -1; d <= 1; d += 2) {
            var tf = f + d;
            if (tf < 0 || tf > 7) continue;
            var tsq = sqOf(tf, oneRank);
            var target = board[tsq];
            if (target && colorOf(target) !== turn) {
              addPawnMove(moves, sq, tsq, piece, target, oneRank === promoRank, null);
            } else if (!target && state.ep === tsq) {
              moves.push(mkMove(sq, tsq, piece, board[sqOf(tf, r)], null, 'ep'));
            }
          }
        }
      } else if (type === 'N') {
        for (var ki = 0; ki < 8; ki++) {
          var kf = f + KNIGHT_JUMPS[ki][0], kr = r + KNIGHT_JUMPS[ki][1];
          if (!inBoard(kf, kr)) continue;
          var ksq = sqOf(kf, kr), kt = board[ksq];
          if (!kt || colorOf(kt) !== turn) moves.push(mkMove(sq, ksq, piece, kt, null, null));
        }
      } else if (type === 'K') {
        for (var qi = 0; qi < 8; qi++) {
          var qf = f + QUEEN_DIRS[qi][0], qr = r + QUEEN_DIRS[qi][1];
          if (!inBoard(qf, qr)) continue;
          var qsq = sqOf(qf, qr), qt = board[qsq];
          if (!qt || colorOf(qt) !== turn) moves.push(mkMove(sq, qsq, piece, qt, null, null));
        }
        addCastlingMoves(state, moves, turn);
      } else {
        var dirs = type === 'B' ? BISHOP_DIRS : (type === 'R' ? ROOK_DIRS : QUEEN_DIRS);
        for (var di = 0; di < dirs.length; di++) {
          var df = f, dr = r;
          for (;;) {
            df += dirs[di][0]; dr += dirs[di][1];
            if (!inBoard(df, dr)) break;
            var dsq = sqOf(df, dr), dt = board[dsq];
            if (!dt) { moves.push(mkMove(sq, dsq, piece, null, null, null)); }
            else {
              if (colorOf(dt) !== turn) moves.push(mkMove(sq, dsq, piece, dt, null, null));
              break;
            }
          }
        }
      }
    }
    return moves;
  }

  function mkMove(from, to, piece, captured, promotion, flag) {
    return { from: from, to: to, piece: piece, captured: captured || null, promotion: promotion || null, flag: flag || null, rookFrom: -1, rookTo: -1 };
  }

  function addPawnMove(moves, from, to, piece, captured, isPromo, flag) {
    if (isPromo) {
      var promos = colorOf(piece) === 'w' ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'];
      for (var i = 0; i < 4; i++) moves.push(mkMove(from, to, piece, captured, promos[i], flag));
    } else {
      moves.push(mkMove(from, to, piece, captured, null, flag));
    }
  }

  /* Chess960-compatible castling. Works for standard chess too. */
  function addCastlingMoves(state, moves, color) {
    var board = state.board;
    var rank = color === 'w' ? 0 : 7;
    var opp = opponent(color);
    var kingChar = color === 'w' ? 'K' : 'k';
    var rookChar = color === 'w' ? 'R' : 'r';
    var kingFrom = state.kings[color];
    if (kingFrom < 0 || rankOf(kingFrom) !== rank || board[kingFrom] !== kingChar) return;

    var init = state.initial[color];
    var sides = [
      { right: color === 'w' ? 'wK' : 'bK', rookFile: init.kRookFile, kingToFile: 6, rookToFile: 5, flag: 'castleK' },
      { right: color === 'w' ? 'wQ' : 'bQ', rookFile: init.qRookFile, kingToFile: 2, rookToFile: 3, flag: 'castleQ' }
    ];

    for (var s = 0; s < 2; s++) {
      var side = sides[s];
      if (!state.castling[side.right]) continue;
      var rookFrom = sqOf(side.rookFile, rank);
      if (board[rookFrom] !== rookChar) continue;
      var kingTo = sqOf(side.kingToFile, rank);
      var rookTo = sqOf(side.rookToFile, rank);

      // Every square the king or rook passes through (or lands on) must be empty,
      // ignoring the castling king and rook themselves.
      if (!pathClear(board, kingFrom, kingTo, kingFrom, rookFrom)) continue;
      if (!pathClear(board, rookFrom, rookTo, kingFrom, rookFrom)) continue;

      // The king may not start in, pass through, or land on an attacked square.
      var blocked = false;
      var lo = Math.min(kingFrom, kingTo), hi = Math.max(kingFrom, kingTo);
      for (var sq = lo; sq <= hi; sq++) {
        if (isSquareAttacked(board, sq, opp)) { blocked = true; break; }
      }
      if (blocked) continue;

      var m = mkMove(kingFrom, kingTo, kingChar, null, null, side.flag);
      m.rookFrom = rookFrom;
      m.rookTo = rookTo;
      moves.push(m);
    }
  }

  function pathClear(board, from, to, ignoreA, ignoreB) {
    var lo = Math.min(from, to), hi = Math.max(from, to);
    for (var sq = lo; sq <= hi; sq++) {
      if (sq === ignoreA || sq === ignoreB) continue;
      if (board[sq]) return false;
    }
    return true;
  }

  /* ---------------- Make / unmake ---------------- */

  function makeMove(state, move) {
    var board = state.board;
    var color = colorOf(move.piece);
    var undo = {
      ep: state.ep,
      halfmove: state.halfmove,
      fullmove: state.fullmove,
      wK: state.castling.wK, wQ: state.castling.wQ,
      bK: state.castling.bK, bQ: state.castling.bQ,
      kingW: state.kings.w, kingB: state.kings.b,
      checkW: state.checkCount.w, checkB: state.checkCount.b,
      epCapturedSq: -1
    };

    if (move.flag === 'castleK' || move.flag === 'castleQ') {
      // Clear both origin squares first: in Chess960 they can overlap the targets.
      board[move.from] = null;
      board[move.rookFrom] = null;
      board[move.to] = move.piece;
      board[move.rookTo] = color === 'w' ? 'R' : 'r';
    } else {
      board[move.from] = null;
      if (move.flag === 'ep') {
        var capSq = sqOf(fileOf(move.to), rankOf(move.from));
        undo.epCapturedSq = capSq;
        board[capSq] = null;
      }
      board[move.to] = move.promotion ? move.promotion : move.piece;
    }

    if (typeOf(move.piece) === 'K') state.kings[color] = move.to;

    // Castling rights
    if (typeOf(move.piece) === 'K') {
      if (color === 'w') { state.castling.wK = false; state.castling.wQ = false; }
      else { state.castling.bK = false; state.castling.bQ = false; }
    }
    var wQRook = sqOf(state.initial.w.qRookFile, 0), wKRook = sqOf(state.initial.w.kRookFile, 0);
    var bQRook = sqOf(state.initial.b.qRookFile, 7), bKRook = sqOf(state.initial.b.kRookFile, 7);
    if (move.from === wQRook || move.to === wQRook) state.castling.wQ = false;
    if (move.from === wKRook || move.to === wKRook) state.castling.wK = false;
    if (move.from === bQRook || move.to === bQRook) state.castling.bQ = false;
    if (move.from === bKRook || move.to === bKRook) state.castling.bK = false;

    state.ep = move.flag === 'double'
      ? sqOf(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) >> 1)
      : null;

    if (typeOf(move.piece) === 'P' || move.captured) state.halfmove = 0;
    else state.halfmove++;

    if (color === 'b') state.fullmove++;
    state.turn = opponent(state.turn);

    if (state.variant === 'threecheck') {
      if (isInCheck(state, state.turn)) state.checkCount[color]++;
    }

    return undo;
  }

  function unmakeMove(state, move, undo) {
    var board = state.board;
    var color = colorOf(move.piece);

    if (move.flag === 'castleK' || move.flag === 'castleQ') {
      board[move.to] = null;
      board[move.rookTo] = null;
      board[move.from] = move.piece;
      board[move.rookFrom] = color === 'w' ? 'R' : 'r';
    } else {
      board[move.from] = move.piece;
      board[move.to] = null;
      if (move.flag === 'ep') {
        board[undo.epCapturedSq] = move.captured;
      } else if (move.captured) {
        board[move.to] = move.captured;
      }
    }

    state.ep = undo.ep;
    state.halfmove = undo.halfmove;
    state.fullmove = undo.fullmove;
    state.castling.wK = undo.wK; state.castling.wQ = undo.wQ;
    state.castling.bK = undo.bK; state.castling.bQ = undo.bQ;
    state.kings.w = undo.kingW; state.kings.b = undo.kingB;
    state.checkCount.w = undo.checkW; state.checkCount.b = undo.checkB;
    state.turn = color;
  }

  function generateLegalMoves(state) {
    var pseudo = generatePseudoMoves(state);
    var legal = [];
    var color = state.turn;
    for (var i = 0; i < pseudo.length; i++) {
      var undo = makeMove(state, pseudo[i]);
      if (!isSquareAttacked(state.board, state.kings[color], opponent(color))) legal.push(pseudo[i]);
      unmakeMove(state, pseudo[i], undo);
    }
    return legal;
  }

  /* ---------------- Notation ---------------- */

  function positionKey(state) {
    var s = '';
    for (var i = 0; i < 64; i++) s += state.board[i] || '.';
    return s + '|' + state.turn + '|' +
      (state.castling.wK ? 'K' : '') + (state.castling.wQ ? 'Q' : '') +
      (state.castling.bK ? 'k' : '') + (state.castling.bQ ? 'q' : '') + '|' +
      (state.ep === null ? '-' : state.ep);
  }

  function sanForMove(state, move, legalMoves) {
    var s;
    if (move.flag === 'castleK') s = 'O-O';
    else if (move.flag === 'castleQ') s = 'O-O-O';
    else {
      var type = typeOf(move.piece);
      var isCapture = !!move.captured || move.flag === 'ep';
      if (type === 'P') {
        s = '';
        if (isCapture) s += FILES.charAt(fileOf(move.from)) + 'x';
        s += squareName(move.to);
        if (move.promotion) s += '=' + typeOf(move.promotion);
      } else {
        s = type;
        var sameFile = false, sameRank = false, ambiguous = false;
        for (var i = 0; i < legalMoves.length; i++) {
          var m = legalMoves[i];
          if (m.to === move.to && m.from !== move.from && m.piece === move.piece) {
            ambiguous = true;
            if (fileOf(m.from) === fileOf(move.from)) sameFile = true;
            if (rankOf(m.from) === rankOf(move.from)) sameRank = true;
          }
        }
        if (ambiguous) {
          if (!sameFile) s += FILES.charAt(fileOf(move.from));
          else if (!sameRank) s += (rankOf(move.from) + 1);
          else s += squareName(move.from);
        }
        if (isCapture) s += 'x';
        s += squareName(move.to);
      }
    }

    var undo = makeMove(state, move);
    var opp = state.turn;
    if (isInCheck(state, opp)) {
      s += generateLegalMoves(state).length === 0 ? '#' : '+';
    }
    unmakeMove(state, move, undo);
    return s;
  }

  /* ---------------- Game status ---------------- */

  function insufficientMaterial(board) {
    var minors = [], others = 0;
    for (var i = 0; i < 64; i++) {
      var p = board[i];
      if (!p) continue;
      var t = typeOf(p);
      if (t === 'K') continue;
      if (t === 'B' || t === 'N') minors.push({ type: t, sq: i, color: colorOf(p) });
      else others++;
    }
    if (others > 0) return false;
    if (minors.length === 0) return true;                    // K vs K
    if (minors.length === 1) return true;                    // K+B or K+N vs K
    if (minors.length === 2 && minors[0].type === 'B' && minors[1].type === 'B' &&
        minors[0].color !== minors[1].color) {
      // Opposing bishops on the same colour complex can never mate.
      var c0 = (fileOf(minors[0].sq) + rankOf(minors[0].sq)) & 1;
      var c1 = (fileOf(minors[1].sq) + rankOf(minors[1].sq)) & 1;
      if (c0 === c1) return true;
    }
    return false;
  }

  function gameStatus(state) {
    // Variant-specific instant wins are checked before the normal terminal tests.
    if (state.variant === 'koth') {
      for (var i = 0; i < CENTER_SQUARES.length; i++) {
        var p = state.board[CENTER_SQUARES[i]];
        if (p === 'K') return { over: true, result: '1-0', reason: 'koth' };
        if (p === 'k') return { over: true, result: '0-1', reason: 'koth' };
      }
    }
    if (state.variant === 'threecheck') {
      if (state.checkCount.w >= 3) return { over: true, result: '1-0', reason: 'threecheck' };
      if (state.checkCount.b >= 3) return { over: true, result: '0-1', reason: 'threecheck' };
    }

    var legal = generateLegalMoves(state);
    var inCheck = isInCheck(state, state.turn);
    if (legal.length === 0) {
      return inCheck
        ? { over: true, result: state.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate' }
        : { over: true, result: '1/2-1/2', reason: 'stalemate' };
    }
    if (state.halfmove >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty' };
    if ((state.repetition[positionKey(state)] || 0) >= 3) {
      return { over: true, result: '1/2-1/2', reason: 'repetition' };
    }
    // In King of the Hill a lone minor piece can still escort a king to the hill,
    // so the material-based draw only applies to the normal-goal variants.
    if (state.variant !== 'koth' && insufficientMaterial(state.board)) {
      return { over: true, result: '1/2-1/2', reason: 'material' };
    }
    return { over: false, inCheck: inCheck, legalMoves: legal };
  }

  /* Play a move given from/to (+ promotion letter). Returns the move, or null if illegal. */
  function move(state, from, to, promotion) {
    var legal = generateLegalMoves(state);
    var chosen = null;
    for (var i = 0; i < legal.length; i++) {
      var m = legal[i];
      if (m.from !== from) continue;
      // Castling can also be triggered by selecting your own rook (Chess960 convention).
      var matchesTarget = m.to === to || ((m.flag === 'castleK' || m.flag === 'castleQ') && m.rookFrom === to);
      if (!matchesTarget) continue;
      if (m.promotion) {
        if (promotion && typeOf(m.promotion) === promotion.toUpperCase()) { chosen = m; break; }
      } else { chosen = m; break; }
    }
    if (!chosen) return null;

    var san = sanForMove(state, chosen, legal);
    makeMove(state, chosen);
    var key = positionKey(state);
    state.repetition[key] = (state.repetition[key] || 0) + 1;
    state.history.push({
      san: san, from: chosen.from, to: chosen.to, piece: chosen.piece,
      captured: chosen.captured, promotion: chosen.promotion, flag: chosen.flag
    });
    return chosen;
  }

  /* ---------------- FEN ---------------- */

  function stateToFen(state) {
    var rows = [];
    for (var r = 7; r >= 0; r--) {
      var row = '', empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = state.board[sqOf(f, r)];
        if (!p) empty++;
        else { if (empty) { row += empty; empty = 0; } row += p; }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    var castle = (state.castling.wK ? 'K' : '') + (state.castling.wQ ? 'Q' : '') +
      (state.castling.bK ? 'k' : '') + (state.castling.bQ ? 'q' : '');
    return rows.join('/') + ' ' + state.turn + ' ' + (castle || '-') + ' ' +
      (state.ep === null ? '-' : squareName(state.ep)) + ' ' + state.halfmove + ' ' + state.fullmove;
  }

  function fenToState(fen, variant) {
    var parts = fen.trim().split(/\s+/);
    if (parts.length < 2) throw new Error('FEN incompleet');
    var rows = parts[0].split('/');
    if (rows.length !== 8) throw new Error('FEN moet 8 rijen hebben');

    var board = emptyBoard();
    for (var r = 0; r < 8; r++) {
      var row = rows[7 - r], f = 0;
      for (var c = 0; c < row.length; c++) {
        var ch = row.charAt(c);
        if (ch >= '1' && ch <= '8') f += parseInt(ch, 10);
        else if ('KQRBNPkqrbnp'.indexOf(ch) !== -1) { if (f > 7) throw new Error('rij te lang'); board[sqOf(f, r)] = ch; f++; }
        else throw new Error('onbekend teken in FEN: ' + ch);
      }
      if (f !== 8) throw new Error('rij heeft niet 8 velden');
    }

    var state = makeState(board, variant || 'standard');
    var turn = parts[1];
    if (turn !== 'w' && turn !== 'b') throw new Error('zetkleur moet w of b zijn');
    state.turn = turn;

    var castle = parts[2] || '-';
    state.castling.wK = castle.indexOf('K') !== -1;
    state.castling.wQ = castle.indexOf('Q') !== -1;
    state.castling.bK = castle.indexOf('k') !== -1;
    state.castling.bQ = castle.indexOf('q') !== -1;

    var ep = parts[3] || '-';
    state.ep = (ep === '-' || ep.length < 2) ? null : parseSquareName(ep);
    state.halfmove = parseInt(parts[4], 10) || 0;
    state.fullmove = parseInt(parts[5], 10) || 1;

    if (state.kings.w < 0 || state.kings.b < 0) throw new Error('beide koningen zijn verplicht');
    // The side not to move must not already be in check — that position is unreachable.
    if (isInCheck(state, opponent(state.turn))) throw new Error('koning van de niet-aanzijnde partij staat schaak');
    return state;
  }

  function perft(state, depth) {
    if (depth === 0) return 1;
    var legal = generateLegalMoves(state);
    if (depth === 1) return legal.length;
    var count = 0;
    for (var i = 0; i < legal.length; i++) {
      var undo = makeMove(state, legal[i]);
      count += perft(state, depth - 1);
      unmakeMove(state, legal[i], undo);
    }
    return count;
  }

  return {
    newGame: newGame,
    makeState: makeState,
    cloneState: cloneState,
    generatePseudoMoves: generatePseudoMoves,
    generateLegalMoves: generateLegalMoves,
    makeMove: makeMove,
    unmakeMove: unmakeMove,
    move: move,
    gameStatus: gameStatus,
    isInCheck: isInCheck,
    isSquareAttacked: isSquareAttacked,
    stateToFen: stateToFen,
    fenToState: fenToState,
    squareName: squareName,
    parseSquareName: parseSquareName,
    fileOf: fileOf,
    rankOf: rankOf,
    sqOf: sqOf,
    colorOf: colorOf,
    typeOf: typeOf,
    opponent: opponent,
    perft: perft,
    positionKey: positionKey,
    insufficientMaterial: insufficientMaterial,
    randomBackrank: randomBackrank,
    buildFromBackrank: buildFromBackrank,
    VARIANT_NAMES: VARIANT_NAMES,
    VARIANT_RULES: VARIANT_RULES,
    CENTER_SQUARES: CENTER_SQUARES
  };
}));
