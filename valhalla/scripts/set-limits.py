"""Raises the engine's isochrone limits to what the dial actually asks for.

The image writes a config on first start with the project's shipped defaults,
which cap isochrones at a handful of contours over a short horizon. This app's
warm-up asks for every minute from 5 to 100 in a single query: 96 contours,
the longest of them 100 minutes. Below those limits the request is rejected
outright rather than answered slowly, and the only symptom in the app is a
dial that never warms.

Run by build-graph.sh. Idempotent, so re-running it after a rebuild is free.
"""

import json
import sys


def main() -> int:
    path, max_contours, max_time = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])

    with open(path, encoding="utf-8") as handle:
        config = json.load(handle)

    limits = config.setdefault("service_limits", {}).setdefault("isochrone", {})
    if limits.get("max_contours") == max_contours and limits.get("max_time_contour") == max_time:
        print("isochrone limits already correct")
        return 0

    limits["max_contours"] = max_contours
    limits["max_time_contour"] = max_time

    with open(path, "w", encoding="utf-8") as handle:
        json.dump(config, handle, indent=2)

    print(f"isochrone limits set to {max_contours} contours, {max_time} minutes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
