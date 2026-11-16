import {test} from 'node:test';
import assert from 'node:assert/strict';
import {containsPoint,regionSamples,regionEntity,visibleRegions,candidatesAt,conflictVisible} from '../dist/regions.js';
import {measuredPair} from '../dist/model.js';
const feature={type:'Feature',properties:{id:'region-a',name:'试验片',family:'吴语',branch:'吴语',cluster:'试验片',level:'片'},geometry:{type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[2,1],[2,2],[1,2],[1,1]]]}};
test('area hit testing honours holes, borders and disconnected islands',()=>{
 assert.equal(containsPoint(feature,[.5,.5]),true);
 assert.equal(containsPoint(feature,[1.5,1.5]),false);
 assert.equal(containsPoint(feature,[4,3]),true);
 assert.equal(containsPoint(feature,[5,3]),false);
 const multi={geometry:{type:'MultiPolygon',coordinates:[feature.geometry.coordinates,[[[6,6],[7,6],[7,7],[6,6]]]]}};
 assert.equal(containsPoint(multi,[6.7,6.5]),true);
});
test('research links require geographic containment and consistent taxonomy',()=>{
 const cs=[{id:'ok',family:'吴语',cluster:'试验片',coordinates:[.5,.5]},{id:'hole',family:'吴语',coordinates:[1.5,1.5]},{id:'other',family:'赣语',coordinates:[.5,.5]},{id:'untested',family:'吴语',coordinates:[.5,.5]}];
 assert.deepEqual(regionSamples(feature,cs,[{from:'ok',to:'hole'},{from:'other',to:'ok'}]).map(c=>c.id),['ok']);
});
test('area never inherits percentage from its sample city, even with colliding IDs',()=>{
 const area=regionEntity(feature,[2,2]);area.id='suzhou';
 const p={id:'nanchang',kind:'point'};const records=[{from:'suzhou',to:'nanchang',value:13,metric:'sentence_target'},{from:'nanchang',to:'suzhou',value:28,metric:'sentence_target'}];
 assert.equal(measuredPair(area,p,records),null);
});
test('small-region mode retains known parent coverage and adds traced children',()=>{
 const child={...feature,properties:{...feature.properties,id:'child',level:'小片',parentId:'region-a'}};
 assert.deepEqual(visibleRegions([feature,child],'cluster').map(f=>f.properties.id),['region-a']);
 assert.deepEqual(visibleRegions([feature,child],'subcluster').map(f=>f.properties.id),['region-a','child']);
 assert.deepEqual(visibleRegions([feature,child],'family'),[]);
});
test('conflicts preserve alternatives but suppress a containing parent and irrelevant fine-level hatching',()=>{
 const parent=feature;
 const child={...feature,properties:{...feature.properties,id:'child',level:'小片',parentId:'region-a'}};
 const sibling={...feature,properties:{...child.properties,id:'sibling'}};
 const unrelated={...feature,properties:{...feature.properties,id:'other',cluster:'另一个片'}};
 const fs=[parent,child,sibling,unrelated];
 assert.deepEqual(candidatesAt(fs,'subcluster',[.5,.5]).map(f=>f.properties.id),['other','child','sibling']);
 assert.deepEqual(candidatesAt(fs,'cluster',[.5,.5]).map(f=>f.properties.id),['region-a','other']);
 const conflict={properties:{regionIds:['child','sibling']}};
 assert.equal(conflictVisible(conflict,fs,'cluster'),false);
 assert.equal(conflictVisible(conflict,fs,'subcluster'),true);
 assert.equal(conflictVisible(conflict,fs,'family'),false);
});
test('a compatible unsplit colour area does not hide or dispute finer source classification',()=>{
 const coarse={...feature,properties:{...feature.properties,id:'coarse',level:'区',cluster:null,candidateClusters:['试验片']}};
 assert.deepEqual(visibleRegions([feature,coarse],'cluster').map(f=>f.properties.id),['coarse','region-a']);
 assert.deepEqual(candidatesAt([feature,coarse],'cluster',[.5,.5]).map(f=>f.properties.id),['region-a']);
 assert.equal(conflictVisible({properties:{status:'compatible-coarse-overlap',regionIds:['coarse','region-a']}},[feature,coarse],'cluster'),false);
 const incompatible={...coarse,properties:{...coarse.properties,candidateClusters:['另一个片']}};
 assert.equal(candidatesAt([feature,incompatible],'cluster',[.5,.5]).length,2);
 const mixed={...coarse,properties:{...coarse.properties,usageType:'mixed-use-zone'}};
 assert.equal(candidatesAt([feature,mixed],'cluster',[.5,.5]).length,2);
 const knownBranch={...coarse,properties:{...coarse.properties,cluster:'另一区'}};
 assert.equal(candidatesAt([feature,knownBranch],'cluster',[.5,.5]).length,2);
});
test('a named parent on another source sheet is not a second competing small region',()=>{
 const child={...feature,properties:{...feature.properties,id:'child',level:'小片',parentId:'different-source-parent',source:'B13'}};
 const parent={...feature,properties:{...feature.properties,source:'B15'}};
 assert.deepEqual(candidatesAt([parent,child],'subcluster',[.5,.5]).map(f=>f.properties.id),['child']);
 assert.deepEqual(candidatesAt([parent,child],'cluster',[.5,.5]).map(f=>f.properties.id),['region-a']);
 const derived={...parent,properties:{...parent.properties,id:'different-source-parent',derivedParent:true}};
 assert.deepEqual(candidatesAt([derived,parent,child],'cluster',[.5,.5]).map(f=>f.properties.id),['region-a']);
 assert.deepEqual(candidatesAt([derived,parent,child],'subcluster',[.5,.5]).map(f=>f.properties.id),['child']);
 const different={...parent,properties:{...parent.properties,branch:'另一分区'}};
 assert.equal(candidatesAt([different,child],'subcluster',[.5,.5]).length,2);
 const mixed={...parent,properties:{...parent.properties,usageType:'mixed-use-zone'}};
 assert.equal(candidatesAt([mixed,child],'subcluster',[.5,.5]).length,2);
 assert.equal(conflictVisible({properties:{status:'compatible-hierarchy-overlap',regionIds:['region-a','child']}},[parent,child],'subcluster'),false);
});
