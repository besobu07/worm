# WORM — Running Notes

Playtest findings and their status. Newest first within each section.

## Source of truth (read this first)
- **As of v19 (Sep 27, 2026), this package — and the published Artifact
  built from it — is the only version being played or shipped.** The
  earlier Muse live build is no longer part of the workflow; there is
  nothing left to reconcile or merge against it. The "Merge checklist for
  the live build (v14)" below is kept only as history, in case that build
  is ever revived.
- **This package is the full front end**: every screen, the polished UI,
  haptics, swipe-only controls, undo, and the full Wally & Pip storyline.
- <details><summary>Merge checklist for the live build (v14) — historical, Muse is no longer in use</summary>

  - **Saves:** v14 adds fields to the save object: `music`, `haptics`,
    `reduceMotion`, `hat`, `seasonal`, `mapFrontier`, `coached`, and
    `resume` (the in-progress level as a move string plus undos used).
    The server-side save should store the whole object, or these settings
    and the resume-where-you-left-off feature will be per-device only.
  - **Undo:** v14 has its own undo (one per level, with a rewind
    animation, a counter on the button, and "Undo last move" on the fail
    card). Keep one undo system, not two. v14's is the fuller one.
  - **Music/art paths:** set `window.WORM_ASSETS = { music: <hashed
    url>, homeArt: <hashed url> }` before `app.js` loads, instead of
    editing the code. CSS/HTML references are normal url()/href and get
    rewritten by the bundler.
  - **Storyline:** now in the package (`story.js` + the story modal in
    `app.js`). Keep one copy, not the live one and this one side by side.
    Copy and keys are verbatim; `save.storySeen` has the same shape the
    live server's `story_progress` table expects, so the server sync just
    needs to include it. Two deliberate changes: the finale now fires
    before Level 65 (index 64), not Level 15; and keyboard shortcuts work
    on the story card (the live `openModal()` list missed `modal-story`).
    The live helpers `drawLadybug()` and `.flower-topper` weren't in the
    reference, so v14 has its own versions. Swap in the live ones if they
    should match exactly.
  - **Guards:** the background-input guard and the game-screen-only guard
    are the first checks in `inputDir()`. Keep both.
  </details>

## Test environment
- **Primary: iPhone, inside the Muse app's embedded browser view.**
  Not Safari or Chrome, but it uses Apple's WebKit engine (a WKWebView),
  so expect Safari-class behavior: strict rules about starting audio only
  from a tap, a ringer/silent channel that can mute audio, iOS gesture
  handling, etc.
- **Secondary: a computer at muse.ai**, in whatever desktop browser is
  being used.
- **Also: the shared test link** (a published page on claude.ai), for
  friends testing. Each player's progress lives in their own browser.
- Implications worth keeping in mind:
  - The host app, not the page, decides whether edge swipes navigate
    back in an embedded WebKit view, so the page can't always block it.
  - The page can't read which app it's running in, so any device-specific
    fix should be based on detected behavior, not a check for Safari.
  - Test fixes by emulating WebKit where possible, and treat the phone
    as the final check.

## Open

### v17 review feedback (received Sep 27, 2026 — partially actioned in v18)
Feedback on the v17 level-design pass. The three Tier-1 items (World 5
opener sawtooth, `test_engine.js` stale probes, and the fail-card copy
mitigation for the "adversarial" concern below) were actioned in v18 - see
the v18 changelog entry. Everything else here is still open. (Separately,
a batch of product/growth/tone feedback — onboarding, sharing, daily mode,
cosmetics, mid-campaign pacing, PWA/tech polish, tone guardrails, a public
quality promise — is logged in full in `PRODUCT_FEEDBACK.md`, not yet
actioned; its fail-message-copy item, §5, is the one exception, folded
into v18 alongside the matching concern below.)

**What's still soft**
- **Combo Meal (L9)** is better (rocks break the old 2×2) but still not a
  trap — greedy can match optimal there (already noted in v17's own
  writeup). Fine as a combo *showcase*, just don't expect it to be the
  difficulty spike for its slot — L10 is the spike.
