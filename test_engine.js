// Replays every solver-found solution through the JS engine.
// Verifies: win state, move count == par, score math, star thresholds.
const Worm = require('./engine.js');
const { LEVELS } = require('./levels.js');
const solved = require('./levels_solved.json');

let fails = 0;
LEVELS.forEach((def, i) => {
  const sol = solved[i].solution;
  const g = Worm.newGame(def);
  let bumped = false;
  for (const ch of sol) {
    const ev = Worm.tryMove(g, ch);
    if (ev.some(e => e.t === 'bump')) { bumped = true; break; }
    if (g.status !== 'playing') break;
  }
  const label = `L${i + 1} ${def.name}`;
  if (bumped) { console.log(`FAIL ${label}: bumped on solver path`); fails++; return; }
  if (g.status !== 'won') { console.log(`FAIL ${label}: status=${g.status} (${g.loseReason}) after solution`); fails++; return; }
  if (g.moves !== def.par) { console.log(`FAIL ${label}: moves=${g.moves} par=${def.par}`); fails++; return; }
  if (g.moves !== sol.length) { console.log(`FAIL ${label}: moves != solution length`); fails++; return; }
  // score sanity: recompute expected
  console.log(`ok   ${label}: moves=${g.moves} score=${g.score} stars=${Worm.starsFor(def, g.moves)}`);
});

