#!/usr/bin/env python3
"""
Real traffic-light positions (OSM highway=traffic_signals) around each city's map area → web/src/data/signals.json
  python3 scripts/fetch_signals.py
Data © OpenStreetMap contributors (ODbL). Phases shown in the app are simulated: live signal timing isn't public.
"""
import json, time, urllib.parse, urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "web/src/data/signals.json"
EPS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
# (city id, [(lat, lng, radius m), ...]) — London covers the Strand/Somerset House and Olympia areas
AREAS = {
    "ldn": [(51.5108, -0.1172, 2600), (51.4963, -0.2096, 1600)],
    "nyc": [(40.7262, -73.9845, 2400)],
    "bgd": [(44.8165, 20.4566, 2400)],
    "ns": [(45.2551, 19.8452, 2400)],
    "sf": [(37.7840, -122.4030, 2600)],  # SoMa · Moscone · Union Square · FiDi
}

def overpass(q):
    data = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for url in EPS:
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "opinion-signals/1.0"})
            with urllib.request.urlopen(req, timeout=120) as r:
                return json.loads(r.read())
        except Exception as e:
            last = e
            time.sleep(5)
    raise SystemExit(f"overpass failed: {last}")

out = {}
import sys
only = sys.argv[1:]  # optional: fetch just these cities and merge into the existing file
existing = json.loads(OUT.read_text())["cities"] if OUT.exists() else {}
out.update(existing)
for city, areas in AREAS.items():
    if only and city not in only:
        continue
    around = "".join(f'node(around:{r},{la},{lo})["highway"="traffic_signals"];' for la, lo, r in areas)
    res = overpass(f"[out:json][timeout:90];({around});out;")
    pts = sorted({(round(e["lon"], 6), round(e["lat"], 6)) for e in res.get("elements", []) if e.get("type") == "node"})
    out[city] = [list(p) for p in pts]
    print(f"{city}: {len(pts)} signals")
    time.sleep(3)
OUT.write_text(json.dumps({"attribution": "© OpenStreetMap contributors (ODbL)", "cities": out}, separators=(",", ":")))
print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")
