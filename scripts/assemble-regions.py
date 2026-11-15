"""Combine independently registered source sheets; derive partial parent unions.

Never use administrative polygons, buffers or convex hulls to fill missing data.
Source-specific polygons remain separately downloadable and reproducible.
"""
from pathlib import Path
import json, hashlib
from collections import defaultdict
from shapely.geometry import shape,mapping
from shapely.ops import unary_union

root=Path(__file__).resolve().parents[1];data=root/'dist/data'
files=['regions-north.geojson','regions-wu-gan.geojson','regions-south.geojson']
features=[];groups=defaultdict(list)
for file in files:
    for f in json.loads((data/file).read_text('utf8'))['features']:
        p=f['properties'];assert shape(f['geometry']).is_valid and not shape(f['geometry']).is_empty,p['id']
        if p['family']=='汉语':p['family']=p['branch']
        if p['family']=='客家话' and p['branch']==p['cluster']:
            p['sourceBranch']=p['branch'];p['branch']=p['family']
        if 'registrationLOOCVKM' in p:p['registrationRMSEKm']=p['registrationLOOCVKM']
        p['partialCoverage']=p.get('partialCoverage',False) or p.get('coverageComplete') is False
        p['researchStatus']='no-region-wide-measurement'
        features.append(f)
        if p['level']=='小片':groups[(p['family'],p['branch'],p['cluster'],p['source'])].append(f)
parents=[]
for (family,branch,cluster,source),children in groups.items():
    existing=next((f for f in features if f['properties']['level']!='小片' and all(f['properties'].get(k)==v for k,v in [('family',family),('branch',branch),('cluster',cluster),('source',source)])),None)
    if existing:parent=existing
    else:
        ident='parent-'+hashlib.sha256('|'.join([family,branch,cluster,source]).encode()).hexdigest()[:10]
        parent={'type':'Feature','properties':{'id':ident,'name':cluster,'family':family,'branch':branch,'cluster':cluster,'subcluster':None,'level':'片','source':source,'parentId':None,'derivedParent':True,'partialCoverage':True,'coverageComplete':False,'method':'union-of-traced-child-polygons; no gap filling','reviewStatus':'approximate-traced','researchStatus':'no-region-wide-measurement','registrationRMSEKm':max(f['properties']['registrationRMSEKm'] for f in children),'evidenceNote':'仅由已描绘小片的几何并集构成；不是该片完整范围。未描边区域没有补齐。','childIds':[f['properties']['id'] for f in children]},'geometry':mapping(unary_union([shape(f['geometry']) for f in children]))}
        parents.append(parent)
    for f in children:f['properties']['parentId']=parent['properties']['id']
combined=parents+features
assert len({f['properties']['id'] for f in combined})==len(combined)
overlaps=[]
for i,a in enumerate(features):
    for b in features[i+1:]:
        g=shape(a['geometry']).intersection(shape(b['geometry']))
        if g.is_empty or g.area<.00001:continue
        parts=[]
        def collect(part):
            if part.geom_type=='Polygon':parts.append(part)
            elif hasattr(part,'geoms'):
                for child in part.geoms:collect(child)
        collect(g)
        if not parts:continue
        pa,pb=a['properties'],b['properties']
        overlaps.append({'type':'Feature','properties':{'id':pa['id']+'--'+pb['id'],'regionIds':[pa['id'],pb['id']],'names':[pa['name'],pb['name']],'sources':[pa['source'],pb['source']],'status':'boundary-conflict-unresolved','note':'Approximate traces overlap. This marks digitisation/registration uncertainty, not evidence of a bilingual area.'},'geometry':mapping(unary_union(parts))})
(data/'boundary-uncertainty.geojson').write_text(json.dumps({'type':'FeatureCollection','features':overlaps},ensure_ascii=False,separators=(',',':')),encoding='utf8')
meta={'version':'0.3','complete':False,'scope':'Selected Han Chinese dialect regions traced from supplied historical atlas; not a complete national subdivision map','sourceFiles':files,'tracedFeatureCount':len(features),'derivedPartialParentCount':len(parents),'sourceSheets':sorted(set(f['properties']['source'] for f in features)),'limitations':['Manual generalisation, not surveyed town/village boundaries','Registration uncertainty is not linguistic boundary accuracy','Small islands, mixed-language enclaves and coastal outlines are incomplete','Overview fallback is never a completed subdivision','No area-wide intelligibility measurements inferred from city samples']}
(data/'regions.geojson').write_text(json.dumps({'type':'FeatureCollection','metadata':meta,'features':combined},ensure_ascii=False,separators=(',',':')),encoding='utf8')
print(json.dumps(meta,ensure_ascii=False))
