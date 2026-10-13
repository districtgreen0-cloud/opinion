#!/usr/bin/env python3
"""
Fetch the real building footprints (+ heights) for London landmark venues from OpenStreetMap
via the Overpass API, and write a compact JSON the three.js LandmarkLayer extrudes.

  python3 scripts/fetch_landmarks.py           → web/src/data/london-landmarks.json

Data © OpenStreetMap contributors (ODbL).
"""
import json, math, sys, time, urllib.parse, urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "web/src/data/london-landmarks.json"
ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]

# (id, display name, search name regex, approx centre lat/lng, search radius m)
VENUES = [
    ("olympia", "Olympia London", "Olympia", 51.4960, -0.2105, 260),
    ("somerset", "Somerset House", "Somerset House", 51.5110, -0.1175, 170),
]

def overpass(q: str) -> dict:
    data = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for url in ENDPOINTS:
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, data=data, headers={"User-Agent": "opinion-landmarks/1.0"})
                with urllib.request.urlopen(req, timeout=90) as r:
                    return json.loads(r.read())
            except Exception as e:  # rate limits / timeouts → back off, then try the mirror
                last = e
                time.sleep(4 * (attempt + 1))
    raise SystemExit(f"Overpass failed: {last}")

def height_of(tags: dict) -> float:
    for k in ("height", "building:height"):
        v = tags.get(k)
        if v:
            try:
                return float(str(v).replace("m", "").split(";")[0].strip())
            except ValueError:
                pass
    lv = tags.get("building:levels")
    if lv:
        try:
            return float(lv) * 3.6 + 2
        except ValueError:
            pass
    return 14.0

def ring_area_m2(ring):
    # shoelace on a local equirectangular projection — good enough to drop slivers
    lat0 = math.radians(ring[0][1])
    pts = [(lng * 111320 * math.cos(lat0), lat * 110540) for lng, lat in ring]
    return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]))) / 2

def main():
    out = {"attribution": "© OpenStreetMap contributors (ODbL)", "venues": []}
    for vid, label, name, lat, lng, radius in VENUES:
        # 1) the named venue outline(s); 2) every building / building:part inside them (the "exact same buildings")
        q = f"""
        [out:json][timeout:60];
        (
          way(around:{radius},{lat},{lng})["name"~"{name}",i]["building"];
          relation(around:{radius},{lat},{lng})["name"~"{name}",i]["building"];
        )->.named;
        .named map_to_area->.a;
        (
          .named;
          way(area.a)["building"];
          way(area.a)["building:part"];
          way(around:{radius},{lat},{lng})["name"~"{name}",i]["building:part"];
        );
        out geom tags;
        """
        res = overpass(q)
        parts = []
        for el in res.get("elements", []):
            tags = el.get("tags", {})
            rings = []
            if el["type"] == "way" and el.get("geometry"):
                rings = [[[round(p["lon"], 7), round(p["lat"], 7)] for p in el["geometry"]]]
            elif el["type"] == "relation":
                for m in el.get("members", []):
                    if m.get("role") == "outer" and m.get("geometry"):
                        rings.append([[round(p["lon"], 7), round(p["lat"], 7)] for p in m["geometry"]])
            for ring in rings:
                if len(ring) < 4:
                    continue
                if ring[0] == ring[-1]:
                    ring = ring[:-1]
                if ring_area_m2(ring) < 25:
                    continue
                parts.append({
                    "ring": ring,
                    "height": round(height_of(tags), 1),
                    "minHeight": round(float(tags.get("min_height", 0) or 0), 1),
                    "kind": "part" if "building:part" in tags else "building",
                    "name": tags.get("name", ""),
                })
        # if parts exist, the outer "building" outline is just the shell — keep both but tag them
        out["venues"].append({"id": vid, "name": label, "center": [lng, lat], "parts": parts})
        print(f"{label}: {len(parts)} footprints, max height {max([p['height'] for p in parts] or [0])} m", file=sys.stderr)
        time.sleep(2)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)", file=sys.stderr)

if __name__ == "__main__":
    main()
