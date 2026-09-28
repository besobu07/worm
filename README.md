# WORM — Project Source

The complete WORM puzzle game, as a static web build. **Serve the folder
with any static web server** (for example `python3 -m http.server`) and open
`index.html`. Opening `index.html` straight from disk also works, but
browsers block loading the music file that way, so the game runs silent.

## What's in here

- `index.html` — page shell (loading screen, screens, cards, icon set)
- `styles.css` — all styling
- `engine.js` — the game rules: movement, trail, apples (red/golden/green/rotten),
  bridges, rocks, crates, water, ice, one-way tiles, teleports, the patrol
  hazard, move budgets, combos, scoring, stars.
  This is the portable game logic — the right starting point for a native port.
- `levels.js` — all 65 levels across 7 worlds (layouts, par, tutorials), plus
  `levels_solved.json` with solver-verified solutions for each.
- `story.js` — the Wally & Pip storyline: the story copy and which levels
  each beat plays around.
- `app.js` — everything on screen: Wally's animation and expressions, the
  board renderer (cached static layer + animated tiles), sound (WebAudio),
  music, haptics, swipe/keyboard input, undo, pause, settings, wardrobe,
  level map, transitions, and localStorage saves (including the exact
  in-progress level, so players resume where they left off).
- `art/worm-home-art.jpg` — the illustrated home-screen artwork (used as the
  home screen itself).
- `NOTES.md` — running playtest notes: what's open, what's resolved.
- `test_engine.js`, `build_levels.py`, `levels_src.py` — engine tests and the
  level-building/solver scripts.
- `fonts/` — self-hosted Baloo 2 (one variable font; the three files are
  identical copies, one file serves every weight).
- `audio/bgm-puzzle-path.mp3` — looping background music, started by the
  first tap, with its own on/off switch in Settings.

## Note on versions

As of v19, this package — and the Artifact published from it — is the
only version being played. It is the game's full front end: every screen,
the polished UI (home artwork, winding level map, cards), haptics,
swipe-only controls, undo, and the complete Wally & Pip storyline, saved
to the browser's localStorage. An earlier hosted build ("Muse") existed
alongside this package for a while; it's no longer part of the workflow,
and `NOTES.md` keeps the old merge checklist only as history.

Recent changes (Sep 2026): world/theme system (3 worlds reskinning the board),
combo-showcase level design (L9 2x2 apple cluster, L14 golden+red pair),
golden-apple JACKPOT moment (screen shake, big burst, fanfare), living board
(water ripple + shimmer, swaying grass, bobbing apples), combo popups that
scale with chain length, cross-fade screen transitions (home/levels/game).

