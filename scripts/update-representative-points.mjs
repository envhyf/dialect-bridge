// Keep representative places aligned with the atlas's historic city symbols.
// This changes point metadata only: it never moves a dialect boundary.
import {readFile,writeFile} from 'node:fs/promises';
const file=new URL('../dist/data/cities.json',import.meta.url);
const cities=JSON.parse(await readFile(file,'utf8'));
const haikou=cities.find(c=>c.id==='haikou');
Object.assign(haikou,{
 coordinates:[110.350,20.018],
 coordinateNote:'B12 海南插图海口旧城代表位置；替换原先偏西的新城区近似坐标 [110.1983,20.044]。不移动方言区域来匹配现代行政中心。',
 note:'代表所列本地方言，不代表全市居民。坐标使用地图集海口旧城符号对应的近似位置；不是现代市政中心，也不是已收录听辨实验样本。',
 representativeLocationSource:'B12-HN independent registration: Haikou control point'
});
for(const id of ['hongkong','macau']){
 const city=cities.find(c=>c.id===id);
 city.coordinateNote='代表点靠近海岸。原图岛屿与海岸已单独描绘，但扫描配准误差仍可能使现代坐标落在近似轮廓外；未按城市点扩大岛屿或改变方言边界。';
}
cities.find(c=>c.id==='nanning-pinghua').coordinateNote='此坐标仅用于“南宁地区平话”的分类索引，尚未核实到具体平话村落。B14 的平话色块分布在城区外围，不能把市中心坐标当作平话分布范围。';
await writeFile(file,JSON.stringify(cities,null,2)+'\n');
await writeFile(new URL('../dist/data/cities.geojson',import.meta.url),JSON.stringify({type:'FeatureCollection',features:cities.map(c=>({type:'Feature',properties:Object.fromEntries(Object.entries(c).filter(([k])=>k!=='coordinates')),geometry:{type:'Point',coordinates:c.coordinates}}))}));
console.log('Representative place correction applied; no area geometry changed.');
