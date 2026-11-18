import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const module = await import('../dist/estimates.js').catch(()=>({}));
test('estimates require exact city evidence and never turn an average into directions',()=>{
 assert.equal(typeof module.estimatedPair,'function');
 const row={a:'a',b:'b',metric:'sentence_target',value:30,kind:'model-estimate',direction:'bidirectional-mean'};
 const data={records:[row]};
 assert.equal(module.estimatedPair({id:'a'},{id:'b'},data),row);
 assert.equal(module.estimatedPair({id:'b'},{id:'a'},data),row);
 assert.equal(module.estimatedPair({id:'a',kind:'region'},{id:'b'},data),null);
 assert.equal(module.estimatedPair({id:'unknown'},{id:'b'},data),null);
 assert.equal(module.estimatedPair({id:'a'},{id:'a'},data),null);
});
test('published calibration keeps held-out dialects out of all training pairs and beats mean baseline',()=>{
 const data=JSON.parse(readFileSync(new URL('../dist/data/estimates.json',import.meta.url)));
 for(const model of data.models){
  assert.ok(model.validation.mae < model.validation.baselineMae);
  assert.equal(model.validation.folds.length,13);
  for(const fold of model.validation.folds){
   assert.equal(fold.trainPairs.length,66);
   assert.equal(fold.testPairs.length,12);
   assert.ok(fold.trainPairs.every(p=>!p.includes(fold.heldOut)));
   assert.ok(fold.testPairs.every(p=>p.includes(fold.heldOut)));
  }
  assert.ok(model.twoNewDialectsValidation.mae < model.twoNewDialectsValidation.baselineMae);
  assert.equal(model.twoNewDialectsValidation.folds.length,78);
  for(const fold of model.twoNewDialectsValidation.folds){
   assert.equal(fold.trainPairs.length,55);
   assert.ok(fold.trainPairs.every(p=>p.every(id=>!fold.heldOut.includes(id))));
  }
 }
 const measured=JSON.parse(readFileSync(new URL('../dist/data/research.json',import.meta.url)));
 for(const row of data.records){
  assert.equal(row.kind,'model-estimate');
  assert.equal(row.direction,'bidirectional-mean');
  assert.equal(measured.some(r=>r.metric===row.metric&&((r.from===row.a&&r.to===row.b)||(r.from===row.b&&r.to===row.a))),false);
  assert.ok(row.range[0]<=row.value&&row.value<=row.range[1]);
  assert.ok(row.range[0]>=0&&row.range[1]<=100);
 }
 assert.equal(data.records.some(r=>[r.a,r.b].includes('beijing')&&[r.a,r.b].includes('shenyang')),false);
});