- **Golden Detour (L14)**, left alone because its golden alcove is already
  last, is now comparatively one of the easier boards in its band since
  everything around it (L16, L18-20) grew real teeth this pass.

**Next identical bug** — ~~World 5 openers still sawtooth after Frost
Gauntlet~~ **fixed in v18** (see changelog: Portal Basics, Arrow to
Portal, Slide to the Gate).
- **Aim Before You Slide (L17)** is still a single "don't take the ice"
  beat — fine as a one-note lesson, but it now reads as an odd easy step
  sandwiched between the rebuilt L16 and L18.
- **Worm's Summit (L65)** still has almost no 1-star band (pre-existing,
  accepted exception, re-confirmed after v17). Don't reuse that same
  amount of slack on another finale — it was accepted once by deliberate
  design, not established as a template.

**Process nits** — ~~`test_engine.js` probes reference pre-v17
solutions~~ **fixed in v18**: the "green apple +1 move" probe now finds
the green apple's move index dynamically instead of assuming move 9 (it
had drifted to move 7 and the probe was passing by coincidence, exactly
the "pass for the wrong reason" risk flagged here), and "combo bonus" now
independently recomputes expected points per apple from
`Worm.APPLE_POINTS` instead of a hardcoded pre-redesign score. Both
verified to still exercise the real invariant (a genuine x4 combo chain
still exists after the redesign) rather than just silencing the check.
- **Intro cards for L7 and L19 sit right at the spoiler line** — close to
  naming the fork outright rather than just the flavor of mistake. Hold
  the line going forward: hint at the *kind* of mistake, never the
  specific cell/tile.

**Design-review follow-up, after reading §9 and the actual new grids
(Sep 27, 2026) — also not yet actioned**
- **The methodology is being called the real upgrade, not the individual
  levels.** Specifically: tracing the true optimal path to prove a trick
  tile is actually used, the greedy-vs-optimal divergence test, and
  naming "decorative trick tile" as a bug class. Framed as professional-
  grade design discipline that compounds — every future level benefits
  from having this check available, not just the ones redone this pass.
- **Early-curve concern: watch L4-L16 as a phone-playtest zone.** L4 is
  now a genuine deferred-apple puzzle at the *fourth* level of the game —
  budgets are generous enough to allow flailing, but the first-time
  experience is now "learn a real trick by level 4." Same concern applies
  to L10 and L16 (also real tricks, still early). Flagged for a real
  playtest, not a numbers fix.
- **Structural concern: solver verification proves a trick *exists*, not
  that it's *findable*.** The solver plays perfectly; humans don't. L46's
  sealed wing strands its apple forever on the direct route — one hard
  restart is fine for a puzzle game, but if *several* redesigned levels
  all punish the greedy route with dead ends back-to-back, the early game
  risks reading as adversarial rather than clever. Suggested fix is
  explicitly **not** more solver time — it's watching a fresh, blind
  player actually attempt L4, L10, L16, and L46 on the test link and
  seeing where they get the "aha" versus where they just get annoyed.
  **Partial mitigation shipped in v18** (this is a hedge, not a substitute
  for that playtest, which is still the real open item): fail cards now
  name the pattern instead of just the result — a dead-end trap
  specifically says "Nothing comes back out of a dead end," so even a
  hard restart teaches the lesson on the way out instead of just feeling
  like a wall. See the v18 changelog and `PRODUCT_FEEDBACK.md` §5, which
  asked for the same thing from the fairness-in-clips angle.
- **Scope honesty flagged on purpose:** this pass fixed the four named
  Summit offenders (L46/L49/L56/L64) plus L1-20. The broader worlds 5-7
  "shape repetition" (same sawtooth/hallway-shape family) is still out
  there beyond those four — consistent with the plan, but called out
  explicitly so it doesn't get mentally filed as "done."
