#!/usr/bin/env python3
"""
Real sports venues from OpenStreetMap → two files used by the app (and the feeds worker):
  web/src/data/sport-majors.json   stadiums · arenas · sports centres · ice rinks (named, with footprints)
  web/src/data/sport-pitches.json  every pitch/court near the map area: football, tennis, basketball, …
  python3 scripts/fetch_sports.py            # all cities
  python3 scripts/fetch_sports.py sf bgd     # just these, merged into the existing files
Data © OpenStreetMap contributors (ODbL).
"""
import json, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_MAJ = ROOT / "web/src/data/sport-majors.json"
OUT_PIT = ROOT / "web/src/data/sport-pitches.json"
EPS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]

# city: (lat, lng, stadium radius m, named-centre radius m, pitch radius m, prefer Latin-Serbian names)
CITIES = {
    "ldn": (51.5072, -0.1276, 26000, 12000, 7000, False),   # Wembley, Twickenham, Wimbledon, Olympic Park, O2
    "nyc": (40.7484, -73.9857, 30000, 10000, 6000, False),  # MetLife, UBS Arena, Prudential, Arthur Ashe
    "sf": (37.7749, -122.4194, 70000, 12000, 6000, False),  # Levi's (Santa Clara), SAP Center, PayPal Park
    "bgd": (44.8125, 20.4573, 16000, 10000, 6000, True),
    "ns": (45.2671, 19.8335, 10000, 8000, 5000, True),
}

# kind ids — keep in sync with web/src/lib/sports.ts
KINDS = ["stadium", "arena", "centre", "soccer", "tennis", "basketball", "baseball", "field", "swim", "ice", "other"]
K = {k: i for i, k in enumerate(KINDS)}


def sport_kind(sport: str) -> int:
    s = (sport or "").split(";")[0].strip()
    if s in ("soccer", "futsal"): return K["soccer"]
    if s in ("tennis", "padel", "table_tennis", "squash", "badminton", "pickleball"): return K["tennis"]
    if s in ("basketball", "netball"): return K["basketball"]
    if s in ("baseball", "softball"): return K["baseball"]
    if s in ("american_football", "rugby_union", "rugby_league", "rugby", "cricket", "gaelic_games", "australian_football", "field_hockey", "hockey", "lacrosse"): return K["field"]
    if s in ("swimming",): return K["swim"]
    if s in ("ice_hockey", "ice_skating"): return K["ice"]
    return K["other"]


def overpass(q):
    data = urllib.parse.urlencode({"data": q}).encode()
    last = None
    for url in EPS:
        for _ in range(2):
            try:
                req = urllib.request.Request(url, data=data, headers={"User-Agent": "opinion-sports/1.0"})
                with urllib.request.urlopen(req, timeout=240) as r:
                    return json.loads(r.read())
            except Exception as e:
                last = e
                time.sleep(8)
    raise SystemExit(f"overpass failed: {last}")


