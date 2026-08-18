# Sound-haptic design canvas

Working files for the "Walk Roulette Sound" design canvas — a clickable
prototype exploring subtle procedural audio as the app's haptic layer.

Three artboards:

- `Desktop.dc.html` — full desktop layout: illustrative basemap, isochrone
  bloom that tracks the dial, reach-aware place dots, route line following
  the reel, rail with live controls.
- `Main.dc.html` — the rail panel alone (mobile-ish framing).
- `Soundboard.dc.html` — the sound palette: every cue auditionable with its
  synthesis spec.

`canvas.json` lays them out on the canvas.

All sounds are synthesized at trigger time with WebAudio (oscillators +
filtered noise bursts) — no samples. Key cues: dial detents whose pitch
tracks the minutes value, chip taps (on high / off low), a switch thock, a
reel ratchet whose flips ease 30 ms → 320 ms over a 4-second throw with
pitch falling as it slows, and a 110 Hz landing thump with a soft fifth.
Master volume sits at whisper level; a Sound pill mutes new cues instantly.

These files are the design source of truth for the sound work until it is
implemented in `src/`. The published, interactive version lives on the
project's Claude artifact ("Walk Roulette Sound").
