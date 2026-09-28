# WORM — Level & World Expansion Plan

Goal: go from 15 tutorial levels to a full campaign that keeps getting harder
in ways that feel *different*, not just bigger. Bigger boards and tighter
move budgets alone plateau fast — real difficulty here should come from new
tile types and from levels that force players to combine mechanics.

## 1. Worlds = difficulty tiers, not just skins

Each world should ship with at least one new mechanic. Proposed lineup:

| # | World            | New mechanic                          | Levels | Grid size    | Par range |
|---|------------------|----------------------------------------|--------|--------------|-----------|
| 1 | Garden Path      | rocks, golden/green apples             | 1–15   | 4×4 – 7×7    | 6–21      |
| 2 | Riverbank        | bridges, rotten apples, crates, combos | 16–30  | 6×6 – 8×8    | 12–26     |
| 3 | Orchard Dusk     | *(existing, becomes finale of act 1)*  | —      | —            | —         |
| 4 | Frost Hollow     | **ice slide** — enter and slide until  | 31–45  | 7×7 – 9×9    | 16–32     |
|   |                  | blocked (see §5: shipped as *every*    |        |              |           |
|   |                  | slid tile joining the trail, not just  |        |              |           |
|   |                  | the stop tile - the better rule)       |        |              |           |
| 5 | Tunnel Warrens   | **one-way tiles** (arrows) + teleport   | 46–60  | 7×7 – 9×9    | 20–38     |
|   |                  | tunnel pairs                           |        |              |           |
| 6 | Nightshade Grove | **patrol hazard** — a rock/thorn that   | 36–50  | 5×5 – 10×15  | 8–25      |
|   |                  | moves on a fixed cycle each turn       |        |              |           |
| 7 | Worm's Summit    | remix finale: every mechanic, biggest   | 51–65  | 7×7 – 12×11  | 9–25      |
|   |                  | boards, tightest budgets               |        |              |           |

That's ~90 levels across 7 worlds (Orchard Dusk folded in as the act-1
finale rather than its own numbered tier). Adjust counts once world 4 is
built and playtested — don't lock in 90 up front.

### Why these mechanics specifically
Each is a small, local rule change on top of the existing `tiles`/`occ`
model in `engine.js` — no rewrite of the core loop:
- **Ice slide**: extend `tryMove` so landing on an `I` tile repeats the same
  direction until the next tile is blocked/apple/edge. Every slid-through
  tile still joins `trail`/`occ` (tail rule is unchanged and still the core
  tension).
- **One-way tiles**: a `canEnter` check keyed by facing direction; cheap.
- **Teleport pairs**: two tagged tiles that swap the head's position on
  entry; trail records both endpoints so the "no disappearing tail" rule
  still applies (this is the one mechanic worth prototyping first — it's the
  biggest departure from "physical" movement).
- **Patrol hazard**: needs a per-turn tick independent of the player's move
  (a hazard position that advances every time `tryMove` succeeds). This is
  the biggest engine change of the four — worth a design spike before
  committing to a whole world around it.

## 2. Difficulty curve, concretely

Two levers per level, both already in the engine:
- **Slack** = `budget − par`. Tutorial levels currently run generous slack
  (6–8 extra moves). Tighten gradually: aim for slack shrinking from ~8 in
  world 1 to ~3–4 by world 6, so later levels genuinely punish an inefficient
  route instead of just being long.
- **Star thresholds**: currently `star3 = par+2`, `star2 = par+5` — a flat
  offset. At par 6 that's generous (33% over par for 3 stars); at par 40
  it's brutal (5% over par). Switch to a **percentage-based** formula for
  worlds 3+, e.g. `star3 = ceil(par * 1.15)`, `star2 = ceil(par * 1.35)`, so
  3-star difficulty feels consistent as levels get longer.