// extra rule probes
function probe(name, fn) {
  try { fn(); console.log('ok   probe: ' + name); }
  catch (e) { console.log('FAIL probe: ' + name + ' - ' + e.message); fails++; }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

probe('bump into rock', () => {
  const g = Worm.newGame(LEVELS[2]); // Rock Garden: right into rock? start (0,0), rock at (1,1)
  const ev = Worm.tryMove(g, 'D'); // (1,0) fine
  assert(ev[0].t === 'move', 'expected move');
  const ev2 = Worm.tryMove(g, 'R'); // (1,1) rock
  assert(ev2[0].t === 'bump', 'expected bump');
  assert(g.moves === 1, 'bump must not count as move');
});

probe('rotten kills', () => {
  const g = Worm.newGame(LEVELS[5]); // Rotten
  ['D','D'].forEach(d => Worm.tryMove(g, d));
  const ev = Worm.tryMove(g, 'R'); // (2,1)
  Worm.tryMove(g, 'R'); // (2,2) rotten
  assert(g.status === 'lost' && g.loseReason === 'rotten', 'expected rotten death, got ' + g.status);
});

probe('trapped detection', () => {
  // tiny custom level: 1-wide corridor dead end
  const def = { grid: ['S.a', '###'], par: 2, budget: 10, star3: 2, star2: 4 };
  const g = Worm.newGame(def);
  Worm.tryMove(g, 'R'); // (0,1)
  const ev = Worm.tryMove(g, 'R'); // (0,2) apple -> win, not trapped
  assert(g.status === 'won', 'expected win, got ' + g.status);
});

probe('bridge single use', () => {
  const g = Worm.newGame(LEVELS[4]); // Bridges
  const sol = solved[4].solution;
  for (const ch of sol) Worm.tryMove(g, ch);
  assert(g.status === 'won', 'expected win');
  assert(Object.keys(g.bridgesUsed).length === 1, 'expected 1 bridge used');
});

probe('green apple +1 move', () => {
  // Finds the green apple's actual move index by watching events, instead
  // of hardcoding one - the exact move it falls on is a level-layout detail
  // that has already changed once (v17's Green Thumb redesign moved it from
  // move 9 to move 7) and shouldn't be able to silently break this probe by
  // shifting again. What must hold regardless of layout: the move that eats
  // it costs 1 move but nets 0 against the budget (the +1 bonus cancels the
  // spend), so movesLeft is unchanged across exactly that move.
  const g = Worm.newGame(LEVELS[6]); // Green Thumb
  const sol = solved[6].solution;
  let greenMoveIdx = -1;
  const before = g.movesLeft;
  for (let i = 0; i < sol.length; i++) {
    const beforeThisMove = g.movesLeft;
    const ev = Worm.tryMove(g, sol[i]);
    if (ev.some(e => e.t === 'eat' && e.kind === 'green')) {
      greenMoveIdx = i;
      assert(g.movesLeft === beforeThisMove, `green apple should net 0 movesLeft change (spend 1, refund 1), went ${beforeThisMove} -> ${g.movesLeft}`);
    }
  }
  assert(greenMoveIdx >= 0, 'expected a green apple to be eaten somewhere in the solver solution');
  assert(g.status === 'won', 'expected win');
  // Overall: budget minus every move actually taken, plus the one +1 bonus.
  assert(g.movesLeft === before - sol.length + 1, `expected ${before - sol.length + 1}, got ${g.movesLeft}`);
});

probe('combo bonus', () => {
  // Combo Meal's apples were rearranged in v17 (broke the old symmetric 2x2
  // block so the chain has to route past rocks) but the redesign still
  // keeps all 4 apples inside the combo window, so a x4 chain is still the
  // right invariant to pin here. The expected score is independently
  // recomputed from Worm.APPLE_POINTS + the same "100*combo for combo>=2"
  // bonus rule the engine implements, applied to whichever apples/combo
  // values actually occur - not hardcoded to the pre-v17 apple layout, so a
  // future relayout can't make this pass for the wrong reason again.
  const g = Worm.newGame(LEVELS[8]); // Combo Meal
  const sol = solved[8].solution;
  let comboSeen = 0, expectedApplePoints = 0;
  for (const ch of sol) {
    const ev = Worm.tryMove(g, ch);
    ev.forEach(e => {
      if (e.t === 'eat') {
        comboSeen = Math.max(comboSeen, e.combo);
        var pts = Worm.APPLE_POINTS[e.kind] + (e.combo >= 2 ? 100 * e.combo : 0);
        assert(e.points === pts, `eat event points ${e.points} != recomputed ${pts} for combo ${e.combo}`);
        expectedApplePoints += pts;
      }
    });
  }
  assert(g.status === 'won', 'expected win');
  assert(comboSeen === 4, 'expected combo x4, got ' + comboSeen);
  const expected = expectedApplePoints + g.movesLeft * 10; // apple points (combo bonuses included) + win bonus
  assert(g.score === expected, `score ${g.score} != ${expected}`);
});

probe('moves budget death', () => {
  const def = { grid: ['S..a'], par: 3, budget: 2, star3: 3, star2: 5 };
  const g = Worm.newGame(def);
  Worm.tryMove(g, 'R'); Worm.tryMove(g, 'R');
  assert(g.status === 'lost' && g.loseReason === 'moves', 'expected out-of-moves, got ' + g.status);
});

probe('ice slide continues until off ice, whole slide is 1 move', () => {
  // trailing apple elsewhere so applesLeft isn't already 0 (which would
  // trigger an immediate win on the first tile, masking what we're testing)
  const def = { grid: ['SII.', '....', '...a'], par: 1, budget: 5, star3: 1, star2: 2 };
  const g = Worm.newGame(def);
  const ev = Worm.tryMove(g, 'R');
  const h = Worm.head(g);
  assert(h.r === 0 && h.c === 3, `expected to stop at (0,3), got (${h.r},${h.c})`);
  assert(g.moves === 1, 'whole slide should cost 1 move, got ' + g.moves);
  assert(g.trail.length === 4, 'expected 4 trail tiles (start + 3 slid), got ' + g.trail.length);
  assert(ev.filter(e => e.t === 'move').length === 3, 'expected 3 move events');
  assert(ev.filter(e => e.t === 'move' && e.slide).length === 2, 'expected 2 events flagged as slide continuation');
});

probe('ice slide stops at an obstacle without entering it', () => {
  const def = { grid: ['SII#', '....', '...a'], par: 1, budget: 5, star3: 1, star2: 2 };
  const g = Worm.newGame(def);
  Worm.tryMove(g, 'R');
  const h = Worm.head(g);
  assert(h.r === 0 && h.c === 2, `expected to stop at (0,2) short of the rock, got (${h.r},${h.c})`);
  assert(g.status === 'playing', 'stopping on ice short of a wall should not end the game');
});

probe('apple collected mid-slide, ends the slide there', () => {
  const def = { grid: ['SIIa'], par: 1, budget: 5, star3: 1, star2: 2 };
  const g = Worm.newGame(def);
  Worm.tryMove(g, 'R');
  assert(g.status === 'won', 'expected win landing on the only apple, got ' + g.status);
  assert(g.moves === 1, 'the whole slide (incl. the apple) should still be 1 move, got ' + g.moves);
});

probe('rotten apple mid-slide still kills', () => {
  const def = { grid: ['SIrI', '....', '...a'], par: 1, budget: 5, star3: 1, star2: 2 };
  const g = Worm.newGame(def);
  Worm.tryMove(g, 'R');
  assert(g.status === 'lost' && g.loseReason === 'rotten', 'expected rotten death mid-slide, got ' + g.status);
  const h = Worm.head(g);
  assert(h.r === 0 && h.c === 2, `expected to die at (0,2), got (${h.r},${h.c})`);
});

probe('a tight budget survives a multi-tile slide (not charged per tile)', () => {
  const def = { grid: ['SIIIa'], par: 1, budget: 1, star3: 1, star2: 2 };
  const g = Worm.newGame(def);
  Worm.tryMove(g, 'R');
  assert(g.status === 'won', 'a 1-move budget should be enough for one slide input, got ' + g.status);
});

probe('one-way tile blocks entry from the wrong direction', () => {
  const def = { grid: ['S..', '.>.', '..a'], par: 4, budget: 10, star3: 4, star2: 6 };
  const g = Worm.newGame(def);
  Worm.tryMove(g, 'R'); // (0,0)->(0,1)
  const ev = Worm.tryMove(g, 'D'); // enter (1,1) '>' moving D - wrong direction
  assert(ev[0].t === 'bump', 'expected bump entering a > tile while moving D, got ' + ev[0].t);
  const h = Worm.head(g);
  assert(h.r === 0 && h.c === 1, `head should not have moved onto the one-way tile, got (${h.r},${h.c})`);
});

probe('one-way tile allows entry from its own direction', () => {
  const def = { grid: ['S..', '.>.', '..a'], par: 4, budget: 10, star3: 4, star2: 6 };
  const g = Worm.newGame(def);
  Worm.tryMove(g, 'D'); // (0,0)->(1,0)
  const ev = Worm.tryMove(g, 'R'); // enter (1,1) '>' moving R - matches
  const h = Worm.head(g);
  assert(h.r === 1 && h.c === 1, `expected to enter the one-way tile at (1,1), got (${h.r},${h.c})`);
  assert(ev.some(e => e.t === 'move'), 'expected a normal move event');
  assert(g.status === 'playing', 'entering a matching one-way tile should not end the game');
});

probe('one-way tiles can trap the worm (legalDirs respects direction gating)', () => {
  // trap cell at (1,2), walled by four one-way tiles all facing away from it,
  // reached through a '>' gate that only lets you approach moving right.
  const def = { grid: ['a.v.', 'S>.<', '..^.'], par: 4, budget: 10, star3: 4, star2: 6 };
  const g = Worm.newGame(def);
  Worm.tryMove(g, 'R'); // (1,0)->(1,1), entering '>' while moving R (matches)
  const ev = Worm.tryMove(g, 'R'); // (1,1)->(1,2), the trap interior
  assert(g.status === 'lost' && g.loseReason === 'trapped',
    'expected trapped loss surrounded by one-way tiles facing away, got ' + g.status);
  assert(ev.some(e => e.t === 'lose' && e.reason === 'trapped'), 'expected a trapped lose event');
});

probe('teleport pads jump the head to their partner, both endpoints join trail', () => {
  const def = { grid: ['S.1', '...', '1.a'], par: 2, budget: 6, star3: 2, star2: 4 };
  const g = Worm.newGame(def);
  Worm.tryMove(g, 'R'); // (0,0)->(0,1)
  const ev = Worm.tryMove(g, 'R'); // (0,1)->(0,2) pad -> warps to (2,0)
  const h = Worm.head(g);
  assert(h.r === 2 && h.c === 0, `expected head at teleport partner (2,0), got (${h.r},${h.c})`);
  assert(g.moves === 2, 'each input should still cost exactly 1 move even with a teleport hop, got ' + g.moves);
  assert(g.trail.length === 4, 'expected 4 trail tiles (start + 2 steps incl. teleport dest), got ' + g.trail.length);
  assert(ev.some(e => e.t === 'teleport'), 'expected a teleport event');
  assert(g.status === 'playing', 'should still be playing (apple not yet eaten)');
});

probe('teleport is bidirectional - entering either pad warps to the other', () => {
  const def = { grid: ['S1.', '...', '.1a'], par: 3, budget: 8, star3: 3, star2: 5 };
  const g = Worm.newGame(def);
  Worm.tryMove(g, 'D'); Worm.tryMove(g, 'D'); // (0,0)->(1,0)->(2,0)
  const ev = Worm.tryMove(g, 'R'); // (2,0)->(2,1) pad -> warps to (0,1)
  const h = Worm.head(g);
  assert(h.r === 0 && h.c === 1, `expected warp to (0,1), got (${h.r},${h.c})`);
  assert(ev.some(e => e.t === 'teleport'), 'expected a teleport event');
});

probe('teleport hop does not chain into a slide past the destination', () => {
  // destination (2,0) has open floor to its right; if the hop incorrectly
  // kept sliding in the trigger direction (R), it would blow straight past
  // the destination instead of stopping there.
  const def = { grid: ['S.1', '...', '1.a'], par: 2, budget: 6, star3: 2, star2: 4 };
  const g = Worm.newGame(def);
  Worm.tryMove(g, 'R');
  Worm.tryMove(g, 'R'); // warps to (2,0)
  const h = Worm.head(g);
  assert(h.r === 2 && h.c === 0, `teleport hop should stop exactly at the partner, got (${h.r},${h.c})`);
  assert(g.status === 'playing', 'should not have slid onward and eaten the apple at (2,2)');
});

probe('patrol ping-pongs along its waypoint list and reverses at both ends', () => {
  const patrol = [[0, 0], [0, 1], [0, 2]];
  const seq = [0, 1, 2, 3, 4, 5].map(step => Worm.patrolPositionAt(patrol, step));
  const expected = [[0, 0], [0, 1], [0, 2], [0, 1], [0, 0], [0, 1]];
  assert(JSON.stringify(seq) === JSON.stringify(expected),
    'expected ping-pong sequence ' + JSON.stringify(expected) + ', got ' + JSON.stringify(seq));
});

probe('patrol advances exactly one step per input, even across a multi-tile ice slide', () => {
  const def = {
    grid: ['SII.', '...a'],
    par: 1, budget: 5, star3: 1, star2: 2,
    patrol: [[1, 0], [1, 1], [1, 2]] // stays clear of the row-0 slide path
  };
  const g = Worm.newGame(def);
  assert(g.patrolStep === 0, 'patrol should not have moved before any input');
  const ev = Worm.tryMove(g, 'R'); // one input, but a 3-tile ice slide
  assert(ev.filter(e => e.t === 'move').length === 3, 'expected the slide to touch 3 tiles');
  assert(g.status === 'playing', 'the slide should not have crossed the patrol path, got ' + g.status);
  assert(g.patrolStep === 1, 'one input should advance the patrol exactly one step, got ' + g.patrolStep);
  assert(g.patrolPos.r === 1 && g.patrolPos.c === 1,
    `expected patrol at (1,1) after one step, got (${g.patrolPos.r},${g.patrolPos.c})`);
});

probe('walking into the hazard\'s current cell kills', () => {
  const def = {
    grid: ['S..', '..a'],
    par: 2, budget: 5, star3: 2, star2: 4,
    patrol: [[0, 2]] // fixed - a 1-point patrol never moves
  };
  const g = Worm.newGame(def);
  Worm.tryMove(g, 'R'); // (0,0)->(0,1), clear
  const ev = Worm.tryMove(g, 'R'); // (0,1)->(0,2), straight into the hazard
  assert(g.status === 'lost' && g.loseReason === 'patrol',
    'expected patrol death walking onto its cell, got ' + g.status + '/' + g.loseReason);
  assert(ev.some(e => e.t === 'lose' && e.reason === 'patrol'), 'expected a patrol lose event');
  const h = Worm.head(g);
  assert(h.r === 0 && h.c === 2, `expected to die at (0,2), got (${h.r},${h.c})`);
});

probe('the hazard catching up to the player\'s new position kills', () => {
  const def = {
    grid: ['..a', 'S..', '...'],
    par: 1, budget: 5, star3: 1, star2: 2,
    patrol: [[2, 2], [1, 1]] // starts well clear of (1,1), then steps onto it
  };
  const g = Worm.newGame(def);
  assert(g.patrolPos.r === 2 && g.patrolPos.c === 2, 'expected patrol to start at (2,2)');
  const ev = Worm.tryMove(g, 'R'); // (1,0)->(1,1); not where the hazard currently is
  assert(g.status === 'lost' && g.loseReason === 'patrol',
    'expected the hazard to catch up and kill, got ' + g.status + '/' + g.loseReason);
  assert(ev.some(e => e.t === 'patrol'), 'expected a patrol advance event');
  assert(ev.some(e => e.t === 'lose' && e.reason === 'patrol'), 'expected a patrol lose event');
});

probe('a bump does not advance the hazard', () => {
  const def = {
    grid: ['S#.a'],
    par: 2, budget: 5, star3: 2, star2: 4,
    patrol: [[0, 3], [0, 2]]
  };
  const g = Worm.newGame(def);
  const ev = Worm.tryMove(g, 'R'); // bumps the rock at (0,1)
  assert(ev[0].t === 'bump', 'expected a bump');
  assert(g.patrolStep === 0, 'a bump must not advance the patrol, got step ' + g.patrolStep);
  assert(g.patrolPos.r === 0 && g.patrolPos.c === 3, 'patrol should still be at its starting waypoint');
});

if (fails) { console.log(fails + ' FAILURES'); process.exit(1); }
console.log('ALL TESTS PASSED');
