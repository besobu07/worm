#!/usr/bin/env bash
# Downloads the 3 Baloo 2 weights the game uses (600/700/800) from Google
# Fonts and saves them here as fixed filenames that styles.css already
# points to. Run this once, with normal internet access, then the game
# never talks to Google Fonts at runtime - see fonts/README.md.
set -euo pipefail
cd "$(dirname "$0")"

UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
CSS_URL="https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&display=swap"

echo "Fetching Google Fonts CSS for Baloo 2..."
CSS="$(curl -fsSL -A "$UA" "$CSS_URL")"

python3 - "$CSS" << 'PY'
import re, sys, subprocess

css = sys.argv[1]
# Each @font-face block: grab font-weight, unicode-range, and src url together.
blocks = re.findall(
    r'@font-face\s*\{([^}]*)\}', css, re.S
)
targets = {600: 'Baloo2-SemiBold.woff2', 700: 'Baloo2-Bold.woff2', 800: 'Baloo2-ExtraBold.woff2'}
found = {}
for b in blocks:
    wm = re.search(r'font-weight:\s*(\d+)', b)
    um = re.search(r'unicode-range:\s*([^;]+);', b)
    sm = re.search(r"url\(([^)]+)\)\s*format\('woff2'\)", b)
    if not (wm and sm):
        continue
    weight = int(wm.group(1))
    if weight not in targets:
        continue
    urange = um.group(1) if um else ''
    # Prefer the plain-Latin subset (covers the game's on-screen English text).
    is_latin = urange.strip().startswith('U+0000-00FF') or 'latin' in urange.lower()
    if weight not in found or (is_latin and not found[weight][1]):
        found[weight] = (sm.group(1).strip('"\' '), is_latin)

missing = [w for w in targets if w not in found]
if missing:
    print("Could not find weights in the CSS response:", missing, file=sys.stderr)
    sys.exit(1)

for weight, (url, _) in found.items():
    out = targets[weight]
    print(f"Downloading weight {weight} -> {out}")
    subprocess.run(['curl', '-fsSL', '-o', out, url], check=True)

print("Done.")
PY

echo "Saved: $(ls -1 Baloo2-*.woff2 2>/dev/null | tr '\n' ' ')"
