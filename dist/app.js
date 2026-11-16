import {compare,haversine,directionalPair} from './model.js';
import {regionEntity,regionSamples,visibleRegions,candidatesAt,conflictVisible,containsPoint} from './regions.js';
const $=id=>document.getElementById(id), d3=window.d3;
const state={cities:[],research:[],atlas:[],regions:[],entities:[],origin:null,target:null,mode:'family',detail:'subcluster',list:'points',pickOrigin:true,transform:null,metric:'sentence_target'};
const familyColors={'官话':'#acbf8e','晋语':'#bd9bc5','吴语':'#60a99e','徽语':'#d9bd72','赣语':'#85b5d0','湘语':'#d49f9e','客家话':'#bda27d','粤语':'#d69a6e','平话':'#a3b46d','闽语':'#8b9fd0','儋州话':'#b3aaa0','未定汉语方言':'#b9b9b0'};
const selectionColors=['#216dab','#ad4b20'];
const levelNames=['同一代表点','同一方言片','同一分区','同一方言大区','跨方言大区'];
let svg,viewport,projection,path,dialectPaths,regionLayer,regionPaths,regionLabels,uncertaintyLayer,dots,labels,route,selected,zoom,settlementLayer,tooltipTimer;
const labelCities=new Set(['beijing','harbin','urumqi','lanzhou','xian','chengdu','chongqing','kunming','wuhan','changsha','nanchang','shanghai','hangzhou','fuzhou','xiamen','guangzhou','nanning','haikou','taipei','taiyuan','jinan','nanjing','shenyang']);
function txt(id,t){$(id).textContent=t;}
function esc(t){return String(t??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));}
function taxonomy(c){return [...new Set([c.family,c.branch,c.cluster,c.subcluster].filter(Boolean))].join(' / ');}
function displayName(c){
 if(c.kind!=='region')return c.name;
 if(c.humanLabel)return c.humanLabel;
 if(c.placeExamples?.length)return c.placeExamples.slice(0,2).join('・')+'一带';
 const cities=state.cities.filter(p=>p.family===c.family&&containsPoint(c.feature,p.coordinates));
 return cities.length?cities.slice(0,2).map(p=>p.name).join('・')+'一带':c.name;
}
function populateSelectors(){
 const options='<optgroup label="按地名选择 · 代表方言点">'+state.cities.map(c=>`<option value="${c.id}">${esc(c.name)} · ${esc(c.family)}</option>`).join('')+'</optgroup><optgroup label="按地图区域选择 · 不套用城市实测">'+state.entities.filter(c=>c.kind==='region'&&!c.derivedParent).map(c=>`<option value="${c.id}">${esc(displayName(c))} · ${esc(c.name)}</option>`).join('')+'</optgroup>';
 for(const id of ['origin','target'])$(id).innerHTML=options;
 // Partial parent regions can also be selected from the map at cluster level.
 for(const c of state.entities.filter(c=>c.derivedParent))for(const id of ['origin','target'])$(id).add(new Option(displayName(c)+' · '+c.name,c.id));
}
function setSelectionSide(origin){state.pickOrigin=origin;updateSelectionUI();renderList();}
function updateSelectionUI(){
 for(const [id,on] of [['pick-origin',state.pickOrigin],['map-pick-a',state.pickOrigin],['pick-target',!state.pickOrigin],['map-pick-b',!state.pickOrigin]])$(id).setAttribute('aria-pressed',String(on));
 $('origin-stop').classList.toggle('active',state.pickOrigin);$('target-stop').classList.toggle('active',!state.pickOrigin);
 txt('map-hint',state.pickOrigin?'点击区域，设为 ① 说话地':'再点一个区域，设为 ② 听话地');
 txt('list-title',`为 ${state.pickOrigin?'①':'②'} 选择${state.list==='points'?'地点':'区域'}`);
}
function selectedAreas(c){
 if(c.kind==='region')return [c.feature];
 const fs=candidatesAt(state.regions,'subcluster',c.coordinates).filter(f=>{const p=f.properties;return p.family===c.family&&(!p.cluster||!c.cluster||p.cluster===c.cluster)&&(!p.branch||p.branch===p.family||p.branch===c.branch);});
 // Ambiguous source outlines stay ambiguous; do not silently assign a city.
 return fs.length===1?fs:[];
}
function drawSelection(a,b){
 selected.selectAll('*').remove();
 const endpoints=[a,b].map((c,i)=>({c,i,color:selectionColors[i],areas:selectedAreas(c)}));
 const parents=new Map(),areas=new Map();
 for(const endpoint of endpoints)for(const f of endpoint.areas){
  if(!areas.has(f.properties.id))areas.set(f.properties.id,{f,color:endpoint.color});
  const parent=state.regions.find(p=>p.properties.id===f.properties.parentId);
  if(parent){const pp=parent.properties;
   for(const part of state.regions.filter(p=>p.properties.level===pp.level&&p.properties.family===pp.family&&p.properties.branch===pp.branch&&p.properties.cluster===pp.cluster))if(!parents.has(part.properties.id))parents.set(part.properties.id,{f:part,color:endpoint.color});
  }
 }
 // All background glows and white separators precede both directional outlines.
 // This preserves A's solid line when two different cities share the same area.
 for(const {f,color} of parents.values())selected.append('path').attr('class','selected-parent').attr('d',path(normalize(f))).attr('fill',color).attr('stroke',color);
 for(const {f,color} of areas.values())selected.append('path').attr('class','selection-fill').attr('d',path(normalize(f))).attr('fill',color);
 for(const {f} of areas.values())selected.append('path').attr('class','selection-halo').attr('d',path(normalize(f)));
 for(const {i,color,areas:fs} of endpoints)for(const f of fs)selected.append('path').attr('class','selected-region').attr('d',path(normalize(f))).attr('fill','none').attr('stroke',color).attr('stroke-dasharray',i?'7 3':null);
 for(const {c,i,color} of endpoints){
  if(i&&a.id===b.id)continue;
  const p=projection(c.coordinates);
  selected.append('circle').attr('cx',p[0]).attr('cy',p[1]).attr('fill',color).attr('stroke',a.id===b.id?selectionColors[1]:'#fff').attr('stroke-width',2).style('pointer-events','none');
  selected.append('text').datum(c).attr('class','active-city-label').style('fill',color).text(`${a.id===b.id?'①②':i?'②':'①'} ${displayName(c)}`);
 }
}
function renderDirectionChart(a,b,m){
 $('direction-chart').innerHTML=[{from:a,to:b,record:m?.forward,label:'① → ②',reverse:false},{from:b,to:a,record:m?.reverse,label:'② → ①',reverse:true}].map(r=>`<div class="direction-row${r.reverse?' reverse':''}"><div class="direction-caption"><span>${r.label} <b>${esc(displayName(r.from))}</b>说 · ${esc(displayName(r.to))}听</span><strong>${r.record?r.record.value+'%':'暂无实测'}</strong></div><div class="direction-track${r.record?'':' unknown'}" aria-hidden="true">${r.record?`<span style="width:${r.record.value}%"></span>`:''}</div></div>`).join('')+'<div class="direction-axis" aria-hidden="true"><span>0</span><span>50</span><span>100%</span></div>';
}
function observedLabel(c){return c.id==='wuhan'?'汉口':c.id==='meizhou'?'梅县':c.name;}
function toast(t){txt('toast',t);$('toast').hidden=false;clearTimeout(tooltipTimer);tooltipTimer=setTimeout(()=>$('toast').hidden=true,4600);}
function normalize(feature){const f=JSON.parse(JSON.stringify(feature));function rings(rs){rs.forEach((r,i)=>{let area=0;for(let k=1;k<r.length;k++)area+=r[k-1][0]*r[k][1]-r[k][0]*r[k-1][1];if((i===0&&area>0)||(i>0&&area<0))r.reverse();});}if(f.geometry.type==='Polygon')rings(f.geometry.coordinates);if(f.geometry.type==='MultiPolygon')f.geometry.coordinates.forEach(rings);return f;}
async function load(){
 try{
  if(!d3)throw Error('地图绘图库未加载');
  const files=['cities.json','dialects.geojson','basemap.json','metadata.json','research.json','settlements.geojson','regions.geojson','boundary-uncertainty.geojson','studies.json'];
  const values=await Promise.all(files.map(async f=>{const r=await fetch('data/'+f);if(!r.ok)throw Error(f+' '+r.status);return r.json();}));
  [state.cities,state.dialects,state.basemap,state.metadata,state.research,state.settlements,state.regionData,state.uncertainty,state.studyCatalog]=values;
  state.cities.forEach(c=>c.kind='point');state.regions=state.regionData.features;
  state.entities=[...state.regions.map(f=>regionEntity(f,d3.geoCentroid(normalize(f)))),...state.dialects.features.map(f=>regionEntity(f,d3.geoCentroid(normalize(f)))),...state.cities];
  state.atlas=await fetch('atlas/manifest.json').then(r=>r.json());
  const q=new URLSearchParams(location.search);state.origin=state.entities.find(c=>c.id===q.get('from'))||state.cities.find(c=>c.id==='suzhou');state.target=state.entities.find(c=>c.id===q.get('to'))||state.cities.find(c=>c.id==='nanchang');state.metric=q.get('metric')==='word_category'?'word_category':'sentence_target';
  if(['family','cluster','subcluster'].includes(q.get('detail')))state.detail=q.get('detail');
  populateSelectors();
  $('detail-level').value=state.detail;buildMap();bind();render();
  if(state.origin.kind==='region'&&state.target.kind==='region'&&state.origin.level!=='大区'&&state.target.level!=='大区'){
   const bounds=path.bounds({type:'FeatureCollection',features:[state.origin.feature,state.target.feature].map(normalize)}),dx=bounds[1][0]-bounds[0][0],dy=bounds[1][1]-bounds[0][1],k=Math.min(5,.68/Math.max(dx/1000,dy/780));
   svg.call(zoom.transform,d3.zoomIdentity.translate(500,410).scale(k).translate((bounds[0][0]+bounds[1][0])/-2,(bounds[0][1]+bounds[1][1])/-2));
  }
 }catch(e){console.error(e);$('map-error').hidden=false;txt('origin-taxonomy','资料未载入，请重新载入页面。');txt('result-title','暂时没有读到地图');txt('result-phrase','请检查本地文件或网络连接，点击地图里的“重新载入”。');}
}
function buildMap(){
 svg=d3.select('#map').attr('viewBox','0 0 1000 780');
 svg.append('defs').html('<pattern id="unknown-hatch" patternUnits="userSpaceOnUse" width="6" height="6"><path d="M0 6L6 0" stroke="#bdc7b7" stroke-width=".5" opacity=".3"/></pattern>');
 svg.select('defs').append('pattern').attr('id','boundary-hatch').attr('patternUnits','userSpaceOnUse').attr('width',5).attr('height',5).html('<path d="M0 5L5 0" stroke="#90744d" stroke-width="1" opacity=".65"/>');
 viewport=svg.append('g');
 const basemap={type:'FeatureCollection',features:state.basemap.features.filter(f=>f.geometry.type!=='MultiLineString'&&f.geometry.type!=='LineString').map(normalize)};
 const fit={type:'FeatureCollection',features:basemap.features.map(f=>({...f,geometry:f.geometry.type==='MultiPolygon'?{...f.geometry,coordinates:f.geometry.coordinates.filter(p=>p[0].some(c=>c[1]>18))}:f.geometry}))};
 projection=d3.geoConicConformal().parallels([25,47]).rotate([-105,0]).center([0,36]).fitExtent([[30,70],[970,710]],fit);
 path=d3.geoPath(projection);
 viewport.append('path').attr('class','graticule').attr('d',path(d3.geoGraticule().extent([[70,15],[140,56]]).step([10,10])()));
 viewport.append('g').selectAll('path').data(basemap.features).join('path').attr('class','province').attr('d',path);
 viewport.append('g').selectAll('path').data(basemap.features).join('path').attr('fill','url(#unknown-hatch)').attr('d',path).style('pointer-events','none');
 dialectPaths=viewport.append('g').selectAll('path').data(state.dialects.features.map(normalize)).join('path').attr('class','dialect-shape overview-shape').attr('d',path).attr('tabindex',0).attr('role','button').attr('aria-label',d=>d.properties.family+'，总图大区，片界未覆盖处').on('mousemove',(event,d)=>showTooltip(event,`${d.properties.family} · 总图`, `此处暂无更细的已描边区域<br>点击查看分类；没有地域互通率`)).on('mouseleave',hideTooltip).on('click',(event,d)=>{event.stopPropagation();choose(entityFor(d));}).on('keydown',(event,d)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();choose(entityFor(d));}});
 regionLayer=viewport.append('g').attr('class','region-layer');
 updateRegionLayer();
 uncertaintyLayer=viewport.append('g').attr('class','boundary-uncertainty');
 uncertaintyLayer.selectAll('path').data(state.uncertainty.features.map(normalize)).join('path').attr('d',path).attr('fill','url(#boundary-hatch)').on('mousemove',(e,d)=>showTooltip(e,'边界交叠 · 归属待核',`${d.properties.names.map(esc).join(' / ')}<br>近似描线交叠；不能仅凭交叠判定实际并用。<br>点击查看候选区域`)).on('mouseleave',hideTooltip).on('click',(e,d)=>{e.stopPropagation();chooseAt(e);});
 viewport.append('g').selectAll('path').data(basemap.features).join('path').attr('class','province-line').attr('d',path);
 // Administrative boundaries remain independent and never determine dialect colours.
 viewport.append('g').selectAll('path').data(state.basemap.features.filter(f=>/LineString/.test(f.geometry.type))).join('path').attr('class','province-line').attr('d',path);
 settlementLayer=viewport.append('g').attr('class','settlements');
 settlementLayer.selectAll('path').data(state.settlements.features).join('path').attr('class','settlement').attr('transform',d=>`translate(${projection(d.geometry.coordinates)})`).attr('d',d3.symbol().type(d3.symbolTriangle).size(12)).attr('fill','#ab7859').attr('stroke','#fafcf7').attr('stroke-width','.5').attr('tabindex',0).attr('role','button').attr('aria-label',d=>d.properties.name+'，查看原图').on('mousemove',(event,d)=>showTooltip(event,'客家话居民点',`${esc(d.properties.name)}<br>原图三角符号转录 · 点击看出处`)).on('mouseleave',hideTooltip).on('click',(event,d)=>{event.stopPropagation();settlementDialog(d);}).on('keydown',(event,d)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();settlementDialog(d);}});
 route=viewport.append('path').attr('class','route-line');
 const measuredIds=new Set(state.research.map(r=>r.from));
 dots=viewport.append('g').attr('class','research-points').selectAll('circle').data(state.cities.filter(c=>measuredIds.has(c.id))).join('circle').attr('class','place-dot').attr('cx',d=>projection(d.coordinates)[0]).attr('cy',d=>projection(d.coordinates)[1]).attr('r',3).attr('tabindex',0).attr('role','button').style('display','none').on('mousemove',(e,c)=>showCityTooltip(e,c)).on('mouseleave',hideTooltip).on('click',(e,c)=>{e.stopPropagation();choose(c);}).on('keydown',(e,c)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(c);}});
 labels=viewport.append('g').selectAll('text').data(state.cities.filter(c=>labelCities.has(c.id))).join('text').attr('class','city-label').attr('x',d=>projection(d.coordinates)[0]+7).attr('y',d=>projection(d.coordinates)[1]+4).text(d=>d.name);
 selected=viewport.append('g');
 zoom=d3.zoom().scaleExtent([.85,8]).translateExtent([[-300,-300],[1300,1100]]).on('zoom',e=>{state.transform=e.transform;viewport.attr('transform',e.transform);hideTooltip();resizeMarkers(e.transform.k);});
 svg.call(zoom).on('dblclick.zoom',null).on('click',e=>{if(!e.defaultPrevented)toast('此处暂无已收录的汉语方言区域边界。空白表示资料未覆盖。');});
 state.transform=d3.zoomIdentity;
 const ro=new ResizeObserver(()=>resizeMarkers(state.transform?.k||1));ro.observe($('map-stage'));
}
function entityFor(f){return state.entities.find(c=>c.id===f.properties.id);}
function chooseAt(e,fallback=null){
 const position=projection.invert((state.transform||d3.zoomIdentity).invert(d3.pointer(e,svg.node())));
 const candidates=candidatesAt(state.regions,state.detail,position);
 if(candidates.length<=1){choose(candidates.length?entityFor(candidates[0]):fallback?entityFor(fallback):null);return;}
 openDialog('这个位置，边界仍待核对',`<p>以下原图近似轮廓在这里交叠。配准和描线尚未消除冲突，暂不替你判定归属。单凭几何交叠不能判定混合区；原图明确记载的并用现象另见各区域说明。</p>${candidates.map(f=>`<button class="candidate-region" data-candidate="${f.properties.id}"><strong>${esc(displayName(entityFor(f)))}</strong><span>${esc(f.properties.name)} · ${esc(taxonomy(f.properties))} · ${f.properties.source}</span></button>`).join('')}`);
 $('dialog-body').querySelectorAll('[data-candidate]').forEach(el=>el.onclick=()=>{$('info-dialog').close();choose(state.entities.find(c=>c.id===el.dataset.candidate));});
}
function updateRegionLayer(){
 const fs=visibleRegions(state.regions,state.detail).map(normalize);
 regionPaths=regionLayer.selectAll('path').data(fs,d=>d.properties.id).join('path').attr('class','dialect-shape region-shape').attr('d',path).attr('tabindex',0).attr('role','button').attr('aria-label',d=>`${taxonomy(d.properties)}，查看区域与研究`).on('mousemove',(e,d)=>showTooltip(e,displayName(entityFor(d)),`${esc(taxonomy(d.properties))}<br>${d.properties.source} 原图描边 · 点击查看研究`)).on('mouseleave',hideTooltip).on('click',(e,d)=>{e.stopPropagation();chooseAt(e,d);}).on('keydown',(e,d)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(entityFor(d));}});
 regionLabels=regionLayer.selectAll('text').data(fs.filter(f=>!f.properties.derivedParent),d=>d.properties.id).join('text').attr('class','region-label').attr('x',d=>projection(entityFor(d).coordinates)[0]).attr('y',d=>projection(entityFor(d).coordinates)[1]).text(d=>$('show-technical').checked?d.properties.name:displayName(entityFor(d)));
}
function resizeMarkers(k){
 const zoomScale=k;k*=Math.abs(svg.node().getScreenCTM()?.a||1);
 dots?.attr('r',3.2/k);labels?.style('font-size','12px').style('stroke-width','3px').attr('x',6).attr('y',3).attr('transform',d=>`translate(${projection(d.coordinates)}) scale(${1/k})`);
 regionLabels?.style('font-size','12px').style('stroke-width','3px').attr('x',0).attr('y',0).attr('transform',d=>`translate(${projection(entityFor(d).coordinates)}) scale(${1/k})`).style('display',zoomScale>=2.3?null:'none');
 selected?.selectAll('circle').attr('r',7/k);selected?.selectAll('text').style('font-size','15px').style('stroke-width','3px').attr('x',0).attr('y',0).attr('dx',11).attr('dy',-9).attr('transform',d=>`translate(${projection(d.coordinates)}) scale(${1/k})`);
 svg?.select('#unknown-hatch').attr('patternTransform',`scale(${1/k})`);
 svg?.select('#boundary-hatch').attr('patternTransform',`scale(${1/k})`);
 settlementLayer?.selectAll('path').attr('d',d3.symbol().type(d3.symbolTriangle).size(12/(k*k)));
 const occupied=[...document.querySelectorAll('.map-heading,.map-controls,.map-action,.north-mark')].map(el=>el.getBoundingClientRect()),mapBox=$('map-stage').getBoundingClientRect();
 [regionLabels,labels].forEach(selection=>selection?.each(function(d){
  const el=d3.select(this);if(this.classList.contains('city-label'))el.style('display',[state.origin?.id,state.target?.id].includes(d.id)?'none':null);
  if(getComputedStyle(this).display==='none')return;
  const b=this.getBoundingClientRect();
  if(b.left<mapBox.left+4||b.right>mapBox.right-4||b.top<mapBox.top+4||b.bottom>mapBox.bottom-4){el.style('display','none');return;}
  if(occupied.some(r=>b.left<r.right+4&&b.right>r.left-4&&b.top<r.bottom+3&&b.bottom>r.top-3))el.style('display','none');else occupied.push(b);
 }));
}
function choose(c){if(!c)return;hideTooltip();if(state.pickOrigin){state.origin=c;state.pickOrigin=false;}else state.target=c;render();}
function render(){
 const a=state.origin,b=state.target,r=compare(a,b),m=directionalPair(a,b,state.research,state.metric);
 $('origin').value=a.id;$('target').value=b.id;
 txt('origin-taxonomy',taxonomy(a));txt('target-taxonomy',taxonomy(b));updateSelectionUI();
 txt('map-origin',`① ${displayName(a)} → ② ${displayName(b)}`);txt('from-name',displayName(a));txt('to-name',displayName(b));txt('pair-varieties',`${a.variety||a.name} → ${b.variety||b.name}`);
 renderDirectionChart(a,b,m);
 const hasArea=a.kind==='region'||b.kind==='region';
 const anchorKnown=a.family!=='未定汉语方言'&&a.usageType!=='mixed-use-zone';
 txt('range',a.id===b.id&&hasArea?'同一已绘区域':levelNames[r.level]||'尚未分类');txt('distance',hasArea?'区域比较':Math.round(haversine(a.coordinates,b.coordinates)).toLocaleString()+' km');
 $('relationship').innerHTML=[a,b].map(c=>`<span>${esc(displayName(c))} · ${esc(taxonomy(c))}</span>`).join('<span class="tree-link">↔</span>');
 txt('reason',r.reason);txt('pair-sources',`${a.source} / ${b.source} · 另可查看 A2 总图`);
 if(m){
  txt('score-heading',`① 说 → ② 听 · ${state.metric==='sentence_target'?'句中目标词':'孤立词分类'}测试`);txt('score',m.forward.value);txt('score-unit','%');txt('reverse-score',m.reverse.value+'%');
  txt('evidence-label',`Tang 2009 · 表 ${m.forward.table} · 不是日常对话理解率`);
  const v=m.forward.value;txt('result-title',v>=70?'这一次，话能接得上':v>=40?'听见一些熟悉的线索':v>=15?'像隔着一层字幕':'熟悉的字，陌生的声');
  txt('result-phrase',`实验里，${observedLabel(a)}话说给${observedLabel(b)}听者，${state.metric==='sentence_target'?'句中目标词翻译':'孤立词义类分类'}正确率为 ${v}%。换个方向，成绩是 ${m.reverse.value}%。`);
  txt('conversation-tip',state.metric==='sentence_target'?'不是“十句话听懂几句”，而是句子里指定词语的翻译成绩。每个方向 15 位听者、60 次回答。':'这是十选一的词语义类测试，随机猜测基线为 10%。它与句中目标词翻译任务不能混用。');
 }else{
  txt('score-heading',hasArea?'这两片乡音，尚无区域层面的实测':'这两地，尚无收录的互通实验');txt('score','—');txt('score-unit','未收录实测');txt('reverse-score','—');txt('evidence-label','没有实测，不从同片、邻近城市推算百分比');
  txt('result-title',a.id===b.id&&hasArea&&r.level>=0?'同一区域，也有不同声音':r.label);txt('result-phrase',r.phrase);txt('conversation-tip',hasArea?'下方列出落在所选区域内、分类一致的实验样本。样本的测试成绩只属于具体方言点，不能涂满整个片区。':'可以读出方言分类关系，不能据此知道个人听懂多少。已有研究样本可在左侧“找地点”中查看。');
 }
 dialectPaths.attr('fill',d=>state.mode==='family'?familyColors[d.properties.family]||'#d9dfce':!anchorKnown?'#e5e5dd':d.properties.family===a.family?'#adc29a':'#e1dfca').attr('opacity',.87);
 regionPaths.attr('fill',d=>{const c=d.properties;if(state.mode==='family')return familyColors[c.family]||'#ccd5c5';if(!anchorKnown||c.family==='未定汉语方言'||c.usageType==='mixed-use-zone')return '#e5e5dd';if(a.id===c.id)return '#52795d';if(compare(a,c).level===1)return '#8fae8a';return c.family===a.family?'#b3c5a1':'#dddec9';}).attr('fill-opacity',.94);
 uncertaintyLayer.style('display',state.detail==='family'?'none':null);
 uncertaintyLayer.selectAll('path').style('display',d=>conflictVisible(d,state.regions,state.detail)?null:'none');
 dots.attr('fill',c=>{if(state.mode==='family')return familyColors[c.family]||'#829b73';return '#537b62';}).attr('aria-label',c=>`${c.name}，${c.variety}，实验样本，点击比较`).style('display',$('show-research').checked?null:'none');
 labels.style('display',c=>[a.id,b.id].includes(c.id)?'none':null);
 const interpolate=d3.geoInterpolate(a.coordinates,b.coordinates);route.attr('d',hasArea?null:path({type:'LineString',coordinates:d3.range(0,1.001,.025).map(interpolate)}));
 drawSelection(a,b);resizeMarkers(state.transform?.k||1);
 if(state.mode==='family')$('legend').innerHTML=Object.entries(familyColors).map(([n,c])=>`<span class="legend-item"><i style="background:${c}"></i>${n}</span>`).join('');
 else if(!anchorKnown)$('legend').innerHTML='<span class="legend-item">①为兼用或归属待核区域，暂不显示分类远近。</span>';
 else $('legend').innerHTML='<span class="legend-item"><i style="background:#8fae8a"></i>同片</span><span class="legend-item"><i style="background:#b3c5a1"></i>同大区</span><span class="legend-item"><i style="background:#dddec9"></i>其他已分类方言区</span><span class="legend-item">灰色：兼用或归属待核；浅底：未覆盖</span>';
 txt('layer-note',`${state.regions.filter(f=>!f.properties.derivedParent).length} 个详图描边区域 · ${state.detail==='subcluster'?'小片未收录处保留片界':state.detail==='cluster'?'片级视图':'总图视图'}。蓝①说话、橙②听话；小片实线/虚线描边，所属片淡亮。棕色斜纹：交叠待核。`);
 renderRegionFacts();renderList();const u=new URL(location.href);u.searchParams.set('from',a.id);u.searchParams.set('to',b.id);u.searchParams.set('metric',state.metric);u.searchParams.set('detail',state.detail);history.replaceState(null,'',u);
}
function listPair(c){return state.pickOrigin?directionalPair(c,state.target,state.research,state.metric):directionalPair(state.origin,c,state.research,state.metric);}
function renderList(){
 txt('list-direction',state.pickOrigin?`列表成绩：候选地说 → ${displayName(state.target)}听`:`列表成绩：${displayName(state.origin)}说 → 候选地听`);
 const q=$('search').value.trim().toLowerCase(),isArea=state.list==='regions';let cs=(isArea?state.entities.filter(c=>c.kind==='region'&&c.level!=='大区'&&!c.derivedParent):state.cities).filter(c=>`${displayName(c)}${c.name}${c.variety}${taxonomy(c)}${c.id}`.toLowerCase().includes(q));
 cs.sort((a,b)=>{if($('sort').value==='name')return a.family.localeCompare(b.family,'zh-CN')||a.name.localeCompare(b.name,'zh-CN');const x=listPair(a),y=listPair(b);if(!!x!==!!y)return x?-1:1;if(x&&y)return y.forward.value-x.forward.value;const anchor=state.pickOrigin?state.target:state.origin;const rank=c=>{const level=compare(anchor,c).level;return level<0?99:level;};return rank(a)-rank(b)||a.name.localeCompare(b.name,'zh-CN');});
 $('city-list').innerHTML=cs.length?cs.map(c=>{const m=listPair(c);return `<button class="city-row${c.id===(state.pickOrigin?state.origin.id:state.target.id)?' active':''}" data-city="${c.id}"><strong>${esc(displayName(c))}</strong><small>${esc(c.kind==='region'?c.name+' · '+c.family:c.variety||c.family)}</small><span class="row-score">${m?m.forward.value+'<small>%</small>':'<small>'+(isArea?c.level:'代表点')+'</small>'}</span></button>`;}).join(''):'<p class="empty-list">暂未收录这个区域。<br>可切换“找地点”查找城市；不以城市圆圈代替片界。</p>';
 $('city-list').querySelectorAll('[data-city]').forEach(el=>el.onclick=()=>{const c=state.entities.find(c=>c.id===el.dataset.city);choose(c);if(c.kind==='region')focusRegion(c);});
 txt('list-count',isArea?`${cs.length} 个已描边片区 · 全国细分尚未齐备`:`${cs.length} 个代表点 · 15 个进入已收录实验`);
}
function focusRegion(c){const b=path.bounds(normalize(c.feature)),dx=b[1][0]-b[0][0],dy=b[1][1]-b[0][1],k=Math.min(8,.65/Math.max(dx/1000,dy/780));svg.call(zoom.transform,d3.zoomIdentity.translate(500,390).scale(k).translate(-(b[0][0]+b[1][0])/2,-(b[0][1]+b[1][1])/2));}
function samples(c){return c.kind==='region'?regionSamples(c.feature,state.cities,state.research):state.research.some(r=>r.from===c.id)?[c]:[];}
function studyCards(family=null){
 return state.studyCatalog.studies.filter(s=>!family||s.families.includes(family)).map(s=>`<a class="study-card" href="${esc(s.url)}" target="_blank" rel="noreferrer"><strong>${esc(s.title)} ↗</strong><small>${esc(s.authors)} · ${s.year}<br>${esc(s.label)}<br>${esc(s.summary)}</small></a>`).join('');
}
function researchCatalog(){openDialog('互通研究目录',`<p class="notice">听者实验、距离研究、原表待核，分开列出。相关文献不代表当前区域或点对已有实测成绩。</p>${studyCards()}<p>核验日期：${state.studyCatalog.checkedOn} · <a href="data/studies.json" download>下载研究目录 ↓</a></p>`);}
function renderRegionFacts(){
 const c=state.target,area=c.kind==='region',as=samples(state.origin),bs=samples(c);
 $('region-facts').innerHTML=`<div class="region-kicker">② 听话地 · ${area?'区域档案':'地点档案'} · ${esc(c.source)}</div><h3>${esc(displayName(c))}</h3><p class="region-taxonomy">${esc(taxonomy(c))}</p>${area?`<p>${c.level==='大区'?'此处仅收录 A2 总图色区，片、小片边界待核。':c.level==='区'?'已描出原图色区，尚未落实为可核验的片、小片边界。':c.level==='小片'?'已描出小片边界。':'已描出片区边界；未收录的小片不作推测。'}${c.partialCoverage||c.coverageComplete===false||c.derivedParent?' 本区域为图幅内局部覆盖。':''}</p><p class="boundary-note">${esc(c.source)} 原图近似描边${Number.isFinite(c.registrationRMSEKm)?` · 配准留一 RMSE ${Number(c.registrationRMSEKm.toFixed(2))} km`:''}。</p><details class="boundary-details"><summary>描边范围与分类备注</summary><p>${esc(c.evidenceNote||'边界精度与现代分布仍需核查。')}</p></details><button id="region-source" class="inline-action">对照原图轮廓 ↗</button>`:`<p>坐标标记研究或分类代表点，不表示城区或方言边界。</p>${c.classificationNote?`<p>${esc(c.classificationNote)}</p><a class="paper-link" href="${esc(c.classificationReference)}" target="_blank" rel="noreferrer">查看分类依据 · 表1 ↗</a>`:''}`}<div class="research-heading">已有互通研究</div><p>${bs.length?`所选${area?'区域内':'地点'}收录 ${bs.length} 个 Tang（2009）实验样本：${bs.map(p=>esc(p.name)).join('、')}。`:'未收录与此区域匹配的互通实验样本。'}${area?' 区域整体：未收录实测。':''}</p>${as.length&&bs.length?`<button id="view-sample-pair" class="sample-link">查看 ${esc(as[0].name)} ↔ ${esc(bs[0].name)} 的双向实验 →</button>`:''}${bs.length?`<div class="sample-actions">${bs.map(p=>`<button data-sample="${p.id}">② 用${esc(p.name)}实测点 ↗</button>`).join('')}</div><a class="paper-link" href="https://www.lotpublications.nl/Documents/228_fulltext.pdf#page=92" target="_blank" rel="noreferrer">Tang 2009 · 原始实验表 4.3 ↗</a>`:''}`;
 if(c.coordinateNote)$('region-facts').querySelector('.region-taxonomy').insertAdjacentHTML('afterend',`<p class="coordinate-note">${esc(c.coordinateNote)}</p>`);
 if(!area&&!selectedAreas(c).length)$('region-facts').querySelector('.region-taxonomy').insertAdjacentHTML('afterend','<p class="boundary-note">此代表点未能唯一匹配当前已绘细分区域，可能涉及未覆盖、分类差异或配准误差。可直接点地图色区查看来源，不自动吸附到邻近片区。</p>');
 $('region-facts').insertAdjacentHTML('beforeend',`<details class="related-studies"><summary>与${esc(c.family)}有关的文献（不等于本点对实测）</summary>${studyCards(c.family)}</details><button id="research-catalog" class="inline-action">浏览全部研究与核验状态 ↗</button>`);
 $('research-catalog').onclick=researchCatalog;
 if($('region-source'))$('region-source').onclick=()=>atlasDialog(c.source,null,c.feature);
 if($('view-sample-pair'))$('view-sample-pair').onclick=()=>{state.origin=as[0];state.target=bs[0];$('show-research').checked=true;render();};
 $('region-facts').querySelectorAll('[data-sample]').forEach(el=>el.onclick=()=>{state.target=state.cities.find(p=>p.id===el.dataset.sample);state.pickOrigin=false;render();});
}
function showTooltip(e,title,body){const rect=$('map-stage').getBoundingClientRect();$('tooltip').innerHTML=`<b>${esc(title)}</b>${body}`;$('tooltip').hidden=false;$('tooltip').style.left=Math.min(Math.max(8,e.clientX-rect.left+14),rect.width-240)+'px';$('tooltip').style.top=Math.max(10,Math.min(e.clientY-rect.top-40,rect.height-100))+'px';}
function showCityTooltip(e,c){const m=listPair(c),a=state.pickOrigin?c:state.origin,b=state.pickOrigin?state.target:c;showTooltip(e,`${c.name} · ${c.variety}`,`${esc(taxonomy(c))}<br>${esc(displayName(a))}说 → ${esc(displayName(b))}听<br>${m?`①→② ${m.forward.value}% · ②→① ${m.reverse.value}%<br>${state.metric==='sentence_target'?'句中目标词翻译':'孤立词义类分类'}实验成绩`:'暂无配对实测 · '+esc(levelNames[compare(a,b).level])}`);}
function hideTooltip(){$('tooltip').hidden=true;}
function openDialog(title,html){txt('dialog-title',title);$('dialog-body').innerHTML=html;if(!$('info-dialog').open)$('info-dialog').showModal();}
function methodDialog(){
 const reg=state.metadata.registration;
 openDialog('先读懂数字，再听见彼此',`<div class="notice">这一版只收录汉语方言。地图展示的是历史分布与研究样本，不能替代对今天某个人语言能力的判断。</div><div class="method-grid"><section><h3>有实验，才有百分数</h3><p>Tang（2009）测试了 15 个方言点。每项任务有 225 个“说者 → 听者”组合，含 15 个同点对照。这里同时保留两个方向，不把它们平均成一个互通率。</p><p>默认指标是句中指定目标词的翻译正确率；每个方向为 15 位听者、60 次回答。它不是整句理解率，更不是日常对话理解率。</p><p><a href="https://www.lotpublications.nl/Documents/228_fulltext.pdf#page=92" target="_blank" rel="noreferrer">查原始表 4.3 · 印刷第 80 页 ↗</a></p></section><section><h3>同片不等于听得懂</h3><p>苏州与温州同属吴语，实验成绩仍然可能很低。南昌与苏州的结果，也不能推广成整个赣语与吴语的结果。</p><p>区域模式不显示实验百分数；研究点模式中，84 个代表点里未进入这项实验的地点只显示分类关系。我们不拿邻近地点的百分数填补空缺。</p><p>接触经历、普通话能力、测试难度和样本来源都会影响成绩。部分听者与录音者可能来自邻近方言点。历史小样本不能代表今天所有人。</p></section></div><h3>你正在看的这一对</h3>${researchTable()}<p><button id="metric-toggle" class="inline-action">切换为${state.metric==='sentence_target'?'孤立词语义分类':'句中目标词翻译'}测试 →</button> <span class="live-status">两种任务分开展示，不混合评分。</span></p><h3>图像如何成为地理数据</h3><p>A2 总图按印刷填色提取轮廓，以 ${reg.gcpCount} 个城市控制点拟合圆锥投影中的仿射变换。留一验证 RMSE 为 ${reg.leaveOneOutRMSEkm} km（旧版二阶多项式为 21.94 km）。这只是拟合候选，不表示已经确认原图投影。行政边界来自 DataV，与旧作「赶集志」同源，独立绘制，不参与方言分区。</p><p>地区详图逐张独立配准，人工沿原图片、小片界线概化描绘。当前收录 ${state.regionData.metadata.tracedFeatureCount} 个轮廓；自动生成的父片仅是已描小片的几何并集，空缺不补齐。可在“对照原图轮廓”中本地打开对应扫描，查看保存的像素描线。配准误差只衡量控制点，不能当作语言边界精度。</p><p>分类沿用所供历史图版；如 B2 的“北方官话”，不会悄悄套用为另一版本的现代分区。细小方言岛、符号混用区和扫描模糊边界仍有遗漏。只收录汉语方言的代表类别；底图空白不表示无人居住或没有语言。</p><h3>散落的客家话居民点</h3><p>另行人工核对四川盆地的 ${state.settlements.features.length} 个原图三角符号。它们是居民点符号的部分转录，不是完整名录，没有擅自补村名，也没有把散点扩成连续的客家话区域。</p><p><a href="data/metadata.json" download>下载配准与来源记录 ↓</a> · <a href="data/research.json" download>下载两项测试数据 ↓</a></p>`);
 $('dialog-body').insertAdjacentHTML('beforeend','<h3>底图坐标也有待核条件</h3><p>同一个显示投影不等于坐标基准已经严格统一。DataV 文档说明其地图组件主要使用 GCJ-02；当前底图文件未声明 CRS，控制点也不是同一来源的实地测量。这里保留提供方坐标，不凭猜测二次转换或吸附行政线。<a href="data/basemap-metadata.json" target="_blank" rel="noreferrer">查看底图核验记录 ↗</a></p>');
 $('metric-toggle').onclick=()=>{state.metric=state.metric==='sentence_target'?'word_category':'sentence_target';render();methodDialog();};
}
function researchTable(){const a=state.origin,b=state.target,m=directionalPair(a,b,state.research,state.metric);if(!m)return '<p class="notice">这两个代表点没有成对实测数据。分类关系不能替代互通实验。</p>';return `<table class="method-table"><thead><tr><th>说者 → 听者</th><th>正确率</th><th>实验任务</th></tr></thead><tbody>${[m.forward,m.reverse].map(r=>`<tr><td>${r.speakerLabel} → ${r.listenerLabel}</td><td>${r.value}%</td><td>${r.metricLabel}</td></tr>`).join('')}</tbody></table><p>${state.metric==='word_category'?'词语分类为十选一任务，随机猜测基线 10%。':'每个句子只计指定目标词；不是整句、也不是对话理解率。'} 特别是同点成绩低于 100%，也提醒我们测试受材料与样本影响。</p>`;}
const localAtlasImages=new Map();
function atlasDialog(preferred='A2',pixel=null,feature=null){
 const a=state.atlas.find(x=>x.id===preferred)||state.atlas[0];
 const imageUrl=localAtlasImages.get(a.id);
 const fp=feature?.properties,ring=fp?.sourceBoundary,size=fp?.sourceImageSize,parts=fp?.sourceParts||[{outer:ring,holes:fp?.sourceHoles||[]}];
 const boundary=ring&&size?`<svg class="source-boundary" viewBox="0 0 ${size[0]} ${size[1]}" preserveAspectRatio="none"><path fill-rule="evenodd" d="${parts.flatMap(p=>[p.outer,...(p.holes||[])]).filter(Boolean).map(r=>'M'+r.map(p=>p.join(',')).join('L')+'Z').join(' ')}"/></svg>`:'';
 const imageContent=imageUrl?`<div class="atlas-frame" id="atlas-frame"><div class="atlas-position"><img id="atlas-image" class="atlas-image" src="${imageUrl}" alt="本地选择的 ${esc(a.title)}扫描图">${boundary}${pixel?`<span class="source-highlight" style="left:${pixel.x/pixel.width*100}%;top:${pixel.y/pixel.height*100}%"></span>`:''}</div></div>`:'<div class="notice"><strong>公开版不附完整扫描原图</strong><p>这里保留图号和来源。若你持有对应图片，可以从电脑中选择，继续对照方言边界和居民点。图片只在此浏览器中读取，不会上传或写入仓库。</p></div>';
 openDialog('从纸上的地图，到眼前的乡音',`<div class="atlas-controls"><select id="atlas-select" aria-label="选择原图">${state.atlas.map(x=>`<option value="${x.id}" ${x.id===a.id?'selected':''}>${x.id} · ${esc(x.title)}</option>`).join('')}</select></div><p id="atlas-caption">${pixel?`原图符号坐标：x ${pixel.x}，y ${pixel.y}（${pixel.width} 像素宽工作图）。选择对应 A2 图后可查看标记。`:'参考图号和标题来自《中国语言地图集》。本地文件请与所选图号对应。'}</p>${imageContent}<label class="local-atlas-label" for="local-atlas-file">在本地打开 ${esc(a.expectedFilename||a.id+'.JPG')}（不上传）</label><input id="local-atlas-file" type="file" accept="image/jpeg,image/png,image/webp"><p class="live-status" id="local-atlas-status">图像可在窗口中点击放大；关闭网页后，本地图片不会保留。</p><p>当前两地参考：${state.origin.name} ${state.origin.source}；${state.target.name} ${state.target.source}。原图中的地名与分区按该历史版本阅读。</p>`);
 if(feature)txt('atlas-caption',`${fp.name} · ${fp.source}：${ring?'红线显示保存的原图像素外轮廓及已记录的内洞，可直接核对有无漏描。':fp.derivedParent?'此父片由已绘小片合并，请选择具体小片对照像素描线。':'此层来自总图颜色提取，未提供单一区域的像素描线叠加。'}`);
 $('atlas-select').onchange=e=>atlasDialog(e.target.value);
 if(imageUrl)$('atlas-image').onclick=()=>$('atlas-frame').classList.toggle('expanded');
 $('local-atlas-file').onchange=e=>{
  const file=e.target.files[0];if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>25*1024*1024){txt('local-atlas-status','请选择不超过 25 MB 的 JPG、PNG 或 WebP 图片。');return;}
  const old=localAtlasImages.get(a.id);if(old)URL.revokeObjectURL(old);
  localAtlasImages.set(a.id,URL.createObjectURL(file));atlasDialog(a.id,pixel,feature);
 };
}
function settlementDialog(d){atlasDialog('A2',d.properties.sourcePixel);}
function downloads(){openDialog('把这张地图带走',`<p>可在 QGIS、ArcGIS 或自己的网页里继续使用。数据保留原图出处和提取方式；配准与分类仍需要进一步校正。</p><a class="download-row" href="data/regions.geojson" download><strong>片与小片 · GeoJSON ↓</strong><small>${state.regionData.metadata.tracedFeatureCount} 个原图描边轮廓及局部父片 · 分类、原图像素与误差</small></a><a class="download-row" href="data/regions-north-metadata.json" download><strong>北方图幅配准记录 ↓</strong><small>控制点、原图指纹与留一误差；仅已转录图幅</small></a><a class="download-row" href="data/regions-wu-gan-metadata.json" download><strong>吴、徽、赣、湘配准记录 ↓</strong><small>吴语、徽语、赣语、湘语图幅</small></a><a class="download-row" href="data/regions-south-metadata.json" download><strong>西南与南方图幅配准记录 ↓</strong><small>西南、闽语与广东图幅</small></a><a class="download-row" href="data/dialects.geojson" download><strong>方言色区 · GeoJSON ↓</strong><small>10 类方言 · 来自原图形状提取，非行政区替代</small></a><a class="download-row" href="data/cities.geojson" download><strong>方言代表点 · GeoJSON ↓</strong><small>${state.cities.length} 个地点 · 分类、出处与备注</small></a><a class="download-row" href="data/settlements.geojson" download><strong>客家话居民点 · GeoJSON ↓</strong><small>${state.settlements.features.length} 个已核对的四川盆地点状符号 · 局部转录</small></a><a class="download-row" href="data/research.json" download><strong>互通度实验 · JSON ↓</strong><small>15 个方言点 × 15 个方向 × 2 项实验；不是 450 对独立地域</small></a><a class="download-row" href="data/metadata.json" download><strong>配准与数据说明 · JSON ↓</strong><small>控制点、误差、图像指纹、覆盖限制</small></a>`);}
function bind(){
 $('journey-form').onsubmit=e=>{e.preventDefault();render();};
 $('origin').onchange=e=>{state.origin=state.entities.find(c=>c.id===e.target.value);state.pickOrigin=false;render();};$('target').onchange=e=>{state.target=state.entities.find(c=>c.id===e.target.value);render();};$('search').oninput=renderList;$('sort').onchange=renderList;
 $('detail-level').onchange=e=>{state.detail=e.target.value;updateRegionLayer();render();};
 for(const tab of ['regions','points'])$('list-'+tab).onclick=()=>{state.list=tab;for(const t of ['regions','points']){$('list-'+t).classList.toggle('selected',t===tab);$('list-'+t).setAttribute('aria-pressed',String(t===tab));}updateSelectionUI();renderList();};
 $('show-research').onchange=render;
 $('swap').onclick=$('journey-swap').onclick=()=>{[state.origin,state.target]=[state.target,state.origin];render();};
 for(const mode of ['score','family'])$('mode-'+mode).onclick=()=>{state.mode=mode;for(const m of ['score','family']){$('mode-'+m).classList.toggle('selected',m===mode);$('mode-'+m).setAttribute('aria-pressed',String(m===mode));}render();};
 for(const id of ['pick-origin','map-pick-a'])$(id).onclick=()=>setSelectionSide(true);
 for(const id of ['pick-target','map-pick-b'])$(id).onclick=()=>setSelectionSide(false);
 $('show-technical').onchange=()=>{updateRegionLayer();render();};
 $('show-settlements').onchange=e=>settlementLayer.style('display',e.target.checked?null:'none');
 $('zoom-in').onclick=()=>svg.call(zoom.scaleBy,1.4);$('zoom-out').onclick=()=>svg.call(zoom.scaleBy,1/1.4);$('reset-map').onclick=()=>svg.call(zoom.transform,d3.zoomIdentity);
 $('method-nav').onclick=methodDialog;$('score-info').onclick=methodDialog;$('atlas-nav').onclick=()=>atlasDialog();$('source-btn').onclick=()=>atlasDialog(state.target.source,null,state.target.feature);$('download').onclick=downloads;
 $('explore-nav').onclick=()=>{if($('info-dialog').open)$('info-dialog').close();$('origin').focus();};$('close-dialog').onclick=()=>$('info-dialog').close();$('info-dialog').onclick=e=>{if(e.target===$('info-dialog')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)e.target.close();}};
 $('share').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('已复制这次相遇的链接。');}catch{openDialog('复制这次相遇',`<p>复制下面的地址即可保留这对地点：</p><input class="share-input" aria-label="分享链接" value="${esc(location.href)}" readonly>`);}};
 document.addEventListener('keydown',e=>{if(e.key==='/'&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)&&!$('info-dialog').open){e.preventDefault();if(innerWidth<=600){$('origin').focus();}else $('search').focus();}});
}
load();
