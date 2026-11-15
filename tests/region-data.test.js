import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {containsPoint,regionSamples} from '../dist/regions.js';
const read=n=>JSON.parse(readFileSync(new URL('../dist/data/'+n,import.meta.url),'utf8'));
const regions=read('regions.geojson').features,cities=read('cities.json'),research=read('research.json');
test('major source cities lie inside their traced regions, not empty circular placeholders',()=>{
 for(const [city,name] of [['suzhou','苏沪嘉小片'],['wenzhou','瓯江片'],['nanchang','昌靖片'],['kunming','昆贵片'],['chengdu','成渝片'],['chongqing','成渝片'],['wuhan','武天片'],['guilin','桂柳片'],['fuzhou','侯官片'],['xiamen','泉漳片']]){
  const point=cities.find(c=>c.id===city),areas=regions.filter(f=>f.properties.name===name);
  assert.ok(areas.some(f=>containsPoint(f,point.coordinates)),`${city} outside ${name}`);
 }
});
test('the Suzhou and Nanchang study is discoverable from its separate source regions',()=>{
 const wu=regions.find(f=>f.properties.id==='wu-taihu-suhujia'),gan=regions.find(f=>f.properties.id==='gan-changjing');
 assert.ok(regionSamples(wu,cities,research).some(c=>c.id==='suzhou'));
 assert.ok(regionSamples(gan,cities,research).some(c=>c.id==='nanchang'));
});
test('overview geometry retains the large extracted Mandarin area after validity repair',()=>{
 const mandarin=read('dialects.geojson').features.find(f=>f.properties.family==='官话');
 for(const id of ['beijing','chengdu','kunming','xian'])assert.ok(containsPoint(mandarin,cities.find(c=>c.id===id).coordinates),id);
});
