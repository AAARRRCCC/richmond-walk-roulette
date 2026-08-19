# History

These files describe versions of the app that no longer exist. Nothing in the
current build depends on any of them. They are kept because they record why
things are the way they are, and a decision with no record tends to get made
again.

Read them as dated notes, not as instructions. Where they disagree with the
root `README.md`, the root README is right.

| File | What it is |
| --- | --- |
| `HANDBACK.md` | End-of-session handover from the autonomous improvement loop, at iteration 50. Describes the roulette-wheel UI and a Google Routes setup, both gone. |
| `IDEAS.md` | The backlog that loop worked from. Refers to `src/data/pois.ts` and a `<WheelPane>` component, neither of which exists now. |
| `iter-log.html` | Visual log of those iterations. Open it in a browser. |

## What replaced them

The wheel drew a straight-line radius and spun an arc of names. Two things
ended it.

The radius was a lie. A circle cannot know that the James is only crossable at
a bridge, so it offered walks that were not walks. Contours from a real
routing engine replaced it, and the measured gap is in the root `README.md`.

The wheel itself went with it. The reel that replaced it is a list of names
that decelerates onto the winner while the map draws each candidate's real
route, which is the part worth watching.

The move from Google's Isochrones API to self-hosted Valhalla came later and
for a different reason. That comparison is in `LAUNCH.md`, not here.
