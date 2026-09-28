/* WORM engine - pure game logic, no DOM.
 * The worm's tail NEVER disappears: every tile visited becomes body forever.
 * Eat every apple without trapping yourself.
 */
(function (root) {
  'use strict';

  var DIRS = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
  var DIR_LIST = ['U', 'D', 'L', 'R'];
  var BLOCKED = { '#': true, 'C': true, '~': true }; // rock, crate, water
  // One-way tiles: an arrow character can only be ENTERED while moving in
  // the direction it points - approaching from any other direction finds it
  // as solid as a wall. Once you're standing on it, it behaves like plain
  // floor (it doesn't extend your move the way ice does).
  var ONEWAY_DIR = { '^': 'U', 'v': 'D', '<': 'L', '>': 'R' };
  // Teleport pads: any of these digit characters may appear at exactly two
  // positions in a level's grid. Entering either one instantly moves the
  // head to the other - both endpoints join the trail (so the "tail never
  // disappears" rule still holds even though the middle was skipped), and
  // the hop always ends the move there (it doesn't chain into an ice slide
  // or a second teleport).
  var TELEPORT_CHARS = { '1': true, '2': true, '3': true, '4': true };
  var APPLE_POINTS = { red: 100, golden: 500, green: 150 };
  var COMBO_WINDOW = 6; // moves between apples to keep a combo alive

  function key(r, c) { return r + ',' + c; }

  // Patrol hazard: def.patrol (if present) is an ordered list of [r,c]
  // waypoints. The hazard ping-pongs along it - forward to the last point,
  // then back to the first, repeating - advancing exactly one waypoint per
  // successful player input (never per tile within an ice slide, and never
  // on a bump). `step` is a monotonically increasing counter; this turns it
  // into a position without needing to separately track direction.
  function patrolPositionAt(patrol, step) {
    var n = patrol.length;
    if (n <= 1) return patrol[0];
    var cycle = 2 * (n - 1);
    var i = step % cycle;
    if (i < 0) i += cycle;
    return i < n ? patrol[i] : patrol[cycle - i];
  }

  function parseDef(def) {
    var tiles = def.grid.map(function (row) { return row.split(''); });
    var R = tiles.length, C = tiles[0].length;
    var start = null, apples = [];
    var teleportPositions = {}; // char -> [ {r,c}, {r,c} ]
    for (var r = 0; r < R; r++) {
      for (var c = 0; c < C; c++) {
        var ch = tiles[r][c];
        if (ch === 'S') { start = { r: r, c: c }; tiles[r][c] = '.'; }
        else if (ch === 'T') {
          // Cosmetic marker only, for level authors to see where the patrol
          // hazard starts on the grid at a glance. The real source of truth
          // is def.patrol; this tile itself is just plain floor.
          tiles[r][c] = '.';
        }
        else if (ch === 'a' || ch === 'g' || ch === 'n') {
          apples.push({
            type: ch === 'a' ? 'red' : ch === 'g' ? 'golden' : 'green',
            r: r, c: c
          });
          tiles[r][c] = '.';
        }
        else if (TELEPORT_CHARS[ch]) {
          (teleportPositions[ch] || (teleportPositions[ch] = [])).push({ r: r, c: c });
        }
        // 'r' (rotten), '^v<>' (one-way) and '1'-'4' (teleport) all stay on
        // the tile - they're read directly off g.tiles by canEnter/enterTile.
      }
    }
    var teleportPartner = {};
    for (var ch2 in teleportPositions) {
      var pos = teleportPositions[ch2];
      if (pos.length === 2) {
        teleportPartner[key(pos[0].r, pos[0].c)] = pos[1];
        teleportPartner[key(pos[1].r, pos[1].c)] = pos[0];
      }
      // a digit that doesn't appear exactly twice is simply not wired up as
      // a teleport pair (defensive - a well-formed level always pairs them).
    }
    return { tiles: tiles, R: R, C: C, start: start, apples: apples, teleportPartner: teleportPartner };
  }

  function newGame(def) {
    var p = parseDef(def);
    var appleMap = {};
    p.apples.forEach(function (a) { appleMap[key(a.r, a.c)] = a; });
    var patrol = def.patrol ? def.patrol.map(function (pt) { return { r: pt[0], c: pt[1] }; }) : null;
    return {
      def: def,
      tiles: p.tiles, R: p.R, C: p.C,
      teleportPartner: p.teleportPartner,
      trail: [{ r: p.start.r, c: p.start.c }],
      occ: (function () { var o = {}; o[key(p.start.r, p.start.c)] = 1; return o; })(),
      apples: appleMap,
      applesLeft: p.apples.length,
      bridgesUsed: {},
      moves: 0,
      movesLeft: def.budget,
      score: 0,
      combo: 0,
      comboTimer: 0,
      status: 'playing', // playing | won | lost
      loseReason: null,  // trapped | moves | rotten | patrol
      facing: 'D',
      patrol: patrol,
      patrolStep: 0,
      patrolPos: patrol ? patrolPositionAt(patrol, 0) : null
    };
  }

  function tileAt(g, r, c) {
    if (r < 0 || c < 0 || r >= g.R || c >= g.C) return null;
    return g.tiles[r][c];
  }

  // Returns: 'ok' | 'blocked' | 'rotten' (rotten is enterable, but fatal)
  function canEnter(g, r, c, dir) {
    var t = tileAt(g, r, c);
    if (t === null || BLOCKED[t]) return 'blocked';
    if (ONEWAY_DIR[t] && ONEWAY_DIR[t] !== dir) return 'blocked';
    if (g.occ[key(r, c)]) return 'blocked';
    if (t === '=' && g.bridgesUsed[key(r, c)]) return 'blocked';
    if (t === 'r') return 'rotten';
    return 'ok';
  }

  function head(g) { return g.trail[g.trail.length - 1]; }

  function legalDirs(g) {
    var h = head(g), out = [];
    for (var i = 0; i < DIR_LIST.length; i++) {
      var d = DIR_LIST[i];
      var nr = h.r + DIRS[d][0], nc = h.c + DIRS[d][1];
      var ce = canEnter(g, nr, nc, d);
      if (ce === 'ok' || ce === 'rotten') out.push(d);
    }
    return out;
  }

  // Resolves everything that happens when the head lands on tile (r,c):
  // joining the trail/occ, marking a bridge used, dying on rotten, eating
  // an apple (with combo/score/green-move-bonus), and winning if that was
  // the last apple. Used both for an ordinary step/slide tile AND for a
  // teleport's destination tile, so the two share identical apple/rotten/
  // win handling instead of duplicating it.
  //
  // Returns { gameOver, continueSlide, teleportTo }:
  //   gameOver     - true if status just became 'won' or 'lost' (caller
  //                  should stop immediately; tryMove has already pushed
  //                  the terminal event and can return).
  //   continueSlide- true if this tile is ice, so the same-direction slide
  //                  should keep going.
  //   teleportTo   - the partner position, if this tile is a wired teleport
  //                  pad (only meaningful when the caller wants to chase it).
  function enterTile(g, r, c, ev) {
    var t = tileAt(g, r, c);
    g.trail.push({ r: r, c: c });
    g.occ[key(r, c)] = 1;
    if (t === '=') g.bridgesUsed[key(r, c)] = 1;

    // Patrol hazard: walking into its current cell is fatal, checked at
    // every tile the head actually lands on (so it composes for free with
    // ice slides and teleport destinations, both of which route through
    // enterTile rather than duplicating this check).
    if (g.patrol && g.patrolPos && g.patrolPos.r === r && g.patrolPos.c === c) {
      g.status = 'lost'; g.loseReason = 'patrol';
      ev.push({ t: 'lose', reason: 'patrol' });
      return { gameOver: true };
    }

    if (t === 'r') {
      g.status = 'lost'; g.loseReason = 'rotten';
      ev.push({ t: 'eat', kind: 'rotten', pos: { r: r, c: c } });
      ev.push({ t: 'lose', reason: 'rotten' });
      return { gameOver: true };
    }

    var ak = key(r, c);
    if (g.apples[ak]) {
      var ap = g.apples[ak];
      delete g.apples[ak];
      g.applesLeft--;
      if (g.comboTimer > 0) g.combo++; else g.combo = 1;
      g.comboTimer = COMBO_WINDOW;
      var pts = APPLE_POINTS[ap.type];
      var comboBonus = 0;
      if (g.combo >= 2) { comboBonus = 100 * g.combo; pts += comboBonus; }
      g.score += pts;
      if (ap.type === 'green') {
        g.movesLeft++;
        ev.push({ t: 'popup', text: '+1 move', kind: 'green', pos: { r: r, c: c } });
      }
      ev.push({
        t: 'eat', kind: ap.type, pos: { r: r, c: c },
        points: pts, combo: g.combo, comboBonus: comboBonus
      });
      if (g.combo >= 2) {
        ev.push({ t: 'popup', text: 'COMBO x' + g.combo, kind: 'combo', pos: { r: r, c: c } });
      }
    }

    if (g.applesLeft === 0) {
      var bonus = Math.max(0, g.movesLeft) * 10;
      g.score += bonus;
      g.status = 'won';
      ev.push({ t: 'win', score: g.score, moves: g.moves, bonus: bonus });
      return { gameOver: true };
    }

    return {
      gameOver: false,
      continueSlide: t === 'I',
      teleportTo: g.teleportPartner[key(r, c)] || null
    };
  }

  // Ice ('I'): stepping onto it costs the normal 1 move, but then the worm
  // keeps sliding automatically in the same direction - one tile at a time,
  // still filling in trail/occ, still able to eat apples or die on rotten
  // along the way - until it either leaves the ice or is blocked. The whole
  // slide is still just 1 move against the budget, since it was triggered
  // by a single input.
  //
  // Teleport pads (see enterTile): landing on one immediately jumps the
  // head to its partner - both tiles join the trail, the destination is
  // checked for apples/rotten/win exactly like any other tile, and then the
  // move ends there (a teleport hop never chains into a slide or another
  // teleport, so there's no risk of ping-ponging forever).
  function tryMove(g, dir) {
    var ev = [];
    if (g.status !== 'playing') return ev;
    g.facing = dir;
    var first = true;
    for (;;) {
      var h = head(g);
      var nr = h.r + DIRS[dir][0], nc = h.c + DIRS[dir][1];
      var ce = canEnter(g, nr, nc, dir);
      if (ce === 'blocked') {
        if (first) ev.push({ t: 'bump', dir: dir });
        break;
      }
      var from = { r: h.r, c: h.c };
      if (first) {
        g.moves++;
        g.movesLeft--;
        if (g.comboTimer > 0) g.comboTimer--;
      }
      ev.push({ t: 'move', from: from, to: { r: nr, c: nc }, dir: dir, slide: !first });
      var res = enterTile(g, nr, nc, ev);
      if (res.gameOver) return ev;

      if (res.teleportTo) {
        var tp = res.teleportTo;
        ev.push({ t: 'teleport', from: { r: nr, c: nc }, to: { r: tp.r, c: tp.c } });
        var tres = enterTile(g, tp.r, tp.c, ev);
        if (tres.gameOver) return ev;
        break; // a teleport hop always ends the move here
      }

      first = false;
      if (!res.continueSlide) break; // only ice keeps the slide going
    }
    // The patrol hazard advances exactly one waypoint per successful player
    // INPUT - never per tile within an ice slide, and never on a bump (a
    // bump leaves `first` true, so it's excluded by the `!first` check
    // below - that's the same flag tryMove already uses to know whether a
    // real move happened at all).
    if (g.status === 'playing' && g.patrol && !first) {
      var oldPatrolPos = g.patrolPos;
      g.patrolStep++;
      g.patrolPos = patrolPositionAt(g.patrol, g.patrolStep);
      ev.push({ t: 'patrol', from: oldPatrolPos, to: g.patrolPos });
      var h2 = head(g);
      if (g.patrolPos.r === h2.r && g.patrolPos.c === h2.c) {
        g.status = 'lost'; g.loseReason = 'patrol';
        ev.push({ t: 'lose', reason: 'patrol' });
      }
    }
    // Whether it was one step, a multi-tile slide, or a teleport hop, the
    // input has now fully resolved - only now is it meaningful to ask "can
    // the player even move again?". Checking this mid-resolution would end
    // the game over a stale budget/mobility snapshot from a tile the worm
    // was only passing through, not one it actually stopped and got stuck
    // on.
    if (g.status === 'playing') {
      if (g.movesLeft <= 0) {
        g.status = 'lost'; g.loseReason = 'moves';
        ev.push({ t: 'lose', reason: 'moves' });
      } else if (legalDirs(g).length === 0) {
        g.status = 'lost'; g.loseReason = 'trapped';
        ev.push({ t: 'lose', reason: 'trapped' });
      }
    }
    return ev;
  }

  function starsFor(def, moves) {
    if (moves <= def.star3) return 3;
    if (moves <= def.star2) return 2;
    return 1;
  }

  var api = {
    DIRS: DIRS,
    DIR_LIST: DIR_LIST,
    COMBO_WINDOW: COMBO_WINDOW,
    APPLE_POINTS: APPLE_POINTS,
    ONEWAY_DIR: ONEWAY_DIR,
    TELEPORT_CHARS: TELEPORT_CHARS,
    newGame: newGame,
    tileAt: tileAt,
    canEnter: canEnter,
    legalDirs: legalDirs,
    tryMove: tryMove,
    head: head,
    starsFor: starsFor,
    key: key,
    patrolPositionAt: patrolPositionAt
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Worm = api;
  }
})(typeof self !== 'undefined' ? self : this);