- Reviewer is independently running their own verification pass (25+
  levels replayed through the real UI on the new solutions, clean so far)
  and will report results separately when finished.

## Resolved

### v19 (Sep 27, 2026)
Playtest prep plus the three "quick technical wins" approved alongside it -
no level data touched at all this round.

**Playtest guide written** (`PLAYTEST_GUIDE.md`, new file) - the operational
half of the still-open "solver proves existence, not findability" concern
above. Frames the two decisions it's meant to unblock (does L17/L14 need
touching; is it safe to extend the three named patterns to worlds 5-7),
names who to get and what to watch (L4, L9, L10, L16, L19, L22/L23/L28 as a
table of good-sign/bad-sign reactions), and a lightweight optional session 2
for reaching L46 via `?debug` + `WormDebug.startLevel(45, true, {})` without
playing 45 levels first. This is prep only - running it is still an open
item, not something this pass could do itself.

**Fail-card `aria-live` gap, fixed** (closes the confirmed gap noted in
`PRODUCT_FEEDBACK.md` batch 2 §6): `#fail-title`/`#fail-sub` are now wrapped
in a `role="alert" aria-live="assertive" aria-atomic="true"` region, so
v18's pattern-naming fail copy ("Nothing comes back out of a dead end," etc.)
reaches VoiceOver/TalkBack instead of sighted players only. Also reordered
`showFail()` so the modal is unhidden *before* the title/sub text is written
- setting the text first and revealing the modal after risks the mutation
happening while the region is still `display:none`, which some AT/browser
combinations won't announce. Verified all four fail-copy paths (dead-end,
rotten-direct, rotten-via-slide, patrol) still show the correct text via the
existing Playwright fail-copy test after the reorder.

**Background music memory, fixed** (closes the "Music memory (low priority)"
item above and `PRODUCT_FEEDBACK.md` batch 1 §7 / batch 2 §8): the bundled
2.5-minute stereo track decoded to ~55 MB of PCM in memory. Replaced with a
45-second mono clip (~8 MB decoded, 691 KB on disk vs. the original 3.5 MB).
Could not verify a musically seamless internal loop point by ear (no audio
playback available), so rather than gamble on a blind mid-phrase crossfade -
real risk of a beat-doubling artifact at the seam if the cut lands on the
wrong beat - the loop point mirrors the original file's own idiom: it ends
in a short engineered fade to near-silence (matching the natural ~2s fade
the original already used at its true end) rather than a hard cut or content
crossfade. Both loop edges (tail and head) were confirmed near-silent by
direct waveform inspection, and the swapped file was confirmed to actually
fetch and `decodeAudioData()` successfully in a real browser (Playwright),
not just via `ffprobe`. **Flagged for an ears-on check** during the human
playtest - this is a defensible blind edit, not a verified-pleasant one.
`audio/bgm-puzzle-path.mp3` is the only file touched; the original is kept
alongside the project's working files as `bgm-puzzle-path.ORIGINAL.mp3` in
case a real loop point ever gets identified by ear and re-cut properly.

