# Walk Roulette

Spin a dial, get a walk you can actually do from where you stand. One context: the app, its server, and the meet feature share one language.

## Language

**Room**:
The live two-person session behind a meet link: both members' setup, their locks, and the last landing, held in server memory for 12 hours.
_Avoid_: session (taken by `Session`, the solo app state), lobby, channel

**Room pointer**:
A meet link that carries only the room id — no origins, no settings. The room, not the URL, is where meet state lives.
_Avoid_: invite link (the retired ping-pong shape that carried `ma`/`mb`)

**Room id**:
The token that names a room, and the whole of what it takes to join one: knowing
it is the only credential there is. So it is minted unguessable rather than
memorable — the link is meant to be sent, not recited.
_Avoid_: room code, room name (both invite being short enough to guess)

**Relay**:
The server's whole role in a room: it orders and forwards messages and never computes a pool or picks a winner.
_Avoid_: authority, game server

**Lock gate**:
Spin stays disabled until both members have locked in their budget. The room's one rule about who may spin.

**Settle**:
The moment an input stops moving — the hand comes off the dial, a toggle lands. Room sync sends settled values only, never in-flight motion.
_Avoid_: debounce (an implementation, not the concept)

**Device token**:
A random per-browser id that names a seat in a room, so a reconnect is recognized as the same walker and a third device is not.
_Avoid_: user id, account (there are no accounts)

**Publishing vs sharing into a room**:
Publishing a location means writing it where strangers and crawlers can read it (a URL); it is rounded to 3 decimals (~110 m). Sharing into a room is a consented act between two walkers over the socket and carries full precision. The joiner's origin is never sent without their explicit act.

**Pin**:
The single walking speed the server applies to every isochrone and every route, so the contour drawn on the map and the minutes printed on a card are answers to the same question. One pin for everybody, including both members of a room.
_Avoid_: the user's pace, walking preference (there is no per-walker speed)

**Reach snapshot**:
A precomputed file holding a preset origin's whole dial ladder, stamped with the pin it was cut at. A snapshot cut at a different pin is a different definition of "25 minutes" and is refused rather than served.
_Avoid_: cache (the runtime contour cache is a separate thing), preset

**Recut**:
Regenerating every reach snapshot against a live engine after the pin, the ladder, or the tileset moves. Always paired with a `SNAPSHOT_VERSION` bump, because the files are cached for a year under their names.
