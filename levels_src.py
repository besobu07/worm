"""WORM level definitions + solver.

Tile legend:
  .  grass        #  rock        C  crate
  ~  water        =  bridge      S  worm start
  a  red apple    g  golden      n  green       r  rotten (avoid!)
  I  ice - entering it keeps sliding you in the same direction (still
     eating apples / dying on rotten along the way) until you leave the
     ice or hit something. A whole slide is one input and one move.
  ^v<>  one-way tile - only enterable while moving in the direction the
     arrow points; approached from any other direction it's as solid as a
     wall. Behaves like plain floor once you're standing on it.
  1-4   teleport pad - each digit must appear at exactly two positions in a
     level's grid. Entering either one instantly warps the head to its
     partner (both endpoints join the trail); the hop always ends the move
     there - it never chains into an ice slide or another teleport.
  T  patrol hazard start (cosmetic only) - a level with a `patrol` field
     (an ordered list of [r,c] waypoints) has a hazard that ping-pongs back
     and forth along that list, advancing one waypoint per player input
     (never per tile within a slide). Walking into its current cell, or
     having it step onto your new position, is instant death. 'T' on the
     grid is just a visual marker for level authors of where it starts;
     the `patrol` list is what actually drives it.
"""
import json, math, os, sys, time

# World reskins: (first level index this world starts at [1-based], world name,
# theme id used by app.js's WORLD_THEMES). Every level from that index onward
# belongs to this world until the next breakpoint.
WORLD_BREAKS = [
    (1, "Garden Path", "garden"),
    (6, "Riverbank", "riverbank"),
    (11, "Orchard Dusk", "orchard"),
    (16, "Frost Hollow", "frost"),
    (21, "Tunnel Warrens", "tunnels"),
    (36, "Nightshade Grove", "nightshade"),
    (51, "Worm's Summit", "summit"),
]

def world_for(idx):
    w = WORLD_BREAKS[0]
    for brk in WORLD_BREAKS:
        if idx >= brk[0]: w = brk
    return w[1], w[2]