**`?level=N` shared-puzzle deep link, implemented** (delivers the core of
`PRODUCT_FEEDBACK.md` batch 2 §5 - not the `?daily=` or og:image parts,
which are separate, unbuilt asks): `?level=46` opens level 46 directly,
shows a "Shared puzzle · your progress here isn't saved" chip in the HUD,
and skips the Wally & Pip story beat (which wouldn't make sense out of
campaign order) while keeping the level's own mechanic intro card, which is
often the only teaching a cold visitor gets for that trick. Out-of-range or
non-numeric `?level=` values fall back to the normal home screen rather than
erroring.
- **Isolation was the hard part, not the routing.** Blocking the obvious
  `persist()` call site isn't enough on its own: the in-memory `save` object
  still picks up the shared play's stars/best/unlocked/resume, and if the
  visitor later leaves the shared level and plays for real, an ordinary
  save afterward would silently write that shared session's progress out as
  if it had been earned normally. Fixed with a snapshot-on-entry,
  restore-on-exit pair (`sharedSaveSnapshot` / `restoreRealSave()`) around
  the whole `save` object, not per-field patching.
  - Caught the same way as this session's other bugs: wrote a Playwright
    test that actually *won* a shared level via real keyboard input (not
    the debug skip hook) and diffed `localStorage` before/during/after -
    the first version of the guard passed a naive "did anything write while
    the flag is set" check but still leaked into the *next* real save after
    leaving, exactly the bug the snapshot/restore exists to prevent.
  - Also verified the `pagehide`-triggered `persist()` call (window backgrounding
    or a tab close mid-shared-session) stays blocked - the guard lives inside
    `persist()` itself, not at each call site, specifically so a call site
    added later can't forget it.
  - Exit path: reaching the level map from a shared level (pause → Levels,
    or the fail card's Levels button - both already funnel through the one
    `goToLevels()` function) restores the pre-shared save and turns normal
    saving back on, so a visitor who decides to explore the real game from
    there saves normally from that point on.
- Full regression re-run clean after all three fixes: `test_engine.js`
  88/88 (engine-only, unaffected by these `app.js`-only changes, run for
  completeness), and a full 65-level Playwright playthrough through the real
  UI - all won, all 11 story beats fired in order, zero console errors.

### v18 (Sep 27, 2026)
The three Tier-1 items from the v17 review feedback: cheap, fully-diagnosed
fixes with no open design question, executed in one pass.

**World 5 opener sawtooth, fixed** (the "next identical bug" flagged at the
end of v17, same fix family as the v16 World 4/6/7 openers):
- **Portal Basics (L22, par 3→8)** — the very first portal touch was a
  trivial 3x3 board; given real size (still a single-concept, ungimmicked
  teach - no fork added) so it doesn't crater right after One-Way Streets.
- **Arrow to Portal (L23, par 5→10)** — the old grid let you reach the
  portal without ever passing the arrow, so the "combine the two things
  you just learned" level wasn't actually combining them (the same
  decorative-trick-tile bug class from v17 §9, caught the same way: traced
  the solver's real path and found the arrow unused). Rebuilt as a strict
  single-file corridor - arrow, then the portal, then an isolated pocket
  reachable only through it - so both are structurally mandatory.
- **Slide to the Gate (L28, par 3→8)** — same finding: the old apple
  placement let the true optimal path skip the ice+arrow interaction
  entirely by dropping straight down a free column. Rebuilt so reaching
  every apple requires the ice slide's arrow-forced stop. Deliberately
  kept gentle (greedy already matches optimal, no forced restart) - these
  are single-mechanic teaching levels, not trap levels, and the review
  feedback specifically flagged not wanting to compound hard traps in the
  early game.

**`test_engine.js` stale probes, fixed** - see the "Process nits" note
above for what changed in the "green apple +1 move" and "combo bonus"
probes and why. Full suite re-run clean: 88/88 (65 level replays + 23
probes).

