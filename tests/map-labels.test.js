import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as regions from '../dist/regions.js';
import {estimatedPair} from '../dist/estimates.js';
import {listeningScores,scoreColor} from '../dist/listen.js';
import {directionalPair} from '../dist/model.js';

const app=fs.readFileSync(new URL('../dist/app.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/load\(\);\s*$/,'');
function runtime(){const context=vm.createContext({window:{d3:{}},document:{},...regions,estimatedPair,listeningScores,scoreColor,directionalPair});vm.runInContext(app,context);return context;}
test('region labels use the actual classification and cities keep their names',()=>{
 const context=runtime();
 const result=vm.runInContext(`[
  displayName({kind:'region',name:'成渝片·片块2',cluster:'成渝片',humanLabel:'成都・重庆',placeExamples:['成都','重庆']}),
  displayName({kind:'region',name:'区名·片块12',subcluster:'吴化小片',cluster:'高阳片'}),
  displayName({kind:'region',name:'未分类区域·片块12'}),
  displayName({kind:'point',name:'成都',cluster:'成渝片'})
 ]`,context);
 assert.deepEqual([...result],['成渝片','吴化小片','未分类区域','成都']);
});

test('listening evidence keeps measurements first and symmetric estimates separate',()=>{
 const context=runtime();
 const result=vm.runInContext(`state.anchor={id:'a',name:'A',kind:'point'};state.cities=[state.anchor,{id:'b',name:'B',kind:'point'},{id:'c',name:'C',kind:'point'},{id:'d',name:'D',kind:'point'}];
 state.research=[{from:'a',to:'b',metric:'sentence_target',value:20},{from:'b',to:'a',metric:'sentence_target',value:30}];
 state.estimates={records:[{a:'a',b:'b',metric:'sentence_target',kind:'model-estimate',direction:'bidirectional-mean',value:55,range:[30,80]},{a:'a',b:'c',metric:'sentence_target',kind:'model-estimate',direction:'bidirectional-mean',value:60,range:[40,80]}]};
 const incoming=listeningEvidence();state.listenDirection='out';const outgoing=listeningEvidence();
 [incoming.map(r=>[r.peer.id,r.kind,r.value]),outgoing.map(r=>[r.peer.id,r.kind,r.value])];`,context);
 assert.deepEqual(JSON.parse(JSON.stringify(result)),[[['b','measured',30],['c','model-estimate',60]],[['b','measured',20],['c','model-estimate',60]]]);
});

test('estimated pair cards and sharing preserve one symmetric mean and its uncertainty',()=>{
 const context=runtime();
 const result=vm.runInContext(`state.origin={id:'a',name:'甲',kind:'point'};state.target={id:'b',name:'乙',kind:'point'};
 state.estimates={records:[{a:'a',b:'b',metric:'sentence_target',kind:'model-estimate',direction:'bidirectional-mean',value:55,range:[30,80]}]};
 const share=shareContext(),card=estimateCard(state.estimates.records[0]);[share,card];`,context);
 const share=result[0];
 assert.equal(share.rows.length,1);
 assert.equal(share.rows[0].kind,'model-estimate');
 assert.deepEqual([...share.rows[0].range],[30,80]);
 assert.match(share.title,/↔/);
 assert.match(share.sources,/Cheng 1997/);
 assert.match(result[1],/双向平均/);
 assert.match(result[1],/30–80%/);
 assert.doesNotMatch(result[1],/① → ②|② → ①/);
});
test('selected regions have labels but only real cities receive point markers',()=>{
 const context=runtime();
 const nodes=[];
 const selection={selectAll:()=>({remove:()=>{}}),append:tag=>{
  const node={tag,attrs:{},attr(k,v){this.attrs[k]=v;return this},style(){return this},datum(d){this.data=d;return this},text(s){this.label=s;return this}};
  nodes.push(node);return node;
 }};
 Object.assign(context,{testSelection:selection});
 vm.runInContext(`selected=testSelection;projection=p=>p;path=()=>'';
 const testArea={kind:'region',id:'area',name:'成渝片',cluster:'成渝片',coordinates:[100,30],feature:{properties:{id:'area'},geometry:{type:'Polygon',coordinates:[]}}};
 const testCity={kind:'point',id:'chengdu',name:'成都',coordinates:[104.07,30.67]};
 drawSelection(testArea,testCity);`,context);
 assert.equal(nodes.filter(n=>n.tag==='circle').length,1);
 const marker=nodes.find(n=>n.tag==='circle');
 assert.equal(marker.attrs.cx,104.07);
 assert.equal(marker.attrs.cy,30.67);
 assert.deepEqual(nodes.filter(n=>n.tag==='text').map(n=>n.label),['① 成渝片','② 成都']);
});
