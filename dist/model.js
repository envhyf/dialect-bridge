// Taxonomy is categorical only. Numerical results come exclusively from research records.
export const bands = [
 {label:'同一处乡音',phrase:'从熟悉的声音出发。',reason:'这是同一个方言代表点。实验中的同点成绩也未必为满分。'},
 {label:'同片，也各有腔调',phrase:'语言地图上同属一片，听懂多少还需要实验。',reason:'同一方言片是分类关系，不等于经过测试的沟通能力。'},
 {label:'同一区里的不同声音',phrase:'分类上相近，不能直接换算成听懂的比例。',reason:'同一分区；片级归属不同或尚未核实。仅凭这一层关系不推算互通率。'},
 {label:'同源，也可能相隔很远',phrase:'同属一类方言，并不保证彼此能听懂。',reason:'同属一个方言大区，但跨越内部片区。内部差异也可能很大。'},
 {label:'跨过一道乡音边界',phrase:'属于不同方言大区，能否接上话，要看具体两地。',reason:'分属不同方言大区。不能把同一个百分数套给所有跨区组合。'},
];
export function compare(a,b){
 if(!a?.family||!b?.family||!a.id||!b.id)return {score:null,range:null,label:'资料尚未覆盖',phrase:'这里的乡音，留待下一次记录。',reason:'没有足够的分类信息，暂不估计。',level:-1};
 if(a.usageType==='mixed-use-zone'||b.usageType==='mixed-use-zone')return {score:null,range:null,label:'先选定一种乡音',phrase:'原图记载这里存在兼用现象，需要选定具体的汉语方言点，再比较两个方向。',reason:'兼用区不是一种单一方言；区域内的不同语言选择不能合成统一互通率。',level:-1};
 if(a.family==='未定汉语方言'||b.family==='未定汉语方言')return {score:null,range:null,label:'分类关系仍待核实',phrase:'保留原图记载，不把尚未确定的归属当成一种新的方言大区。',reason:'至少一侧的方言归属未确定，暂不排列远近或推算互通程度。',level:-1};
 let level=4;
 if(a.id===b.id)level=0;
 else if(a.family===b.family){
  level=3;
  if(a.branch&&a.branch===b.branch){if(a.branch!==a.family)level=2;if(a.cluster&&a.cluster===b.cluster)level=1;}
 }
 const band=level===0&&(a.kind==='region'||b.kind==='region')?{label:'同一区域，也有不同声音',phrase:'选中了同一个已绘区域，内部的口音和接触经历仍可能不同。',reason:'这是同一个地图区域，不是两名听者的实验，也不代表内部处处互通。'}:bands[level];
 return {...band,score:null,range:null,level};
}
export function haversine(a,b){const r=Math.PI/180;const dl=(b[0]-a[0])*r,dp=(b[1]-a[1])*r;const h=Math.sin(dp/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin(dl/2)**2;return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)));}
export function nearestPoint(c,points,maxKm=100){let best=null;for(const point of points){const distance=haversine(c,point.coordinates);if(distance<=maxKm&&(!best||distance<best.distance))best={point,distance};}return best;}
export function measuredPair(a,b,records,metric='sentence_target'){
 if(!a?.id||!b?.id)return null;
 if(a?.kind==='region'||b?.kind==='region')return null;
 const heardByYou=records.find(r=>r.from===b.id&&r.to===a.id&&r.metric===metric);
 const heardByThem=records.find(r=>r.from===a.id&&r.to===b.id&&r.metric===metric);
 return heardByYou&&heardByThem?{heardByYou,heardByThem}:null;
}
// Journey order is explicit: A SPEAKS, B LISTENS; swapping reverses this task.
export function directionalPair(speaker,listener,records,metric='sentence_target'){
 const pair=measuredPair(speaker,listener,records,metric);
 return pair?{forward:pair.heardByThem,reverse:pair.heardByYou}:null;
}
