# Pin the walking speed at 4.5 km/h

The app pins one walking speed server-side and applies it to isochrones and
routes alike, so the contour on the map and the minutes on the result card
answer the same question. That pin was **3.69 km/h**; it is now **4.5**.

3.69 was never measured against a walker. It was the pace at which Valhalla's
25 minute area from Monroe Park matched the Google Isochrones the app used to
ship with — a number fitted to make a contour cutover invisible. It then
survived a challenge that looked like validation but was not: 673 routes
measured a mean effective pace of 3.606 km/h, 2.3% *slower* than the pin
(`HUMAN-REVIEW.md` §2.5), and the pin stayed on the argument that it erred
conservatively. That measurement compared the engine to its own literal. It
could not have detected the error we actually had.

The field test did. One walk, Shockoe Slip to the Virginia Holocaust Museum:
the app said 22 minutes, Google Maps said 18, and it took 15:57. The pin set
to agree with Google was disagreeing with Google by 22%, and with the ground
by 38%. The route was effectively straight, so this is a pace error and not
Valhalla routing a detour the walker did not take.

**4.5 km/h**, roughly a mapping provider's average-walker assumption — not the
~5.1 the field walk implies for this particular walker. Meet-in-the-middle
shares one pin between two people, and its arithmetic only holds if both are
assumed to cover the same ground in the same minutes; neither of them agreed
to the other's speed. 4.5 also keeps the error running in the direction where
it under-promises for the faster walker rather than stranding the slower one.

One walk is thin evidence for a number, and we accepted that: the walk's job
was to falsify 3.69, not to establish 4.5. 4.5 stands on being a published
population average that the walk is consistent with.

## Consequences

- `SNAPSHOT_VERSION` 3 → 4, and all eleven `public/reach/*.json` recut against
  the cluster engine (valhalla.plvr.net, tileset 1787337146) at the new pace.
  `seedFromSnapshot` rejects a snapshot stamped with a different `speedKmh`, so
  an un-recut file is a cache miss rather than a wrong map.
- Every ETA, every contour and every candidate pool moved. The README's
  reachable-area figures were re-measured (Monroe Park 2.03 → 2.93 sq mi,
  Shockoe Slip 1.48 → 2.24), and the circle they are compared against grew with
  them, so the app's actual argument — a circle lies most near the water — is
  unchanged in shape.
- The `verify-engine` speed fixture was re-taken: 1.049 km in 791.0 s.
- `docs/plans/**` and `HUMAN-REVIEW.md` still say 3.69 throughout. They are a
  record of what was decided when, not live claims, and were deliberately left
  alone.
