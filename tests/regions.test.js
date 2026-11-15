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
 const unrelated={...feature,properties:{...feature.properties,id:'other'}};
 const fs=[parent,child,sibling,unrelated];
 assert.deepEqual(candidatesAt(fs,'subcluster',[.5,.5]).map(f=>f.properties.id),['other','child','sibling']);
 assert.deepEqual(candidatesAt(fs,'cluster',[.5,.5]).map(f=>f.properties.id),['region-a','other']);
 const conflict={properties:{regionIds:['child','sibling']}};
 assert.equal(conflictVisible(conflict,fs,'cluster'),false);
 assert.equal(conflictVisible(conflict,fs,'subcluster'),true);
 assert.equal(conflictVisible(conflict,fs,'family'),false);
});
