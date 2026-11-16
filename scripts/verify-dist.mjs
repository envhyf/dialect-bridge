import assert from 'node:assert/strict';
import {readFile,readdir,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const root=resolve('dist');
const read=async file=>JSON.parse(await readFile(join(root,file),'utf8'));
const html=await readFile(join(root,'index.html'),'utf8');
assert.ok(html.includes('乡音桥')&&!html.includes('乡音之间'),'brand');
for(const m of html.matchAll(/(?:src|href)="([^"]+)"/g)){
 if(/^(?:https?:|data:|#|\.\/$)/.test(m[1]))continue;
 await stat(join(root,m[1].split('?')[0]));
}
const cities=await read('data/cities.json');const ids=new Set(cities.map(c=>c.id));
assert.equal(ids.size,cities.length);
const records=await read('data/research.json');
assert.equal(records.length,450);
assert.equal(new Set(records.map(r=>`${r.from}/${r.to}/${r.metric}`)).size,450);
assert.ok(records.every(r=>ids.has(r.from)&&ids.has(r.to)&&r.value>=0&&r.value<=100));
const regions=await read('data/regions.geojson');
const regionIds=new Set(regions.features.map(f=>f.properties.id));
assert.equal(regionIds.size,regions.features.length,'unique area identifiers');
const overview=await read('data/dialects.geojson');
const entityIds=[...ids,...regionIds,...overview.features.map(f=>f.properties.id)];
assert.ok(entityIds.every(id=>typeof id==='string'&&id.length));
assert.equal(new Set(entityIds).size,entityIds.length,'point, detailed-area and overview identifiers must not collide');
assert.equal(regions.metadata.complete,false,'partial transcription must be explicit');
for(const f of regions.features){
 const p=f.properties;
 assert.ok(['Polygon','MultiPolygon'].includes(f.geometry.type),'areas must have area geometry');
 assert.ok(['官话','晋语','吴语','徽语','赣语','湘语','客家话','粤语','平话','闽语','儋州话','未定汉语方言'].includes(p.family),'Han dialect family');
 assert.ok(['区','片','小片'].includes(p.level),'actual hierarchy level');
 assert.ok(!p.parentId||regionIds.has(p.parentId),'parent exists');
 assert.equal(p.researchStatus,'no-region-wide-measurement','no fabricated area score');
 if(!p.derivedParent){
  assert.ok(p.sourceBoundary.length>=4);assert.ok(p.sourceImageSize.length===2);assert.ok(Number.isFinite(p.registrationRMSEKm));
  const parts=p.sourceParts||[{outer:p.sourceBoundary,holes:p.sourceHoles||[]}];
  assert.ok(parts.length>0,'source outline cannot disappear');
  for(const part of parts){
   assert.ok(Array.isArray(part.outer)&&part.outer.length>=3,'sourceParts uses {outer,holes} objects, including the first part');
   for(const ring of [part.outer,...(part.holes||[])])assert.ok(ring.every(c=>c.length===2&&c.every(Number.isFinite)&&c[0]>=0&&c[1]>=0&&c[0]<=p.sourceImageSize[0]&&c[1]<=p.sourceImageSize[1]),'source pixels stay in original scan frame');
  }
 }
 const polygons=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
 assert.ok(polygons.length>0);
 for(const rings of polygons)for(const ring of rings){assert.ok(ring.length>=4);assert.deepEqual(ring[0],ring.at(-1));assert.ok(ring.every(c=>c.length===2&&c.every(Number.isFinite)&&c[0]>65&&c[0]<140&&c[1]>15&&c[1]<55));}
}
assert.equal(regions.metadata.tracedFeatureCount,regions.features.filter(f=>!f.properties.derivedParent).length);
const catalog=await read('data/studies.json');
assert.ok(catalog.studies.every(s=>s.url.startsWith('https://')&&s.status&&s.type));
assert.ok(catalog.studies.filter(s=>s.status!=='verified-directional-tables').every(s=>s.numericDataset===null),'unverified or structural studies cannot add listener scores');
const atlas=await read('atlas/manifest.json');
for(const f of regions.features.filter(f=>!f.properties.derivedParent)){
 const p=f.properties,source=atlas.find(a=>a.id===p.source);
 assert.ok(source,'region must reference a known atlas sheet');
 assert.deepEqual(p.sourceImageSize,[source.width,source.height],'insets retain the full original sheet pixel frame');
}
assert.ok(atlas.every(a=>a.available===false&&!a.file),'Public archive must contain source metadata only');
assert.deepEqual((await readdir(join(root,'atlas'))).sort(),['manifest.json'],'Original scans must never enter public artifacts');
async function check(dir){for(const name of await readdir(dir)){const file=join(dir,name),s=await stat(file);if(s.isDirectory())await check(file);else assert.ok(!/\.(jpe?g|png|webp|pdf|zip|tar|gz)$/i.test(name),'Unexpected binary source material: '+name);}}
await check(root);
console.log(`Public dist verified: ${cities.length} representative points, ${records.length} observations, ${atlas.length} source records; no original scans.`);
