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
// A geometric centroid can fall in a hole or between islands. Prefer a prepared
// interior anchor; for legacy data choose an interior horizontal scan segment.
export function regionLabelCoordinates(feature,centroid){
 for(const point of [feature.properties?.labelCoordinates,centroid])if(Array.isArray(point)&&point.every(Number.isFinite)&&containsPoint(feature,point))return point;
 const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
 const area=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0));
 const rings=[...polygons].sort((a,b)=>area(b[0])-area(a[0]))[0];
 const ys=[...new Set(rings.flatMap(r=>r.map(p=>p[1])))].sort((a,b)=>a-b);
 const slices=ys.slice(1).map((y,i)=>({y:(y+ys[i])/2,height:y-ys[i]})).sort((a,b)=>b.height-a.height).slice(0,64);
 let best=null,width=-1;
 for(const {y} of slices){
  const xs=[];
  for(const ring of rings)for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const a=ring[j],b=ring[i];if((a[1]>y)!==(b[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));
  }
  xs.sort((a,b)=>a-b);
  for(let i=0;i+1<xs.length;i+=2){const span=xs[i+1]-xs[i],point=[(xs[i]+xs[i+1])/2,y];if(span>width&&containsPoint(feature,point)){best=point;width=span;}}
 }
 return best||rings[0][0];
}
export function regionEntity(feature,centroid){return {...feature.properties,kind:'region',feature,coordinates:regionLabelCoordinates(feature,centroid),variety:feature.properties.name};}
export function visibleRegions(features,level){const rank={'区':0,'片':1,'小片':2};return level==='family'?[]:features.filter(f=>level==='subcluster'||f.properties.level!=='小片').sort((a,b)=>(rank[a.properties.level]??0)-(rank[b.properties.level]??0));}
export function compatibleCoarseCover(coarse,fine){
 const a=coarse.properties,b=fine.properties;
 return a.level==='区'&&!a.cluster&&a.family===b.family&&!!b.cluster&&a.usageType!=='mixed-use-zone'&&b.usageType!=='mixed-use-zone'&&(!a.candidateClusters?.length||a.candidateClusters.includes(b.cluster));
}
export function knownHierarchyCover(parent,child){
 const a=parent.properties,b=child.properties;
 return a.level==='片'&&b.level==='小片'&&a.family===b.family&&a.branch===b.branch&&!!a.cluster&&a.cluster===b.cluster&&a.usageType!=='mixed-use-zone'&&b.usageType!=='mixed-use-zone';
}
function redundantDerivedParent(derived,traced){
 const a=derived.properties,b=traced.properties;
 return !!a.derivedParent&&!b.derivedParent&&a.level===b.level&&a.family===b.family&&a.branch===b.branch&&!!a.cluster&&a.cluster===b.cluster&&a.usageType!=='mixed-use-zone'&&b.usageType!=='mixed-use-zone';
}
export function candidatesAt(features,level,point){
 const candidates=visibleRegions(features,level).filter(f=>containsPoint(f,point));
 return candidates.filter(f=>!candidates.some(c=>c.properties.parentId===f.properties.id||knownHierarchyCover(f,c)||compatibleCoarseCover(f,c)||redundantDerivedParent(f,c)));
}
export function conflictVisible(conflict,features,level){
 if(level==='family')return false;
 if(['compatible-coarse-overlap','compatible-hierarchy-overlap'].includes(conflict.properties.status))return false;
 const visibleIds=conflict.properties.regionIds.map(id=>{const p=features.find(f=>f.properties.id===id)?.properties;return level==='cluster'&&p?.level==='小片'?p.parentId:id;}).filter(Boolean);
 return new Set(visibleIds).size>1;
}