**Fail-card copy now names the pattern, not just the result** (acts on
v17's structural concern above and `PRODUCT_FEEDBACK.md` §5 at once):
- **Trapped in a dead end** (the tile you're stuck on has at most one
  physically-open neighbor, ignoring your own trail - i.e. it only ever
  had one way in): *"Nothing comes back out of a dead end."* instead of
  the generic "Wally wiggled himself into a corner." Verified against
  Golden! (L4) played the wrong order (spur apple first) - correctly
  distinguishes this from a generic self-trap in open space, which still
  gets the old generic text.
- **Rotten reached mid ice-slide**: *"Ice doesn't stop for a second
  thought."* instead of the generic "Yuck." Verified both ways: walking
  directly into Rotten (L6)'s rotten tile still gets the generic message;
  sliding into Slide of Peril (L19)'s rotten via its ice band gets the new
  one. Detected by checking whether the tile immediately before the death
  was entered mid-slide (`e.slide` on the preceding move event), not by
  guessing from the reason alone.
- **Patrol**: reworded to lead with *"It steps when you step"* (was "The
  thorn got him. Watch its pattern...") - same lesson, matches the
  requested phrasing.
  All four paths verified end-to-end through the real browser (not just
  the engine) via forced lose sequences on Golden!, Rotten, Slide of
  Peril, and Marching Orders.

No level topology changed by the fail-card work itself (`app.js` only);
level-data changes are limited to the three named World 5 levels above.
Full regression re-run after both changes: degeneracy audit clean (same
accepted exceptions as v17, nothing new), and a full 65-level Playwright
playthrough through the real UI - all won, all story beats fired, zero
console errors.

### v17 (Sep 27, 2026)
A detailed puzzle-*design* review of L1-20, acted on in full, plus the four
"corridor of tricks" Worm's Summit hallway levels explicitly deferred at
the end of v16 (`Sealed Passage`, `Thorn Gauntlet`, `High Pass`, `Ascent`).
The finding: several levels were technically distinct (new mechanic, new
layout) but not actually harder, because their true optimal solve never
forced a real decision — the nearest apple was always correct next, every
tile on the board was already on the shortest path, and a tighter budget
just made an already-single route stricter rather than more interesting.
Full methodology and the three named patterns are written up in
`LEVEL_DESIGN_PLAN.md` §9; summary here.

**Redesigned (new fork/trap, solver-verified against the true optimal
path, not just against the intended one):**
- **Golden! (L4, par 8→12)** — ring corridor around a rock block with a
  dead-end spur; the golden apple is the far/first stop, the spur apple
  must be saved for last (the "deferred apple" pattern — see §9).
- **Rotten (L6, par 8→12)** — one added rock closes the old fully-open
  left-edge bypass that let the route ignore the rotten tile's neighborhood
  entirely; now the shortest path runs directly past it.
- **Green Thumb (L7, par 10→12, budget 17→19)** — narrow single-file
  corridor with two separated gates, so the green apple costs a genuine
  2-move detour instead of being absorbed for free by route flexibility.
- **Combo Meal (L9, par 7→9)** — broke the old symmetric 2×2 apple block;
  chaining the combo now requires routing past two rocks.
- **No Going Back (L10, par unchanged in spirit but grid rebuilt)** — same
  ring+spur shape as L4, at a slightly larger scale. The *previous* grid's
  interior "maze" was discovered to be entirely decorative (the old optimal
  path never touched it — a real pre-existing bug, not something the
  redesign introduced); the new grid actually uses its own maze.
- **Frost Hollow (L16, grid rebuilt, par unchanged at 16)** — the *previous*
  redesign's optimal solve never touched its own ice tiles at all, a
  serious bug for the game's first ice-tutorial level. Rebuilt so rushing
  to cross before mopping up the left-side apples genuinely seals you off.
- **Thin Ice, Deep Water (L18, par 6→8)** — two separate ice sheets over
  the river; only one lines up with the bridge, the other strands you at
  the water's edge. Intro card trimmed slightly so it hints at this without
  spelling out which sheet is the trap.
- **Slide of Peril (L19, par 4→8)** — two full-width ice rows over a bottom
  row holding one rotten tile and one apple (the "ice overshoot" pattern).
- **Frost Gauntlet (L20, board shrunk from 7×8 to 6×7, crates removed,
  par 27→15)** — the finale for World 4 was oversized relative to its own
  difficulty; shrunk to a tighter, still-genuine ice+rock+golden-detour trap.
- **Sealed Passage (L46, par 14→21)** — an apple tucked in a wall notch
  before the level's existing one-way gate; walking straight to the gate
  (the direct route) strands it forever (the "sealed wing" pattern). An
  initial attempt reused L4/L10's dead-end-spur shape directly and came
  back solver-`UNSOLVABLE`, because the spur apple wasn't the level's last
  apple — see §9 for why that pattern requires it to be.
- **Thorn Gauntlet (L49, par 14→17)** — reuses Slide of Peril's ice-
  overshoot shape ahead of the level's existing one-way/portal/patrol
  sequence.
- **High Pass (L56, par 16→20)** — a dead-end-spur ring at the end of the
  corridor, with a golden apple that must be grabbed before finishing the
  spur, not after.
- **Ascent (L64, par 25→26)** — the patrol-guarded "thorn's stretch"
  corridor near the end had a free edge column running alongside it the
  whole way down, so the true optimal solve skipped the patrol hazard
  entirely. Closed the column; the corridor is now the only way through
  (intro card updated to say so).

**Budget-only tightening (no layout change, per-level instruction):**
Two Bites (L2, 16→14), Crates (L8, 18→16), Lake Loop (L11, 17→15), Double
Trouble (L12, 21→19), The Gauntlet (L13, 20→18), Worm's End (L15, 31→27,
slack now 6 instead of 10 — the first real finale should threaten, not
coast).

**Left unchanged on purpose:** L1, L3, L5, L14, L17. L14 "Golden Detour"
was specifically checked (its existing design already saves the golden
alcove for the last two moves of the optimal solve) and needed no change.

**Verification:** every redesigned level's solver-true-optimal path was
traced move-by-move (including intermediate ice-slide tiles, which don't
show up as separate moves) to confirm its new trick tile is actually part
of the solution, not decoration — the same check that caught the L10 and
L16 pre-existing bugs above. Full degeneracy audit re-run across all 65
levels (no new 1-star/2-star dead zones introduced; the pre-existing
Worm's Summit/L65 zero-slack exception, unrelated to this pass, is still
present and still accepted). `levels.js` rebuilt from `levels_src.py`, and
a full 65-level Playwright playthrough replayed every level's solver
solution through the real browser UI: all won cleanly, all story beats
fired in order, zero console errors.

The three patterns (deferred apple, sealed wing, ice overshoot), the
greedy-vs-optimal divergence test used to validate each one, a proof that
a bare two-apple loop can never trap, and the "decorative trick tile" bug
class are all written up as reusable, named techniques in
`LEVEL_DESIGN_PLAN.md` §9 for the next level-design pass to reach for
directly instead of re-deriving from scratch.

### v16 (Sep 27, 2026)
Two feedback batches acted on in one pass: a UX/engineering review and a
design-and-level-content review (the latter citing this file and the
shipped v15 numbers directly).

**Difficulty & level data**
- **Four world-opener levels redesigned** so difficulty climbs linearly
  instead of sawtoothing at each new world's start (they were easier than
  the previous world's finale): Frost Hollow (L16, par 6→16), One-Way
  Streets (L21, par 4→12), Thorn Awakens (L36, par 8→16), The Climb Begins
  (L51, par 12→20). Verified none of these recreate the documented
  "2-deep gate + 2-waypoint patrol = unsolvable" trap.
- **Star-threshold formula redesigned.** It was a flat `par+2`/`par+5` for
  every level, which is generous on early levels and punishing on late
  ones (Icebound Vault's 1-star band was a single move). Worlds 1-2 keep
  the flat formula (it fits the short early levels fine); worlds 3+ now
  use a *slack-relative* formula: `star3 = par + ceil(slack*0.35)`,
  `star2 = par + ceil(slack*0.7)`, where `slack = budget - par`. This was
  chosen over the design plan's original "percentage of par" formula
  (`par*1.15`/`par*1.35`) after that version was found to make 1-star (and
  sometimes 2-star) mathematically unreachable on 16 levels, wherever a
  level's hand-tuned tight budget couldn't absorb a percentage of its
  (large) par. Slack-relative structurally guarantees a real 1-star band
  whenever there's any slack at all. `default_stars(idx, par, budget)` in
  `levels_src.py` implements this; per-level `star3=`/`star2=` overrides
  are still supported for the rare level that needs one.
- **Degeneracy audit run across all 65 levels** (no 1-star possible, or a
  1-move sliver, or no 2-star possible). Found 16 broken under the
  percentage-of-par draft, 3 after switching to slack-relative (fixed
  Green Thumb and Cold Snap with a 1-move budget bump each), 1 after that
  — Worm's Summit (L65), which has zero 1-star room by deliberate design
  (it carries the smallest slack in the game, 3 moves, on purpose). Left
  as an accepted exception, re-confirmed after every subsequent level-data
  change in this round.
- **Worm's End (L15) budget cut from 40 to 31**, not the literally-
  suggested ~28 — 28 would have reintroduced an unreachable star tier
  under the new formula. 31 gives 10 moves of slack, a real 1-star band,
  and an actual sense of threat for the first finale.
- Frost Hollow's in-game intro card and `LEVEL_DESIGN_PLAN.md` both now
  correctly state the shipped ice rule ("every tile you slide across
  joins your tail," not just the tile you stop on) — the plan had a stale
  line describing the rule that was never shipped.

**Controls & UI**
- **Move queue capped at 1 buffered swipe** (was 3). The puzzle is built
  on "one input is precious"; queuing several moves ahead let players
  commit blind. A rapid extra swipe while Wally is still resolving the
  previous one is now simply dropped rather than queued.
- **Play now starts the frontier level directly**; the level map is
  reached through a new secondary "All Levels" button next to Wardrobe on
  the home screen.
- **Live star-pace countdown** added to the in-game HUD ("3★ in 12"),
  next to the pips that were already dimming as moves are spent — the
  target number used to only appear after the level ended.
- **Score removed from the win card.** It had no purpose beyond itself
  (stars unlock hats, moves are the puzzle, score was just displayed) and
  crowded the one number that matters; Moves is now the sole, larger
  "hero" stat there. The live in-game HUD still shows a running score.
- **Fixed: a level's first-ever clear never showed the "New Best" badge**
  (the check required a *previous* best to compare against). Now a first
  clear counts as a new best.
- **Story-beat replay added.** Skipping a Wally & Pip beat used to mark it
  seen forever with no way back. Settings now has a "Wally & Pip's story"
  list of every beat seen so far, in order, that reopens it on tap.
- **Music 404 no longer fails silently forever.** It now retries after an
  8-second cooldown (e.g. on the next screen change) instead of latching
  `failed` permanently, and shows a toast with the error — only in a
  `?debug` build, never for real players.
- **Audited every mechanic** (ice, teleports, thorn, rotten apples,
  one-ways, patrols) against its intro card: all of them are taught the
  moment they're introduced. The two cases that looked new were just new
  arrow-orientations of an already-taught rule.
- **Flavor art added** behind the level-map and in-game screens, filling
  the open space around the path and the board with a themed backdrop
  per world (soft cloud glow for Garden Path, ripples for Riverbank,
  dusk-glow blobs for Orchard, sparkle flecks for Frost Hollow, glowing
  crystal flecks for Tunnel Warrens, eerie purple/pink blooms for
  Nightshade Grove, aurora bands + a mountain silhouette for Worm's
  Summit). Pure CSS (`radial-gradient`/`clip-path`), keyed off a
  `data-theme` attribute `applyScreenTheme()` now sets — no new art
  assets. Uses the same background-layering pattern as the home screen
  (`::before`/`::after` at z-index:0, real content forced to z-index:1
  above it). **Caution for future edits:** don't add a bare `position`
  rule on `#screen-levels`/`#screen-game` themselves — an ID selector
  outranks `.screen`'s class selector and will silently override its
  `position:absolute`, breaking the full-screen layout (hit this once
  while building the feature; the pseudo-elements don't need it, `.screen`
  already provides the positioning context).
- **Fixed a real, shipped CSS bug**, not just a leftover splice: a
  dangling `body.rm` token sat in front of the undo-counter badge's
  positioning rule, so `#game-undo{position:relative}` only applied in
  reduced-motion mode. In normal mode the badge was very likely
  mis-anchored to the whole screen instead of the undo button. Removed
  the stray token so the rule always applies.

**Deliberately not done this round**
- Worlds 5-7 still repeat a fixed "introduce, pair, stack, gauntlet"
  shape in several levels (named: High Pass, Sealed Passage, Thorn
  Gauntlet, Ascent). The fix is new level *design*, not a formula or a
  bug, so it's being held for its own pass rather than rushed in here.
  The four short levels that already teach a single new idea well (Aim
  Before You Slide, Slide of Peril, Portal Past the Sentry, Icebound
  Vault) are the template to build more of.
- Full regression: re-ran the solver's degeneracy audit and a genuine
  65-level Playwright playthrough (real win → `nextLevel()` flow, not
  forced level-jumps) after every change in this round. All 65 levels
  solve cleanly with the solver's verified solutions, all 11 story beats
  fire in the correct order, zero console errors.

### Confirmed on the phone, in Muse (Sep 27, 2026)
- **Swiping out of the game:** the v14 mitigations (armed back-guard,
  board edge gutters, touch capture) hold up inside Muse's embedded view.
  Swiping to move Wally no longer exits the app.
- **iPhone haptics:** the hidden-switch tick trick works inside Muse's
  WebKit view. Both marked verified, not just "should work."

### v15 (Sep 27, 2026)
- **Dirt puffs toned down:** the per-step `puff()` burst (fires on every
  non-slide move) went from 5 particles to 3, smaller, shorter-lived, and
  with a narrower/gentler kick. The idle dirt-ball juggling animation
  wasn't touched — only the per-step one was reported as "a bit much."
- **Story finished:** four new Pip beats open each of the later worlds
  (`world4` "Into the Frost" after L15, `world5` "Underground" after L20,
  `world6` "Thorn Country" after L35, `world7` "The Summit" after L50),
  plus a real `ending` beat ("The Golden Apple Tree") after the Level 65
  win — Wally actually reaches the tree now. The finale card's line was
  also reworded away from "all in one garden" (it plays right before a
  mountaintop level). The story vignette now paints a different backdrop
  per world (frost/tunnels/nightshade/summit palettes, matching the
  in-game `WORLD_THEMES`) instead of always showing the garden lawn.
  Verified end to end: a full real playthrough (through the actual win →
  `nextLevel()` flow, not a forced level-jump) shows all 11 beats firing
  in the correct order with no console errors.
- **Level data nits fixed:** L61 "Icebound Vault" (this was L61, not L63 —
  corrected while fixing it) now has an explicit `star2: 16` override, so
  a 1-star finish is possible again (was: budget 17, star2 18, so any win
  got at least 2 stars). L59-L63's intro kicker was "Nightshade Gauntlet"
  (the previous world's name); it's "Combining Tricks" now, matching the
  other Worm's Summit levels around them. `levels_src.py`'s star-threshold
  code now supports a per-level `star2`/`star3` override for future levels
  that need one.

### v14 (Sep 27, 2026)
- **Restored:** home screen artwork and swipe-only controls.
- **Undo** brought into the package with the live rule (one per level).
- **Wally & Pip storyline** ported; finale re-pointed to Level 65.
- **README corrected:** haptics and the polished UI are in this package
  (the old note listed them as live-only).
- **Music follow-ups:**
  - The mp3, artwork and fonts are now readable by any web server (644).
  - Pausing or leaving the app suspends the audio context, so the track
    holds its place instead of restarting from 0:00.
  - Music can no longer start while the app is hidden.
  - Music has its own on/off switch, separate from sound effects.
  - The README says to serve the folder for music.
- **Background-input guard** and the **game-screen-only guard** are both
  still the first checks in `inputDir()`.

### v13 (Muse)
- Background music routed through the same WebAudio path as the sound
  effects. Fixed the "sound effects but no music" problem on iPhone.