LEVELS_SRC = [
dict(name="First Bite", intro=("Welcome to WORM!", "Move",
    "Swipe to wiggle one square at a time. Eat every apple. "
    "Your tail NEVER disappears, so plan ahead!"),
 grid=[
 "S...",
 "....",
 "....",
 "...a",
 ]),

dict(name="Two Bites",
 grid=[
 "S....",
 ".....",
 "..a..",
 ".....",
 "....a",
 ], budget=14),  # tightened -2: same layout, less wander-and-still-3-star

dict(name="Rock Garden", intro=("New Mechanics!", "Rocks",
    "Rocks block your path. There's always a way around - find it!"),
 grid=[
 "S....",
 ".###.",
 ".....",
 ".###.",
 "a...a",
 ]),

dict(name="Golden!", intro=("New Mechanics!", "Golden Apples",
    "Golden apples are worth +500 points, but they hide where the route is tricky. "
    "The nearest apple isn't always the one to eat first. Plan the whole trip!"),
 grid=[
 "S....",
 ".###.",
 ".#a#.",
 ".#.#.",
 "....g",
 ]),

dict(name="Bridges", intro=("New Mechanics!", "Bridges",
    "Some tiles can only be crossed once. The river is deep - the bridge is your only way across. Plan your path!"),
 grid=[
 "S.....",
 "......",
 "~~=~~~",
 "......",
 "....a.",
 "......",
 ]),

dict(name="Rotten", intro=("New Mechanics!", "Rotten Apples",
    "Don't eat it. One bite and it's game over. Route around the stink!"),
 grid=[
 "S....",
 ".....",
 "..r..",
 "#.#..",
 "a...a",
 ]),

dict(name="Green Thumb", intro=("New Mechanics!", "Green Apples & Moves",
    "Green apples add one extra move to your worm. Every level has a move budget - "
    "run out and it's game over! This one's tucked off the direct route, so it costs "
    "a real detour, not a freebie."),
 grid=[
 "S....",
 "##.##",
 ".....",
 "##.##",
 ".n...",
 "#.#.#",
 "....a",
 ], budget=19),

dict(name="Crates", intro=("New Mechanics!", "Crates",
    "Crates are just as solid as rocks. Wiggle around them!"),
 grid=[
 "S.....",
 ".CC...",
 "......",
 "...CC.",
 "......",
 "a....a",
 ], budget=16),  # tightened -2: same layout, less wander-and-still-3-star

dict(name="Combo Meal", intro=("New Mechanics!", "Combos",
    "Eat apples close together to build a COMBO. Chain them for big bonus points - "
    "but you'll have to route past a couple of rocks to keep the chain alive."),
 grid=[
 "S.....",
 ".a.a..",
 ".##.#.",
 "......",
 ".a.a..",
 ]),

dict(name="No Going Back",
 grid=[
 "S....",
 ".###.",
 ".#a#.",
 ".#.#.",
 ".....",
 "....a",
 ]),

dict(name="Lake Loop",
 grid=[
 "S.....",
 ".~~~..",
 ".~=~..",
 ".~~~..",
 "......",
 "..a.a.",
 ], budget=15),  # tightened -2: same layout, less wander-and-still-3-star

dict(name="Double Trouble",
 grid=[
 "S...#.",
 "..#...",
 ".a.#a.",
 "..#...",
 ".r....",
 "g.....",
 ], budget=19),  # pulled to par+5: keep the structure, tighten the finish

dict(name="The Gauntlet",
 grid=[
 "S..#..",
 ".#.#..",
 ".#...a",
 ".###..",
 ".....#",
 "a..#..",
 ], budget=18),  # pulled to par+5: keep the structure, tighten the finish

dict(name="Golden Detour",
 grid=[
 "S.....",
 ".###..",
 ".#ga..",
 ".###..",
 "......",
 "a....a",
 ]),

dict(name="Worm's End", intro=("Final Garden!", "Everything",
    "Every trick you've learned, all in one garden. Good luck, little worm."),
 grid=[
 "S......",
 ".#####.",
 ".a.....",
 ".#####.",
 "...=...",
 ".~~~~~.",
 ".a.g.r.",
 ], budget=27),  # cut from 40->31 earlier this project, now 31->27 (slack 6):
                 # the first real finale should actually threaten, not coast

dict(name="Frost Hollow", intro=("New Mechanics!", "Ice",
    "Step onto ice and you'll keep sliding until you hit something - and every "
    "tile you cross joins your tail, same as walking. No stopping halfway, so "
    "plan where you'll end up before you step on!"),
 grid=[
 "S..#...",
 ".a.#...",
 "..a.IIa",
 "...#...",
 "...#...",
 ".a.#.a.",
 ]),

dict(name="Aim Before You Slide",
 grid=[
 "S......",
 "..####.",
 "..IIII#",
 "..####.",
 "......a",
 ]),

dict(name="Thin Ice, Deep Water", intro=("New Mechanics!", "Ice Over Water",
    "Ice runs right up to the river - but only one sheet lines up with the "
    "bridge. Slide carefully, then use the bridge to finish the crossing."),
 grid=[
 "S.......",
 "III.III.",
 "~~~~~=~~",
 "........",
 ".....a..",
 ]),

dict(name="Slide of Peril", intro=("New Mechanics!", "Direction Matters",
    "The same ice sends you a different way depending on which side you step "
    "on from. Choose carefully - one way ends on rotten."),
 grid=[
 "S..........",
 "...IIIIIII.",
 "...IIIIIII.",
 "...r....a..",
 ]),

dict(name="Frost Gauntlet", intro=("Frost Hollow Finale!", "Everything, Cold",
    "Ice, rocks, and a golden detour - all the way to the bottom "
    "of the hollow. Good luck!"),
 grid=[
 "S......",
 ".###...",
 ".#..IIg",
 ".#..#..",
 "...n#..",
 "a....#a",
 ]),

dict(name="One-Way Streets", intro=("New Mechanics!", "One-Way Tiles",
    "Arrows only let you through going one direction - approach from any "
    "other side and it's as solid as a wall."),
 grid=[
 "#.#.#.#",
 "S..a...",
 "#.>...#",
 "a....a.",
 "#.#.#.#",
 ]),

dict(name="Portal Basics", intro=("New Mechanics!", "Teleport Pads",
    "Step on a glowing pad and you'll warp straight to its matching "
    "partner - wherever that is on the map."),
 grid=[
 "S....",
 ".....",
 "..1..",
 ".....",
 "1a..a",
 ]),

dict(name="Arrow to Portal",
 grid=[
 "#######",
 "S.>.a.1",
 "#######",
 "#######",
 ".1...a.",
 ]),

dict(name="One-Way Rock Garden",
 grid=[
 "S....",
 ".....",
 "##v##",
 ".....",
 "....a",
 ]),

dict(name="Portal Over Water", intro=("Combining Tricks", "Portals + Bridges",
    "The river still only has one bridge - but a portal might save you a "
    "few steps on the far side."),
 grid=[
 "S.....",
 "......",
 "~~=~~~",
 "......",
 "....1.",
 "1....a",
 ]),

dict(name="Arrows & Poison",
 grid=[
 "S......",
 ".......",
 "###v###",
 ".......",
 "...r..a",
 ]),

dict(name="Crated Portals",
 grid=[
 "S.....",
 "..CC..",
 "..1...",
 "......",
 "...1.a",
 ]),

dict(name="Slide to the Gate", intro=("Combining Tricks", "Ice + Arrows",
    "A one-way tile stops an ice slide dead if it's facing the wrong way - "
    "use that to control exactly where you stop."),
 grid=[
 "SIIIIIv...",
 "#....a....",
 "a..a......",
 ]),

dict(name="Portal on Ice",
 grid=[
 "S######",
 ".III1..",
 "#######",
 "1.....a",
 ]),

dict(name="Three-Way Junction", intro=("Combining Tricks", "Three at Once",
    "A one-way gate, a bridge, and a portal, all on the way to the same "
    "apple. Take them one at a time."),
 grid=[
 "S......",
 ".......",
 "##v####",
 ".......",
 "~~~~=~~",
 "...1...",
 "1.....a",
 ]),

dict(name="Crated Crossfire",
 grid=[
 "S......",
 ".C^C...",
 "....r..",
 "..1....",
 "1.....a",
 ]),

dict(name="The Deep Warren",
 grid=[
 "SIII^...",
 "#.......",
 "1.......",
 "....1..a",
 ]),

dict(name="Warren Gauntlet I",
 grid=[
 "S......",
 ".......",
 "##v####",
 ".......",
 "~~~~=~~",
 "..III.1",
 "..r..1a",
 ]),

dict(name="Warren Gauntlet II",
 grid=[
 "S.......",
 "........",
 "####v###",
 "........",
 ".C.....C",
 "1.......",
 "..r..1..",
 "a......g",
 ]),

dict(name="Tunnel Warrens Finale", intro=("Tunnel Warrens Finale!", "Everything Underground",
    "One-way gates, a bridge, ice, portals, crates, and rot - every trick "
    "this warren has. Good luck down here!"),
 grid=[
 "S........",
 ".........",
 "####v####",
 ".........",
 "~~~~=~~~~",
 "...III...",
 ".........",
 ".1.C.C.1.",
 "n...r...g",
 ]),

dict(name="Thorn Awakens", intro=("New Mechanics!", "The Patrol Hazard",
    "A thorn creature paces back and forth along a fixed path, moving once "
    "every time YOU move. Walk into its current spot - or let it step onto "
    "you - and it's game over. Watch its pattern before you cross!"),
 grid=[
 "S......",
 ".a.....",
 ".......",
 "#...#..",
 ".......",
 "....a..",
 "..a...a",
 ], patrol=[[3,1],[3,2],[3,3]]),

dict(name="Marching Orders",
 grid=[
 "S.....",
 "......",
 "#....#",
 "......",
 ".....a",
 ], patrol=[[2,1],[2,2],[2,3],[2,4]]),

dict(name="Guarded Larder", intro=("Combining Tricks", "Thorns + Rocks",
    "Wiggle through the rock maze first, then time your dash past the thorn."),
 grid=[
 "S......",
 ".####..",
 ".#..#..",
 ".#.##..",
 ".#.....",
 "#....#.",
 ".......",
 "a.....a",
 ], patrol=[[5,1],[5,2],[5,3],[5,4]]),

dict(name="Thorn and Rot", intro=("Combining Tricks", "Thorns + Rotten Apples",
    "The thorn isn't the only thing that can end your run down here - mind "
    "the rotten apple too."),
 grid=[
 "S......",
 ".......",
 "#....#.",
 ".......",
 "..r....",
 ".....a.",
 ], patrol=[[2,1],[2,2],[2,3],[2,4]]),

dict(name="Crated Sentry", intro=("Combining Tricks", "Thorns + Crates",
    "The crates carve up your options - the thorn still guards the only way through."),
 grid=[
 "S.......",
 ".CC.CC..",
 "........",
 "#.....#.",
 "........",
 "......a.",
 ], patrol=[[3,1],[3,2],[3,3],[3,4],[3,5]]),

dict(name="Bridge of Thorns", intro=("Combining Tricks", "Thorns + Bridges",
    "Cross the river first - the bridge only holds once - then time your "
    "way past the thorn on the far bank."),
 grid=[
 "S......",
 ".......",
 "~~~=~~~",
 ".......",
 "#....#.",
 ".......",
 "......a",
 ], patrol=[[4,1],[4,2],[4,3],[4,4]]),

dict(name="Cold Shoulder", intro=("Combining Tricks", "Thorns + Ice",
    "The ice drops you right at the thorn's doorstep - don't slide in blind."),
 grid=[
 "S.......",
 ".I......",
 ".I......",
 ".I......",
 "#......#",
 "......a.",
 ], patrol=[[4,1],[4,2],[4,3],[4,4],[4,5],[4,6]]),

dict(name="One Way, One Chance", intro=("Combining Tricks", "Thorns + One-Way Gates",
    "Once you're through the arrow, there's no going back - commit only "
    "when the way past the thorn is clear."),
 grid=[
 "S......",
 ".......",
 "##v####",
 ".......",
 "#....#.",
 ".......",
 "......a",
 ], patrol=[[4,1],[4,2],[4,3],[4,4]]),

dict(name="Portal Past the Sentry", intro=("Combining Tricks", "Thorns + Portals",
    "A portal on the far side skips the thorn's whole stretch, if you can "
    "reach it."),
 grid=[
 "S......",
 ".......",
 "#....#.",
 ".......",
 "1.....a",
 "......1",
 ], patrol=[[2,1],[2,2],[2,3],[2,4]]),

dict(name="Frost and Thorn",
 grid=[
 "S.....",
 ".####.",
 "......",
 ".IIII.",
 "......",
 "#....#",
 "......",
 "....a.",
 ], patrol=[[5,1],[5,2],[5,3],[5,4]]),

dict(name="Sealed Passage", intro=("Combining Tricks", "Nothing Comes Back",
    "A one-way gate and a single-use bridge, both between you and the "
    "apples. Once you're through either one, there's no going back for "
    "what you left behind."),
 grid=[
 "S.......",
 "...#.a..",
 "........",
 "##v#####",
 "........",
 "~~~~=~~~",
 "........",
 "#.....#.",
 "........",
 "......a.",
 ], patrol=[[7,1],[7,2],[7,3],[7,4],[7,5]]),

dict(name="Portal Under Watch", intro=("Combining Tricks", "Thorns + Crates + Portals",
    "A portal waits past the crates - but it drops you right back under the thorn's watch."),
 grid=[
 "S.......",
 "C.CC.CC.",
 "........",
 ".1.....1",
 "........",
 "#.....#.",
 "........",
 "......a.",
 ], patrol=[[5,1],[5,2],[5,3],[5,4],[5,5]]),

dict(name="Warren of Thorns", intro=("Nightshade Gauntlet", "Rocks, Bridges, Rot & Thorns",
    "Everything the grove has thrown at you so far, back to back. Stay sharp."),
 grid=[
 "S.......",
 "........",
 ".####...",
 "........",
 "~~~=~~~~",
 "........",
 "#.....#.",
 "..r.....",
 "......a.",
 ], patrol=[[6,1],[6,2],[6,3],[6,4],[6,5]]),

dict(name="Thorn Gauntlet", intro=("Nightshade Gauntlet", "Ice, One-Way, Portals & Thorns",
    "One more gauntlet before the finale - ice, an arrow, a portal, and the "
    "thorn, all in sequence. That ice again: step on wrong and you'll slide "
    "onto rotten."),
 grid=[
 "S...........",
 "...IIIIIII..",
 "...r....a...",
 "............",
 "########v###",
 "............",
 "1..........1",
 "............",
 "#..........#",
 "............",
 "..........a.",
 ], patrol=[[8,1],[8,2],[8,3],[8,4],[8,5],[8,6],[8,7],[8,8],[8,9]]),

dict(name="Nightshade Grove Finale", intro=("Nightshade Grove Finale!", "Every Trick In The Grove",
    "Rocks, a one-way gate, a bridge, ice, crates, a portal, rot, and the "
    "thorn itself - the whole grove, one last time. Good luck, little worm."),
 grid=[
 "S........",
 ".........",
 ".####....",
 ".........",
 "##v######",
 ".........",
 "~~~~=~~~~",
 ".........",
 "IIIIIIIII",
 ".........",
 "#..CC..#.",
 ".........",
 "1.......1",
 ".........",
 "n...r...g",
 ], patrol=[[12,1],[12,2],[12,5],[12,6],[12,7]]),

dict(name="The Climb Begins", intro=("Worm's Summit", "The Remix Begins",
    "No new tricks from here on - just everything you already know, combined, "
    "on bigger boards with tighter budgets. Welcome to the summit."),
 grid=[
 "S........",
 "..a......",
 "##v######",
 ".........",
 "~~~=~~~~~",
 ".....r...",
 "..a....a.",
 ".........",
 "1.......1",
 ".........",
 "a........",
 ]),

dict(name="Frozen Crates",
 grid=[
 "S.......",
 "C.CC.CC.",
 "........",
 "I.IIII..",
 "........",
 ".1.....1",
 "........",
 "......a.",
 ]),

dict(name="Orchard Vault", intro=("Combining Tricks", "Combos + Golden Detour",
    "A tight apple cluster for a big combo, then a golden pair tucked behind "
    "the rock maze - and a bridge to finish the crossing."),
 grid=[
 "S........",
 ".####....",
 ".#..#....",
 ".#.##....",
 ".#.......",
 ".....aa..",
 ".....gg..",
 "~~~~=~~~~",
 ".........",
 "........a",
 ]),

dict(name="Thorn on Ice", intro=("Combining Tricks", "Patrol + Ice + One-Way",
    "Slide, commit through the arrow, then time your way past the thorn."),
 grid=[
 "S.......",
 ".IIII...",
 "........",
 "###v####",
 "........",
 "#.....#.",
 "........",
 "......a.",
 ], patrol=[[5,1],[5,2],[5,3],[5,4],[5,5]]),

dict(name="Shortcut Under Watch", intro=("Combining Tricks", "Patrol + Portals + Crates",
    "The portal skips the thorn's whole stretch, if you can reach it through "
    "the crates."),
 grid=[
 "S.......",
 "C.CC.CC.",
 "........",
 ".1.....1",
 "........",
 "#.....#.",
 "...r....",
 "......a.",
 ], patrol=[[5,1],[5,2],[5,3],[5,4],[5,5]]),

dict(name="High Pass", intro=("Combining Tricks", "Patrol + Bridge + One-Way + Ice",
    "Four tricks stacked in a row - ice, an arrow, a bridge, then the thorn's "
    "stretch. A golden apple waits near the top - but it's not the last stop."),
 grid=[
 "S........",
 ".........",
 ".IIII....",
 ".........",
 "##v######",
 ".........",
 "~~~~=~~~~",
 ".........",
 "#......#.",
 "..###....",
 "..#a#....",
 "..#.#....",
 ".....g...",
 ], patrol=[[8,1],[8,2],[8,3],[8,4],[8,5],[8,6]]),

dict(name="Rockslide Rot", intro=("Combining Tricks", "Rocks + Crates + Bridge + Rot + Patrol",
    "A rock maze, a bridge, a rotten decoy, and the thorn - all before you "
    "even see the apple."),
 grid=[
 "S........",
 ".........",
 ".####....",
 ".#..#....",
 ".#.##....",
 ".#.......",
 "~~~~=~~~~",
 ".........",
 "#......#.",
 "..r......",
 ".......a.",
 ], patrol=[[8,1],[8,2],[8,3],[8,4],[8,5],[8,6]]),

dict(name="Cold Snap", intro=("Combining Tricks", "Ice + One-Way + Portals + Patrol + Gold",
    "A golden apple waits on the far side of everything - ice, an arrow, a "
    "portal, and the thorn's watch."),
 grid=[
 "S........",
 ".IIII....",
 ".........",
 "###v#####",
 ".........",
 "1.#####.1",
 ".........",
 "#......#.",
 ".........",
 "g......a.",
 ], patrol=[[7,1],[7,2],[7,3],[7,4],[7,5],[7,6]], budget=29),

dict(name="Warren and Orchard", intro=("Combining Tricks", "Crates + Rocks + Bridge + Ice + Patrol",
    "The biggest board yet - crates, a rock maze, a bridge, an ice slide, "
    "and the thorn, all in one long climb."),
 grid=[
 "S..........",
 ".CC..CC....",
 "...........",
 ".####......",
 ".#..#......",
 ".#.##......",
 ".#.........",
 "~~~~~=~~~~~",
 "...........",
 ".IIII......",
 "...........",
 "#........#.",
 "...........",
 ".........a.",
 ], patrol=[[11,1],[11,2],[11,3],[11,4],[11,5],[11,6],[11,7],[11,8]]),

dict(name="Sentry Line", intro=("Combining Tricks", "One-Way + Bridge + Crates + Rot + Patrol",
    "An arrow, crates, a bridge, a rotten decoy, and the thorn's watch - in "
    "sequence, with no room for a wrong turn."),
 grid=[
 "S..........",
 "...........",
 ".CC..CC....",
 "...........",
 "####v######",
 "...........",
 "~~~~~=~~~~~",
 "...........",
 "#........#.",
 "....r......",
 "...........",
 ".........a.",
 ], patrol=[[8,1],[8,2],[8,3],[8,4],[8,5],[8,6],[8,7],[8,8]]),

dict(name="Icebound Vault", intro=("Combining Tricks", "Rocks + Ice + Portals",
    "A rock maze, an ice slide, and a portal past the thorn's stretch - on "
    "the tightest budget yet."),
 grid=[
 "S..........",
 ".####......",
 ".#..#......",
 ".#.##......",
 ".#.........",
 ".IIII......",
 "...........",
 "1........1.",
 "...........",
 "#........#.",
 "...........",
 ".........a.",
 ], patrol=[[9,1],[9,2],[9,3],[9,4],[9,5],[9,6],[9,7],[9,8]], budget=20),

dict(name="Frozen Orchard", intro=("Combining Tricks", "Crates + Ice + Bridge + Rot + Gold",
    "No thorn this time - just crates, ice, a bridge, and a rotten decoy "
    "guarding a golden apple."),
 grid=[
 "S.........",
 ".CC..CC...",
 "..........",
 ".IIII.....",
 "..........",
 "~~~~=~~~~~",
 "..........",
 "#.......#.",
 "...r......",
 "g.......a.",
 ]),

dict(name="Warren, Gate & Bridge", intro=("Combining Tricks", "One-Way + Portals + Patrol + Bridge + Crates",
    "An arrow, crates on both sides, a bridge, a portal, and the thorn's "
    "stretch - five tricks, one long final approach."),
 grid=[
 "S..........",
 "...........",
 "####v######",
 "...........",
 ".CC....CC..",
 "...........",
 "~~~~~=~~~~~",
 "...........",
 "1........1.",
 "...........",
 "#........#.",
 "...........",
 ".........a.",
 ], patrol=[[10,1],[10,2],[10,3],[10,4],[10,5],[10,6],[10,7],[10,8]]),

dict(name="Ascent", intro=("Worm's Summit", "The Long Climb",
    "Rocks, a one-way gate, a bridge, ice, crates, a portal, rot, and the "
    "thorn - back to back, one long climb to the top. No edge to sneak "
    "around this time - the thorn's stretch is the only way through."),
 grid=[
 "S..........",
 ".####......",
 ".#..#......",
 ".#.##......",
 ".#.........",
 "####v######",
 "...........",
 "~~~~~=~~~~~",
 "...........",
 ".IIII..CC..",
 "...........",
 "1........1.",
 ".....r.....",
 "#........##",
 "...........",
 ".........a.",
 ], patrol=[[13,1],[13,2],[13,3],[13,4],[13,5],[13,6],[13,7],[13,8]]),

dict(name="Worm's Summit", intro=("Worm's Summit Finale!", "Every Trick, One Last Time",
    "Rocks, a one-way gate, a bridge, ice, crates, a portal, rot, and the "
    "thorn - every mechanic you've learned across the whole game, one final "
    "time, on the tightest budget yet. This is it, little worm. Good luck."),
 grid=[
 "S........",
 ".........",
 ".####....",
 ".........",
 "##v######",
 ".........",
 "~~~~=~~~~",
 ".........",
 "IIIIIIIII",
 ".........",
 "#..CC..#.",
 ".........",
 "1.......1",
 ".........",
 "n...r...g",
 ], patrol=[[10,1],[10,2],[10,5],[10,6],[10,7]], budget=28),
]

