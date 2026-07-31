/* Chess rules engine — plain ES5, no dependencies.
   Board: array of 64 squares, index = rank*8+file, rank 0 = rank "1", file 0 = "a".
   Piece codes: 'P','N','B','R','Q','K' = white, lowercase = black. null = empty. */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ChessEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var FILES = 'abcdefgh';

  function fileOf(sq) { return sq % 8; }
  function rankOf(sq) { return Math.floor(sq / 8); }
  function sqOf(file, rank) { return rank * 8 + file; }
  function inBoard(file, rank) { return file >= 0 && file <= 7 && rank >= 0 && rank <= 7; }
  function squareName(sq) { return FILES.charAt(fileOf(sq)) + (rankOf(sq) + 1); }
  function parseSquareName(name) {
    var file = FILES.indexOf(name.charAt(0));
    var rank = parseInt(name.charAt(1), 10) - 1;
    return sqOf(file, rank);
  }
  function isWhite(piece) { return piece !== null && piece === piece.toUpperCase(); }
  function isBlack(piece) { return piece !== null && piece === piece.toLowerCase() && piece !== piece.toUpperCase(); }
  function colorOf(piece) { return isWhite(piece) ? 'w' : 'b'; }
  function typeOf(piece) { return piece.toUpperCase(); }
  function opponent(color) { return color === 'w' ? 'b' : 'w'; }

  var ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  var BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
  var QUEEN_DIRS = ROOK_DIRS.concat(BISHOP_DIRS);
  var KNIGHT_JUMPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];

  function initialBoard() {
    var b = new Array(64);
    for (var i = 0; i < 64; i++) b[i] = null;
    var backrank = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    for (var f = 0; f < 8; f++) {
      b[sqOf(f, 0)] = backrank[f];
      b[sqOf(f, 1)] = 'P';
      b[sqOf(f, 6)] = 'p';
      b[sqOf(f, 7)] = backrank[f].toLowerCase();
    }
    return b;
  }

  function newGame() {
    return {
      board: initialBoard(),
      turn: 'w',
      castling: { wK: true, wQ: true, bK: true, bQ: true },
      ep: null,
      halfmove: 0,
      fullmove: 1,
      history: [],
      repetition: {}
    };
  }

  function cloneState(state) {
    var b = state.board.slice();
    return {
      board: b,
      turn: state.turn,
      castling: { wK: state.castling.wK, wQ: state.castling.wQ, bK: state.castling.bK, bQ: state.castling.bQ },
      ep: state.ep,
      halfmove: state.halfmove,
      fullmove: state.fullmove,
      history: state.history.slice(),
      repetition: shallowCopyMap(state.repetition)
    };
  }

  function shallowCopyMap(m) {
    var out = {};
    for (var k in m) { if (m.hasOwnProperty(k)) out[k] = m[k]; }
    return out;
  }

  function kingSquare(board, color) {
    var target = color === 'w' ? 'K' : 'k';
    for (var i = 0; i < 64; i++) { if (board[i] === target) return i; }
    return -1;
  }

  /* Is `sq` attacked by any piece of color `byColor` on `board`? */
  function isSquareAttacked(board, sq, byColor) {
    var f = fileOf(sq), r = rankOf(sq), i, tf, tr, t;

    // Pawn attacks: look from sq backwards along the attacker's forward direction.
    var pawnDir = byColor === 'w' ? -1 : 1; // attacker pawn sits `pawnDir` ranks away from sq (toward its own side)
    var pawnRank = r + pawnDir;
    if (pawnRank >= 0 && pawnRank <= 7) {
      for (i = -1; i <= 1; i += 2) {
        tf = f + i;
        if (tf >= 0 && tf <= 7) {
          t = board[sqOf(tf, pawnRank)];
          if (t && colorOf(t) === byColor && typeOf(t) === 'P') return true;
        }
      }
    }

    // Knight attacks
    for (i = 0; i < KNIGHT_JUMPS.length; i++) {
      tf = f + KNIGHT_JUMPS[i][0];
      tr = r + KNIGHT_JUMPS[i][1];
      if (inBoard(tf, tr)) {
        t = board[sqOf(tf, tr)];
        if (t && colorOf(t) === byColor && typeOf(t) === 'N') return true;
      }
    }

    // King attacks
    for (i = 0; i < QUEEN_DIRS.length; i++) {
      tf = f + QUEEN_DIRS[i][0];
      tr = r + QUEEN_DIRS[i][1];
      if (inBoard(tf, tr)) {
        t = board[sqOf(tf, tr)];
        if (t && colorOf(t) === byColor && typeOf(t) === 'K') return true;
      }
    }

    // Sliding: rook/queen
    for (i = 0; i < ROOK_DIRS.length; i++) {
      tf = f; tr = r;
      for (;;) {
        tf += ROOK_DIRS[i][0]; tr += ROOK_DIRS[i][1];
        if (!inBoard(tf, tr)) break;
        t = board[sqOf(tf, tr)];
        if (t) {
          if (colorOf(t) === byColor && (typeOf(t) === 'R' || typeOf(t) === 'Q')) return true;
          break;
        }
      }
    }
    // Sliding: bishop/queen
    for (i = 0; i < BISHOP_DIRS.length; i++) {
      tf = f; tr = r;
      for (;;) {
        tf += BISHOP_DIRS[i][0]; tr += BISHOP_DIRS[i][1];
        if (!inBoard(tf, tr)) break;
        t = board[sqOf(tf, tr)];
        if (t) {
          if (colorOf(t) === byColor && (typeOf(t) === 'B' || typeOf(t) === 'Q')) return true;
          break;
        }
      }
    }
    return false;
  }

  function isInCheck(state, color) {
    var ks = kingSquare(state.board, color);
    if (ks === -1) return false;
    return isSquareAttacked(state.board, ks, opponent(color));
  }

  /* Pseudo-legal moves (does not filter self-check), including fully-validated castling. */
  function generatePseudoMoves(state) {
    var board = state.board, turn = state.turn, moves = [], sq, piece, color;
    for (sq = 0; sq < 64; sq++) {
      piece = board[sq];
      if (!piece || colorOf(piece) !== turn) continue;
      color = turn;
      var type = typeOf(piece);
      var f = fileOf(sq), r = rankOf(sq);

      if (type === 'P') {
        var dir = color === 'w' ? 1 : -1;
        var startRank = color === 'w' ? 1 : 6;
        var promoRank = color === 'w' ? 7 : 0;
        var oneRank = r + dir;
        if (inBoard(f, oneRank)) {
          var oneSq = sqOf(f, oneRank);
          if (!board[oneSq]) {
            addPawnMove(moves, sq, oneSq, piece, null, oneRank === promoRank, null);
            var twoRank = r + 2 * dir;
            if (r === startRank && !board[sqOf(f, twoRank)]) {
              moves.push({ from: sq, to: sqOf(f, twoRank), piece: piece, captured: null, promotion: null, flag: 'double' });
            }
          }
          var dxs = [-1, 1], k;
          for (k = 0; k < 2; k++) {
            var tf = f + dxs[k];
            if (!inBoard(tf, oneRank)) continue;
            var tsq = sqOf(tf, oneRank);
            var target = board[tsq];
            if (target && colorOf(target) !== color) {
              addPawnMove(moves, sq, tsq, piece, target, oneRank === promoRank, null);
            } else if (!target && state.ep === tsq) {
              moves.push({ from: sq, to: tsq, piece: piece, captured: board[sqOf(tf, r)], promotion: null, flag: 'ep' });
            }
          }
        }
      } else if (type === 'N') {
        for (var ki = 0; ki < KNIGHT_JUMPS.length; ki++) {
          var kf = f + KNIGHT_JUMPS[ki][0], kr = r + KNIGHT_JUMPS[ki][1];
          if (!inBoard(kf, kr)) continue;
          var ksq = sqOf(kf, kr);
          var kt = board[ksq];
          if (!kt || colorOf(kt) !== color) {
            moves.push({ from: sq, to: ksq, piece: piece, captured: kt, promotion: null, flag: null });
          }
        }
      } else if (type === 'K') {
        for (var qi = 0; qi < QUEEN_DIRS.length; qi++) {
          var qf = f + QUEEN_DIRS[qi][0], qr = r + QUEEN_DIRS[qi][1];
          if (!inBoard(qf, qr)) continue;
          var qsq = sqOf(qf, qr);
          var qt = board[qsq];
          if (!qt || colorOf(qt) !== color) {
            moves.push({ from: sq, to: qsq, piece: piece, captured: qt, promotion: null, flag: null });
          }
        }
        addCastlingMoves(state, moves, color);
      } else {
        var dirs = type === 'B' ? BISHOP_DIRS : (type === 'R' ? ROOK_DIRS : QUEEN_DIRS);
        for (var di = 0; di < dirs.length; di++) {
          var df = f, dr = r;
          for (;;) {
            df += dirs[di][0]; dr += dirs[di][1];
            if (!inBoard(df, dr)) break;
            var dsq = sqOf(df, dr);
            var dt = board[dsq];
            if (!dt) {
              moves.push({ from: sq, to: dsq, piece: piece, captured: null, promotion: null, flag: null });
            } else {
              if (colorOf(dt) !== color) {
                moves.push({ from: sq, to: dsq, piece: piece, captured: dt, promotion: null, flag: null });
              }
              break;
            }
          }
        }
      }
    }
    return moves;
  }

  function addPawnMove(moves, from, to, piece, captured, isPromo, flag) {
    if (isPromo) {
      var promos = colorOf(piece) === 'w' ? ['Q', 'R', 'B', 'N'] : ['q', 'r', 'b', 'n'];
      for (var i = 0; i < promos.length; i++) {
        moves.push({ from: from, to: to, piece: piece, captured: captured, promotion: promos[i], flag: flag });
      }
    } else {
      moves.push({ from: from, to: to, piece: piece, captured: captured, promotion: null, flag: flag });
    }
  }

  function addCastlingMoves(state, moves, color) {
    var board = state.board;
    var opp = opponent(color);
    if (color === 'w') {
      if (state.castling.wK && !board[5] && !board[6] && board[4] === 'K' && board[7] === 'R') {
        if (!isSquareAttacked(board, 4, opp) && !isSquareAttacked(board, 5, opp) && !isSquareAttacked(board, 6, opp)) {
          moves.push({ from: 4, to: 6, piece: 'K', captured: null, promotion: null, flag: 'castleK' });
        }
      }
      if (state.castling.wQ && !board[1] && !board[2] && !board[3] && board[4] === 'K' && board[0] === 'R') {
        if (!isSquareAttacked(board, 4, opp) && !isSquareAttacked(board, 3, opp) && !isSquareAttacked(board, 2, opp)) {
          moves.push({ from: 4, to: 2, piece: 'K', captured: null, promotion: null, flag: 'castleQ' });
        }
      }
    } else {
      if (state.castling.bK && !board[61] && !board[62] && board[60] === 'k' && board[63] === 'r') {
        if (!isSquareAttacked(board, 60, opp) && !isSquareAttacked(board, 61, opp) && !isSquareAttacked(board, 62, opp)) {
          moves.push({ from: 60, to: 62, piece: 'k', captured: null, promotion: null, flag: 'castleK' });
        }
      }
      if (state.castling.bQ && !board[57] && !board[58] && !board[59] && board[60] === 'k' && board[56] === 'r') {
        if (!isSquareAttacked(board, 60, opp) && !isSquareAttacked(board, 59, opp) && !isSquareAttacked(board, 58, opp)) {
          moves.push({ from: 60, to: 58, piece: 'k', captured: null, promotion: null, flag: 'castleQ' });
        }
      }
    }
  }

  /* Apply move to state in place. Does not validate legality. */
  function applyMove(state, move) {
    var board = state.board;
    var color = colorOf(move.piece);
    var movedPiece = move.piece;

    board[move.from] = null;
    if (move.flag === 'ep') {
      var capSq = sqOf(fileOf(move.to), rankOf(move.from));
      board[capSq] = null;
    }
    board[move.to] = move.promotion ? move.promotion : movedPiece;

    if (move.flag === 'castleK') {
      if (color === 'w') { board[7] = null; board[5] = 'R'; }
      else { board[63] = null; board[61] = 'r'; }
    } else if (move.flag === 'castleQ') {
      if (color === 'w') { board[0] = null; board[3] = 'R'; }
      else { board[56] = null; board[59] = 'r'; }
    }

    // Castling rights
    if (typeOf(movedPiece) === 'K') {
      if (color === 'w') { state.castling.wK = false; state.castling.wQ = false; }
      else { state.castling.bK = false; state.castling.bQ = false; }
    }
    if (move.from === 0 || move.to === 0) state.castling.wQ = false;
    if (move.from === 7 || move.to === 7) state.castling.wK = false;
    if (move.from === 56 || move.to === 56) state.castling.bQ = false;
    if (move.from === 63 || move.to === 63) state.castling.bK = false;

    // En passant target
    if (move.flag === 'double') {
      state.ep = sqOf(fileOf(move.from), (rankOf(move.from) + rankOf(move.to)) / 2);
    } else {
      state.ep = null;
    }

    // Halfmove clock
    if (typeOf(movedPiece) === 'P' || move.captured) state.halfmove = 0;
    else state.halfmove++;

    if (color === 'b') state.fullmove++;
    state.turn = opponent(state.turn);
  }

  /* Legal moves = pseudo moves that don't leave own king in check. */
  function generateLegalMoves(state) {
    var pseudo = generatePseudoMoves(state);
    var legal = [];
    var color = state.turn;
    for (var i = 0; i < pseudo.length; i++) {
      var clone = cloneState(state);
      applyMove(clone, pseudo[i]);
      if (!isSquareAttacked(clone.board, kingSquare(clone.board, color), opponent(color))) {
        legal.push(pseudo[i]);
      }
    }
    return legal;
  }

  function positionKey(state) {
    return state.board.map(function (p) { return p ? p : '.'; }).join('') + '|' + state.turn + '|' +
      (state.castling.wK ? 'K' : '') + (state.castling.wQ ? 'Q' : '') +
      (state.castling.bK ? 'k' : '') + (state.castling.bQ ? 'q' : '') + '|' +
      (state.ep === null ? '-' : squareName(state.ep));
  }

  function sanForMove(state, move, legalMoves) {
    if (move.flag === 'castleK') return sanSuffix(state, move, 'O-O');
    if (move.flag === 'castleQ') return sanSuffix(state, move, 'O-O-O');
    var type = typeOf(move.piece);
    var isCapture = !!move.captured || move.flag === 'ep';
    var s = '';
    if (type === 'P') {
      if (isCapture) s += FILES.charAt(fileOf(move.from));
      s += (isCapture ? 'x' : '') + squareName(move.to);
      if (move.promotion) s += '=' + typeOf(move.promotion);
    } else {
      s += type;
      // Disambiguation
      var others = [];
      for (var i = 0; i < legalMoves.length; i++) {
        var m = legalMoves[i];
        if (m.to === move.to && m.from !== move.from && m.piece === move.piece) others.push(m);
      }
      if (others.length) {
        var sameFile = false, sameRank = false;
        for (var j = 0; j < others.length; j++) {
          if (fileOf(others[j].from) === fileOf(move.from)) sameFile = true;
          if (rankOf(others[j].from) === rankOf(move.from)) sameRank = true;
        }
        if (!sameFile) s += FILES.charAt(fileOf(move.from));
        else if (!sameRank) s += (rankOf(move.from) + 1);
        else s += squareName(move.from);
      }
      s += (isCapture ? 'x' : '') + squareName(move.to);
    }
    return sanSuffix(state, move, s);
  }

  function sanSuffix(state, move, s) {
    var clone = cloneState(state);
    applyMove(clone, move);
    var oppColor = clone.turn;
    var inCheck = isInCheck(clone, oppColor);
    if (inCheck) {
      var legal = generateLegalMoves(clone);
      s += legal.length === 0 ? '#' : '+';
    }
    return s;
  }

  function insufficientMaterial(board) {
    var pieces = [];
    for (var i = 0; i < 64; i++) { if (board[i]) pieces.push(board[i]); }
    var nonKing = pieces.filter(function (p) { return typeOf(p) !== 'K'; });
    if (nonKing.length === 0) return true;
    if (nonKing.length === 1 && (typeOf(nonKing[0]) === 'N' || typeOf(nonKing[0]) === 'B')) return true;
    if (nonKing.length === 2) {
      var t0 = typeOf(nonKing[0]), t1 = typeOf(nonKing[1]);
      if (t0 === 'B' && t1 === 'B' && colorOf(nonKing[0]) !== colorOf(nonKing[1])) {
        // opposite-colored single bishops each: insufficient only if same square color
        var sq0 = -1, sq1 = -1, c = 0;
        for (var k = 0; k < 64; k++) {
          if (board[k] === nonKing[0]) sq0 = k;
          if (board[k] === nonKing[1]) sq1 = k;
        }
        var color0 = (fileOf(sq0) + rankOf(sq0)) % 2;
        var color1 = (fileOf(sq1) + rankOf(sq1)) % 2;
        if (color0 === color1) return true;
      }
    }
    return false;
  }

  /* Make a move (by from/to/promotion), updating history + repetition + SAN. Returns move detail or null if illegal. */
  function move(state, from, to, promotion) {
    var legal = generateLegalMoves(state);
    var chosen = null;
    for (var i = 0; i < legal.length; i++) {
      var m = legal[i];
      if (m.from === from && m.to === to) {
        if (m.promotion) {
          if (promotion && typeOf(m.promotion) === promotion.toUpperCase()) { chosen = m; break; }
        } else {
          chosen = m; break;
        }
      }
    }
    if (!chosen) return null;
    var san = sanForMove(state, chosen, legal);
    applyMove(state, chosen);
    var key = positionKey(state);
    state.repetition[key] = (state.repetition[key] || 0) + 1;
    state.history.push({ san: san, from: chosen.from, to: chosen.to, piece: chosen.piece, captured: chosen.captured, promotion: chosen.promotion, flag: chosen.flag, fen: stateToFen(state) });
    return chosen;
  }

  function gameStatus(state) {
    var legal = generateLegalMoves(state);
    var inCheck = isInCheck(state, state.turn);
    if (legal.length === 0) {
      return inCheck ? { over: true, result: state.turn === 'w' ? '0-1' : '1-0', reason: 'checkmate' } : { over: true, result: '1/2-1/2', reason: 'stalemate' };
    }
    if (state.halfmove >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty-move rule' };
    var key = positionKey(state);
    if ((state.repetition[key] || 0) >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold repetition' };
    if (insufficientMaterial(state.board)) return { over: true, result: '1/2-1/2', reason: 'insufficient material' };
    return { over: false, inCheck: inCheck, legalMoves: legal };
  }

  function stateToFen(state) {
    var rows = [];
    for (var r = 7; r >= 0; r--) {
      var row = '', empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = state.board[sqOf(f, r)];
        if (!p) { empty++; }
        else { if (empty) { row += empty; empty = 0; } row += p; }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    var placement = rows.join('/');
    var castle = (state.castling.wK ? 'K' : '') + (state.castling.wQ ? 'Q' : '') +
      (state.castling.bK ? 'k' : '') + (state.castling.bQ ? 'q' : '');
    if (!castle) castle = '-';
    var ep = state.ep === null ? '-' : squareName(state.ep);
    return placement + ' ' + state.turn + ' ' + castle + ' ' + ep + ' ' + state.halfmove + ' ' + state.fullmove;
  }

  function fenToState(fen) {
    var parts = fen.trim().split(/\s+/);
    var placement = parts[0], turn = parts[1] || 'w', castle = parts[2] || '-', ep = parts[3] || '-';
    var halfmove = parseInt(parts[4], 10) || 0;
    var fullmove = parseInt(parts[5], 10) || 1;
    var board = new Array(64);
    for (var i = 0; i < 64; i++) board[i] = null;
    var rows = placement.split('/');
    for (var r = 0; r < 8; r++) {
      var row = rows[7 - r];
      var f = 0;
      for (var c = 0; c < row.length; c++) {
        var ch = row.charAt(c);
        if (/\d/.test(ch)) { f += parseInt(ch, 10); }
        else { board[sqOf(f, r)] = ch; f++; }
      }
    }
    return {
      board: board,
      turn: turn,
      castling: { wK: castle.indexOf('K') !== -1, wQ: castle.indexOf('Q') !== -1, bK: castle.indexOf('k') !== -1, bQ: castle.indexOf('q') !== -1 },
      ep: ep === '-' ? null : parseSquareName(ep),
      halfmove: halfmove,
      fullmove: fullmove,
      history: [],
      repetition: {}
    };
  }

  function perft(state, depth) {
    if (depth === 0) return 1;
    var legal = generateLegalMoves(state);
    if (depth === 1) return legal.length;
    var count = 0;
    for (var i = 0; i < legal.length; i++) {
      var clone = cloneState(state);
      applyMove(clone, legal[i]);
      count += perft(clone, depth - 1);
    }
    return count;
  }

  return {
    newGame: newGame,
    cloneState: cloneState,
    generateLegalMoves: generateLegalMoves,
    applyMove: applyMove,
    move: move,
    gameStatus: gameStatus,
    isInCheck: isInCheck,
    isSquareAttacked: isSquareAttacked,
    kingSquare: kingSquare,
    stateToFen: stateToFen,
    fenToState: fenToState,
    squareName: squareName,
    parseSquareName: parseSquareName,
    fileOf: fileOf,
    rankOf: rankOf,
    sqOf: sqOf,
    colorOf: colorOf,
    typeOf: typeOf,
    perft: perft,
    positionKey: positionKey,
    insufficientMaterial: insufficientMaterial
  };
}));
