# WORM — Product & Growth Feedback

Feedback logged for future action. **Nothing in this file has been
implemented yet** — this is a holding pen for product/growth/marketing
notes, kept separate from `NOTES.md` (playtest/engineering findings) and
`LEVEL_DESIGN_PLAN.md` (puzzle-design technique) because it's a different
category of work: onboarding, sharing, retention, tone, and go-to-market,
not level content or code.

Received Sep 27, 2026, in two batches (numbered independently within each
— batch 2 is a separate pass, not a continuation of batch 1's numbering).
Recorded close to verbatim so nothing gets lost in paraphrase; light
headers added for navigation only.

# Batch 1

## 1. Make the first 90 seconds famous
The home art and "Get Your Wiggle On" are strong. The hook still hides
behind Play.
- One silent 8-12s loop: Wally walks a tiny deferred-apple board, eats the
  wrong apple, seals the spur, shrugs. No UI chrome. That's the trailer
  and the store GIF.
- First session goal: clear L4. That's the first real decision. If someone
  quits at L3 they never felt the game.
- Don't put a story wall before the first swipe. Intro after the first
  apple is already the right instinct — keep it.
- Online hits in this genre (Golf Peaks, Water Sort-adjacent puzzles, Mini
  Motorways) sell a verb you can mime. "Your tail never leaves" is that
  verb. Show it failing, not succeeding.

## 2. Share a board, not a score
Score on the win card was correctly removed. Sharing still needs an
object.
- Level codes for the 65 campaign boards plus a tiny daily seed
  (`WORM-4G7K`). One screen: grid as emoji/ASCII + "I 3★'d this in 12."
  Fits in a post.
- After a 3★, optional ghost path you can export as a 3-second looping
  take (head + fading tail). People share clips, not star counts.
- "Stuck on L10" is a better community prompt than a leaderboard. A single
  official account posting one board a week will outperform a global
  ranking.
- Avoid live PvP and time attack. They punish the pause the puzzle wants.

## 3. Daily that respects the solver
A rotating 6×6, 2-3 apples, one mechanic, 8s solver cap. If the search
truncates, don't ship that seed. Same pipeline you already trust.
- Streak is fine; energy/lives are not. Miss a day, lose the streak, keep
  the campaign. That's how Wordle-shaped games stay welcome instead of
  extractive.

## 4. Hats need a story people repeat
Wardrobe is built. It's currently a star dump. Online, cosmetics spread
when they're jokes or flexes with a sentence:
- World mastery hat: all 3★ in Nightshade → thorn-bud cap. People
  understand that sentence.
- Seasonal already exists — lean into calendar (Halloween, first frost)
  with a one-week board, not a shop.
- One secret hat from a tap easter egg (five giggles, butterfly still on
  him). Streamers find those.
- Don't add a currency. Stars → hats is clean.

## 5. Failures should teach in one line
You already have lose reasons. The card can say the pattern, not the
cell:
- trapped + last tile was a spur entrance → "Nothing comes back out of a
  dead end."
- rotten mid-slide → "Ice doesn't stop for a second thought."
- patrol → "It steps when you step."

That's how a hard game feels fair in clips and in Discord. v17's forks
only pay off if the fail names the fork class.

## 6. The mid-campaign still sags as content
L22 / L23 / L28 are still par-3 demos after a real Frost finale. Online
drop-off isn't at L4 anymore; it's "new world, baby puzzles again."

Same three patterns, applied to Tunnel openers, will do more for reviews
than World 8. Reviewers bounce when difficulty sawtooths. You already
wrote that lesson in v16-v17. *(Cross-reference: this is the same World 5
opener sawtooth already logged in `NOTES.md`'s v17 review-feedback
section — same bug, product framing here, engineering framing there.)*

## 7. Technical bar people notice without knowing why
- Installable PWA (icons, standalone, splash you already have). "Add to
  Home Screen" is how a web puzzle becomes a phone game.
- Music: the 55MB decode is the one thing that will feel cheap on a mid
  phone. A 45s mono loop is an upgrade, not a downgrade. *(Done in v19: now
  a 45s mono clip, ~8MB decoded. The loop point is an engineered fade to
  silence rather than a verified-by-ear seamless crossfade - flagged for an
  ears-on check during the playtest, since it was cut without being able to
  listen to it. See `NOTES.md`'s v19 entry.)*
- First paint without waiting on BGM — you started this; keep music fully
  lazy.
- A public `?level=10` link that opens that board. That's how a tweet
  becomes a session.

## 8. Tone is the moat — protect it
Wally's idle bits, Pip's short beats, one undo, no timer. That's why it
can be hard and still cozy.

Things that would make it "just another puzzle site":
- interstitial ads, lives, daily login chests
- a hint button that plays the next solver move
- weekly difficulty FOMO
- a second protagonist or lore dump

Eleven story beats is enough. The ending already teases the far valley —
that's DLC/World 8 copy, not a new cutscene stack.

## 9. A simple public quality promise
Ship a one-page "how we make levels": solver-verified par,
decorative-mechanic audit, no unverified daily. That reads as craft in a
feed full of generated sliders. You already do the work; naming it is
marketing.

# Batch 2

Received as a reaction to v18's new fail-card copy specifically (opens by
pointing at "Nothing comes back out of a dead end" as the actual hook, not
"cozy"). Numbered 3-9 as received; whatever this batch's own sections 1-2
were, they arrived before this file captured them and aren't reconstructed
here — everything from the received "That's the tweet..." opening line
onward is verbatim below.

**The hook, restated:** "That's the tweet, the itch tagline, the
og:description, the first line of a press kit. 'Cozy' is the aftertaste,
not the hook." Ship a 4-file press kit: that line, the 12s fail-the-spur
loop (from batch 1 §1), one still of Nightshade, one sentence on the
solver ("every par is machine-checked; decorative mechanics are treated
as bugs").

## 3. Completionism without a battle pass
You already have stars and hats. What's missing is a sentence people can
finish.
- World plaques on the map, not just a star total. "Nightshade 45/45" is
  a flex. "142/195 stars" is homework.
- No-undo medal per world, recorded silently. Don't put it on the HUD.
  Announce it once on the world-clear card. That creates a second
  playthrough without a New Game+.
- Par medal (clear at or under par) is better than a timer. It uses a
  number you already show.

Do not add a hint button that plays the next solver move. That would be
the fastest way to make the game feel generated.

## 4. Ghosts, not leaderboards
After a 3★, offer "leave a ghost." Next visitor on that device (or that
shared `?level=` link) sees a faint trail. No names, no ranks, no server.
It's the Mini Metro / Golf Peaks version of social — proof a human was
here — and it works offline.

A global leaderboard would make L65's 3-move slack feel like a speedrun
tax. Don't.

## 5. Make ?level= do the whole job
You already have the URL idea. Finish it:
- `?level=10` starts that board, skips story, shows a "this is a shared
  puzzle" chip, and does not unlock campaign progress. Sharing L46
  shouldn't skip someone to Nightshade. *(Done in v19 - see `NOTES.md`.)*
- `?daily=2026-10-31` for the solver-gated daily. *(Not done - depends on
  the daily mode itself, §3 of this batch 1, which doesn't exist yet.)*
- og:image generated or hand-made per world so Slack/iMessage unfurls a
  board, not the home painting. *(Not done.)*

That's how a tweet becomes a session without an account system.

## 6. Accessibility as a review bullet
You're closer than you think: reduced-motion, no color-only portals
(shape-coded), swipe and WASD, one-undo.

Add three cheap things reviewers mention:
- A high-contrast tile outline toggle (ice vs grass is the weak pair).
- Announce lose reason to aria-live so VoiceOver gets "Nothing comes back
  out of a dead end," not just "Stuck." *(Done in v19: `#fail-title`/
  `#fail-sub` now sit in a `role="alert" aria-live="assertive"` region, and
  the reveal order was fixed so the text change happens after the modal is
  visible, not before. See `NOTES.md`'s v19 entry.)*
- Color-blind preview of the current board in Settings — one extra canvas
  pass.

"Works with VoiceOver and a keyboard, no account" is a rare line in this
genre.

## 7. Session shape after the campaign
65 levels and you're done is a Steam problem, not a web problem. After
the ending beat:
- Daily (already specified in §3 of batch 1).
- New Game-minus: campaign again, but hats persist and no-undo is on by
  default. Pip's line: "Same gardens. Shorter patience."
- One weekly official board posted as a `?level=` link, not a live event.
  Miss it, it's still in an archive list. No FOMO chest.

World 8 stays DLC copy in the ending. Don't build it until L4/L10/L16/L46
survive a blind phone playtest — that's still the open item in `NOTES.md`.

## 8. Cut the one thing that will get a mid-phone review
The 55MB stereo decode. A 45-second mono loop is not a downgrade; it's
the difference between "polished" and "why did my tab hitch." Lazy-load
is started. Finish it. Reviewers won't name the file size. They'll say
the game felt heavy. *(Done in v19 - see `NOTES.md`. Lazy-load was already
in place; this just shrank what gets decoded.)*

## 9. Don't add
Multiplayer, energy, a hint that plays solver moves, a second mascot,
weekly difficulty FOMO, user-generated levels that skip the solver, or a
shop. Those are how this becomes "a puzzle site."

**If you only ship three more product things this month:** itch page +
the one-sentence hook, `?level=` that doesn't leak campaign unlocks, and
world plaques + no-undo medals. Everything else is amplification of a
game that's already built.

**The remaining design debt that still hurts "top online" more than any
of the above** (reconfirms what's already logged in `NOTES.md`'s v17
review-feedback section, not new): L17 is still a one-note rest, L14 is
now the easy kid in a hard class, and Worlds 5-7 still reuse the hallway
shape outside the four rebuilt in v17. Reviewers bounce on sawtooth and
repetition, not on missing dailies.