DIRS = {'U':(-1,0),'D':(1,0),'L':(0,-1),'R':(0,1)}
BLOCKED = set('#C~')
ONEWAY_DIR = {'^':'U', 'v':'D', '<':'L', '>':'R'}
TELEPORT_CHARS = set('1234')

def patrol_position_at(patrol, step):
    """Mirrors engine.js's patrolPositionAt exactly: the hazard ping-pongs
    forward to the last waypoint, then back to the first, repeating."""
    n = len(patrol)
    if n <= 1: return patrol[0]
    cycle = 2 * (n - 1)
    i = step % cycle
    return patrol[i] if i < n else patrol[cycle - i]

def parse(grid):
    tiles=[]; start=None; apples={}
    teleport_positions={}
    for r,row in enumerate(grid):
        trow=[]
        for c,ch in enumerate(row):
            if ch=='S': start=(r,c); trow.append('.')
            elif ch=='T': trow.append('.')  # cosmetic patrol-start marker only
            elif ch in 'agn': apples[(r,c)]=ch; trow.append('.')
            elif ch in TELEPORT_CHARS:
                teleport_positions.setdefault(ch, []).append((r,c))
                trow.append(ch)
            else: trow.append(ch)  # 'r', '^v<>', and any other terrain stay as-is
        tiles.append(trow)
    teleport_partner = {}
    for ch, positions in teleport_positions.items():
        if len(positions) == 2:
            (r0,c0),(r1,c1) = positions
            teleport_partner[(r0,c0)] = (r1,c1)
            teleport_partner[(r1,c1)] = (r0,c0)
        # a digit that doesn't appear exactly twice just isn't wired up -
        # matches engine.js's defensive behavior in parseDef.
    return tiles,start,apples,teleport_partner

