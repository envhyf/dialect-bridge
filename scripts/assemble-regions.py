"""Combine independently registered source sheets; derive partial parent unions.

Never use administrative polygons, buffers or convex hulls to fill missing data.
Source-specific polygons remain separately downloadable and reproducible.
"""
from pathlib import Path
import json, hashlib
from collections import defaultdict
from shapely.geometry import shape,mapping
from shapely.ops import unary_union
from pyproj import Geod

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
    existing=[f for f in features if f['properties']['level']!='小片' and all(f['properties'].get(k)==v for k,v in [('family',family),('branch',branch),('cluster',cluster),('source',source)])]
    if existing:parent=existing[0]
    else:
        ident='parent-'+hashlib.sha256('|'.join([family,branch,cluster,source]).encode()).hexdigest()[:10]
        parent={'type':'Feature','properties':{'id':ident,'name':cluster,'family':family,'branch':branch,'cluster':cluster,'subcluster':None,'level':'片','source':source,'parentId':None,'derivedParent':True,'partialCoverage':True,'coverageComplete':False,'method':'union-of-traced-child-polygons; no gap filling','reviewStatus':'approximate-traced','researchStatus':'no-region-wide-measurement','registrationRMSEKm':max(f['properties']['registrationRMSEKm'] for f in children),'evidenceNote':'仅由已描绘小片的几何并集构成；不是该片完整范围。未描边区域没有补齐。','childIds':[f['properties']['id'] for f in children]},'geometry':mapping(unary_union([shape(f['geometry']) for f in children]))}
        parents.append(parent)
    for f in children:
        # A source can draw the same parent cluster as several separate features.
        # Attach each child to the matching piece, not whichever piece was listed first.
        chosen=max(existing,key=lambda candidate:shape(candidate['geometry']).intersection(shape(f['geometry'])).area) if existing else parent
        f['properties']['parentId']=chosen['properties']['id']
combined=parents+features
assert len({f['properties']['id'] for f in combined})==len(combined)
overlaps=[]
geod=Geod(ellps='WGS84')
def compatible_coarse(a,b):
    return (a['level']=='区' and not a.get('cluster') and a['family']==b['family'] and bool(b.get('cluster'))
            and a.get('usageType')!='mixed-use-zone' and b.get('usageType')!='mixed-use-zone'
            and (not a.get('candidateClusters') or b['cluster'] in a['candidateClusters']))
def known_hierarchy(a,b):
    return (a['level']=='片' and b['level']=='小片' and a['family']==b['family'] and a['branch']==b['branch']
            and bool(a.get('cluster')) and a['cluster']==b['cluster'] and a.get('usageType')!='mixed-use-zone' and b.get('usageType')!='mixed-use-zone')
for i,a in enumerate(features):
    for b in features[i+1:]:
        pa,pb=a['properties'],b['properties']
        # A known parent containing its child is hierarchy, not disputed ownership.
        if pa.get('parentId')==pb['id'] or pb.get('parentId')==pa['id']:continue
        g=shape(a['geometry']).intersection(shape(b['geometry']))
        if g.is_empty or g.area<.00001:continue
        parts=[]
        def collect(part):
            if part.geom_type=='Polygon':parts.append(part)
            elif hasattr(part,'geoms'):
                for child in part.geoms:collect(child)
        collect(g)
        if not parts:continue
        overlap=unary_union(parts)
        compatible=compatible_coarse(pa,pb) or compatible_coarse(pb,pa)
        hierarchy=known_hierarchy(pa,pb) or known_hierarchy(pb,pa)
        status='compatible-hierarchy-overlap' if hierarchy else 'compatible-coarse-overlap' if compatible else 'boundary-conflict-unresolved'
        note='Same named cluster with parent/child levels across source sheets; preserve both geometries and prefer the child for selection.' if hierarchy else 'Same family; one source lacks subdivision boundaries. Prefer the compatible finer classification for clicks, retaining both source geometries.' if compatible else 'Approximate traces overlap. Geometry alone cannot establish mixed usage; consult explicit source usage notes.'
        overlaps.append({'type':'Feature','properties':{'id':pa['id']+'--'+pb['id'],'regionIds':[pa['id'],pb['id']],'names':[pa['name'],pb['name']],'sources':[pa['source'],pb['source']],'areaKm2':round(abs(geod.geometry_area_perimeter(overlap)[0])/1e6,2),'status':status,'note':note},'geometry':mapping(overlap)})
(data/'boundary-uncertainty.geojson').write_text(json.dumps({'type':'FeatureCollection','features':overlaps},ensure_ascii=False,separators=(',',':')),encoding='utf8')
meta={'version':'0.4','complete':False,'scope':'Han Chinese dialect regions traced from supplied historical atlas; legend coverage is not boundary completeness','sourceFiles':files,'tracedFeatureCount':len(features),'derivedPartialParentCount':len(parents),'sourceSheets':sorted(set(f['properties']['source'] for f in features),key=lambda s:int(s[1:])),'boundaryConflictCount':sum(f['properties']['status']=='boundary-conflict-unresolved' for f in overlaps),'compatibleCoarseOverlapCount':sum(f['properties']['status']=='compatible-coarse-overlap' for f in overlaps),'compatibleHierarchyOverlapCount':sum(f['properties']['status']=='compatible-hierarchy-overlap' for f in overlaps),'limitations':['Manual generalisation, not surveyed town/village boundaries','Registration uncertainty is not linguistic boundary accuracy','Small islands, mixed-language enclaves and coastal outlines are incomplete','Overview fallback is never a completed subdivision','No area-wide intelligibility measurements inferred from city samples']}
(data/'regions.geojson').write_text(json.dumps({'type':'FeatureCollection','metadata':meta,'features':combined},ensure_ascii=False,separators=(',',':')),encoding='utf8')
print(json.dumps(meta,ensure_ascii=False))
