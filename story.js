// WORM - the Wally & Pip storyline.
// Story copy is verbatim from the live build (extracted 2026-09-27).
// The keys double as the live server's `story_progress` row keys
// (validated there against /^[a-z0-9-]{1,40}$/) - don't rename them.
var STORIES = {
  intro: {
    title: 'Meet Wally',
    cards: [
      'Meet Wally — the littlest worm in Bramble Garden, with the biggest appetite.',
      'Every morning Wally dreams of apples... but wherever he wiggles, his tail follows FOREVER. He can never cross his own path!',
      'Swipe to guide Wally. Eat every apple, dodge the rotten ones, and don\'t get trapped!'
    ]
  },
  after3: {
    title: 'A New Friend',
    cards: [
      'You made it past the rocks! \'I\'m Pip!\' says the ladybug. \'Mind if I tag along? I hear the riverside has the juiciest apples...\''
    ]
  },
  after6: {
    title: 'Phew!',
    cards: [
      'Pip: \'That grey apple smelled AWFUL. Good dodging, Wally! From here on, we snack smart.\''
    ]
  },
  after9: {
    title: 'Combo King',
    cards: [
      'Pip: \'Did you SEE that combo?! At this rate the Golden Apple Tree will hear about you, Wally!\''
    ]
  },
  after12: {
    title: 'Almost There',
    cards: [
      'Pip: \'Look — through the leaves! The Golden Apple Tree, at the heart of the garden. Just a little further!\''
    ]
  },
  world4: {
    title: 'Into the Frost',
    cards: [
      'The orchard gives way to frost underfoot. \'Ooh, chilly!\' says Pip, puffing out her wings. \'The Golden Apple Tree grows past the cold, the caves, and worse. Slow and steady, Wally.\'',
      'Pip: \'Careful on the ice, though — it doesn\'t stop for wormy tails.\''
    ]
  },
  world5: {
    title: 'Underground',
    cards: [
      'The frost thins into stone. Pip lands on Wally\'s nose and squints into the dark. \'The Tunnel Warrens,\' she whispers. \'Old paths, one-way gates, and portals that\'ll pop you out somewhere else entirely.\'',
      'Pip: \'Stick close to me — my spots glow a little, in a pinch.\''
    ]
  },
  world6: {
    title: 'Thorn Country',
    cards: [
      'Daylight, such as it is down here, fades to purple. Something rustles in the brambles — a patrol of thorns, pacing back and forth. Pip goes very still. \'Nightshade Grove. Don\'t let it catch your rhythm, Wally. Watch its steps, not its snarl.\'',
      'Pip: \'Whatever\'s past this place, it\'d better be worth it.\''
    ]
  },
  world7: {
    title: 'The Summit',
    cards: [
      'The brambles fall away below, and the air turns thin and bright. Pip gasps. \'Wally... look up.\' A single peak catches the last of the light, and at the very top, something glints gold.',
      'Pip: \'Everything you\'ve learned — ice, gates, portals, the thorn\'s patrol, all of it — it\'s all waiting up there, one last time. This is the climb, Wally.\''
    ]
  },
  finale: {
    title: 'The Final Garden',
    cards: [
      'Pip: \'This is it, Wally. Every trick you\'ve learned, one last summit. Make me proud!\''
    ]
  },
  ending: {
    title: 'The Golden Apple Tree',
    cards: [
      'Wally crests the final rise, and there it is: the Golden Apple Tree, roots wrapped around the mountaintop, its apples glowing like little suns.',
      'Pip spins a happy loop in the air. \'You really did it, Wally! Every garden, every gauntlet, every apple — all the way from Bramble Garden to the top of the world!\'',
      'Wally takes one bite of a golden apple, and for once, even he is speechless. Not bad, for the littlest worm in the garden.',
      'THE END — for now. Pip has already spotted a valley on the other side of the mountain that \'absolutely, definitely has apples too.\' Some things never change.'
    ]
  }
};

// When each beat plays, by 0-based level index.
//   before: when that level starts (ahead of its tutorial card)
//   after:  between that level's win card and the next level
// The finale used to fire before Level 15 (index 14), a leftover from the
// original 15-level game. It now plays before the campaign's last level,
// Level 65 "Worm's Summit". The four world4-7 beats fire right after each
// preceding world's finale level, as the next world opens; "ending" is the
// actual close of the story, after the Level 65 win card.
var STORY_BEATS = {
  before: { 0: 'intro', 64: 'finale' },
  after: {
    2: 'after3', 5: 'after6', 8: 'after9', 11: 'after12',
    14: 'world4',  // after L15 "Worm's End" (Orchard Dusk finale)
    19: 'world5',  // after L20 "Frost Gauntlet" (Frost Hollow finale)
    34: 'world6',  // after L35 "Tunnel Warrens Finale"
    49: 'world7',  // after L50 "Nightshade Grove Finale"
    64: 'ending'   // after L65 "Worm's Summit" (the campaign's last win)
  }
};

// The beats in the order they're experienced, for a "replay a beat you've
// already seen" list (Settings > Wally & Pip's story). Skipping a card
// still marks it seen, same as finishing it, so this is the only way back
// to one you clicked past too fast.
var STORY_ORDER = ['intro', 'after3', 'after6', 'after9', 'after12',
  'world4', 'world5', 'world6', 'world7', 'finale', 'ending'];

if (typeof module !== 'undefined') module.exports = { STORIES: STORIES, STORY_BEATS: STORY_BEATS, STORY_ORDER: STORY_ORDER };