def resolve_move(tiles, R, C, teleport_partner, head, occ, apples, bridges, d,
                  patrol=None, patrol_step=0):
    """Simulate one input (direction d) from head, including any ice slide or
    teleport hop - mirrors engine.js's tryMove/enterTile logic exactly, so
    the solver agrees with the real game about what one move can do. Returns
    None if the very first step is blocked (an invalid direction, like a
    bump). Otherwise returns a dict describing where the move ended:
    died=True means it ran into a rotten tile, walked into the patrol
    hazard's current cell, or had the hazard step onto its new position (all
    dead ends - never something a solver should choose), and 'eaten' lists
    the type ('a'/'g'/'n') of each apple picked up along the way, in order,
    so the caller can apply the green-apple move bonus.

    `head`, `occ` and `bridges` are all encoded as bitmask ints (one bit per
    cell, index r*C+c) rather than sets of (r,c) tuples - hashing/comparing
    a Python int is far cheaper than a frozenset, and it's what makes the
    solver's memoization actually scale (see solve_level's docstring).

    `patrol` (a list of (r,c) tuples, or None) and `patrol_step` (the
    hazard's step counter as of the START of this move) mirror engine.js's
    g.patrol/g.patrolStep: every tile the head lands on during this move -
    including a teleport's destination - is checked against the hazard's
    CURRENT position (patrol_step, not yet advanced), exactly like
    enterTile's collision check. Only once the whole move fully resolves
    without dying does the hazard advance one step for this input (never
    per tile within a slide) and get a second, "catches up to you" check
    against the head's final resting tile. The returned dict's
    'patrol_step' is the hazard's step count after this move, for the
    caller to thread into the next call."""
    dr,dc = DIRS[d]
    r,c = divmod(head, C)
    apples = dict(apples)
    eaten = []
    first = True

    def patrol_hit(pos):
        return patrol is not None and patrol_position_at(patrol, patrol_step) == pos

    while True:
        nr,nc = r+dr, c+dc
        if not (0<=nr<R and 0<=nc<C):
            if first: return None
            break
        t = tiles[nr][nc]
        onedir = ONEWAY_DIR.get(t)
        nbit = 1 << (nr*C+nc)
        if t in BLOCKED or (onedir is not None and onedir != d) or (occ & nbit) or (t=='=' and (bridges & nbit)):
            if first: return None
            break
        occ |= nbit
        if t=='=': bridges |= nbit
        r,c = nr,nc
        if patrol_hit((r,c)):
            return dict(died=True, head=r*C+c, occ=occ, apples=apples, bridges=bridges,
                        eaten=eaten, patrol_step=patrol_step)
        if t=='r':
            return dict(died=True, head=r*C+c, occ=occ, apples=apples, bridges=bridges,
                        eaten=eaten, patrol_step=patrol_step)
        if (r,c) in apples:
            eaten.append(apples[(r,c)])
            del apples[(r,c)]
        first = False
        if (r,c) in teleport_partner:
            # Teleport hop: jump straight to the partner tile, which joins
            # the trail/occ and gets the same patrol/apple/rotten check -
            # then the move always ends there (no chaining into a slide or
            # another teleport), exactly like engine.js's enterTile/tryMove.
            pr,pc = teleport_partner[(r,c)]
            pbit = 1 << (pr*C+pc)
            occ |= pbit
            r,c = pr,pc
            if patrol_hit((r,c)):
                return dict(died=True, head=r*C+c, occ=occ, apples=apples, bridges=bridges,
                            eaten=eaten, patrol_step=patrol_step)
            if tiles[r][c]=='r':
                return dict(died=True, head=r*C+c, occ=occ, apples=apples, bridges=bridges,
                            eaten=eaten, patrol_step=patrol_step)
            if (r,c) in apples:
                eaten.append(apples[(r,c)])
                del apples[(r,c)]
            break
        if t!='I': break  # only ice keeps the slide going

    new_step = patrol_step
    if patrol is not None:
        new_step = patrol_step + 1
        if patrol_position_at(patrol, new_step) == (r,c):
            return dict(died=True, head=r*C+c, occ=occ, apples=apples, bridges=bridges,
                        eaten=eaten, patrol_step=new_step)
    return dict(died=False, head=r*C+c, occ=occ, apples=apples, bridges=bridges,
                eaten=eaten, patrol_step=new_step)

