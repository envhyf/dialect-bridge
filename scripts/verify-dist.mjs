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
const atlas=await read('atlas/manifest.json');
assert.ok(atlas.every(a=>a.available===false&&!a.file),'Public archive must contain source metadata only');
assert.deepEqual((await readdir(join(root,'atlas'))).sort(),['manifest.json'],'Original scans must never enter public artifacts');
async function check(dir){for(const name of await readdir(dir)){const file=join(dir,name),s=await stat(file);if(s.isDirectory())await check(file);else assert.ok(!/\.(jpe?g|png|webp|pdf|zip|tar|gz)$/i.test(name),'Unexpected binary source material: '+name);}}
await check(root);
console.log(`Public dist verified: ${cities.length} representative points, ${records.length} observations, ${atlas.length} source records; no original scans.`);
