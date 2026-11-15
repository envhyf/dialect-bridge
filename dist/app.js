import {compare,haversine,nearestPoint,measuredPair} from './model.js';
const $=id=>document.getElementById(id), d3=window.d3;
const state={cities:[],research:[],atlas:[],origin:null,target:null,mode:'score',pickOrigin:false,transform:null,metric:'sentence_target'};
const familyColors={'官话':'#becda4','晋语':'#c8bd91','吴语':'#79a490','徽语':'#b4b48b','赣语':'#93b1a2','湘语':'#a2b77f','客家话':'#c7a786','粤语':'#7d9c88','平话':'#b4c19c','闽语':'#bdc788'};
const levelNames=['同一代表点','同一方言片','同一分区','同一方言大区','跨方言大区'];
const levelColors=['#234c36','#4c7956','#8faa7d','#becda4','#dddcc8'];
const researchColor=v=>d3.interpolateRgb('#d4ddbe','#245a3b')(Math.max(0,Math.min(1,v/100)));
let svg,viewport,projection,path,dialectPaths,dots,labels,route,selected,zoom,settlementLayer,tooltipTimer;
const labelCities=new Set(['beijing','harbin','urumqi','lanzhou','xian','chengdu','chongqing','kunming','wuhan','changsha','nanchang','shanghai','hangzhou','fuzhou','xiamen','guangzhou','nanning','haikou','taipei','taiyuan','jinan','nanjing','shenyang']);
function txt(id,t){$(id).textContent=t;}
function esc(t){return String(t??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));}
function taxonomy(c){return [...new Set([c.family,c.branch,c.cluster].filter(Boolean))].join(' / ');}
function observedLabel(c){return c.id==='wuhan'?'汉口':c.id==='meizhou'?'梅县':c.name;}
function toast(t){txt('toast',t);$('toast').hidden=false;clearTimeout(tooltipTimer);tooltipTimer=setTimeout(()=>$('toast').hidden=true,4600);}
function normalize(feature){const f=JSON.parse(JSON.stringify(feature));function rings(rs){rs.forEach((r,i)=>{let area=0;for(let k=1;k<r.length;k++)area+=r[k-1][0]*r[k][1]-r[k][0]*r[k-1][1];if((i===0&&area>0)||(i>0&&area<0))r.reverse();});}if(f.geometry.type==='Polygon')rings(f.geometry.coordinates);if(f.geometry.type==='MultiPolygon')f.geometry.coordinates.forEach(rings);return f;}
async function load(){
 try{
  if(!d3)throw Error('地图绘图库未加载');
  const files=['cities.json','dialects.geojson','basemap.json','metadata.json','research.json','settlements.geojson'];
  const values=await Promise.all(files.map(async f=>{const r=await fetch('data/'+f);if(!r.ok)throw Error(f+' '+r.status);return r.json();}));
  [state.cities,state.dialects,state.basemap,state.metadata,state.research,state.settlements]=values;
  state.atlas=await fetch('atlas/manifest.json').then(r=>r.json());
  const q=new URLSearchParams(location.search);state.origin=state.cities.find(c=>c.id===q.get('from'))||state.cities.find(c=>c.id==='suzhou');state.target=state.cities.find(c=>c.id===q.get('to'))||state.cities.find(c=>c.id==='nanchang');state.metric=q.get('metric')==='word_category'?'word_category':'sentence_target';
  $('origin').innerHTML=state.cities.map(c=>`<option value="${c.id}">${c.name} · ${c.variety}</option>`).join('');
  buildMap();bind();render();
 }catch(e){console.error(e);$('map-error').hidden=false;txt('origin-taxonomy','资料未载入，请重新载入页面。');txt('result-title','暂时没有读到地图');txt('result-phrase','请检查本地文件或网络连接，点击地图里的“重新载入”。');}
}
function buildMap(){
 svg=d3.select('#map').attr('viewBox','0 0 1000 780');
 svg.append('defs').html('<pattern id="unknown-hatch" patternUnits="userSpaceOnUse" width="6" height="6"><path d="M0 6L6 0" stroke="#bdc7b7" stroke-width=".5" opacity=".3"/></pattern>');
 viewport=svg.append('g');
 const basemap={type:'FeatureCollection',features:state.basemap.features.filter(f=>f.geometry.type!=='MultiLineString'&&f.geometry.type!=='LineString').map(normalize)};
 const fit={type:'FeatureCollection',features:basemap.features.map(f=>({...f,geometry:f.geometry.type==='MultiPolygon'?{...f.geometry,coordinates:f.geometry.coordinates.filter(p=>p[0].some(c=>c[1]>18))}:f.geometry}))};
 projection=d3.geoConicConformal().parallels([25,47]).rotate([-105,0]).center([0,36]).fitExtent([[30,70],[970,710]],fit);
 path=d3.geoPath(projection);
 viewport.append('path').attr('class','graticule').attr('d',path(d3.geoGraticule().extent([[70,15],[140,56]]).step([10,10])()));
 viewport.append('g').selectAll('path').data(basemap.features).join('path').attr('class','province').attr('d',path);
 viewport.append('g').selectAll('path').data(basemap.features).join('path').attr('fill','url(#unknown-hatch)').attr('d',path).style('pointer-events','none');
 dialectPaths=viewport.append('g').selectAll('path').data(state.dialects.features.map(normalize)).join('path').attr('class','dialect-shape').attr('d',path).on('mousemove',(event,d)=>showTooltip(event,`${d.properties.family}色区`,`来自 A2 的形状提取 · 边界近似<br>点击附近圆点查看具体乡音`)).on('mouseleave',hideTooltip);
 viewport.append('g').selectAll('path').data(basemap.features).join('path').attr('class','province-line').attr('d',path);
 // Administrative boundaries remain independent and never determine dialect colours.
 viewport.append('g').selectAll('path').data(state.basemap.features.filter(f=>/LineString/.test(f.geometry.type))).join('path').attr('class','province-line').attr('d',path);
 settlementLayer=viewport.append('g').attr('class','settlements');
 settlementLayer.selectAll('path').data(state.settlements.features).join('path').attr('class','settlement').attr('transform',d=>`translate(${projection(d.geometry.coordinates)})`).attr('d',d3.symbol().type(d3.symbolTriangle).size(12)).attr('fill','#ab7859').attr('stroke','#fafcf7').attr('stroke-width','.5').attr('tabindex',0).attr('role','button').attr('aria-label',d=>d.properties.name+'，查看原图').on('mousemove',(event,d)=>showTooltip(event,'客家话居民点',`${esc(d.properties.name)}<br>原图三角符号转录 · 点击看出处`)).on('mouseleave',hideTooltip).on('click',(event,d)=>{event.stopPropagation();settlementDialog(d);}).on('keydown',(event,d)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();settlementDialog(d);}});
 route=viewport.append('path').attr('class','route-line');
 dots=viewport.append('g').selectAll('circle').data(state.cities).join('circle').attr('class','place-dot').attr('cx',d=>projection(d.coordinates)[0]).attr('cy',d=>projection(d.coordinates)[1]).attr('r',4.2).attr('tabindex',0).attr('role','button').on('mousemove',(e,c)=>showCityTooltip(e,c)).on('mouseleave',hideTooltip).on('click',(e,c)=>{e.stopPropagation();choose(c);}).on('keydown',(e,c)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(c);}});
 labels=viewport.append('g').selectAll('text').data(state.cities.filter(c=>labelCities.has(c.id))).join('text').attr('class','city-label').attr('x',d=>projection(d.coordinates)[0]+7).attr('y',d=>projection(d.coordinates)[1]+4).text(d=>d.name);
 selected=viewport.append('g');
 zoom=d3.zoom().scaleExtent([.85,8]).translateExtent([[-300,-300],[1300,1100]]).on('zoom',e=>{state.transform=e.transform;viewport.attr('transform',e.transform);hideTooltip();resizeMarkers(e.transform.k);});
 svg.call(zoom).on('dblclick.zoom',null).on('click',e=>{if(e.defaultPrevented)return;const p=projection.invert((state.transform||d3.zoomIdentity).invert(d3.pointer(e,svg.node())));if(!p)return;const near=nearestPoint(p,state.cities,80);if(near){choose(near.point);toast(`选取附近代表点：${near.point.name}（约 ${Math.round(near.distance)} km）。不据此判断点击处的方言。`);}else toast('此处暂无可比较的代表点。色区可供查看，暂不推算互通率。');});
 state.transform=d3.zoomIdentity;
 const ro=new ResizeObserver(()=>{const box=$('map-stage').getBoundingClientRect();svg.attr('preserveAspectRatio',box.width/box.height<.7?'xMidYMid meet':'xMidYMid meet');});ro.observe($('map-stage'));
}
function resizeMarkers(k){dots?.attr('r',d=>(d.id===state.origin?.id||d.id===state.target?.id?6:4)/Math.sqrt(k));labels?.attr('font-size',10/Math.sqrt(k));}
function choose(c){if(state.pickOrigin){state.origin=c;state.pickOrigin=false;$('pick-origin').setAttribute('aria-pressed','false');txt('map-hint','点击圆点比较');}else state.target=c;render();}
function render(){
 const a=state.origin,b=state.target,r=compare(a,b),m=measuredPair(a,b,state.research,state.metric);
 $('origin').value=a.id;txt('origin-taxonomy',taxonomy(a));txt('map-origin',`从${a.name}出发`);txt('from-name',a.name);txt('to-name',b.name);txt('pair-varieties',`${a.variety}  ↔  ${b.variety}`);
 txt('range',levelNames[r.level]||'尚未分类');txt('distance',Math.round(haversine(a.coordinates,b.coordinates)).toLocaleString()+' km');
 $('relationship').innerHTML=[a,b].map(c=>`<span>${esc(taxonomy(c))}</span>`).join('<span class="tree-link">↔</span>');
 txt('reason',r.reason);txt('pair-sources',`${a.source} / ${b.source} · 另可查看 A2 总图`);
 if(m){
  txt('score-heading',`你听对方 · ${state.metric==='sentence_target'?'句中目标词':'孤立词分类'}测试`);txt('score',m.heardByYou.value);txt('score-unit','%');txt('reverse-score',m.heardByThem.value+'%');
  txt('evidence-label',`Tang 2009 · 表 ${m.heardByYou.table} · 不是日常对话理解率`);
  const v=m.heardByYou.value;txt('result-title',v>=70?'这一次，话能接得上':v>=40?'听见一些熟悉的线索':v>=15?'像隔着一层字幕':'熟悉的字，陌生的声');
  txt('result-phrase',`实验里，${observedLabel(a)}听者对${observedLabel(b)}话的${state.metric==='sentence_target'?'句中目标词翻译':'孤立词义类分类'}正确率为 ${v}%。换个方向，成绩是 ${m.heardByThem.value}%。`);
  txt('conversation-tip',state.metric==='sentence_target'?'不是“十句话听懂几句”，而是句子里指定词语的翻译成绩。每个方向 15 位听者、60 次回答。':'这是十选一的词语义类测试，随机猜测基线为 10%。它与句中目标词翻译任务不能混用。');
  $('score-meter').innerHTML=Array.from({length:25},(_,i)=>`<i${i<v/4?' class="filled"':''}></i>`).join('');
 }else{
  txt('score-heading','这两地，尚无收录的互通实验');txt('score','—');txt('score-unit','暂无实测');txt('reverse-score','—');txt('evidence-label','保留未知，不用分类关系伪造百分比');
  txt('result-title',r.label);txt('result-phrase',r.phrase);txt('conversation-tip','可以读出方言的亲疏关系，不能据此知道个人听懂多少。试试苏州与南昌，看看一对有双向实验的乡音。');$('score-meter').innerHTML=Array.from({length:25},()=>'<i></i>').join('');
 }
 dialectPaths.attr('fill',d=>state.mode==='family'?familyColors[d.properties.family]||'#d9dfce':d.properties.family===a.family?'#adc29a':'#e1dfca').attr('opacity',.87);
 dots.attr('fill',c=>{if(state.mode==='family')return familyColors[c.family]||'#829b73';const pair=measuredPair(a,c,state.research,state.metric);return pair?researchColor(pair.heardByYou.value):'#fff';}).attr('stroke',c=>measuredPair(a,c,state.research,state.metric)?'#fff':'#829078').attr('aria-label',c=>`${c.name}，${c.variety}，点击比较`);
 labels.style('display',c=>[a.id,b.id].includes(c.id)?'none':null);
 const interpolate=d3.geoInterpolate(a.coordinates,b.coordinates);route.attr('d',path({type:'LineString',coordinates:d3.range(0,1.001,.025).map(interpolate)}));
 selected.selectAll('*').remove();[a,b].forEach((c,i)=>{if(i&&a.id===b.id)return;const p=projection(c.coordinates);selected.append('circle').attr('cx',p[0]).attr('cy',p[1]).attr('r',11).attr('fill','none').attr('stroke','#315b3c').attr('stroke-width',1).style('pointer-events','none');selected.append('text').attr('class','active-city-label').attr('x',p[0]+13).attr('y',p[1]-11).text(c.name);});resizeMarkers(state.transform?.k||1);
 if(state.mode==='family')$('legend').innerHTML=Object.entries(familyColors).map(([n,c])=>`<span class="legend-item"><i style="background:${c}"></i>${n}</span>`).join('');
 else $('legend').innerHTML='<span class="legend-item"><i style="background:#adc29a"></i>同一方言大区</span><span class="legend-item"><i style="background:#e1dfca"></i>其他汉语方言区</span><span class="legend-item"><i style="background:#edf1e7"></i>未收录</span><span class="legend-item">● 实测点：浅 → 深 = 低 → 高</span>';
 txt('layer-note',state.mode==='family'?'色区沿原图形状 · 淡线为行政边界 · △ 客家话居民点（局部）':'面积颜色表示分类关系；只有实测圆点表示测试成绩。');
 renderList();const u=new URL(location.href);u.searchParams.set('from',a.id);u.searchParams.set('to',b.id);u.searchParams.set('metric',state.metric);history.replaceState(null,'',u);
}
function renderList(){
 const q=$('search').value.trim().toLowerCase();let cs=state.cities.filter(c=>c.id!==state.origin.id&&`${c.name}${c.variety}${taxonomy(c)}${c.id}`.toLowerCase().includes(q));
 cs.sort((a,b)=>{if($('sort').value==='distance')return haversine(state.origin.coordinates,a.coordinates)-haversine(state.origin.coordinates,b.coordinates);const x=measuredPair(state.origin,a,state.research,state.metric),y=measuredPair(state.origin,b,state.research,state.metric);if(!!x!==!!y)return x?-1:1;if(x&&y)return y.heardByYou.value-x.heardByYou.value;return compare(state.origin,a).level-compare(state.origin,b).level||haversine(state.origin.coordinates,a.coordinates)-haversine(state.origin.coordinates,b.coordinates);});
 $('city-list').innerHTML=cs.length?cs.map(c=>{const m=measuredPair(state.origin,c,state.research,state.metric),r=compare(state.origin,c);return `<button class="city-row${c.id===state.target.id?' active':''}" data-city="${c.id}"><strong>${c.name}</strong><small>${esc(taxonomy(c))}</small><span class="row-score">${m?m.heardByYou.value+'<small>%</small>':'<small>'+levelNames[r.level]+'</small>'}</span></button>`;}).join(''):'<p class="empty-list">没有找到这个地点。<br>试试方言名称，如「客家话」。</p>';
 $('city-list').querySelectorAll('[data-city]').forEach(el=>el.onclick=()=>choose(state.cities.find(c=>c.id===el.dataset.city)));
 const measured=cs.filter(c=>measuredPair(state.origin,c,state.research,state.metric)).length;txt('list-count',`${cs.length} 个地点 · ${measured} 个有与你配对的实测`);
}
function showTooltip(e,title,body){const rect=$('map-stage').getBoundingClientRect();$('tooltip').innerHTML=`<b>${esc(title)}</b>${body}`;$('tooltip').hidden=false;$('tooltip').style.left=Math.min(Math.max(8,e.clientX-rect.left+14),rect.width-240)+'px';$('tooltip').style.top=Math.max(10,Math.min(e.clientY-rect.top-40,rect.height-100))+'px';}
function showCityTooltip(e,c){const m=measuredPair(state.origin,c,state.research,state.metric);showTooltip(e,`${c.name} · ${c.variety}`,`${esc(taxonomy(c))}<br>${m?`你听对方 ${m.heardByYou.value}% · 对方听你 ${m.heardByThem.value}%<br>${state.metric==='sentence_target'?'句中目标词翻译':'孤立词义类分类'}实验成绩`:'暂无配对实测 · '+esc(levelNames[compare(state.origin,c).level])}`);}
function hideTooltip(){$('tooltip').hidden=true;}
function openDialog(title,html){txt('dialog-title',title);$('dialog-body').innerHTML=html;if(!$('info-dialog').open)$('info-dialog').showModal();}
function methodDialog(){
 const reg=state.metadata.registration;
 openDialog('先读懂数字，再听见彼此',`<div class="notice">这一版只收录汉语方言。地图展示的是历史分布与研究样本，不能替代对今天某个人语言能力的判断。</div><div class="method-grid"><section><h3>有实验，才有百分数</h3><p>Tang（2009）测试了 15 个方言点。每项任务有 225 个“说者 → 听者”组合，含 15 个同点对照。这里同时保留两个方向，不把它们平均成一个互通率。</p><p>默认指标是句中指定目标词的翻译正确率；每个方向为 15 位听者、60 次回答。它不是整句理解率，更不是日常对话理解率。</p><p><a href="https://www.lotpublications.nl/Documents/228_fulltext.pdf#page=92" target="_blank" rel="noreferrer">查原始表 4.3 · 印刷第 80 页 ↗</a></p></section><section><h3>同片不等于听得懂</h3><p>苏州与温州同属吴语，实验成绩仍然可能很低。南昌与苏州的结果，也不能推广成整个赣语与吴语的结果。</p><p>84 个代表点里，未进入这项实验的地点只显示分类关系：同片、同区或跨区。我们不拿邻近地点的百分数填补空缺。</p><p>接触经历、普通话能力、测试难度和样本来源都会影响成绩。部分听者与录音者可能来自邻近方言点。历史小样本不能代表今天所有人。</p></section></div><h3>你正在看的这一对</h3>${researchTable()}<p><button id="metric-toggle" class="inline-action">切换为${state.metric==='sentence_target'?'孤立词语义分类':'句中目标词翻译'}测试 →</button> <span class="live-status">两种任务分开展示，不混合评分。</span></p><h3>图像如何成为地理数据</h3><p>A2 原图按印刷填色提取轮廓，经 ${reg.gcpCount} 个手工辨认的地理控制点进行二阶多项式配准，再转为 GeoJSON。留一验证均方根误差为 ${reg.leaveOneOutRMSEkm} km，属于探索级地理配准。行政边界来自 DataV，与旧作「赶集志」同源，独立绘制，不参与方言分区。</p><p>细小方言岛、符号混用区和扫描模糊边界仍有遗漏。只收录汉语方言的代表类别；底图空白不表示无人居住或没有语言。</p><h3>散落的客家话居民点</h3><p>另行人工核对四川盆地的 ${state.settlements.features.length} 个原图三角符号。它们是居民点符号的部分转录，不是完整名录，没有擅自补村名，也没有把散点扩成连续的客家话区域。</p><p><a href="data/metadata.json" download>下载配准与来源记录 ↓</a> · <a href="data/research.json" download>下载两项测试数据 ↓</a></p>`);
 $('metric-toggle').onclick=()=>{state.metric=state.metric==='sentence_target'?'word_category':'sentence_target';render();methodDialog();};
}
function researchTable(){const a=state.origin,b=state.target,m=measuredPair(a,b,state.research,state.metric);if(!m)return '<p class="notice">这两个代表点没有成对实测数据。分类关系不能替代互通实验。</p>';return `<table class="method-table"><thead><tr><th>说者 → 听者</th><th>正确率</th><th>实验任务</th></tr></thead><tbody>${[m.heardByYou,m.heardByThem].map(r=>`<tr><td>${r.speakerLabel} → ${r.listenerLabel}</td><td>${r.value}%</td><td>${r.metricLabel}</td></tr>`).join('')}</tbody></table><p>${state.metric==='word_category'?'词语分类为十选一任务，随机猜测基线 10%。':'每个句子只计指定目标词；不是整句、也不是对话理解率。'} 特别是同点成绩低于 100%，也提醒我们测试受材料与样本影响。</p>`;}
const localAtlasImages=new Map();
function atlasDialog(preferred='A2',pixel=null){
 const a=state.atlas.find(x=>x.id===preferred)||state.atlas[0];
 const imageUrl=localAtlasImages.get(a.id);
 const imageContent=imageUrl?`<div class="atlas-frame" id="atlas-frame"><div class="atlas-position"><img id="atlas-image" class="atlas-image" src="${imageUrl}" alt="本地选择的 ${esc(a.title)}扫描图">${pixel?`<span class="source-highlight" style="left:${pixel.x/pixel.width*100}%;top:${pixel.y/pixel.height*100}%"></span>`:''}</div></div>`:'<div class="notice"><strong>公开版不附完整扫描原图</strong><p>这里保留图号和来源。若你持有对应图片，可以从电脑中选择，继续对照方言边界和居民点。图片只在此浏览器中读取，不会上传或写入仓库。</p></div>';
 openDialog('从纸上的地图，到眼前的乡音',`<div class="atlas-controls"><select id="atlas-select" aria-label="选择原图">${state.atlas.map(x=>`<option value="${x.id}" ${x.id===a.id?'selected':''}>${x.id} · ${esc(x.title)}</option>`).join('')}</select></div><p id="atlas-caption">${pixel?`原图符号坐标：x ${pixel.x}，y ${pixel.y}（${pixel.width} 像素宽工作图）。选择对应 A2 图后可查看标记。`:'参考图号和标题来自《中国语言地图集》。本地文件请与所选图号对应。'}</p>${imageContent}<label class="local-atlas-label" for="local-atlas-file">在本地打开 ${esc(a.expectedFilename||a.id+'.JPG')}（不上传）</label><input id="local-atlas-file" type="file" accept="image/jpeg,image/png,image/webp"><p class="live-status" id="local-atlas-status">图像可在窗口中点击放大；关闭网页后，本地图片不会保留。</p><p>当前两地参考：${state.origin.name} ${state.origin.source}；${state.target.name} ${state.target.source}。原图中的地名与分区按该历史版本阅读。</p>`);
 $('atlas-select').onchange=e=>atlasDialog(e.target.value);
 if(imageUrl)$('atlas-image').onclick=()=>$('atlas-frame').classList.toggle('expanded');
 $('local-atlas-file').onchange=e=>{
  const file=e.target.files[0];if(!file)return;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>25*1024*1024){txt('local-atlas-status','请选择不超过 25 MB 的 JPG、PNG 或 WebP 图片。');return;}
  const old=localAtlasImages.get(a.id);if(old)URL.revokeObjectURL(old);
  localAtlasImages.set(a.id,URL.createObjectURL(file));atlasDialog(a.id,pixel);
 };
}
function settlementDialog(d){atlasDialog('A2',d.properties.sourcePixel);}
function downloads(){openDialog('把这张地图带走',`<p>可在 QGIS、ArcGIS 或自己的网页里继续使用。数据保留原图出处和提取方式；配准与分类仍需要进一步校正。</p><a class="download-row" href="data/dialects.geojson" download><strong>方言色区 · GeoJSON ↓</strong><small>10 类方言 · 来自原图形状提取，非行政区替代</small></a><a class="download-row" href="data/cities.geojson" download><strong>方言代表点 · GeoJSON ↓</strong><small>${state.cities.length} 个地点 · 分类、出处与备注</small></a><a class="download-row" href="data/settlements.geojson" download><strong>客家话居民点 · GeoJSON ↓</strong><small>${state.settlements.features.length} 个已核对的四川盆地点状符号 · 局部转录</small></a><a class="download-row" href="data/research.json" download><strong>互通度实验 · JSON ↓</strong><small>15 个方言点 × 15 个方向 × 2 项实验；不是 450 对独立地域</small></a><a class="download-row" href="data/metadata.json" download><strong>配准与数据说明 · JSON ↓</strong><small>控制点、误差、图像指纹、覆盖限制</small></a>`);}
function bind(){
 $('origin').onchange=e=>{state.origin=state.cities.find(c=>c.id===e.target.value);render();};$('search').oninput=renderList;$('sort').onchange=renderList;
 $('swap').onclick=()=>{[state.origin,state.target]=[state.target,state.origin];render();};
 for(const mode of ['score','family'])$('mode-'+mode).onclick=()=>{state.mode=mode;for(const m of ['score','family']){$('mode-'+m).classList.toggle('selected',m===mode);$('mode-'+m).setAttribute('aria-pressed',String(m===mode));}render();};
 $('pick-origin').onclick=()=>{state.pickOrigin=!state.pickOrigin;$('pick-origin').setAttribute('aria-pressed',String(state.pickOrigin));txt('map-hint',state.pickOrigin?'下一次点击设为家乡':'点击圆点比较');};
 $('show-settlements').onchange=e=>settlementLayer.style('display',e.target.checked?null:'none');
 $('zoom-in').onclick=()=>svg.call(zoom.scaleBy,1.4);$('zoom-out').onclick=()=>svg.call(zoom.scaleBy,1/1.4);$('reset-map').onclick=()=>svg.call(zoom.transform,d3.zoomIdentity);
 $('method-nav').onclick=methodDialog;$('score-info').onclick=methodDialog;$('atlas-nav').onclick=()=>atlasDialog();$('source-btn').onclick=()=>atlasDialog(state.target.source);$('download').onclick=downloads;
 $('explore-nav').onclick=()=>{if($('info-dialog').open)$('info-dialog').close();$('origin').focus();};$('close-dialog').onclick=()=>$('info-dialog').close();$('info-dialog').onclick=e=>{if(e.target===$('info-dialog')){const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)e.target.close();}};
 $('share').onclick=async()=>{try{await navigator.clipboard.writeText(location.href);toast('已复制这次相遇的链接。');}catch{openDialog('复制这次相遇',`<p>复制下面的地址即可保留这对地点：</p><input class="share-input" aria-label="分享链接" value="${esc(location.href)}" readonly>`);}};
 document.addEventListener('keydown',e=>{if(e.key==='/'&&!/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)&&!$('info-dialog').open){e.preventDefault();if(innerWidth<=600){$('origin').focus();}else $('search').focus();}});
}
load();
