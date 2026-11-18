import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=name=>JSON.parse(readFileSync(new URL(name,root),'utf8'));
const structural=read('dist/data/structural-evidence.json');
const measured=read('dist/data/research.json');
const cityIds=new Set(read('dist/data/cities.json').map(p=>p.id));
const pairRows=[];
for(let i=0;i<structural.points.length;i++){
 if(structural.lowerTriangle[i].length!==i)throw Error(`Bad triangular row ${i}`);
 for(let j=0;j<i;j++){
  const phi=structural.lowerTriangle[i][j];
  if(!Number.isFinite(phi)||phi<=0||phi>1)throw Error('Invalid phi');
  pairRows.push({a:structural.points[j].id,b:structural.points[i].id,phi});
 }
}
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
const clamp=x=>Math.max(0,Math.min(100,x));
const round=x=>Math.round(x*1000)/1000;
function fit(rows){
 const x=mean(rows.map(r=>r.phi)),y=mean(rows.map(r=>r.y));
 const slope=rows.reduce((s,r)=>s+(r.phi-x)*(r.y-y),0)/rows.reduce((s,r)=>s+(r.phi-x)**2,0);
 return {intercept:y-slope*x,slope};
}
const predict=(model,phi)=>clamp(model.intercept+model.slope*phi);
const models=[],records=[];
for(const metric of ['sentence_target','word_category']){
 const targetRows=measured.filter(r=>r.metric===metric);
 const lookup=new Map(targetRows.map(r=>[`${r.from}/${r.to}`,r.value]));
 const observed=pairRows.flatMap(pair=>{
  const forward=lookup.get(`${pair.a}/${pair.b}`),reverse=lookup.get(`${pair.b}/${pair.a}`);
  return Number.isFinite(forward)&&Number.isFinite(reverse)?[{...pair,y:(forward+reverse)/2}]:[];
 });
 const observedIds=[...new Set(observed.flatMap(r=>[r.a,r.b]))].sort();
 const errors=[],baselineErrors=[],folds=[];
 // Each fold removes ALL pairs containing one dialect, including both original directions.
 for(const heldOut of observedIds){
  const train=observed.filter(r=>r.a!==heldOut&&r.b!==heldOut);
  const test=observed.filter(r=>r.a===heldOut||r.b===heldOut);
  const model=fit(train),baseline=mean(train.map(r=>r.y));
  const predictions=test.map(r=>({a:r.a,b:r.b,observed:r.y,predicted:predict(model,r.phi),baseline}));
  errors.push(...predictions.map(r=>Math.abs(r.predicted-r.observed)));
  baselineErrors.push(...predictions.map(r=>Math.abs(r.baseline-r.observed)));
  folds.push({heldOut,trainPairs:train.map(r=>[r.a,r.b]),testPairs:test.map(r=>[r.a,r.b]),mae:round(mean(predictions.map(r=>Math.abs(r.predicted-r.observed)))),predictions:predictions.map(r=>({...r,predicted:round(r.predicted),baseline:round(r.baseline)}))});
 }
 const sorted=[...errors].sort((a,b)=>a-b);
 const error90=sorted[Math.ceil(sorted.length*.9)-1];
 const mae=mean(errors),baselineMae=mean(baselineErrors);
 const pairFolds=observed.map(test=>{
  const heldOut=[test.a,test.b];
  const train=observed.filter(r=>!heldOut.includes(r.a)&&!heldOut.includes(r.b));
  const predicted=predict(fit(train),test.phi),baseline=mean(train.map(r=>r.y));
  return {heldOut,trainPairs:train.map(r=>[r.a,r.b]),observed:test.y,predicted,baseline};
 });
 const pairErrors=pairFolds.map(f=>Math.abs(f.predicted-f.observed)).sort((a,b)=>a-b);
 const pairMae=mean(pairErrors),pairBaselineMae=mean(pairFolds.map(f=>Math.abs(f.baseline-f.observed)));
 const pairError90=pairErrors[Math.ceil(pairErrors.length*.9)-1];
 const model=fit(observed);
 const minimumPhi=Math.min(...observed.map(r=>r.phi)),maximumPhi=Math.max(...observed.map(r=>r.phi));
 const id=`lexical-ols-${metric}-v1`;
 const enabled=mae<baselineMae;
 models.push({id,metric,kind:'exploratory-calibration',enabled,formula:'clamp(intercept + slope × lexical_phi, 0, 100)',coefficients:model,target:'(A→B + B→A) / 2',trainingPairs:observed.length,trainingDialects:observedIds,predictorDomain:[minimumPhi,maximumPhi],validation:{method:'leave-one-dialect-out',mae:round(mae),baselineMae:round(baselineMae),rmse:round(Math.sqrt(mean(errors.map(e=>e*e)))),absoluteError90:round(error90),evaluationRows:errors.length,uniquePairs:observed.length,folds},twoNewDialectsValidation:{method:'leave-both-dialects-out',mae:round(pairMae),baselineMae:round(pairBaselineMae),absoluteError90:round(pairError90),folds:pairFolds.map(f=>({...f,predicted:round(f.predicted),baseline:round(f.baseline)}))}});
 if(!enabled)continue;
 for(const pair of pairRows){
  if(!cityIds.has(pair.a)||!cityIds.has(pair.b))continue;
  // No replacement of observed pairs and no extrapolation beyond the training predictor range.
  if(lookup.has(`${pair.a}/${pair.b}`)||lookup.has(`${pair.b}/${pair.a}`))continue;
  if(pair.phi<minimumPhi||pair.phi>maximumPhi)continue;
  const bothNew=!observedIds.includes(pair.a)&&!observedIds.includes(pair.b);
  if(bothNew&&pairMae>=pairBaselineMae)continue;
  const envelope=bothNew?Math.max(error90,pairError90):error90;
  const value=predict(model,pair.phi);
  records.push({a:pair.a,b:pair.b,metric,kind:'model-estimate',direction:'bidirectional-mean',value:Math.round(value),unit:'%',range:[Math.floor(clamp(value-envelope)),Math.ceil(clamp(value+envelope))],rangeKind:'held-out-error-envelope',validationScenario:bothNew?'both-dialects-unseen':'one-dialect-unseen',modelId:id,predictor:{metric:'lexical_phi',value:pair.phi,evidenceId:structural.id},sourceUrl:structural.sourceUrl,calibrationSourceUrl:'https://www.lotpublications.nl/Documents/228_fulltext.pdf',notes:['两方向实验成绩平均值的探索性估计；没有新增听者实测，不能解释为任一方向或日常对话理解率。','范围依据完整方言留出验证绝对误差的第90百分位；两地均为新点时取两类验证较宽误差带，不是置信区间或有覆盖保证的预测区间。']});
 }
}
const result={checkedOn:'2026-11-18',version:1,label:'模型估算 · 双向平均',status:'exploratory-not-independently-validated',evidenceDataset:'structural-evidence.json',calibrationDataset:'research.json',notes:['模型仅使用原论文词汇结构系数和既有听者实验校准，不使用地理距离、方言类别或片区标签。','每个验证折留出一个完整方言点。78个不同点对在13折中各出现两次；156次预测不是156个独立样本。','仅在误差优于训练均值基线且词汇系数位于训练范围内时发布估计。模型未在新增城市的人类实验中外部验证。','城市样本不能推广到区域；未知结构点保持无数值。'],models,records};
writeFileSync(new URL('dist/data/estimates.json',root),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({records:records.length,models:models.map(m=>({metric:m.metric,enabled:m.enabled,mae:m.validation.mae,baselineMae:m.validation.baselineMae,error90:m.validation.absoluteError90}))},null,2));