Suggested pacing inside a world (roughly, per ~15-level world):
1–3 tutorial the new mechanic in isolation · 4–8 combine it with one prior
mechanic · 9–12 combine it with two+ · 13–15 "gauntlet" levels using
everything introduced so far in that world. This matches how Garden Path →
Riverbank already ramp, so it's more codifying the existing instinct than
changing it.

## 3. Solver scalability — partially fixed, one honest caveat remains

**Status: two of the three options below are done.** `solve_level()` now:

- Keys its memo table on `(head, occ, apples, bridges)` where `occ` and
  `bridges` are bitmask **ints** (one bit per cell, `r*C+c`) instead of
  `frozenset`s. Cheaper to hash/compare, and a same-board/same-time-budget
  throughput test (fixed 4s search, 9×9 board, 5 apples) showed it gets
  through **~1.6x** as many search nodes as the old frozenset version in the
  same wall-clock time. Real, but modest — see the caveat below.
- Has a hard node-count + wall-clock budget on the DFS (defaults: 4,000,000
  nodes / 8 seconds, both overridable per call). If a board can't be
  exhaustively searched in time, the search stops and returns the *best
  solution found so far* (at least as good as the greedy fallback) with
  `truncated: True` on the result. `main()` surfaces this as a loud
  `[UNVERIFIED - search truncated ...]` line instead of silently shipping an
  unproven par, and the emitted `levels_solved.json` entry carries
  `verified: false` for the same reason. **This is the more important half
  of the fix** — it turns "might hang forever" into "always returns
  something, honestly labeled" — the bitmask change alone would not have
  been enough on its own.

**The honest caveat**, found while stress-testing this: on a synthetic
**9×9 board with 5 apples and mostly open floor**, even the improved
solver needed the full 8s budget and still only returned an *unverified*
best-effort par (still correctly flagged, not silently wrong — but not
proven optimal either). A **fully open 11×11 board with 6 apples** is
harder still: in one run the DFS didn't even complete a single full
solution within budget, and greedy also failed to find one, so
`solve_level()` correctly reported `UNSOLVABLE!` (which for a real level
would mean "redesign it," not "the game is broken" — but that redesign
loop costs authoring time if it happens a lot).

The pattern matters more than the numbers: **it's specifically large *and*
open boards with several apples that are expensive** — that's a
Hamiltonian-path-style combinatorial explosion, not a solver inefficiency.
Every hand-built level shipped so far (L1–L20, all with rocks/crates/water
carving up the floor into corridors) solves in a small fraction of a
second, total, for all 20 combined. **Practical implication for authoring
worlds 5–7**: keep rocks/crates/obstacles dense enough to break up the open
floor (which also tends to make for a more interesting puzzle anyway,
rather than "walk toward the nearest apple"), and treat any
`[UNVERIFIED]` line from `levels_src.py` as a sign to either simplify that
level's layout or bump `node_limit`/`time_limit` for that one solve and
re-verify by hand.

