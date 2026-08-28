# Retire serverless meet ping-pong for a live room

The meet feature shipped serverless on purpose: origins, budget lock, and the
answer all traveled in the URL (`m`/`ma`/`mb`/`l`/`d`), and `share.ts`'s
comments argue at length for that shape — no socket, no room, no service
holding both sessions. We are reversing it. Meet becomes a live two-person
**room**: a WebSocket relay inside the app's own Node process, in-memory
state, links reduced to a **room pointer** (`/s?r=<id>`). The retired keys
decode as a cold start; roughly two such links exist in the wild.

Why reverse a decision the code defends: the serverless shape had hit its
ceiling. "One spin lands on the same winner on both screens" cannot travel in
a URL, and the ping-pong's other costs — coordinates published in forwardable
links (rounded to 3 decimals as damage control), pools that disagree at the
margins because each device reads the other's origin at ~110 m — all fall out
when origins move to a consented socket message at full precision and the
winner travels by id. The serverless arguments were right about what a URL
must never carry; the room is how meet stops needing the URL to carry it.

## Consequences

- The app server is stateful (rooms in memory, single replica) — restarts
  drop live rooms into a reconnect blip and reset their 12-hour clocks.
- Meet requires the service to be up; there is no degraded link-only mode.
- `PIN_PRECISION` (3 decimals) now governs only what URLs publish (solo `o`
  pins); room messages are exempt by the publishing / sharing-into-a-room
  distinction in CONTEXT.md.