Visual polish pass (Sep 2026): Baloo 2 for the logo, headings, HUD and
buttons, self-hosted from `fonts/` (see above) rather than linked from
Google Fonts, with a plain system font kept for body copy; simplified the
logo's outline from `-webkit-text-stroke` (which visibly glitched on the R,
where the stroke self-intersects at the bowl/leg junction on this heavy a
face) to a layered flat-shadow outline, and sized it up
(`clamp(96px,27vw,128px)`, responsive so it can't overflow narrow screens);
introduced shared radius (`--r-sm/md/lg/pill`) and shadow
(`--sh-sm/md/lg`) tokens used across every button/pill/card instead of each
one inventing its own; replaced every emoji and Unicode glyph (‹ › ⟳ 🔒 🔊 🔇
▲◀▼▶ 🐛) with a small inline SVG icon set defined once in `index.html` and
reused via `<use href="#ic-...">`; home-screen tagline is now "Get Your
Wiggle On".

Ice slide prototype (Sep 2026): new tile type `I` — step onto ice and you
keep sliding in the same direction (still eating apples / dying on rotten
along the way) until you leave the ice or hit something, with the whole
slide counting as one move against the budget; a move-budget/trapped-check
timing bug (checked mid-slide instead of once per input) was caught by a
dedicated test before shipping. New **Frost Hollow** world (L16–L20, icy
palette + glassy animated ice-tile rendering) with 5 solver-verified
levels, plus a smooth multi-tile slide animation. The level-authoring
pipeline (`levels_src.py`) now also refuses to build if a level is
solvable only *over* its stated move budget, instead of silently shipping
it (a real bug this caught while authoring the Frost Hollow finale).

Solver scalability fix (Sep 2026): the level-authoring solver
(`levels_src.py`) now keys its search memo on bitmask ints instead of
`frozenset`s (~1.6x more search throughput per second) and enforces a
hard node/time budget on the search, so a big future board degrades to
an honestly-flagged best-effort result (`[UNVERIFIED]` in the build log,
`verified: false` in `levels_solved.json`) instead of hanging the build
forever. Stress-testing this also confirmed the real bottleneck is
large *and* open boards with several apples, not board size alone -
every hand-built level shipped so far (L1-L20) still solves in a
fraction of a second.

One-way tiles + teleport pairs (Sep 2026): two new tile types — `^v<>`
arrows that only let you pass while moving the direction they point
(approach from any other side and it's a wall), and `1`-`4` teleport pads
that instantly warp you to their matching partner, both endpoints joining
the trail so the "tail never disappears" rule still holds. A teleport hop
always ends the move where it lands rather than chaining into a slide or a
second teleport. New **Tunnel Warrens** world (L21–L35, underground-cavern
palette, a glowing chevron for one-way tiles and a color-matched pulsing
portal glyph for teleport pairs) with 15 solver-verified levels, plus a
distinct instant-warp animation (particle puff + whoosh) so a teleport hop
reads differently from an ice glide. Caught mid-authoring: several early
gauntlet-style levels put a rock wall with a single gate inside a *wider*
grid without sealing the full row, so the solver found a shorter path
around the wall that never touched the gate — solvable, but silently
defeating the level's own teaching point. A small script that replays each
solved solution and checks which special tiles it actually steps on caught
this; every such wall now spans the grid's full width.

Background music (Sep 2026): a looping track (`audio/bgm-puzzle-path.mp3`)
starts on the first tap of Play and shares the existing sound toggle with
the SFX — no second mute button. It is decoded once and looped through the
same Web Audio context as the sound effects (not an `<audio>` element), so
music and SFX always take the identical output path on every device.

v13 (Sep 2026): music routing fix — the track previously played through an
HTML `<audio>` element, which iOS can silence device-side while Web Audio
sound effects keep playing (the reported "SFX but no music" symptom on
iPhone). Music now decodes once via `decodeAudioData` and loops through
the same shared AudioContext as the effects, with the `<audio id="bgm">`
element removed entirely. Fetch/decode failures are caught silently so the
game never breaks without the track.

Patrol hazard (Sep 2026): a new kind of threat instead of a new tile type —
a thorn creature that paces back and forth along a fixed list of waypoints,
advancing exactly one step every time *you* successfully move (never per
tile within an ice slide, and never on a bump). Walking into its current
cell, or having it step onto your new position right after you land, is
instant death; both checks reuse the same `enterTile()` helper as every
other tile rule, so it composes for free with ice, teleports, and every
other mechanic without duplicating logic. New **Nightshade Grove** world
(L36–L50, a moody purple-and-thorn palette with a glowing, spike-shelled
hazard sprite that has its own short gliding animation independent of the
worm's) with 15 solver-verified levels, ramping from a pure introduction
through every prior mechanic paired with the hazard (rocks, bridges,
rotten apples, crates, ice, one-way gates, teleport pads) up to a finale
that strings all of them together in one grove. The Python solver
(`levels_src.py`) simulates the hazard identically (same ping-pong
position function, same two collision checks, same one-tick-per-input
timing), so every shipped level's stated par is a real, hazard-aware
solution rather than a lucky guess. One real design trap found while
authoring these, worth remembering for world 7: a single-file passage
exactly as long as the hazard's patrol cycle can be **mathematically
unsolvable regardless of timing** (the collision math ends up checking
both of the hazard's positions on every crossing), not just hard — the
fix is either a wider gate (so at least one column is always safe) or a
gate whose depth doesn't match the patrol's period.

Worm's Summit (Sep 2026): the campaign finale, and the last new world - no
new mechanic, just everything from worlds 1-6 (rocks, crates, water/bridges,
rotten apples, combos, golden/green apples, ice, one-way gates, teleport
pairs, and the patrol hazard) remixed together on bigger boards with
tighter move budgets (slack shrinks to as little as 3 moves by the finale,
versus 6-8 in the early tutorials). New **Worm's Summit** world (L51-L65,
15 solver-verified levels, a crisp snow-and-aurora mountaintop palette) that
starts by revisiting each two/three-mechanic pairing from the last few
worlds under a tighter budget, then builds into five- and six-mechanic
gauntlets, and ends with `Worm's Summit` itself - rocks, a one-way gate, a
bridge, a full-width ice row, crates, a teleport pair, a patrol hazard, a
rotten decoy, and a green-and-golden apple pair, solved in exactly 25 moves
against a 28-move budget. One real solver lesson from authoring these worth
recording: **large, open, multi-apple boards blow up the DFS search far
faster than board size alone would suggest** (matches the caveat already on
record in §3 of `LEVEL_DESIGN_PLAN.md`) - several early finale drafts timed
out unsolved or took tens of seconds even with a generous node/time budget,
and the fix every time was the same one the plan already recommends: add
more rocks/crates to break the open floor into corridors rather than trying
to brute-force a bigger search budget. The full 65-level campaign is now
complete across all 7 worlds.

Studio polish pass (Sep 2026): no rule or level changes - all 65 levels
still replay their verified solutions to a win through the real UI.
*Performance:* the board's non-animating art (grass, flowers, rocks,
crates, bridges, frame) is now drawn once into an offscreen layer and
blitted each frame, with only genuinely animated tiles redrawn (~2.5x
less render time per frame); theme/screen lookups are cached instead of
being re-queried per tile per frame; the 3.5 MB music track no longer
preloads before first paint; music stops and the audio graph suspends
while the app is backgrounded; particle count is capped. *Fixes:* the
worm's body no longer draws a straight line across the board between two
teleport pads, and no longer runs ahead of the head during an ice slide;
the win/fail card can no longer pop up over the next level if you restart
or back out during the celebration; the background-input guard (moves
ignored while the tab/app is hidden) is in `inputDir()`. *Visuals:* the
board is a rounded tray with a rim and drop shadow; rocks and crates have
contact shadows; the worm has a shadow, segment bands and a highlight;
tiny boards no longer blow up to giant tiles (72px cap); the board
settles in when a level starts; all stars are one SVG icon instead of
platform-dependent glyphs. *HUD & screens:* level name under the level
number; labelled Moves / apples-left / Score pills with a live 3-star
pace indicator that dims as you pass each threshold; score counts up;
the level map highlights your next level, scrolls to it, shows per-world
stars and page dots, and slides between worlds; home shows Continue
(with the level) and a campaign-progress bar; the win card shows moves
and score side by side, "Perfect!" for 3 stars, a New best badge, and
how many moves the next star tier needs. *Controls:* swipe anywhere over
the board area (fires as soon as the finger crosses the threshold; one
gesture is always exactly one move); arrow keys light up the matching
on-screen button; held keys don't auto-repeat moves; R restarts, Esc
goes back, Enter/Space confirms, and left/right flip worlds on the level
map; horizontal swipe flips worlds too; short haptic cues on Android
(follows the sound toggle); hover and keyboard-focus states; reduced
motion is respected (no shake, no pulsing, lighter confetti).

See `LEVEL_DESIGN_PLAN.md` for the full campaign history and the
solver-scalability notes.

v14 — "Wally comes alive" (Sep 27, 2026). No rule or level changes: all 65
levels still replay their verified solutions to a win through the real UI.
*Wally:* squash and stretch as he moves, a springy landing, eyes that turn
smoothly and follow what he's looking at, a slow breath at rest. New
expressions: star-eyed, relieved, sad, tired, unimpressed, annoyed,
confused, sleepy. He reacts to how the level went (happy wiggle, "Phew!"
with a wiped brow, or a star-eyed "Amazing!" for a hard level or a level
that took several tries). He reacts to mistakes (a puzzled "?" and a head
shake; bump three times and he's annoyed), and to lots of undos (he gets
impatient). Left alone he eyes the nearest apple, daydreams about it in a
thought bubble, juggles a dirt ball, turns to stare at the player, and
eventually dozes off. Secrets: tap him to make him giggle (five quick
taps annoys him); tap apples, water, ice or the thorn for tiny
reactions; on about a third of levels a butterfly lands on him if you
stop to think. *Juice:* dirt (or snow) kicks up behind every step, eaten
apples pop with a ring, bridges splinter, wins shake the screen and the
camera eases in on Wally. *Sound:* every effect varies slightly in pitch
and level; moves are a soft pop plus a dirt squish; mistakes are a
distinct soft "bonk"; new sounds for ice slides, undo, bridges cracking,
giggles, pausing. Music is muffled while paused and resumes in place
after backgrounding. *Undo:* one per level, matching the live game
(`UNDO_LIMIT` in `app.js`; set it to `Infinity` for unlimited), with a small
counter on the button. Wally's tail reels back in and eaten apples pop
back into place. The fail card leads with "Undo last move" while the undo
is unused, and leaving and resuming a level doesn't refill it. *Pause:* a burrow where Wally sleeps, with Resume, Restart, Levels
and quick sound toggles; leaving the app (switching apps, a call, locking
the phone) pauses automatically. *Settings:* music, sound effects, haptics,
reduce motion. *Haptics:* Android vibration, plus the iOS 18+ system tick
on iPhone. *Resume:* leave mid-level and Continue puts you back on the same
move, with undo history. *Level map:* each world is a winding tunnel with
a world emblem; Wally stands on it at your next level and wriggles along
to the next one after each clear. *Transitions:* an iris wipe closes on
Wally and reopens on him in the next level. *Wardrobe:* nine hats worn in
the actual game, unlocked by stars (plus seasonal Halloween and holiday
hats); new unlocks are announced on the win card. *Home:* the illustrated
artwork, full-screen with a slow drift (a portrait panel on wide screens).
*Story:* the Wally & Pip storyline ported from the live
build (copy verbatim, same `storySeen` keys): "Meet Wally" before Level 1,
Pip's beats after Levels 3, 6, 9 and 12, and the finale, re-pointed from
Level 15 (a leftover from the 15-level game) to just before Level 65. Each
beat plays once, and skipping marks it seen. Cards have a small animated
vignette of Wally (in his hat) and Pip the ladybug, and keyboard
shortcuts work on them. *Onboarding:* Level 1 has no text wall: one line, an animated arrow, then
one tip after the first move. *Loading screen:* "Wally is digging…".
*Controls:* swipe-only on touch screens (arrow buttons removed); the
system back gesture pauses instead of leaving mid-level; keyboard: arrows
or WASD, Z to undo, Esc or P to pause, R to restart. *Also:* landscape
layout for phones, colour-blind-safe teleport pads (each pair also has
its own shape), and file permissions fixed so any web server can serve
the music, art and fonts.

v15 (Sep 27, 2026). *Story finished:* four new Pip beats open Frost
Hollow, Tunnel Warrens, Nightshade Grove and Worm's Summit (after Levels
15, 20, 35 and 50), and a real ending beat plays after the Level 65 win —
Wally reaches the Golden Apple Tree. The finale card's text was also
tweaked so it no longer says "garden" right before a mountaintop level.
The story vignette now paints a different backdrop per world instead of
always the garden lawn. *Juice:* the per-step dirt-puff kicked up behind
Wally is lighter (fewer, smaller, quicker particles) — the idle dirt-ball
juggling animation is unchanged. *Level data:* L61 "Icebound Vault" can
reach 1 star again (its star2 threshold was above its move budget, so
every win got at least 2); L59-63's intro kicker no longer wrongly reads
"Nightshade Gauntlet". No rule changes: all 65 levels still replay their
verified solutions to a win through the real UI, including the new story
beats, verified end to end.

v16 (Sep 27, 2026). Two rounds of feedback acted on — a UX/engineering
review and a design-and-level-content review citing this repo's own
`LEVEL_DESIGN_PLAN.md` and shipped numbers directly. *Difficulty:* four
world-opener levels redesigned so difficulty climbs linearly instead of
dipping at the start of each new world (Frost Hollow, One-Way Streets,
Thorn Awakens, The Climb Begins — see `NOTES.md` for exact par changes).
*Stars:* the threshold formula is now slack-relative on worlds 3+
(`par + %age of (budget − par)`) instead of a flat `par+2`/`par+5` for
every level, fixing star bands that were generous early and punishingly
tight late (Icebound Vault's 1-star band was a single move); all 65
levels re-audited for degenerate star tiers. Worm's End's move budget cut
from 40 to 31 so the first finale threatens. *Controls:* the move queue
is capped at one buffered swipe (was three) to match the "one input is
precious" design; Play now jumps straight to the frontier level, with a
new secondary "All Levels" button for the map. *UI:* a live star-pace
countdown on the in-game HUD ("3★ in 12"); Score removed from the win
card (no purpose beyond itself) with Moves as the sole hero stat; a
first-ever level clear now correctly gets the "New Best" badge; Wally &
Pip story beats can be replayed from Settings instead of being lost
forever on a skip; a failed music load now retries instead of giving up
permanently. *Flavor art:* themed CSS backgrounds (no new art assets)
now fill the open space around the path and the board on the level-map
and in-game screens, one recipe per world. *Fixed:* a dangling CSS
selector that mis-positioned the undo-counter badge outside of reduced-
motion mode. No rule changes beyond the four redesigned levels: all 65
levels still replay to a win through the real UI, verified end to end
(including all 11 story beats, in order, with zero console errors) after
every change in this round. See `NOTES.md` for the full writeup,
including what was deliberately left for a follow-up pass (a handful of
Worm's Summit-region levels still repeat a "corridor of tricks" shape
rather than teaching one idea each).

v17 (Sep 27, 2026). A level-*design* pass, not just a numbers pass: a
detailed puzzle-design review found that several early levels (and the
four "corridor of tricks" Worm's Summit hallway levels flagged as a
follow-up in v16) were technically distinct but not actually harder,
because their true optimal solve never forced a real decision — the
nearest apple was always correct, every tile offered was already on the
shortest path. Fixed with three reusable patterns, documented in
`LEVEL_DESIGN_PLAN.md` §9: **the deferred apple** (a dead-end spur you
must save for last — `Golden!`, `No Going Back`), **the sealed wing** (a
one-way gate or single-use bridge that permanently strands an
easy-to-miss apple if you cross before grabbing it — `Sealed Passage`,
`High Pass`), and **the ice overshoot** (the obvious ice crossing dumps
you onto a rotten tile; a different approach lands safely — `Slide of
Peril`, `Thorn Gauntlet`). Twelve levels redesigned in total (L4, L6, L7,
L9, L10, L16, L18, L19, L20, plus all four Summit hallway levels); three
more (L2, L8, L11, L12, L13, L15) got a straight budget tightening only.
Every redesign was checked against the solver's *actual* optimal path, not
just the intended one — this caught two pre-existing bugs where a level's
namesake mechanic was pure decoration (L10's interior maze and L16's ice
were both unused by the true optimal solve before this pass; L64
"Ascent"'s patrol-guarded corridor had a free edge column bypassing the
hazard entirely). All fixed. Tutorial/intro cards were rewritten where
needed so they hint at the new trick without previewing exactly where the
fork is. No changes to the engine, UI, or any level outside this list; all
65 levels still replay to a win through the real UI end to end, all story
beats fire in order, zero console errors.

v18 (Sep 27, 2026). Three cheap, fully-diagnosed fixes from post-v17
review feedback (see `NOTES.md` for the full item list, including what's
*not* actioned yet). *Level data:* the World 5 opener sawtooth — Portal
Basics (L22, par 3→8), Arrow to Portal (L23, par 5→10), Slide to the Gate
(L28, par 3→8) — fixed the same way the v16 World 4/6/7 openers were.
Arrow to Portal's old grid also turned out to let the true optimal path
skip its own arrow entirely (the same decorative-trick-tile bug class v17
named), fixed alongside the resize. *Fail cards:* now name the pattern
instead of just the result — a dead-end trap says "Nothing comes back out
of a dead end," a rotten tile hit mid ice-slide says "Ice doesn't stop for
a second thought," patrol leads with "It steps when you step" — verified
through the real browser via forced-loss sequences on four different
levels, not just read off the code. *Tests:* two `test_engine.js` probes
that had drifted from the v17 grids (and were passing by coincidence
rather than actually checking anything) now derive their expected values
dynamically instead of from a hardcoded pre-redesign solution. No engine
or UI changes beyond the fail-card copy; full regression clean (degeneracy
audit, 88/88 `test_engine.js`, and a full 65-level Playwright playthrough).

v19 (Sep 27, 2026). Playtest prep plus three technical wins - no level data
touched. `PLAYTEST_GUIDE.md` (new) is a ready-to-run guide for a blind human
playtest, the open item everything else this pass hedges against rather
than replaces. *Accessibility:* the fail-card's lose-reason text now sits in
an `aria-live="assertive"` region so VoiceOver/TalkBack get "Nothing comes
back out of a dead end" instead of silence. *Audio:* the background music
went from a 2.5-minute stereo file (~55MB decoded in memory) to a
45-second mono clip (~8MB decoded); the loop point is an engineered fade to
silence rather than a by-ear-verified seamless crossfade, since there was no
way to listen to it - flagged for a check during the playtest. *Sharing:*
`?level=N` now opens that level directly with a "shared puzzle" chip, skips
the story beat, and - the part that took the real engineering - never
writes any of that session's progress into the visitor's own save, even if
they win, background the tab, or close it mid-play; verified with a
Playwright test that actually plays a level to a win via real input and
diffs `localStorage` throughout. See `NOTES.md` for the full writeup.

Built September 2026.
