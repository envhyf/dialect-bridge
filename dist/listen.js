import {directionalPair} from './model.js';

export const scoreBands=[
 {min:70,label:'70–100%',color:'#60a99e'},
 {min:40,label:'40–69%',color:'#85b5d0'},
 {min:15,label:'15–39%',color:'#d9bd72'},
 {min:0,label:'0–14%',color:'#d69a6e'}
];
export function scoreColor(value){return Number.isFinite(value)?scoreBands.find(b=>value>=b.min)?.color||'#b9b9b0':'#b9b9b0';}
export function listeningScores(anchor,cities,records,metric,direction='in'){
 if(!anchor||anchor.kind==='region')return [];
 return cities.filter(c=>c.id!==anchor.id).flatMap(peer=>{
  const from=direction==='in'?peer:anchor,to=direction==='in'?anchor:peer;
  const result=directionalPair(from,to,records,metric);
  return result?[{peer,from,to,record:result.forward,value:result.forward.value}]:[];
 }).sort((a,b)=>b.value-a.value||a.peer.name.localeCompare(b.peer.name,'zh-CN'));
}
