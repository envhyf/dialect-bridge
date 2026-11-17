"""Derive display-only shared linework; do not move or clip dialect polygons."""
import json, hashlib
from pathlib import Path
from shapely.geometry import shape, mapping
from shapely.ops import unary_union
from shapely import make_valid, line_merge

root = Path(__file__).resolve().parents[1] / 'dist' / 'data'
read = lambda name: json.loads((root / name).read_text(encoding='utf-8'))
base = read('basemap.json')['features']
areas = [shape(f['geometry']) for f in base if f['geometry']['type'] in ('Polygon', 'MultiPolygon')]
records = []
def add(id, geometries):
    merged = line_merge(unary_union(geometries))
    assert merged.is_valid and not merged.is_empty
    records.append({'type':'Feature','properties':{'id':id},'geometry':mapping(merged)})
add('admin', [g.boundary for g in areas])
add('outline', [unary_union([make_valid(g) for g in areas]).boundary])
regions = read('regions.geojson')['features']
for level in ('cluster', 'subcluster'):
    fs = [f for f in regions if level == 'subcluster' or f['properties']['level'] != '小片']
    add(level, [shape(f['geometry']).boundary for f in fs])
output = {'type':'FeatureCollection','metadata':{'purpose':'Display-only union of boundary linework. Outer administrative outline uses make_valid to repair invalid provider rings before union. Exact input polygon geometry retained in source files; no simplification, smoothing, datum conversion or administrative clipping.','sourceFiles':['basemap.json','regions.geojson'],'sourceSHA256':{n:hashlib.sha256((root/n).read_text(encoding='utf-8').encode('utf-8')).hexdigest() for n in ('basemap.json','regions.geojson')}},'features':records}
(root / 'map-lines.geojson').write_text(json.dumps(output,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
print('Shared map linework:', len(records), 'layers; source polygons unchanged.')
