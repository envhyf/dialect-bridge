import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {listeningScores,scoreColor} from '../dist/listen.js';
const read=n=>JSON.parse(readFileSync(new URL('../dist/data/'+n,import.meta.url),'utf8'));
const cities=read('cities.json'),records=read('research.json'),suzhou=cities.find(c=>c.id==='suzhou');
test('one-place exploration respects who hears whom, without treating self-controls as peers',()=>{
 const incoming=listeningScores(suzhou,cities,records,'sentence_target','in');
 const outgoing=listeningScores(suzhou,cities,records,'sentence_target','out');
 assert.equal(incoming.length,14);assert.equal(outgoing.length,14);
 assert.equal(incoming.find(r=>r.peer.id==='nanchang').value,28);
 assert.equal(outgoing.find(r=>r.peer.id==='nanchang').value,13);
 assert.ok(incoming.every(r=>r.to.id==='suzhou'&&r.from.id!=='suzhou'));
 assert.ok(incoming.every((r,i)=>i===0||r.value<=incoming[i-1].value));
});
test('unknown places and entire regions never acquire neighbours’ measurements',()=>{
 assert.deepEqual(listeningScores({...suzhou,kind:'region'},cities,records,'sentence_target'),[]);
 assert.deepEqual(listeningScores(cities.find(c=>c.id==='haikou'),cities,records,'sentence_target'),[]);
 assert.notEqual(scoreColor(0),scoreColor(null));
 assert.notEqual(scoreColor(14),scoreColor(15));
});
