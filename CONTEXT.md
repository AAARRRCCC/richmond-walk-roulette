# Walk Roulette

Spin a dial, get a walk you can actually do from where you stand. One context: the app, its server, and the meet feature share one language.

## Language

**Room**:
The live two-person session behind a meet link: both members' setup, their locks, and the last landing, held in server memory for 12 hours.
_Avoid_: session (taken by `Session`, the solo app state), lobby, channel

**Room pointer**:
A meet link that carries only the room id — no origins, no settings. The room, not the URL, is where meet state lives.
_Avoid_: invite link (the retired ping-pong shape that carried `ma`/`mb`)

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
