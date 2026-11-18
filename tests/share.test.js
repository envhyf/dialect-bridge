import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {scoreBands} from '../dist/listen.js';

test('PNG export includes every mixed-evidence row with estimates and ranges explicitly marked',async()=>{
 const drawn=[];
 const ctx=new Proxy({fillText:(...args)=>drawn.push(args),measureText:s=>({width:String(s).length*10})},{get:(o,k)=>o[k]||(()=>{})});
 const canvas={getContext:()=>ctx,toBlob:cb=>cb({})};
 const runtime=vm.createContext({document:{fonts:{ready:Promise.resolve()},createElement:()=>canvas},URL:{createObjectURL:()=> 'blob:test'},scoreBands,console});
 const source=fs.readFileSync(new URL('../dist/share.js',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
 vm.runInContext(source+'\nmapImage=async()=>({});',runtime);
 runtime.exportContext={mode:'listen',title:'甲听各地',subtitle:'实测与估算',filename:'test',metric:'句中目标词',sources:'Cheng 1997 / Tang 2009 校准',note:'估算误差带，非置信区间',hasEstimates:true,legend:[],rows:Array.from({length:18},(_,i)=>({label:'地点'+i,value:50,color:'#60a99e',kind:i<14?'measured':'model-estimate',range:i<14?undefined:[20,80]}))};
 await vm.runInContext('createShareImage({},exportContext)',runtime);
 assert.ok(canvas.height>1200);
 for(let i=0;i<18;i++)assert.ok(drawn.some(([s])=>s===`地点${i} · ${i<14?'实测':'估算'}`));
 assert.equal(drawn.filter(([s])=>s==='双向平均 · 误差带 20–80%').length,4);
 assert.ok(drawn.some(([s])=>s.includes('Cheng 1997')));
 assert.ok(drawn.every(([,x,y])=>x>=0&&y>=0&&y<=canvas.height));
});
