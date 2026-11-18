// Estimates are symmetric pair means. They must never enter directionalPair().
export function estimatedPair(a,b,dataset,metric='sentence_target'){
 if(!a?.id||!b?.id||a.id===b.id||a.kind==='region'||b.kind==='region')return null;
 return (dataset?.records||[]).find(r=>r.metric===metric&&r.kind==='model-estimate'&&r.direction==='bidirectional-mean'&&((r.a===a.id&&r.b===b.id)||(r.a===b.id&&r.b===a.id)))||null;
}
