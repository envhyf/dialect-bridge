// GeoJSON uses longitude/latitude. Small regional rings do not cross the antimeridian.
function inRing(p,ring){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[j],b=ring[i],cross=(p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]);
  if(Math.abs(cross)<1e-10&&p[0]>=Math.min(a[0],b[0])&&p[0]<=Math.max(a[0],b[0])&&p[1]>=Math.min(a[1],b[1])&&p[1]<=Math.max(a[1],b[1]))return true;
  if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
export function containsPoint(feature,p){
 const g=feature.geometry,ps=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
 return ps.some(rings=>inRing(p,rings[0])&&!rings.slice(1).some(r=>inRing(p,r)));
}
export function regionSamples(feature,cities,records){
 const p=feature.properties,ids=new Set(records.flatMap(r=>[r.from,r.to]));
 return cities.filter(c=>ids.has(c.id)&&c.family===p.family&&(!p.branch||p.branch===p.family||c.branch===p.branch)&&(!p.cluster||!c.cluster||c.cluster===p.cluster)&&containsPoint(feature,c.coordinates));
}
export function regionEntity(feature,centroid){return {...feature.properties,kind:'region',feature,coordinates:centroid,variety:feature.properties.name};}
export function visibleRegions(features,level){return level==='family'?[]:features.filter(f=>level==='subcluster'||f.properties.level!=='小片').sort((a,b)=>(a.properties.level==='小片')-(b.properties.level==='小片'));}
export function candidatesAt(features,level,point){
 const candidates=visibleRegions(features,level).filter(f=>containsPoint(f,point));
 return candidates.filter(f=>!candidates.some(c=>c.properties.parentId===f.properties.id));
}
export function conflictVisible(conflict,features,level){
 if(level==='family')return false;
 const visibleIds=conflict.properties.regionIds.map(id=>{const p=features.find(f=>f.properties.id===id)?.properties;return level==='cluster'&&p?.level==='小片'?p.parentId:id;}).filter(Boolean);
 return new Set(visibleIds).size>1;
}
