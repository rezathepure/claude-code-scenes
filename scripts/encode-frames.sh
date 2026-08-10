#!/usr/bin/env bash
#
# Screenshots a directory of HTML frames with headless Chrome and encodes them
# to an animated GIF (and an mp4 master for the demo).
#
# Chrome rather than a rasteriser because the frames rely on real font
# rendering, a CSS gradient and a border radius — librsvg/sharp render the text
# blank, which is how the first attempt at these assets failed.
#
# One Chrome process per frame is slow (~5s each, cold start) but restartable:
# an existing screenshot is skipped, so an interrupted run resumes.
#
#   scripts/encode-frames.sh <frames-dir> <output.gif> [output.mp4]
#
set -euo pipefail

FRAMES=${1:?usage: encode-frames.sh <frames-dir> <output.gif> [output.mp4]}
GIF=${2:?usage: encode-frames.sh <frames-dir> <output.gif> [output.mp4]}
MP4=${3:-}

CHROME=${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}
[ -x "$CHROME" ] || { echo "no Chrome at $CHROME (set CHROME_BIN)" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }

SHOTS="$FRAMES/png"
mkdir -p "$SHOTS" "$(dirname "$GIF")"

for f in "$FRAMES"/*.html; do
  b=$(basename "$f" .html)
  [ -s "$SHOTS/$b.png" ] && continue
  # 2x for a crisp downscale; the window matches the 100x22 grid plus padding.
  "$CHROME" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=1010,470 --screenshot="$SHOTS/$b.png" "file://$f" >/dev/null 2>&1
done

PATTERN=$(ls "$SHOTS" | head -1 | sed 's/[0-9]\+/%0&d/;s/%0\([0-9]\)\([0-9]*\)d/%0\1d/')
FRAME_GLOB="$SHOTS/$(ls "$SHOTS" | head -1 | sed 's/[0-9]/?/g')"

if [ -n "$MP4" ]; then
  ffmpeg -y -framerate 12 -pattern_type glob -i "$FRAME_GLOB" \
    -vf "scale=1440:-2:flags=lanczos" -c:v libx264 -pix_fmt yuv420p -crf 20 "$MP4" >/dev/null 2>&1
fi

# palettegen/paletteuse rather than a naive encode: 128 colours with a light
# bayer dither keeps the gradient from banding without inflating the file.
ffmpeg -y -framerate 12 -pattern_type glob -i "$FRAME_GLOB" \
  -vf "fps=12,scale=760:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 "$GIF" >/dev/null 2>&1

printf 'gif %s' "$(ls -lh "$GIF" | awk '{print $5}')"
[ -n "$MP4" ] && printf '  mp4 %s' "$(ls -lh "$MP4" | awk '{print $5}')"
echo
