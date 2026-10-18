import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
const call=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance);
const cmd=command=>call({op:'command',command}),save=()=>JSON.parse(call({op:'save'})),view=()=>call({op:'view'});
const data=call({op:'catalog'}),city=id=>data.cities.findIndex(c=>c.id===id);
const cases=[
 ['Kingston-Havana','kingston','havana','sloop'],
 ['Kingston-Bridgetown','kingston','bridgetown','sloop'],
 ['Osaka-Nagasaki','osaka','nagasaki','sloop'],
 ['Osaka-Edo','osaka','edo','sloop'],
 ['Cairo-Suez','cairo','suez','caravan'],
 ['Genoa-Livorno','genoa','livorno','sloop'],
 ['London-Nantes','london','nantes','sloop']
];
const report=[];
for(const [name,a,b,kind] of cases)for(const seed of [1700,1701,1702])for(const posts of [1,2]){
 cmd({action:'new',seed,events:false});
 const stops=[city(a),city(b)];
 try{
  const quote=call({op:'query',request:{query:'opening',kind,stops}});
  for(const nation of quote.missing)cmd({action:'license',nation});
  cmd({action:'buildPost',city:stops[0]});
  if(posts===2)cmd({action:'buildPost',city:stops[1]});
  cmd({action:'openRoute',kind,stops,allowed:data.goods.map((_,i)=>i),buyBelow:0,sellAbove:0});
  const start=view().companies[0],before=save().companies[0].totals;
  const months=[];
  for(let i=0;i<12;i++){cmd({action:'tick',days:[31,28,31,30,31,30,31,31,30,31,30,31][i]});const v=view().companies[0];months.push({day:save().day,cash:v.cash,assets:v.assets,bankrupt:v.bankrupt});if(v.bankrupt)break;}
  const g=save(),co=g.companies[0],v=view().companies[0];
  const operating=['purchase','sale','tax','upkeep','licenseDaily','escort','roadToll','roadIncome','handlingFee','postUpkeep','warehouseUpkeep','handlingUpkeep'];
  report.push({name,seed,posts,day:g.day,startingCash:start.cash,endingCash:v.cash,assetChange:v.assets-start.assets,operating:operating.reduce((n,k)=>n+(co.totals[k]??0)-(before[k]??0),0),deliveries:co.routes.reduce((n,r)=>n+r.deliveries,0),bankrupt:co.bankrupt,months});
 }catch(e){report.push({name,seed,posts,error:e.message});}
}
const expansion=[];
for(const seed of [1700,1701,1702])for(const mode of ['hold','same-hub','new-post','new-post-research-10']){
 cmd({action:'new',seed,events:false});const a=city('osaka'),b=city('nagasaki'),h=city('hakata');
 const base=call({op:'query',request:{query:'opening',kind:'sloop',stops:[a,b]}});
 for(const nation of base.missing)cmd({action:'license',nation});
 cmd({action:'buildPost',city:a});cmd({action:'openRoute',kind:'sloop',stops:[a,b],allowed:data.goods.map((_,i)=>i)});
 for(let i=0;i<3;i++)cmd({action:'tick',days:30});const before=view().companies[0];
 if(mode==='new-post-research-10'){const g=save();g.companies[0].technology[6]=10;call({op:'load',text:JSON.stringify(g)});}
 if(mode.startsWith('new-post'))cmd({action:'buildPost',city:b});
 if(mode!=='hold')cmd({action:'openRoute',kind:'sloop',stops:[mode==='same-hub'?a:b,h],allowed:data.goods.map((_,i)=>i)});
 const start=view().companies[0];
 for(let i=0;i<6;i++){cmd({action:'tick',days:30});if(view().companies[0].bankrupt)break;}
 const co=view().companies[0];expansion.push({seed,mode,day:save().day,preExpansionCash:before.cash,startingCash:start.cash,endingCash:co.cash,assetChange:co.assets-start.assets,bankrupt:co.bankrupt,deliveries:co.routes.map(r=>r.deliveries)});
}
fs.writeFileSync('AgentNote/post-expansion-audit.json',JSON.stringify(expansion,null,2)+'\n');
fs.writeFileSync('AgentNote/post-balance-audit.json' ,JSON.stringify(report,null,2)+'\n');
for(const r of report.filter(r=>r.seed===1700))console.log(JSON.stringify({...r,months:undefined},(_k,v)=>typeof v==='number'?Math.round(v*100)/100:v));
for(const r of expansion.filter(r=>r.seed===1700))console.log(JSON.stringify(r));