class _SearchTruncated(Exception):
    """Raised internally by solve_level's dfs() when it hits the node/time
    budget below, so a big board degrades to 'best found so far, flagged as
    unverified' instead of hanging the build."""
    pass

def solve_level(level, budget=None, node_limit=4_000_000, time_limit=8.0):
    """DFS + memoization, seeded by a greedy upper bound. Two scalability
    fixes on top of the naive version:

    1. occ/bridges are bitmask ints (see resolve_move) instead of
       frozenset(occ) - much cheaper to hash and compare, so the memo table
       (keyed on (head, occ, apples, bridges)) stays cheap even as boards
       and open-tile counts grow.
    2. A hard node-count + wall-clock budget on the DFS. If a board is big
       enough that exhaustive search won't finish in time, the search stops
       and returns the best solution found so far (which is always at least
       as good as the greedy solution, and often the true optimum even if
       unproven) with result['truncated']=True, instead of hanging forever.
       Callers (main(), below) surface that flag so an under-verified level
       doesn't silently ship as if it were solver-proven optimal.
    """
    tiles,start,apples0,teleport_partner = parse(level['grid'])
    R=len(tiles); C=len(tiles[0])
    start_idx = start[0]*C+start[1]
    best={'moves':10**9,'path':None}
    sys.setrecursionlimit(100000)
    patrol = [tuple(p) for p in level['patrol']] if level.get('patrol') else None

    # greedy first solution for an upper bound
    def greedy():
        head=start_idx; occ=1<<start_idx; apples=dict(apples0); bridges=0; path=[]; pstep=0
        for _ in range(400):
            if not apples: return path
            hr,hc = divmod(head, C)
            # step toward nearest apple (manhattan), prefer unblocked
            tr=min(apples, key=lambda p: abs(p[0]-hr)+abs(p[1]-hc))
            moved=False
            order=sorted(DIRS, key=lambda d: abs(hr+DIRS[d][0]-tr[0])+abs(hc+DIRS[d][1]-tr[1]))
            for d in order:
                res=resolve_move(tiles,R,C,teleport_partner,head,occ,apples,bridges,d,patrol,pstep)
                if res is None or res['died']: continue
                head=res['head']; occ=res['occ']; apples=res['apples']; bridges=res['bridges']
                pstep=res['patrol_step']
                path.append(d)
                moved=True; break
            if not moved: return None
        return None
    g=greedy()
    if g: best['moves']=len(g); best['path']=g

    memo={}
    nodes=[0]
    t0=time.time()
    # order dirs toward nearest apple for good pruning
    def dfs(head, occ, apples, bridges, patrol_step, path, moves, moves_left):
        if not apples:
            if moves<best['moves']: best['moves']=moves; best['path']=list(path)
            return
        if moves>=best['moves']: return
        if moves_left is not None and moves_left<0: return
        nodes[0]+=1
        if nodes[0] % 4096 == 0:
            if nodes[0] > node_limit or (time.time()-t0) > time_limit:
                raise _SearchTruncated()
        key=(head,occ,frozenset(apples.items()),bridges,patrol_step)
        if key in memo and memo[key]<=moves: return
        memo[key]=moves
        hr,hc = divmod(head, C)
        tr=min(apples, key=lambda p: abs(p[0]-hr)+abs(p[1]-hc))
        order=sorted(DIRS, key=lambda d: abs(hr+DIRS[d][0]-tr[0])+abs(hc+DIRS[d][1]-tr[1]))
        for d in order:
            res=resolve_move(tiles,R,C,teleport_partner,head,occ,apples,bridges,d,patrol,patrol_step)
            if res is None or res['died']: continue
            ml=moves_left
            if ml is not None:
                for etype in res['eaten']:
                    if etype=='n': ml+=1
                ml-=1
            path.append(d)
            dfs(res['head'],res['occ'],res['apples'],res['bridges'],res['patrol_step'],path,moves+1,ml)
            path.pop()

    ml0 = budget if budget is not None else None
    truncated = False
    try:
        dfs(start_idx,1<<start_idx,dict(apples0),0,0,[],0,ml0)
    except _SearchTruncated:
        truncated = True
    if best['path'] is None: return None
    best['truncated'] = truncated
    best['nodes'] = nodes[0]
    return best

