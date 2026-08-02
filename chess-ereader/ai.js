/* Computer opponent — plain ES5.
   Alpha-beta search with MVV-LVA move ordering, quiescence search and
   iterative deepening under a time budget. The time budget matters: e-reader
   CPUs are slow, so a level asks for a depth but stops at whatever depth it
   actually managed within its budget. */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./chess-engine.js'));
  } else {
    root.ChessAI = factory(root.ChessEngine);
  }
}(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var LEVELS = [
    { name: 'Beginner',   hint: 'Speelt vaak willekeurig',      depth: 1, timeMs: 400,   blunder: 0.60, quiesce: false },
    { name: 'Makkelijk',  hint: 'Ziet directe dreigingen',      depth: 2, timeMs: 900,   blunder: 0.30, quiesce: false },
    { name: 'Gemiddeld',  hint: 'Rekent enkele zetten vooruit', depth: 3, timeMs: 1800,  blunder: 0.10, quiesce: false },
    { name: 'Gevorderd',  hint: 'Straft fouten af',             depth: 4, timeMs: 3500,  blunder: 0.02, quiesce: true },
    { name: 'Sterk',      hint: 'Traag op e-readers',           depth: 5, timeMs: 7000,  blunder: 0,    quiesce: true },
    { name: 'Expert',     hint: 'Erg traag op e-readers',       depth: 6, timeMs: 14000, blunder: 0,    quiesce: true }
  ];

  var VALUE = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 };
  var MATE = 100000;

  /* Piece-square tables, written a8-first so they read like a board. */
  var PST = {
    P: [ 0,  0,  0,  0,  0,  0,  0,  0,
        50, 50, 50, 50, 50, 50, 50, 50,
        10, 10, 20, 30, 30, 20, 10, 10,
         5,  5, 10, 25, 25, 10,  5,  5,
         0,  0,  0, 20, 20,  0,  0,  0,
         5, -5,-10,  0,  0,-10, -5,  5,
         5, 10, 10,-20,-20, 10, 10,  5,
         0,  0,  0,  0,  0,  0,  0,  0],
    N: [-50,-40,-30,-30,-30,-30,-40,-50,
        -40,-20,  0,  0,  0,  0,-20,-40,
        -30,  0, 10, 15, 15, 10,  0,-30,
        -30,  5, 15, 20, 20, 15,  5,-30,
        -30,  0, 15, 20, 20, 15,  0,-30,
        -30,  5, 10, 15, 15, 10,  5,-30,
        -40,-20,  0,  5,  5,  0,-20,-40,
        -50,-40,-30,-30,-30,-30,-40,-50],
    B: [-20,-10,-10,-10,-10,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5, 10, 10,  5,  0,-10,
        -10,  5,  5, 10, 10,  5,  5,-10,
        -10,  0, 10, 10, 10, 10,  0,-10,
        -10, 10, 10, 10, 10, 10, 10,-10,
        -10,  5,  0,  0,  0,  0,  5,-10,
        -20,-10,-10,-10,-10,-10,-10,-20],
    R: [  0,  0,  0,  0,  0,  0,  0,  0,
          5, 10, 10, 10, 10, 10, 10,  5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
         -5,  0,  0,  0,  0,  0,  0, -5,
          0,  0,  0,  5,  5,  0,  0,  0],
    Q: [-20,-10,-10, -5, -5,-10,-10,-20,
        -10,  0,  0,  0,  0,  0,  0,-10,
        -10,  0,  5,  5,  5,  5,  0,-10,
         -5,  0,  5,  5,  5,  5,  0, -5,
          0,  0,  5,  5,  5,  5,  0, -5,
        -10,  5,  5,  5,  5,  5,  0,-10,
        -10,  0,  5,  0,  0,  0,  0,-10,
        -20,-10,-10, -5, -5,-10,-10,-20],
    K: [-30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -30,-40,-40,-50,-50,-40,-40,-30,
        -20,-30,-30,-40,-40,-30,-30,-20,
        -10,-20,-20,-20,-20,-20,-20,-10,
         20, 20,  0,  0,  0,  0, 20, 20,
         20, 30, 10,  0,  0, 10, 30, 20]
  };

  /* Board index (0 = a1) to table index (0 = a8), mirrored for black. */
  function pstIndex(sq, color) {
    var f = C.fileOf(sq), r = C.rankOf(sq);
    return color === 'w' ? (7 - r) * 8 + f : r * 8 + f;
  }

  function distanceToHill(sq) {
    var f = C.fileOf(sq), r = C.rankOf(sq);
    var df = Math.min(Math.abs(f - 3), Math.abs(f - 4));
    var dr = Math.min(Math.abs(r - 3), Math.abs(r - 4));
    return df + dr;
  }

  /* Positive score favours white, always — the search flips by side to move. */
  function evaluate(state) {
    var score = 0, sq, p;
    for (sq = 0; sq < 64; sq++) {
      p = state.board[sq];
      if (!p) continue;
      var color = C.colorOf(p), type = C.typeOf(p);
      var v = VALUE[type] + PST[type][pstIndex(sq, color)];
      score += color === 'w' ? v : -v;
    }

    if (state.variant === 'koth') {
      // Racing the king to the centre is the whole point, so weight it heavily.
      score += (6 - distanceToHill(state.kings.w)) * 28;
      score -= (6 - distanceToHill(state.kings.b)) * 28;
    } else if (state.variant === 'threecheck') {
      score += state.checkCount.w * 220;
      score -= state.checkCount.b * 220;
    }
    return score;
  }

  function scoreMove(move) {
    var s = 0;
    if (move.captured) s += 10 * VALUE[C.typeOf(move.captured)] - VALUE[C.typeOf(move.piece)];
    if (move.promotion) s += VALUE[C.typeOf(move.promotion)];
    if (move.flag === 'ep') s += 10 * VALUE.P - VALUE.P;
    return s;
  }

  function orderMoves(moves) {
    for (var i = 0; i < moves.length; i++) moves[i].__s = scoreMove(moves[i]);
    moves.sort(function (a, b) { return b.__s - a.__s; });
    return moves;
  }

  function terminalScore(state, ply) {
    // Variant goals end the game before any move generation matters.
    if (state.variant === 'koth') {
      for (var i = 0; i < C.CENTER_SQUARES.length; i++) {
        var p = state.board[C.CENTER_SQUARES[i]];
        if (p === 'K') return MATE - ply;
        if (p === 'k') return -(MATE - ply);
      }
    } else if (state.variant === 'threecheck') {
      if (state.checkCount.w >= 3) return MATE - ply;
      if (state.checkCount.b >= 3) return -(MATE - ply);
    }
    return null;
  }

  function Search(state, deadline, useQuiesce) {
    this.state = state;
    this.deadline = deadline;
    this.useQuiesce = useQuiesce;
    this.nodes = 0;
    this.aborted = false;
  }

  Search.prototype.outOfTime = function () {
    // Checking the clock is not free, so only sample it periodically.
    if ((this.nodes & 511) === 0 && Date.now() > this.deadline) this.aborted = true;
    return this.aborted;
  };

  Search.prototype.quiesce = function (alpha, beta, ply) {
    var state = this.state;
    this.nodes++;
    var term = terminalScore(state, ply);
    if (term !== null) return state.turn === 'w' ? term : -term;

    var stand = evaluate(state);
    if (state.turn === 'b') stand = -stand;
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (this.outOfTime()) return alpha;

    var moves = C.generatePseudoMoves(state);
    var captures = [];
    for (var i = 0; i < moves.length; i++) {
      if (moves[i].captured || moves[i].promotion) captures.push(moves[i]);
    }
    orderMoves(captures);

    var color = state.turn;
    for (var j = 0; j < captures.length; j++) {
      var undo = C.makeMove(state, captures[j]);
      if (C.isSquareAttacked(state.board, state.kings[color], C.opponent(color))) {
        C.unmakeMove(state, captures[j], undo);
        continue;
      }
      var score = -this.quiesce(-beta, -alpha, ply + 1);
      C.unmakeMove(state, captures[j], undo);
      if (this.aborted) return alpha;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  };

  Search.prototype.negamax = function (depth, alpha, beta, ply) {
    var state = this.state;
    this.nodes++;

    var term = terminalScore(state, ply);
    if (term !== null) return state.turn === 'w' ? term : -term;

    if (state.halfmove >= 100) return 0;
    if (this.outOfTime()) return alpha;

    if (depth <= 0) {
      if (this.useQuiesce) return this.quiesce(alpha, beta, ply);
      var e = evaluate(state);
      return state.turn === 'w' ? e : -e;
    }

    var color = state.turn;
    var moves = orderMoves(C.generatePseudoMoves(state));
    var legalCount = 0;

    for (var i = 0; i < moves.length; i++) {
      var undo = C.makeMove(state, moves[i]);
      if (C.isSquareAttacked(state.board, state.kings[color], C.opponent(color))) {
        C.unmakeMove(state, moves[i], undo);
        continue;
      }
      legalCount++;
      var score = -this.negamax(depth - 1, -beta, -alpha, ply + 1);
      C.unmakeMove(state, moves[i], undo);
      if (this.aborted) return alpha;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }

    if (legalCount === 0) {
      // Checkmate is worse the sooner it happens; stalemate is dead level.
      return C.isInCheck(state, color) ? -(MATE - ply) : 0;
    }
    return alpha;
  };

  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Pick a move for the side to move. Returns null if there are none. */
  function chooseMove(state, levelIndex) {
    var level = LEVELS[levelIndex] || LEVELS[2];
    var legal = C.generateLegalMoves(state);
    if (legal.length === 0) return null;
    if (legal.length === 1) return legal[0];

    if (level.blunder > 0 && Math.random() < level.blunder) {
      return legal[Math.floor(Math.random() * legal.length)];
    }

    var deadline = Date.now() + level.timeMs;
    var search = new Search(state, deadline, level.quiesce);
    var color = state.turn;
    var roots = orderMoves(shuffled(legal));
    var best = roots[0];

    // Iterative deepening: keep the best move from the last fully completed
    // depth, so running out of time still leaves a usable answer.
    for (var depth = 1; depth <= level.depth; depth++) {
      var alpha = -Infinity, bestThisDepth = null;
      for (var i = 0; i < roots.length; i++) {
        var undo = C.makeMove(state, roots[i]);
        var score = -search.negamax(depth - 1, -Infinity, -alpha, 1);
        C.unmakeMove(state, roots[i], undo);
        if (search.aborted) break;
        if (bestThisDepth === null || score > alpha) { alpha = score; bestThisDepth = roots[i]; }
      }
      if (search.aborted) break;
      if (bestThisDepth) {
        best = bestThisDepth;
        // Search the previous best first next time round: better pruning.
        var idx = roots.indexOf(best);
        if (idx > 0) { roots.splice(idx, 1); roots.unshift(best); }
      }
      if (alpha >= MATE - 100) break; // forced mate found, no need to go deeper
    }

    if (best) { delete best.__s; }
    return best;
  }

  return { LEVELS: LEVELS, chooseMove: chooseMove, evaluate: evaluate };
}));
