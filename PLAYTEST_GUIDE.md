# WORM — Blind Playtest Guide

## What this answers

Every level-design fix since v17 has been verified against the solver:
the trick tile is genuinely on the optimal path, greedy diverges from
optimal, the level isn't degenerate. None of that proves the trick is
*findable*, or that finding it (or missing it) feels clever rather than
unfair. That's the one open question blocking two decisions:

1. Do L17 and L14 actually need touching, or are they fine as a breather?
2. Is it safe to apply the same three patterns (deferred apple, sealed
   wing, ice overshoot) to worlds 5-7, or would that be one dead end too
   many stacked on an early game that's already carrying L4, L9, L10,
   L16, L19?

This isn't a bug hunt. There's nothing to "pass" or "fail." The job is to
watch one real person hit these levels cold and see whether the moment
they get stuck reads as *"oh, clever"* or *"come on, seriously?"*

## Who to get

Someone who has never seen WORM, ideally not a puzzle-game regular
(the target player is "cozy game" audience, not speedrunners). One
person is enough for a first read; three is enough to stop guessing.
Don't coach them. Don't explain the tail-trail rule beyond what the
in-game intro cards already say. If they ask "wait, how does the ice
work again," that's data — it means the card didn't stick, note it and
let them re-read it themselves rather than explaining verbally.

## Session 1 — organic playthrough (the one that matters most)

Give them the published link, on a phone if possible (that's the real
target device). Let them start from Level 1 and just play. Don't jump
ahead, don't skip the story cards unless they choose to. Sit somewhere
you can see the screen and hear their reactions, but don't narrate or
hint.

Play through at least L1-L20, ideally into the low L20s so the World 5
opener fix (L22/L23/L28) gets seen too. That's roughly 20-30 minutes for
a first-timer.

**Watch closely at these levels** — for each one, the question is the
same: *did they get stuck, and if so, did they recover with an "aha" or
just brute-force/undo their way through without ever feeling like they
learned something?*

| Level | What's being tested | A good sign | A bad sign |
|---|---|---|---|
| L4 "Golden!" | First deferred-apple puzzle, 4th level in | They try the spur first, get trapped, laugh/say "oh," restart and get it in one more try | They get trapped, look confused about *why*, need several blind restarts before it clicks — or never really understands why, just eventually stumbles into the right order |
| L9 "Combo Meal" | Not a trap (control level) — should feel like a fun combo puzzle, not a wall | Any reaction other than "why is this here" — it's meant to be easier than its neighbors | If they specifically comment this one feels *pointless* or *too easy* after L4/L7, that's useful too |
| L10 "No Going Back" | Same deferred-apple pattern, slightly bigger — tests whether L4 actually taught the lesson | They apply what L4 taught them and get it faster than L4 | They fall into the exact same trap the same way, meaning L4's lesson didn't transfer |
| L16 "Frost Hollow" | First ice mechanic + a real trap combined | Confusion is fine here — it's the ice tutorial, first exposure to a new rule. Watch whether the intro card was enough or they needed to fail once to understand the slide | Fails and STILL doesn't understand why after reading the card again |
| L19 "Slide of Peril" | Ice overshoot onto rotten | A restart with an "oh, I get it, the ice doesn't stop" reaction | Frustration that reads as "I couldn't have known that" rather than "I should've seen that coming" |
| L22/L23/L28 | World 5 opener smoothing (new this pass) | These should feel like a normal, unremarkable difficulty ramp — nothing to comment on is a *good* result here | Any "wait, why did it suddenly get easy/hard again" comment means the smoothing didn't work |

**Also just generally note:** where do they put the phone down / say
"I'll finish this later"? That tells you more about pacing than any
single level does.

## Session 2 — targeted check on L46 (optional, separate sitting)

L46 "Sealed Passage" is deep in the campaign (Nightshade Grove, world 6
of 7) — getting there organically means playing 45 levels first, which
isn't practical for a quick read. Two ways to test it anyway, in order
of preference:

1. **Best:** if a session-1 tester is willing to keep playing across
   multiple sittings, just let them reach it naturally eventually and
   note the reaction then. Most honest result, slowest to get.
2. **Practical:** open the published link with `?debug` on the end of
   the URL, then in the browser console run
   `WormDebug.startLevel(45, true, {})` to jump straight to L46 (it's
   the 46th level, index 45). Tell the tester nothing else. This skips
   the natural buildup (they won't have just come from L45's difficulty
   or built up campaign-long pattern-recognition), so treat the result
   as a weaker signal than session 1 — useful for "is this an outright
   dead end nobody would ever find," not for "does the pacing feel
   right leading into it."

Watch for the same thing as L4/L10: do they eat the apple tucked behind
the wall notch before or after going through the one-way gate, and if
they go through first and get stuck, is their reaction "oh, that's on
me" or "that's not fair, I never even saw that apple"?

## What to actually write down

Nothing formal. A sentence per flagged level is enough:

```
L4:  restarted twice, second time said "wait, save the far one for last"
     out loud before doing it. Felt earned.
L10: got it on the first try without hesitating - L4 taught it.
L16: failed once on the ice card, re-read it, got it. Fine.
L19: restarted, muttered "of course," moved on. Good sign.
L22: no comment, just played through. Good (boring is the goal here).
L46: never came up in this session (didn't reach it).
```

That's the whole deliverable. Bring it back and it directly answers the
two open decisions above — no further analysis needed on this end.

## What the result changes

- **If L4/L10/L16/L19 mostly land as "clever":** worlds 5-7 hallway
  repetition is clear to fix using the same three patterns, and L17/L14
  can likely stay as deliberate rest beats rather than something to fix.
- **If they land as "annoying" more than once, especially back-to-back:**
  hold off on adding more forks to worlds 5-7 until the existing ones are
  softened first (bigger budgets, an extra hint in the intro card, or in
  the worst case reverting one of the softer redesigns like L9 back
  toward its old shape isn't off the table).
- **Either way**, World 8 stays exactly what it already is — ending copy,
  not a build — until this comes back clean, per the existing note in
  `NOTES.md`.