def default_stars(idx, par, budget):
    # Worlds 1-2 (L1-10) keep a flat +2/+5 offset - generous in absolute
    # terms, which is fine (even the point) for early tutorial levels. From
    # World 3 onward, par grows large enough (into the 20s+) that a flat
    # offset stops meaning the same thing every time: +2 moves out of 6 is
    # forgiving, +2 moves out of 27 is a speedrun grade.
    #
    # LEVEL_DESIGN_PLAN.md section 2 called for switching to a straight
    # percentage of par instead (star3 = ceil(par*1.15) etc) but never
    # actually got wired in - and testing it here turned up why it's the
    # wrong formula for this campaign: a lot of worlds 5-7 levels ship with
    # a deliberately tight, hand-picked `budget` (the whole point of a
    # "gauntlet"/finale level), and a pure percentage-of-par star2 routinely
    # lands *above* those budgets, making 1 star - sometimes even 2 -
    # mathematically unreachable, exactly the "Icebound Vault" bug this was
    # supposed to fix, just recreated across 16 other levels.
    #
    # What actually stays consistent regardless of how tight a level's
    # budget is: spending a fraction of whatever *slack* (budget - par) it
    # has, rather than a fraction of par itself. This can't ever put star2
    # at or past budget for any level with real slack, and it degrades
    # gracefully (very tight, close to all-or-nothing stars) on the
    # handful of finales with almost none - which matches those levels'
    # own intent rather than fighting it.
    if idx < 11:
        return par + 2, par + 5
    slack = max(0, budget - par)
    return par + math.ceil(slack * 0.35), par + math.ceil(slack * 0.7)

