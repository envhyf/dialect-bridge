import {scoreBands} from './listen.js';
const ink='#243c35',muted='#617268',paper='#f1f3ef';
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
 clone.style.width=width+'px';clone.style.height=height+'px';clone.style.background='#f7f9f5';
 // Keep symbols readable at export resolution, independent of the visitor's device width.
 const scale=Math.abs(svg.getScreenCTM()?.a||1)/(width/1000);
 for(const node of clone.querySelectorAll('.city-label,.active-city-label,.region-label,.listen-score-point')){
  node.setAttribute('transform',(node.getAttribute('transform')||'').replace(/scale\(([-\d.e]+)\)/g,(_,n)=>`scale(${Number(n)*scale})`));
 }
 for(const node of clone.querySelectorAll('.selection-marks>circle,.research-points>circle'))node.setAttribute('r',Number(node.getAttribute('r'))*scale);
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
 for(const node of svg.querySelectorAll('.active-city-label')){const p=position(node);placed.push({left:p.x-10,right:p.x+95,top:p.y-20,bottom:p.y+25})}
 const intersects=(a,b)=>a.left<b.right+5&&a.right>b.left-5&&a.top<b.bottom+5&&a.bottom>b.top-5;
 copies.forEach((node,i)=>{
  const {x,y}=locations[i];if(x<0||x>width||y<0||y>height)return;
  node.style.display='';let chosen;
  const otherPoints=locations.filter((_,j)=>j!==i).map(p=>({left:p.x-5,right:p.x+5,top:p.y-5,bottom:p.y+5}));
  for(const radius of [0,22,44,66,88]){
   for(const [dx,dy] of [[8+radius,-35],[-54-radius,-35],[8+radius,8],[-54-radius,8],[-23,-48-radius],[-23,15+radius]]){
    const r={left:x+dx,right:x+dx+46,top:y+dy,bottom:y+dy+40};
    if(r.left<4||r.right>width-4||r.top<4||r.bottom>height-4||[...placed,...otherPoints].some(o=>intersects(r,o)))continue;
    chosen={dx,dy,r};break;
   }if(chosen)break;
  }
  for(const part of node.querySelectorAll('rect,text,path'))part.style.display=chosen?'':'none';if(!chosen)return;
  const {dx,dy,r}=chosen;placed.push(r);
  const rect=node.querySelector('rect');rect.setAttribute('x',dx);rect.setAttribute('y',dy+17);
  const name=node.querySelector('.listen-peer-name');name.setAttribute('x',dx);name.setAttribute('y',dy+11);
  const value=node.querySelector('.listen-peer-value');value.setAttribute('x',dx+23);value.setAttribute('y',dy+32);
  node.querySelector('path').setAttribute('d',`M0 0L${dx<0?dx+46:dx},${dy+28}`);
 });
}
function text(ctx,value,x,y,size=20,color=ink,serif=false){ctx.fillStyle=color;ctx.font=`${size}px "Atlas ${serif?'Serif':'Sans'}",sans-serif`;ctx.fillText(String(value),x,y);}
function wrap(ctx,value,x,y,width,size=20,color=muted,limit=4){
 ctx.font=`${size}px "Atlas Sans",sans-serif`;let line='',rows=0;
 for(let i=0;i<value.length;i++){const char=value[i];if(ctx.measureText(line+char).width>width){text(ctx,line,x,y,size,color);y+=size*1.65;line='';rows++;if(rows===limit-1){let rest=value.slice(i);if(ctx.measureText(rest).width>width){while(rest&&ctx.measureText(rest+'…').width>width)rest=rest.slice(0,-1);rest+='…';}text(ctx,rest,x,y,size,color);return y}}line+=char;}
 if(line)text(ctx,line,x,y,size,color);return y;
}
export async function createShareImage(svg,context){
 const mapPromise=mapImage(svg,1080,842);
 await document.fonts.ready;
 const width=1600,height=1200,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const ctx=canvas.getContext('2d');ctx.fillStyle=paper;ctx.fillRect(0,0,width,height);
 text(ctx,'乡音桥',48,72,40,ink,true);text(ctx,'汉语方言 · 片与小片',250,69,20,muted);
 text(ctx,context.title,48,134,30,ink,true);text(ctx,context.subtitle,48,172,19,muted);
 const map=await mapPromise;ctx.fillStyle='#f7f9f5';ctx.fillRect(36,200,1080,842);ctx.drawImage(map,36,200,1080,842);
 ctx.strokeStyle='#dce2da';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(1140,200);ctx.lineTo(1140,1042);ctx.stroke();
 text(ctx,context.mode==='listen'?'各地实测':'两个方向，分别作答',1172,228,24,ink,true);
 if(context.mode==='listen'){
  context.rows.slice(0,14).forEach((row,i)=>{const y=278+i*45;text(ctx,row.label,1172,y,21);text(ctx,row.value+'%',1485,y,23,ink,true);ctx.fillStyle=row.color;ctx.fillRect(1172,y+10,320*row.value/100,3)});
  if(!context.rows.length)wrap(ctx,'未收录这个地点的方向性实测。留白不表示听不懂。',1172,290,330,23);
 }else{
  context.rows.forEach((row,i)=>{const y=288+i*170;wrap(ctx,row.label,1172,y,330,21,ink,2);text(ctx,row.value===null?'暂无实测':row.value+'%',1172,y+65,row.value===null?27:48,row.color,true);ctx.fillStyle='#dce2da';ctx.fillRect(1172,y+90,320,6);if(row.value!==null){ctx.fillStyle=row.color;ctx.fillRect(1172,y+90,320*row.value/100,6)}});
 }
 const noteY=context.mode==='listen'?960:710;
 wrap(ctx,context.metric,1172,noteY,330,18,ink,3);
 wrap(ctx,'实验正确率 ≠ 日常对话理解率。只适用于具体研究点，不代表整个方言片。',1172,noteY+65,330,18,muted,4);
 let x=48,y=1078;
 for(const item of context.legend){const span=item.label.length*18+35;if(x+span>1550){x=48;y+=32}ctx.fillStyle=item.color;ctx.fillRect(x,y-13,15,9);text(ctx,item.label,x+23,y,17,muted);x+=span;}
 if(context.mode==='listen'){text(ctx,'实测点',48,1110,17,muted);scoreBands.forEach((band,i)=>{const left=130+i*160;ctx.fillStyle=band.color;ctx.fillRect(left,1097,15,9);text(ctx,band.label,left+23,1110,17,muted)});}
 text(ctx,'来源：中国语言地图集 · Tang 2009。边界为近似描绘；无实测处不推算百分比。',48,1150,18,muted);
 text(ctx,'paisheng.me/dialect-bridge',48,1180,16,muted);
 const date=new Date().toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai'});text(ctx,date,1430,1180,16,muted);
 const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('图片未能生成')),'image/png'));
 return {blob,url:URL.createObjectURL(blob),filename:`乡音桥-${context.filename}.png`};
}