def ring_of(e):
    """outer ring of a way / multipolygon (largest outer member), as [[lng,lat],...] decimated to ≤ 48 points"""
    pts = []
    if e["type"] == "way":
        pts = [(g["lon"], g["lat"]) for g in e.get("geometry", []) if g]
    elif e["type"] == "relation":
        outers = [m for m in e.get("members", []) if m.get("role") in ("outer", "") and m.get("geometry")]
        if outers:
            best = max(outers, key=lambda m: len(m["geometry"]))
            pts = [(g["lon"], g["lat"]) for g in best["geometry"] if g]
    if len(pts) < 4:
        return None
    step = max(1, len(pts) // 48)
    ring = pts[::step]
    if ring[-1] != pts[-1]:
        ring.append(pts[-1])
    return [[round(x, 6), round(y, 6)] for x, y in ring]


def center_of(e):
    if e["type"] == "node":
        return e["lon"], e["lat"]
    if "center" in e:
        return e["center"]["lon"], e["center"]["lat"]
    b = e.get("bounds")
    if b:
        return (b["minlon"] + b["maxlon"]) / 2, (b["minlat"] + b["maxlat"]) / 2
    return None


ARENA_RE = re.compile(r"arena|garden|cent(er|re)|hall|dvorana|hala|pavilion|coliseum|dome", re.I)


def major_kind(t):
    lei = t.get("leisure")
    if lei == "stadium": return K["stadium"]
    if lei == "ice_rink": return K["ice"]
    if lei == "sports_hall" or ARENA_RE.search(t.get("name", "")) and t.get("building"): return K["arena"]
    return K["centre"]


def names(t, latin):
    keys = (["name:sr-Latn", "name:en", "name"] if latin else ["name", "name:en"]) + ["alt_name", "official_name", "short_name", "old_name", "name:sr-Latn", "alt_name:en"]
    out = []
    for k in keys:
        for v in (t.get(k) or "").split(";"):
            v = v.strip()
            if v and v not in out:
                out.append(v)
    return out


def save():
    attr = "© OpenStreetMap contributors (ODbL)"
    OUT_MAJ.write_text(json.dumps({"attribution": attr, "kinds": KINDS, "cities": maj_all}, ensure_ascii=False, separators=(",", ":")))
    OUT_PIT.write_text(json.dumps({"attribution": attr, "kinds": KINDS, "cities": pit_all}, separators=(",", ":")))
    print(f"  saved {OUT_MAJ.name} ({OUT_MAJ.stat().st_size // 1024} KB), {OUT_PIT.name} ({OUT_PIT.stat().st_size // 1024} KB)", flush=True)


maj_all = json.loads(OUT_MAJ.read_text())["cities"] if OUT_MAJ.exists() else {}
pit_all = json.loads(OUT_PIT.read_text())["cities"] if OUT_PIT.exists() else {}
only = sys.argv[1:]

for city, (la, lo, r_st, r_mid, r_pit, latin) in CITIES.items():
    if only and city not in only:
        continue
    res = overpass(f"""[out:json][timeout:200];(
      nwr["leisure"="stadium"](around:{r_st},{la},{lo});
      nwr["leisure"~"^(sports_centre|sports_hall|ice_rink)$"]["name"](around:{r_mid},{la},{lo});
    );out geom;""")
    majors, seen = [], set()
    for e in res.get("elements", []):
        t = e.get("tags", {})
        c = center_of(e) or (lambda r: r and (sum(p[0] for p in r) / len(r), sum(p[1] for p in r) / len(r)))(ring_of(e))
        if not c:
            continue
        nm = names(t, latin)
        k = major_kind(t)
        if not nm and k != K["stadium"]:
            continue
        key = (nm[0] if nm else "") + f"{round(c[0], 3)}{round(c[1], 3)}"
        if key in seen:
            continue
        seen.add(key)
        m = {"n": nm[0] if nm else "", "k": k, "s": sport_kind(t.get("sport", "")), "p": [round(c[0], 6), round(c[1], 6)]}
        if len(nm) > 1: m["a"] = nm[1:6]
        if t.get("capacity", "").isdigit(): m["c"] = int(t["capacity"])
        if k in (K["stadium"], K["arena"], K["ice"]):
            r = ring_of(e)
            if r: m["r"] = r
        majors.append(m)
    # biggest first: the label layer draws in order
    majors.sort(key=lambda m: (-(m.get("c") or 0), m["k"]))
    maj_all[city] = majors
    time.sleep(4)

    res = overpass(f'[out:json][timeout:200];nwr["leisure"="pitch"](around:{r_pit},{la},{lo});out tags center;')
    pts = set()
    for e in res.get("elements", []):
        c = center_of(e)
        if c:
            pts.add((round(c[0], 5), round(c[1], 5), sport_kind(e.get("tags", {}).get("sport", ""))))
    pit_all[city] = [list(p) for p in sorted(pts)]
    by = {}
    for p in pts: by[KINDS[p[2]]] = by.get(KINDS[p[2]], 0) + 1
    save()
    print(f"{city}: {len(majors)} majors ({sum(1 for m in majors if m['k'] == 0)} stadiums) · {len(pts)} pitches {by}", flush=True)
    time.sleep(4)