The deeper fix — a real admissible A*/IDA* heuristic (e.g. an actual
lower bound on remaining moves, harder than plain Manhattan distance once
ice slides are in play, since a slide can cover several tiles in one move
and Manhattan distance alone isn't a valid lower bound in that case) — is
still open, and is the thing to reach for if a future world genuinely wants
large, open, apple-dense boards. Until then, the budget/cutoff mechanism
keeps the pipeline safe, and level design is the cheaper lever.

This only affects the authoring pipeline (`levels_src.py`/`build_levels.py`),
not runtime — the shipped `engine.js` is unaffected either way.

## 4. Suggested next steps, in order

1. ~~Prototype **one** new mechanic (ice slide is the cheapest engine
   change)~~ **Done.** See §5 below.
2. ~~Patch the solver scalability issue above so it doesn't silently hang
   once boards grow.~~ **Done** — bitmask memo keys + a node/time budget
   with an honest `[UNVERIFIED]` fallback, plus the earlier
   "solvable but over budget" catch in `main()`. See §3 for what's still
   genuinely hard (large, open, apple-dense boards) and §5 for the
   ice-slide work. A real A*/IDA* heuristic remains the deeper fix if a
   future world wants that kind of board.
3. Batch-author world 4 (Frost Hollow) using the pacing structure in §2.
   **Done** — 5 levels, L16–L20.
4. ~~Repeat for worlds 5–7~~ World 5 (Tunnel Warrens) **done** — one-way
   tiles + teleport pairs, both built as engine changes with tests first,
   then 15 hand-built levels (L21–L35). See §6. Worlds 6–7 (patrol hazard,
   remix finale) remain, in that order — spike the patrol-hazard engine
   change on its own before batch-authoring world 6 around it, same as the
   last two worlds.

## 5. Ice slide prototype — shipped (World 4: Frost Hollow)

The ice mechanic from §1 is implemented and validated end-to-end:

- **Engine (`engine.js`)**: `tryMove` now loops per-tile instead of stepping
  once. Landing on `I` keeps the slide going in the same direction —
  eating apples or dying on rotten along the way — until it leaves the ice
  or is blocked. The whole slide, however many tiles, is still exactly one
  input and one move against the budget (matches the original design goal
  of not punishing players for something they didn't choose tile-by-tile).
  Move-budget and trapped checks were moved to run once *after* the slide
  fully resolves, not per tile — the original per-tile placement was a real
  bug (a slide could falsely end the game mid-slide on a stale budget/
  mobility snapshot) that a dedicated test caught before it shipped.
- **Tests (`test_engine.js`)**: 5 new probes cover a multi-tile slide,
  stopping short of an obstacle, eating an apple mid-slide, dying on rotten
  mid-slide, and a slide surviving on a 1-move budget (proving it isn't
  charged per tile). All 12 probes + all 20 level replays pass.
- **Solver (`levels_src.py`)**: added `resolve_move()`, which mirrors
  `engine.js`'s per-tile slide loop exactly, so the solver and the shipped
  engine always agree about what one input does. `greedy()` and `dfs()`
  both call it instead of the old single-tile step logic.
- **Solver safety net**: while authoring L20 "Frost Gauntlet", the pipeline
  silently shipped a level that needed 27 moves against a stated budget of
  26 — `solve_level()`'s DFS is capped by budget, but seeds its search with
  an *uncapped* greedy upper bound, and if DFS can't beat that bound within
  budget the uncapped answer survives unflagged. `main()` now explicitly
  checks `par > budget` and fails the build (`UNSOLVABLE within budget!`)
  instead of shipping it. This protects every future level, not just this
  one.
- **World theme (`app.js`)**: `frost` theme (icy palette, snow-blue board)
  plus a dedicated ice-tile render — glassy rounded fill, an animated
  diagonal light sweep per tile, and light crack facets — so ice reads
  clearly as its own surface at a glance.
- **Animation**: multi-tile slides glide smoothly through every intermediate
  tile via a small waypoint queue (`headAnimQueue`) instead of jump-cutting
  to the final tile, so a 4-tile slide reads as one continuous motion.
- **Levels**: 5 hand-built Frost Hollow levels (L16–L20), each solver-verified
  and replay-tested: a pure slide-mechanics intro, an "aim before you slide"
  level where the ice is a *trap*, not the shortcut (the direct route
  down-then-across is the actual optimal path — an intentional swerve on
  expectations), an ice-over-water crossing that chains into the existing
  bridge mechanic, a "same ice sends you two different places depending on
  entry side" puzzle, and a finale gauntlet combining ice, rocks, crates,
  and a golden-apple detour.

With the solver-scalability fix in §3 also done, next up per §4 is world 5
(one-way tiles + teleport pairs), using the same prototype-first approach:
engine change + tests first, then a small hand-built level set, before
committing to a full 15-level world.

## 6. One-way tiles + teleport pairs — shipped (World 5: Tunnel Warrens)

Both new mechanics from §1 are implemented, tested, and batch-authored into
a full 15-level world, in one pass rather than the "prototype a handful,
then decide" approach used for ice:

- **Engine (`engine.js`)**: two independent additions.
  - **One-way tiles** (`^v<>`): `canEnter` now takes the movement direction
    and rejects entry when the tile's arrow doesn't match it — approached
    from any other side, it's exactly as solid as a rock. Cheap, as §1
    predicted: one extra comparison in an existing function, no new state
    on the game object.
  - **Teleport pairs** (`1`-`4`, each digit wired up wherever it appears at
    exactly two grid positions): entering either tile jumps the head to its
    partner. Both the entry and exit tiles join `trail`/`occ` (so the "tail
    never disappears" rule holds even though the middle was skipped), the
    destination gets the same apple/rotten/win handling as any other tile,
    and the hop always ends the move there — it never chains into an ice
    slide or a second teleport, so there's no ping-pong risk.
  - Both share one design decision worth calling out: `tryMove`'s per-tile
    entry logic (join trail, mark bridges, check rotten, eat apples, check
    win) was pulled into a single `enterTile()` helper, used both for an
    ordinary step and for a teleport's destination. Duplicating that logic
    instead — which was the tempting first draft — is exactly the kind of
    thing that produced the movesLeft/trapped-check bug in the ice work;
    sharing it means a teleport destination gets every rule correctly by
    construction, not by remembering to copy it twice.
- **Tests (`test_engine.js`)**: 6 new probes — one-way blocks the wrong
  direction, one-way allows its own direction, one-way tiles can wall off a
  cell into a trapped loss (exercises the direction-aware `legalDirs`), a
  teleport hop joins both endpoints to the trail in one move, teleport is
  bidirectional (either pad warps to the other), and a teleport hop doesn't
  chain past its destination. All passed on the first run — a good sign the
  `enterTile()` refactor was the right call.
- **Solver (`levels_src.py`)**: `resolve_move()` grew the same two rules
  (direction-gated entry via a tile→direction lookup, and a teleport-partner
  jump that ends the move) mirroring engine.js exactly, verified by replaying
  every solver solution through the real engine (the existing `test_engine.js`
  harness does this for all 35 levels now).
- **World theme (`app.js`)**: `tunnels` theme (underground cavern palette —
  purple-black stone, glowing crystal flecks instead of flowers) plus two
  new tile renders: a glowing chevron for one-way tiles (rotated to match
  its direction, with a slow pulse) and a pulsing color-coded portal glyph
  for teleport pads (color keyed to the pair's digit, so a player can match
  an entry pad to its exit by eye before committing to it).
- **Animation**: a teleport hop is an instant cut rather than a glide — a
  particle puff at the tile you vanish from and another where you appear,
  plus a short whoosh sound — deliberately distinct from an ice slide's
  continuous glide, so the two mechanics read as different kinds of motion
  even though both can move the head more than one tile per input.
- **Levels**: 15 hand-built levels (L21–L35) following §2's pacing, adapted
  for two new mechanics instead of one: L21-23 introduce one-way tiles,
  teleport pads, and the two together, in isolation; L24-29 pair each new
  mechanic with one older one (rocks, bridges, rotten, crates, ice); L30-32
  combine three-plus mechanics at once; L33-35 are gauntlets using
  everything, the last one (`Tunnel Warrens Finale`) requiring a one-way
  gate, a bridge, an ice slide, and two separate apples across a fully
  sealed sequential layout.
  - **A real bug caught while authoring these, worth calling out**: several
    early gauntlet-style drafts put a rock "wall with one gate" inside a
    *wider* grid without sealing the full row — e.g. a 4-cell-wide rock
    block in a 7-wide level, leaving the two flanking columns wide open. The
    solver happily found a shorter path around the wall that never touched
    the gate at all, silently defeating the level's own teaching point
    while still reporting a valid, solvable par. Caught not by the solver
    (a bypassed mechanic isn't a build error) but by a small audit script
    that replays each solved solution and checks which special tiles the
    optimal path actually steps on — `L25`/`L30`/`L32` originally failed
    this check. Fixed by making every such wall span the grid's *full*
    width with a single gate column (`L24`'s original pattern, now reused
    deliberately everywhere). `L25` and `L30` were left as-is on purpose —
    their intro text already frames the portal as an optional shortcut, not
    a requirement, so a bypassable portal there is correct, not a bug.
  - **Worth remembering for worlds 6-7**: "is this solvable" and "does the
    optimal solution actually exercise the mechanic I built the level
    around" are two different questions, and only the solver pipeline
    checks the first one automatically. A quick script like the one above
    (replay the solved path, log which special tiles it touches) is cheap
    insurance before shipping a batch of levels for a new mechanic.

Per §4, the full 7-world, 65-level campaign is now complete. See §8 below.

## 7. Patrol hazard — shipped (World 6: Nightshade Grove)

The last new mechanic from §1 is implemented, tested, and batch-authored
into a full 15-level world, following the same "engine + tests first, then
the solver, then a full batch of levels" order used for World 5:

- **Engine (`engine.js`)**: a level can carry a `patrol` field - an ordered
  list of `[r,c]` waypoints, not a grid character, since a single-character
  cell can't express an ordered path. `patrolPositionAt(patrol, step)` turns
  a monotonically increasing step counter into a position by ping-ponging
  forward to the last waypoint and back to the first, repeating - so the
  hazard's direction never needs to be tracked separately. The hazard
  advances exactly once per successful player *input* (`newGame` seeds
  `patrolStep`/`patrolPos`; `tryMove` advances them once after its main loop
  resolves, gated on `!first` so a bump - which leaves `first` true - never
  advances it, and a multi-tile ice slide or a teleport hop - which both
  still leave `first` false after their first tile - only ever advances it
  once per input, not once per tile). Two collision checks, both living
  inside the shared `enterTile()` helper so they compose for free with ice
  and teleport destinations instead of needing to be duplicated at every
  call site: (1) the tile the head is entering matches the hazard's current
  position (walking into it), and (2) after the hazard advances following a
  fully-resolved move, its new position matches the head's final resting
  tile (it stepping onto you). A `'T'` grid character exists purely as a
  cosmetic marker for level authors to see where the patrol starts at a
  glance; it's stripped to plain floor by `parseDef`, exactly like `'S'`.
- **Tests (`test_engine.js`)**: 5 new probes - the ping-pong sequence
  reverses correctly at both ends of the waypoint list, a multi-tile ice
  slide only advances the hazard once (not once per tile), walking directly
  onto the hazard's current cell kills, the hazard catching up to the
  player's new position kills, and a bump doesn't advance the hazard at
  all. All 23 probes + all 50 level replays pass.
- **Solver (`levels_src.py`)**: `resolve_move()` grew a `patrol`/`patrol_step`
  parameter pair and a matching `patrol_position_at()` helper that mirrors
  engine.js's function exactly. The same two collision checks are applied
  at every tile the simulated head lands on - including a teleport's
  destination - and the hazard only advances once resolve_move fully
  resolves a move without dying, exactly mirroring the real engine's timing.
  `patrol_step` was added as a fifth field in the DFS memo key (alongside
  head/occ/apples/bridges), since two otherwise-identical board states with
  the hazard in different phases of its cycle are genuinely different
  states for search purposes.
- **A genuine design trap found while authoring these, worth remembering for
  world 7**: a single-file passage exactly as long as the hazard's full
  patrol cycle (e.g. a 2-tile-deep gate with a 2-waypoint patrol sitting
  exactly on those two tiles) turned out to be **mathematically unsolvable,
  not just hard** - every crossing attempt gets checked against both of the
  hazard's two waypoints (the "walking into it" check uses the position
  from just before the hazard's step, and the "it steps onto you" check
  uses the position from just after, and for a 2-waypoint cycle those two
  checks always cover *both* waypoints on every single crossing, regardless
  of timing). The fix used throughout this world: make the gate *wider*
  than the hazard's reach at any one instant (so at least one column is
  always safe to step through) rather than exactly as deep as its patrol,
  and depth-1 gates (the wall is only one row/column thick) sidestep the
  trap entirely since crossing them only ever risks one collision check,
  not two in a row.
- **World theme (`app.js`)**: `nightshade` theme (a moody purple-black
  grove palette with glowing nightshade-bloom flecks instead of flowers)
  plus a dedicated hazard render - a spiky, slowly-rotating glowing burr
  with two hunting eyes - driven by its own small tween (`haz`, separate
  from the worm's own head animation) that glides between waypoints in
  sync with the player's move animation rather than jump-cutting.
- **Levels**: 15 hand-built levels (L36-L50) following §2's pacing: L36-38
  introduce the hazard alone (a wide gate it paces back and forth across,
  so there's always at least one safe column at any instant); L39-44 pair
  it with one older mechanic each (rotten apples, crates, bridges, ice,
  one-way gates, teleport pads); L45-47 combine it with two-plus mechanics
  at once; L48-50 are gauntlets, the last one (`Nightshade Grove Finale`)
  stringing together a one-way gate, a bridge, a full-width ice row, crates,
  a teleport pair, a rotten decoy, and both a green and a golden apple
  around the hazard's own guarded stretch. Verified two ways beyond the
  solver itself: a `node test_engine.js` full regression (50 levels + 23
  probes, all passing) and a Playwright playtest that actually played every
  World 6 level's solver-found solution through the real browser build,
  confirming each one wins in exactly its stated par with no dropped inputs
  or rendering errors.

## 8. Remix finale — shipped (World 7: Worm's Summit) — campaign complete

World 7 needed no engine work at all - it's a pure content world, combining
every mechanic from worlds 1-6 on bigger boards with tighter move budgets,
exactly as scoped in §1. That made this the fastest world to build
end-to-end, but it surfaced two real lessons worth recording:

- **A single-file passage exactly as long as the patrol hazard's full cycle
  is unsolvable, full stop - not a timing puzzle.** Restated from §7's
  finding, but worth repeating here because a first finale draft walked
  straight into it again: a 2-tile-deep gate guarded by a 2-waypoint patrol
  has no safe crossing at any input parity, because the "walking into it"
  and "it steps onto you" checks between them cover *both* of the hazard's
  waypoints on every single crossing attempt. Every World 7 level reuses
  the wider-than-the-hazard-reach gate pattern from World 6 instead.
- **Large, open, multi-apple boards blow up the DFS far faster than raw
  board size would suggest - this bit several finale drafts directly.**
  Building bigger combination levels (naturally wanting more open space to
  fit more mechanics) repeatedly produced boards that either timed out
  `UNVERIFIED` or, worse, came back fully `UNSOLVABLE` even at a raised
  25-second/12-million-node budget in `main()` - not because the level was
  actually unsolvable, but because the search couldn't finish confirming a
  path within budget while exploring the same open floor from many
  interchangeable routes. This is exactly the caveat §3 already
  documented, now confirmed directly at authoring time rather than just in
  a synthetic stress test. The fix was never "give the solver more time" -
  it was always going back and adding more rocks/crates to cut the open
  floor into corridors, which is both cheaper and (per §3's original
  observation) makes for a more interesting puzzle anyway. One finale
  design that tried to layer in an *extra* wide-open apple room on top of
  an already-working narrow layout was abandoned entirely in favor of
  keeping the whole level linear/corridor-shaped end to end - a good
  general rule for any future large board: grow the *chain* of mechanics,
  not the open floor space between them.
- **Levels**: 15 hand-built levels (L51-L65). L51-52 are a gentle re-entry
  (one prior 2-mechanic combo each, generous budgets); L53-58 revisit
  three- and four-mechanic combinations from worlds 4-6 under visibly
  tighter budgets; L59-63 are five-plus-mechanic gauntlets on the biggest
  boards in the game; L64-65 are the true finale pair, with `Worm's Summit`
  itself combining rocks, a one-way gate, a bridge, a full-width ice row,
  crates, a teleport pair, the patrol hazard, a rotten decoy, and a
  green-and-golden apple pair, solved in exactly 25 moves against a
  28-move budget (only 3 moves of slack, the tightest in the game). World
  theme: `summit`, a crisp snow-and-aurora mountaintop palette reusing
  every mechanic-specific render (ice, one-way glow, teleport pairs, the
  patrol hazard sprite) already built for worlds 4-6 - no new rendering
  code was needed, only a new color set. Verified the same two ways as
  every world before it: `node test_engine.js` (all 65 levels + 23 probes
  passing) and a Playwright playtest of every World 7 level's solver
  solution through the real browser build, confirming exact par with no
  dropped inputs or rendering errors.

With World 7 shipped, the campaign originally scoped in §1 is complete:
7 worlds, 65 hand-built and solver-verified levels, 5 tile mechanics beyond
the original rocks/apples (bridges, ice, one-way tiles, teleport pairs, the
patrol hazard), background music, and a full visual/audio identity per
world. Any further work from here (an 8th world, harder remixes, a real
A*/IDA* solver heuristic per §3) is a genuinely new scope decision, not a
continuation of this plan.

## 9. Decision-forcing puzzle patterns — shipped (L1-20 retune + Worm's Summit hallway fixes)

A design review of the early game (L1-20) found levels that were *flat* -
technically distinct (a new mechanic, a new layout) but not actually
harder, because their true optimal solve never forced a real decision: the
nearest apple was always the right apple to eat next, every tile the board
offered was already on the shortest path, and tightening the move budget
just turned an already-single route into a stricter version of itself. The
fix was never "cut the budget further" - it was rebuilding the affected
levels around genuine forks, and checking that the fork was genuine the
only way that means anything for a puzzle game: run the solver and read
what its *true optimal* solution actually does, not what the layout is
supposed to imply. This surfaced two categories of levels needing work -
L1-20 itself, and the four purely-linear "stack every mechanic in a
corridor" Worm's Summit hallway levels (`Sealed Passage`, `Thorn Gauntlet`,
`High Pass`, `Ascent`) - and produced three reusable patterns plus a
general-purpose way to test whether an "obviously right" line is actually a
trap.

**Pattern: the deferred apple (dead-end spur).** A ring-shaped corridor
wraps an inner rock-walled block; a single-tile-wide spur drops into the
block from one point on the ring and dead-ends at an apple whose only open
neighbor is the spur tile itself. The correct solve walks the ring the
*long* way to a second apple first, then finishes by dropping into the
spur last. This only works when the spur's apple is the very last apple
the level needs - the spur's single entrance becomes part of your own tail
the moment you pass it, so if any apple remains uneaten elsewhere, you're
now permanently sealed in with no way back out. (`Golden!`/L4 and
`No Going Back`/L10 both use this shape; an early attempt to reuse it for
`Sealed Passage`/L46 came back solver-`UNSOLVABLE` for exactly this reason
- the spur apple wasn't last, so entering it meant dying in your own trail
on the way back out. That failure is what led to the next pattern instead.)

**Pattern: the sealed wing (irreversible chokepoint).** A one-way gate or a
single-use bridge is *not* a fork on its own - the level design already had
several of these and they weren't creating real decisions, because nothing
was ever placed where the seal would matter. The pattern only becomes a
trap once an apple sits on the near side of the seal, off the direct line
to the gate/bridge, so a player beelining for the chokepoint can walk past
it without noticing. Cross first and the wing is gone forever - every tile
you've stepped on (including the gate/bridge tile itself) is permanently
part of your own trail, so there is no "go back for it" once you're
through; the level becomes unsolvable from that position and the player has
to restart. `Sealed Passage`/L46 (an apple tucked behind a wall notch
before its one-way gate) and `High Pass`/L56 (a golden apple that must be
grabbed before finishing a dead-end-spur detour, not after) both ship this.

**Pattern: the ice overshoot.** Ice only slides in the direction you were
already moving, and the slide doesn't stop until it hits something - so an
ice band placed so its "obvious" straight-through crossing runs directly
into a rotten tile forces real route-planning: entering the same ice from
a different approach (a different row, a different starting column) lands
safely instead. `Slide of Peril`/L19 shipped this first; `Thorn
Gauntlet`/L49 reuses the identical shape (a full-width ice band over a row
holding one rotten tile and one safe apple) ahead of its existing one-way
gate/portal/patrol sequence.

**Testing method: greedy-vs-optimal divergence.** Hand-reasoning about
whether a layout "feels" like a trap is unreliable (see the loop proof
below). The reliable test used throughout this pass: run the real solver
for the true optimal path, then separately run a simple greedy walker that
always steps toward whichever apple is nearest by Manhattan distance (a
stand-in for a player's first instinct). If greedy gets stuck outright
(`TRAPPED` - it reaches a state with no legal move and remaining apples),
that's a hard trap: the level cannot be talked around once you take the
wrong first step, and a real player has to undo/restart. If greedy finishes
but needs more moves than optimal, that's a softer trap: still a real
decision, just not fatal. If greedy already matches optimal, the "trap"
is cosmetic only - worth reconsidering (this is what caught the very first
draft of `Combo Meal`/L9's redesign, which was kept anyway since breaking
its 2x2 apple block was the primary ask for that slot in the curve, not a
hard-trap requirement).

**A proof worth keeping: a simple two-apple loop can never trap.** If a
level's only structure is one continuous cycle (no branches, no dead ends)
with two apples on it, whichever apple is nearer by raw shortest-path
distance from the current position is *always* also the optimal apple to
eat first - there's no layout of a bare loop that makes the greedy-nearest
choice wrong, because reaching the far apple by continuing around the same
loop is never blocked by having already eaten the near one. Real traps
need either a dead-end branch (the deferred-apple pattern) or a genuine
fork/chokepoint with an irreversible consequence (the sealed-wing pattern).
Don't spend authoring time trying to build a trap out of a plain loop; it
provably can't be done.

**Bug class found and fixed by this pass: decorative trick tiles.** Several
already-shipped levels turned out to have a mechanic tile that the true
optimal solver path never actually touches - the level *looks* like it
tests ice, or a patrol corridor, but a cheaper route quietly avoids it
entirely. This is invisible from the grid text alone; it only shows up by
tracing the solver's actual solution move-by-move and checking which
tiles it lands on (or, for ice, which tiles get added to the trail
mid-slide, since a slide's intermediate cells don't appear as separate
moves). Found and fixed twice this pass: `Frost Hollow`/L16 (the prior
redesign's optimal path never touched its own ice tiles at all - the
game's first ice tutorial level wasn't testing ice) and `Ascent`/L64 (the
patrol-guarded "thorn's stretch" corridor had a free edge column running
around it the whole way down, so the optimal solve skipped the patrol
hazard entirely; closed by walling off the last open column). Static
obstacles (rocks, crates) don't need this check - they only shape the
space, they aren't a mechanic being taught - but every *active* mechanic
(ice, one-way gates, bridges, the patrol hazard, teleport pairs) added or
touched by a redesign should have its trick tile confirmed present in the
traced optimal path before shipping.