def main():
    out=[]
    ok=True
    for i,lv in enumerate(LEVELS_SRC, start=1):
        budget = lv.get('budget')
        # World 7's bigger remix boards need more headroom than the default
        # 4M-node/8s budget to search exhaustively; this only costs build
        # time, never runtime, so it's generous on purpose.
        sol = solve_level(lv, budget, node_limit=12_000_000, time_limit=25.0)
        if sol is None:
            print(f"L{i} {lv['name']}: UNSOLVABLE!"); ok=False; continue
        par=sol['moves']
        # solve_level's dfs is capped at `budget` moves-left, but it seeds
        # its search with an uncapped greedy upper bound and only ever
        # improves on it - if dfs never finds anything within budget, the
        # uncapped greedy result silently survives as "the answer", which
        # would ship a level that's unsolvable within its own stated
        # budget. Catch that explicitly instead of trusting `sol is not
        # None` alone.
        if budget is not None and par > budget:
            print(f"L{i} {lv['name']}: UNSOLVABLE within budget! "
                  f"best found needs {par} moves but budget is only {budget}.")
            ok=False; continue
        b = budget if budget is not None else par+8
        world_name, theme = world_for(i)
        star3_d, star2_d = default_stars(i, par, b)
        # verify with budget enforced if custom budget given
        entry=dict(idx=i, name=lv['name'], world=world_name, theme=theme,
                   intro=list(lv['intro']) if lv.get('intro') else None,
                   grid=lv['grid'], par=par, budget=b,
                   # A level can still override the computed thresholds for
                   # a case the formula doesn't fit well on its own (e.g. a
                   # level whose own budget is tighter than star2 would put
                   # it, which makes 1 star unreachable).
                   star3=lv.get('star3', star3_d), star2=lv.get('star2', star2_d),
                   solution=''.join(sol['path']),
                   verified=not sol['truncated'],
                   patrol=lv.get('patrol'))
        out.append(entry)
        flag = ''
        if sol['truncated']:
            # The board was too big to search exhaustively within the node/
            # time budget (see solve_level's docstring). What we have is a
            # real, playable solution - at least as good as the greedy
            # fallback - but it is NOT proven optimal, so par/star thresholds
            # for this level should be spot-checked by hand before shipping.
            flag = f"  [UNVERIFIED - search truncated after {sol['nodes']} nodes, best par may not be optimal]"
        print(f"L{i:2d} {lv['name']:14s} world={world_name:12s} par={par:2d} budget={b:2d} sol={entry['solution'][:40]}{flag}")
    if not ok: sys.exit(1)
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'levels_solved.json')
    with open(out_path,'w') as f:
        json.dump(out,f)
    print("wrote", out_path)

if __name__=='__main__': main()
