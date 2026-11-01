#!/usr/bin/env python3
"""Builds public/world/{countries,cities}.json from world-atlas (Natural Earth, public domain).
Usage: build-world.py countries-50m.json ne_50m_populated_places_simple.geojson"""
import json, sys
GREEN = {'United States of America','United Arab Emirates','Singapore'}
BLUE = {'Canada','Australia','Saudi Arabia','Ukraine','South Korea','Japan','Nigeria','Kenya','Venezuela','United Kingdom','Germany','Netherlands','Switzerland','Portugal','Vietnam','Philippines','Malaysia','Georgia','Czechia','Austria','Sweden','Ireland'}
DARK = {'Kazakhstan','Mongolia','Uzbekistan','Turkmenistan','Afghanistan','Bolivia','Paraguay','Ethiopia','Sudan','Tanzania','Dem. Rep. Congo','Angola','Zambia','Mozambique','Zimbabwe','Madagascar','Botswana','Namibia','Libya','Egypt','Myanmar','Laos','Cambodia','Mauritania','Mali','Burkina Faso','Ghana','Cameroon','Uganda','Chile','Argentina','Uruguay','Iraq','Iran','Pakistan','Algeria','Morocco','Tunisia','Peru','Ecuador','Nepal','Bangladesh','Yemen','Syria','Congo','Gabon','Malawi','Papua New Guinea'}
NONE = {'Greenland','Chad','Niger','Central African Rep.','W. Sahara','Somalia','Eritrea','S. Sudan','North Korea','Fr. S. Antarctic Lands','Eq. Guinea'}
t = json.load(open(sys.argv[1]))
sx, sy = t['transform']['scale']; tx, ty = t['transform']['translate']
arcs = []
for a in t['arcs']:
    x = y = 0; pts = []
    for dx, dy in a:
        x += dx; y += dy; pts.append((round(x*sx+tx, 1), round(y*sy+ty, 1)))
    arcs.append(pts)
def ring(r):
    out = []
    for i in r:
        p = arcs[i] if i >= 0 else arcs[~i][::-1]
        out += p if not out else p[1:]
    dd = [out[0]]
    for q in out[1:]:
        if q != dd[-1]: dd.append(q)
    return dd
def clip(r, x, keep_left):
    """Sutherland-Hodgman against the vertical line lng = x."""
    inside = (lambda p: p[0] <= x) if keep_left else (lambda p: p[0] >= x)
    out = []
    for i, q in enumerate(r):
        p = r[i-1]
        if inside(q) != inside(p):
            k = (x-p[0])/(q[0]-p[0]); out.append((x, round(p[1]+k*(q[1]-p[1]), 2)))
        if inside(q): out.append(q)
    if out and out[0] != out[-1]: out.append(out[0])
    return out
def split(poly):
    """Rings stitched across the antimeridian jump by ~360 degrees: unwrap, then cut at 180."""
    o = poly[0]
    if not any(abs(o[i][0]-o[i-1][0]) > 180 for i in range(1, len(o))): return [poly]
    u = [(x+360 if x < 0 else x, y) for x, y in o]
    east = clip(u, 180, True)
    west = [(x-360, y) for x, y in clip(u, 180, False)]
    return [[r] for r in (east, west) if len(r) >= 4]
feats = []
for g in t['objects']['countries']['geometries']:
    n = g['properties']['name']
    if n == 'Antarctica' or 'arcs' not in g: continue
    polys = g['arcs'] if g['type'] == 'MultiPolygon' else [g['arcs']]
    c = [[ring(r) for r in p] for p in polys]
    c = [q for p in c if len(p[0]) >= 4 for q in split(p)]
    b = 4 if n in GREEN else 3 if n in BLUE else 1 if n in DARK else 0 if n in NONE else 2
    feats.append({'type':'Feature','properties':{'b':b},'geometry':{'type':'MultiPolygon','coordinates':c}})
json.dump({'type':'FeatureCollection','features':feats}, open('public/world/countries.json','w'), separators=(',',':'))
p = json.load(open(sys.argv[2]))['features']
p.sort(key=lambda f: -(f['properties'].get('pop_max') or 0))
rows = [[f['properties']['name'], f['properties'].get('adm0name') or '', round(f['properties']['longitude'],3), round(f['properties']['latitude'],3), 1 if f['properties'].get('adm0cap') else 0] for f in p]
json.dump(rows, open('public/world/cities.json','w'), ensure_ascii=False, separators=(',',':'))
print(len(feats), len(rows), sum(r[4] for r in rows))
