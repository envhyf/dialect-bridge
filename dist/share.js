import {scoreBands} from './listen.js';

const ink='#1e2a24',muted='#656d66',paper='#f5f2ea',mapBg='#f9f7f1',line='#dcd5c7';
const props=['fill','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-dasharray','stroke-linecap','stroke-linejoin','font-family','font-size','font-weight','text-anchor','paint-order','opacity','display','visibility','vector-effect'];
let fontCSS;

async function embeddedFonts(){
 if(!fontCSS)fontCSS=Promise.all(['serif','sans'].map(async name=>{
  const response=await fetch(`vendor/atlas-${name}.woff`);if(!response.ok)throw Error('字体未载入');
  const bytes=new Uint8Array(await response.arrayBuffer());let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return `@font-face{font-family:"Atlas ${name==='serif'?'Serif':'Sans'}";src:url(data:font/woff;base64,${btoa(binary)}) format("woff")}`;
 })).then(r=>r.join('')).catch(e=>{fontCSS=null;throw e});
 return fontCSS;
}

async function mapImage(svg,width,height){
 const clone=svg.cloneNode(true),original=[svg,...svg.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
 for(let i=0;i<original.length;i++){
  const style=getComputedStyle(original[i]);for(const prop of props)copies[i].style.setProperty(prop,style.getPropertyValue(prop));
  copies[i].removeAttribute('tabindex');copies[i].removeAttribute('role');
 }
 clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width',width);clone.setAttribute('height',height);
 clone.style.width=width+'px';clone.style.height=height+'px';clone.style.background=mapBg;
 const scale=Math.abs(svg.getScreenCTM()?.a||1)/(width/1000);
 for(const node of clone.querySelectorAll('.city-label,.active-city-label,.region-label,.listen-score-point')){
  node.setAttribute('transform',(node.getAttribute('transform')||'').replace(/scale\(([-\d.e]+)\)/g,(_,n)=>`scale(${Number(n)*scale})`));
 }
 for(const node of clone.querySelectorAll('.selection-marks>circle,.research-points>circle,.city-points>circle'))node.setAttribute('r',Number(node.getAttribute('r'))*scale);
 for(const node of clone.querySelectorAll('.settlement'))node.setAttribute('transform',(node.getAttribute('transform')||'')+` scale(${scale})`);
 layoutExportScores(svg,clone,width,height);
 const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=await embeddedFonts();clone.prepend(style);
 const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'}));
 try{const image=new Image();image.src=url;await image.decode();return image;}finally{URL.revokeObjectURL(url)}
}

function layoutExportScores(svg,clone,width,height){
 const matrix=svg.getScreenCTM(),unit=Math.min(width/1000,height/780),placed=[];
 const position=node=>{const m=node.getScreenCTM();return {x:(m.e-matrix.e)/matrix.a*unit+(width-1000*unit)/2,y:(m.f-matrix.f)/matrix.d*unit+(height-780*unit)/2}};
 const originals=[...svg.querySelectorAll('.listen-score-point')],copies=[...clone.querySelectorAll('.listen-score-point')],locations=originals.map(position);
 for(const node of svg.querySelectorAll('.active-city-label')){const p=position(node);placed.push({left:p.x-8,right:p.x+92,top:p.y-20,bottom:p.y+22})}
 const intersects=(a,b)=>a.left<b.right+4&&a.right>b.left-4&&a.top<b.bottom+4&&a.bottom>b.top-4;
 copies.forEach((node,i)=>{
  const {x,y}=locations[i];if(x<0||x>width||y<0||y>height)return;
  node.style.display='';let chosen;
  const est=node.classList.contains('estimate-point'),w=est?46:42,h=20,boxH=h+14;
  const otherPoints=locations.filter((_,j)=>j!==i).map(p=>({left:p.x-5,right:p.x+5,top:p.y-5,bottom:p.y+5}));
  for(const radius of [0,20,40,62,84]){
   for(const [dx,dy] of [[8+radius,-boxH+3],[-w-8-radius,-boxH+3],[8+radius,6],[-w-8-radius,6],[-w/2,-boxH-8-radius],[-w/2,12+radius],[16+radius,-h/2-6],[-w-16-radius,-h/2-6]]){
    const r={left:x+dx,right:x+dx+w,top:y+dy,bottom:y+dy+boxH};
    if(r.left<4||r.right>width-4||r.top<4||r.bottom>height-4||[...placed,...otherPoints].some(o=>intersects(r,o)))continue;
    chosen={dx,dy,r};break;
   }if(chosen)break;
  }
  for(const part of node.querySelectorAll('rect,text,path'))part.style.display=chosen?'':'none';if(!chosen)return;
  const {dx,dy,r}=chosen;placed.push(r);
  const rect=node.querySelector('rect');rect.setAttribute('x',dx);rect.setAttribute('y',dy+14);rect.setAttribute('width',w);rect.setAttribute('height',h);
  const name=node.querySelector('.listen-peer-name');name.setAttribute('x',dx+1);name.setAttribute('y',dy+11);
  const value=node.querySelector('.listen-peer-value');value.setAttribute('x',dx+w/2);value.setAttribute('y',dy+14+h*0.72);
  const lx=dx+w<0?dx+w:dx>0?dx:dx+w/2,ly=dy+14+h/2;
  node.querySelector('path').setAttribute('d',`M0 0L${lx},${ly}`);
 });
}

function text(ctx,value,x,y,size=20,color=ink,serif=false,align='left'){
 ctx.fillStyle=color;ctx.textAlign=align;ctx.font=`${size}px "Atlas ${serif?'Serif':'Sans'}",sans-serif`;ctx.fillText(String(value),x,y);ctx.textAlign='left';
}

function wrap(ctx,value,x,y,width,size=18,color=muted,limit=4){
 ctx.font=`${size}px "Atlas Sans",sans-serif`;let line='',rows=0;
 for(let i=0;i<value.length;i++){
  const char=value[i];
  if(ctx.measureText(line+char).width>width){
   text(ctx,line,x,y,size,color);y+=size*1.6;line='';rows++;
   if(rows===limit-1){
    let rest=value.slice(i);
    if(ctx.measureText(rest).width>width){while(rest&&ctx.measureText(rest+'…').width>width)rest=rest.slice(0,-1);rest+='…';}
    text(ctx,rest,x,y,size,color);return y;
   }
  }
  line+=char;
 }
 if(line)text(ctx,line,x,y,size,color);return y;
}

export async function createShareImage(svg,context){
 const mapW=1040,mapH=812;
 const mapPromise=mapImage(svg,mapW,mapH);
 await document.fonts.ready;
 const width=1600;
 const listenRowsHeight=context.mode==='listen'?context.rows.reduce((sum,r)=>sum+(r.kind==='model-estimate'?64:48),0):0;
 const height=context.mode==='listen'?Math.max(1160,290+listenRowsHeight+280):1140;
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');
 ctx.fillStyle=paper;ctx.fillRect(0,0,width,height);

 // Editorial masthead
 text(ctx,'乡音桥',44,68,38,ink,true);
 ctx.strokeStyle=line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(192,40);ctx.lineTo(192,72);ctx.stroke();
 text(ctx,'汉语方言地图 · 片与小片',212,64,18,muted);
 const date=new Date().toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'});
 text(ctx,`paisheng.me/dialect-bridge  ·  ${date}`,width-44,62,15,muted,false,'right');

 // Title & subtitle
 text(ctx,context.title,44,122,28,ink,true);
 text(ctx,context.subtitle,44,152,17,muted);
 ctx.strokeStyle=line;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(44,170);ctx.lineTo(width-44,170);ctx.stroke();

 // Map panel
 const map=await mapPromise;
 ctx.fillStyle=mapBg;ctx.fillRect(44,188,mapW,mapH);
 ctx.drawImage(map,44,188,mapW,mapH);
 ctx.strokeStyle=line;ctx.lineWidth=1;ctx.strokeRect(44.5,188.5,mapW-1,mapH-1);

 // Right reading column
 const colX=1124,colW=432;
 ctx.strokeStyle=line;ctx.beginPath();ctx.moveTo(1104,188);ctx.lineTo(1104,height-138);ctx.stroke();
 text(ctx,context.mode==='listen'?'实测与估算分列':context.hasEstimates?'文献模型估算 · 双向平均':'两个方向，分别作答',colX,216,22,ink,true);

 let cursorY=258;
 if(context.mode==='listen'){
  if(!context.rows.length){
   cursorY=wrap(ctx,'未收录实测或可用模型估算。留白不表示听不懂，也不以邻近城市或同片关系推算百分比。',colX,270,colW,19,muted,4)+32;
  }else{
   for(const row of context.rows){
    const estimated=row.kind==='model-estimate';
    text(ctx,row.label+(estimated?' · 估算':' · 实测'),colX,cursorY,18,ink);
    text(ctx,(estimated?'约 ':'')+row.value+'%',colX+colW,cursorY,21,ink,true,'right');
    if(estimated){
     text(ctx,`双向平均 · 误差带 ${row.range[0]}–${row.range[1]}%`,colX,cursorY+22,14.5,muted);
     ctx.save();ctx.setLineDash([4,3]);ctx.strokeStyle='#8b948d';ctx.lineWidth=1.2;
     ctx.beginPath();ctx.moveTo(colX,cursorY+32);ctx.lineTo(colX+colW,cursorY+32);ctx.stroke();ctx.restore();
     cursorY+=64;
    }else{
     ctx.fillStyle='#e7e2d7';ctx.fillRect(colX,cursorY+12,colW,5);
     ctx.fillStyle=row.color;ctx.fillRect(colX,cursorY+12,colW*row.value/100,5);
     cursorY+=48;
    }
   }
  }
 }else{
  context.rows.forEach((row,i)=>{
   const estimated=row.kind==='model-estimate';
   if(estimated){
    ctx.save();ctx.fillStyle=mapBg;ctx.fillRect(colX,cursorY-12,colW,236);
    ctx.setLineDash([6,4]);ctx.strokeStyle='#8e9790';ctx.lineWidth=1.2;ctx.strokeRect(colX+0.5,cursorY-11.5,colW-1,235);ctx.restore();
    text(ctx,row.label,colX+20,cursorY+22,19,muted);
    text(ctx,`约 ${row.value}%`,colX+20,cursorY+84,48,ink,true);
    // Visual empirical error band
    const barX=colX+20,barY=cursorY+104,barW=colW-40;
    ctx.fillStyle='#e7e2d7';ctx.fillRect(barX,barY,barW,10);
    const low=Math.max(0,Math.min(100,row.range[0])),high=Math.max(low,Math.min(100,row.range[1]));
    ctx.fillStyle='rgba(33,109,171,0.16)';ctx.fillRect(barX+barW*low/100,barY,barW*(high-low)/100,10);
    ctx.save();ctx.setLineDash([4,3]);ctx.strokeStyle='#216dab';ctx.lineWidth=1.2;ctx.strokeRect(barX+barW*low/100,barY,barW*(high-low)/100,10);ctx.restore();
    ctx.fillStyle='#216dab';ctx.beginPath();ctx.arc(barX+barW*row.value/100,barY+5,5,0,Math.PI*2);ctx.fill();
    text(ctx,`经验误差带 ${row.range[0]}–${row.range[1]}%`,colX+20,cursorY+144,18,ink);
    wrap(ctx,'交换两地后同值，无法估计方向差异；误差带不是置信区间。',colX+20,cursorY+176,colW-40,16,muted,3);
    cursorY+=258;
   }else{
    const y=cursorY+i*158;
    wrap(ctx,row.label,colX,y,colW,19,ink,2);
    text(ctx,row.value===null?'暂无实测':row.value+'%',colX,y+60,row.value===null?28:46,row.value===null?muted:row.color,true);
    ctx.fillStyle='#e7e2d7';ctx.fillRect(colX,y+80,colW,7);
    ctx.fillStyle='#c4bdb0';ctx.fillRect(colX+colW/2,y+78,1,11);
    if(row.value!==null){ctx.fillStyle=row.color;ctx.fillRect(colX,y+80,colW*row.value/100,7);}
    if(i===context.rows.length-1){
     text(ctx,'0',colX,y+106,13,muted);
     text(ctx,'50',colX+colW/2,y+106,13,muted,false,'center');
     text(ctx,'100%',colX+colW,y+106,13,muted,false,'right');
     cursorY=y+140;
    }
   }
  });
 }

 // Method note in right column
 const noteY=Math.max(cursorY+14,context.mode==='listen'?cursorY+16:640);
 ctx.strokeStyle=line;ctx.beginPath();ctx.moveTo(colX,noteY-16);ctx.lineTo(colX+colW,noteY-16);ctx.stroke();
 const afterMetricY=wrap(ctx,context.metric,colX,noteY+8,colW,17,ink,2);
 wrap(ctx,context.note,colX,afterMetricY+34,colW,16,muted,6);

 // Footer legend & attribution
 const footTop=height-118;
 ctx.strokeStyle=line;ctx.beginPath();ctx.moveTo(44,footTop);ctx.lineTo(width-44,footTop);ctx.stroke();
 let lx=44,ly=footTop+32;
 for(const item of context.legend){
  const span=item.label.length*16+34;
  if(lx+span>width-44){lx=44;ly+=28;}
  ctx.fillStyle=item.color;ctx.fillRect(lx,ly-11,14,9);
  text(ctx,item.label,lx+21,ly,15.5,muted);
  lx+=span;
 }
 if(context.mode==='listen'){
  const bandY=ly+28;
  text(ctx,'实测色带',44,bandY,15,muted);
  scoreBands.forEach((band,i)=>{const left=126+i*144;ctx.fillStyle=band.color;ctx.fillRect(left,bandY-11,14,9);text(ctx,band.label,left+20,bandY,15,muted);});
  if(context.hasEstimates)text(ctx,'虚线约值：模型双向平均',720,bandY,15,muted);
 }
 text(ctx,'边界：《中国语言地图集》近似描绘 · '+context.sources,44,height-24,15,muted);

 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('图片未能生成')),'image/png'));
 return {blob,url:URL.createObjectURL(blob),filename:`乡音桥-${context.filename}.png`};
}
