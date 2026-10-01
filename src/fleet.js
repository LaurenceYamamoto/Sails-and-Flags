import {SHIPS,distance} from './data.js';
import {shipSpec,shipCatalog,shipDaily,canProduce} from './industry.js';
import {entry,routeLegs,routeSchedule,reschedule,serialize,deserialize} from './engine.js';
import {checkedName,shipName} from './identity.js';
const check=(ok,message)=>{if(!ok)throw new Error(message);};
export function renameCompany(s,value){s.companyName=checkedName(value);}
export function renameDesign(s,id,value){check(s.industry.designIds.includes(id),'自社の研究済み設計を選んでください。');s.world.designs[id].spec.customName=checkedName(value);}
export function renameShip(s,id,value){const v=s.ships.find(v=>v.id===id);check(v,'船を確認してください。');v.name=checkedName(value);}
export function quoteFleetReplacement(s,{mode,source,target,routeId}){
 const result={mode,source,target,routeId,shipIds:[],routeIds:[],count:0,sailing:0,sale:0,purchase:0,cost:0,remaining:s.cash,error:null};
 try{
  check(!s.gameOver,'破産後は操作できません。新しいゲームを開始してください。');
  check(['type','route','automation'].includes(mode),'置換対象を確認してください。');
  check(Object.hasOwn(shipCatalog(s),target)&&canProduce(s,target),'購入・建造できる置換先の船種を選んでください。');
  if(mode!=='route')check(Object.hasOwn(shipCatalog(s),source)&&source!==target,'異なる置換元・置換先の船種を選んでください。');
  if(mode==='route')check(s.routes.some(r=>r.id===routeId),'ルートを確認してください。');
  const ships=mode==='automation'?[]:s.ships.filter(v=>(mode==='type'?v.type===source:v.routeId===routeId)&&v.type!==target);
  const routes=mode==='automation'?s.routes.filter(r=>r.autoShipType===source):s.routes.filter(r=>ships.some(v=>v.routeId===r.id));
  result.shipIds=ships.map(v=>v.id);result.routeIds=routes.map(r=>r.id);result.count=mode==='automation'?routes.length:ships.length;result.sailing=ships.filter(v=>v.voyage).length;
  result.sale=ships.reduce((n,v)=>n+shipSpec(s,v.type).price,0);result.purchase=ships.length*shipSpec(s,target).price;result.cost=result.purchase-result.sale;result.remaining=s.cash-result.cost;
  check(result.count>0,'置き換える対象がありません。');
  check([result.sale,result.purchase,result.cost,result.remaining].every(Number.isFinite),'置換金額が大きすぎます。');
  check(routes.every(r=>routeLegs(r).every(([a,b])=>distance(a,b)<=shipSpec(s,target).range)),'置換先の航続距離が不足するルートがあります。');
  check(result.remaining>=0,'置換差額の資金が不足しています。');
 }catch(error){result.error=error.message;}
 return result;
}
export function replaceFleet(s,options){
 const q=quoteFleetReplacement(s,options);check(!q.error,q.error);
 // Validate a detached transaction before replacing live state; no partial fleet changes.
 const copy=deserialize(serialize(s)),ships=copy.ships.filter(v=>q.shipIds.includes(v.id));
 for(const v of ships)entry(copy,'shipSale',shipSpec(copy,v.type).price,null,{shipId:v.id});
 for(const v of ships){
  if(v.voyage){v.voyage.departureType??=v.type;v.voyage.upkeep??=(v.voyage.total-v.voyage.remaining)*shipDaily(copy,v.type);}
  v.name=shipName(copy,v);v.type=q.target;
  entry(copy,Object.hasOwn(SHIPS,q.target)?'shipPurchase':'shipConstruction',-shipSpec(copy,q.target).price,null,{shipId:v.id});
 }
 for(const r of copy.routes.filter(r=>q.routeIds.includes(r.id))){
  if(q.mode==='automation')r.autoShipType=q.target;
  else{reschedule(copy,r);r.transport={since:copy.day,sales:0,costs:0,upkeep:0,deliveries:0};r.cooldownUntil=copy.day+routeSchedule(copy,r).cycle;}
 }
 Object.assign(s,deserialize(serialize(copy)));return q;
}
