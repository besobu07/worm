# Self-hosted Baloo 2

`styles.css` loads Baloo 2 from local files here instead of linking Google
Fonts, so the game makes no external font request at runtime (works
offline, no third-party request on load). The 3 files it expects:

```
fonts/Baloo2-SemiBold.woff2   (weight 600)
fonts/Baloo2-Bold.woff2       (weight 700)
fonts/Baloo2-ExtraBold.woff2  (weight 800)
```

They aren't checked into this package — fetch them once, from a machine
with normal internet access:

## Option A — run the script (fastest)

```
cd fonts
./fetch-fonts.sh
```

It hits Google Fonts' CSS API, pulls the 3 woff2 URLs, and saves them here
with the right names. Needs `curl` and `python3` (already used elsewhere in
this project).

## Option B — download manually

If the script can't reach Google Fonts from wherever you're building (e.g.
a sandboxed CI runner), get the same 3 files from
[Google Webfonts Helper](https://gwfh.mranftl.com/fonts/baloo-2?subsets=latin)
- pick weights 600, 700, 800, "Modern Browsers" (woff2) - and rename the
downloaded files to match the list above.

## If the files are missing

Nothing breaks - `styles.css`'s `--font-display` stack falls back to
`ui-rounded`/system-ui, so the game just renders in the system font until
you run the fetch. No console errors, no layout shift beyond the normal
font-swap.
