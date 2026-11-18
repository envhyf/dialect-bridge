"""Source topology and geographic label regressions; no private scan required."""
import json
from pathlib import Path
from shapely.geometry import shape,Point,Polygon
from shapely.ops import unary_union
root=Path(__file__).resolve().parents[1]
features=json.loads((root/'dist/data/regions.geojson').read_text('utf8'))['features']
byid={f['properties']['id']:f for f in features}
for f in features:
    assert shape(f['geometry']).contains(Point(f['properties']['labelCoordinates'])),f['properties']['id']
assert 'b4-qinlong-6' in byid,'Preserve the printed Zhengning enclave'
assert 'b4-qinlong-7' not in byid,'Do not regenerate the false Tongxin sliver'
def pixels(id):
    return unary_union([Polygon(q['outer'],q['holes']) for q in byid[id]['properties']['sourceParts']])
def point(x,y):return Point(x*3106/1800,y*2306/1336)
for id,xy in [('xiang-changyi',(690,637)),('xiang-loushao',(520,700)),('xiang-jixu',(200,560)),('xiang-loushao',(182,693)),('gan-dongsui',(320,830))]:
    assert pixels(id).contains(point(*xy)),(id,xy)
ids=['xiang-changyi','xiang-loushao','xiang-jixu','gan-dongsui']
for i,a in enumerate(ids):
    for b in ids[i+1:]:assert pixels(a).intersection(pixels(b)).area<.1,(a,b)
assert not any(pixels(id).contains(point(260,580)) for id in ids),'Xianghua footprint must remain outside Xiang/Gan'
assert sum(len(q['outer']) for id in ids for q in byid[id]['properties']['sourceParts'])>1200
print('Boundary revision passed: all interior labels, true enclave retained, false sliver removed, shared Xiang/Gan interfaces and printed texture samples verified.')
