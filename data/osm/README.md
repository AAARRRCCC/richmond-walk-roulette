# Harvested OpenStreetMap data

**Map data © OpenStreetMap contributors, made available under the Open Database
License (ODbL).** <https://www.openstreetmap.org/copyright>

Everything in this directory came out of one command, `npm run harvest:osm`,
which is the only thing in this repo that talks to Overpass. `manifest.json`
records, per file, the verbatim Overpass QL, the `osm3s.timestamp_osm_base` the
server reported, and the element count — so a change to what was asked for shows
up in a diff rather than as a mysteriously different file.

These files are committed on purpose. `scripts/propose-places.mjs` reads them and
never the network, for the same reason `scripts/build-reach.mjs` reads a
committed snapshot rather than a live engine: a build whose output depends on the
day it ran is not a build, and a mid-air OSM edit should not be able to change
the destination list without review.

## Do not wire this into CI

Overpass's own documentation forbids using a public instance as an application
backend, states a ceiling near 10,000 queries and 1 GB a day, and returns 429
after a fifteen-second queue. Harvesting on every push would be exactly the abuse
those docs name. The harvest is a rare, manual, local act; it pauses five seconds
between queries and waits thirty on a rate limit, and both of those are etiquette
rather than tuning.

## What is here

| File | What it holds |
| --- | --- |
| `destinations.json` | Parks, gardens, reserves, cemeteries, museums, markets, allowlisted `historic=*` |
| `detours.json` | Artwork, viewpoints, bridges and piers, named steps, natural features, memorials with a subtype |
| `gates-*.json` | Nodes shared between one outline family and a pedestrian way — the anchor ladder's second rung |

The gate files exist because `out center` on a park way returns the bounding-box
centre, which is a spot in the middle of a lawn. One query per outline family
rather than one for everything: a node-set recursion over the whole box at once
times out, and cemeteries, gardens and reserves each need their own or they get
no gate rung at all.

`entrance=*` is deliberately absent. It was measured at **zero** on Richmond park
outlines — the 852 entrance nodes in the box all sit on building outlines — so
the ladder keeps that rung only because it is free when it hits.
