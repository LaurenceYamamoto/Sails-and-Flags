import {planRivalInvestment} from './rival-investment-v14.js';
import {canServe,travelDistance,roadToll,routeNations} from './land-v14.js';
import {shipName} from './identity-v14.js';
import {shipSpec,shipCatalog,shipDaily,sailingDays,canProduce,transferIndustry} from './industry-v14.js';
import { CITIES, NATIONS, SHIPS, GOODS, distance, daysFor } from './data-v14.js';
import { assets, buyLicense, buyShip, assignShip, releaseShip, setCircuit, removeRoute, routeShips, routeLegs, routeSchedule, circuitKey, optimizeLoad, price, entry, reschedule, serialize, deserialize } from './engine-v14.js';
import {licenseTerms} from './security-v14.js';

const check=(ok,message)=>{if(!ok)throw new Error(message);};
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const amount=n=>finite(n)&&n>=0&&n<=1e12;
export const monthFor=day=>new Date(Date.UTC(1700,0,1)+day*86400000).toISOString().slice(0,7);
export const PROFILES={small:{cash:5000,reserve:1000,maxShips:150,maxRoutes:50,types:['sloop','wagon','camel','mule']},large:{cash:25000,reserve:6000,maxShips:150,maxRoutes:50,types:['sloop','brig','fluyt','wagon','camel','mule']}};
export function initializeManagement(s, kind=null) {
  s.automation={enabled:false,monthlyBudget:0,minCash:1000,expandThreshold:25,shrinkThreshold:0,month:monthFor(s.day),spent:0};
  s.managementLog=[];s.firstRankDay=null;
  if(kind)s.strategy={kind,lastMonth:monthFor(s.day)};
  for(const r of s.routes)initializeRoute(r,s.day,routeShips(s,r)[0].type);
}
export function initializeRoute(r,day,type=r.autoShipType) {
  r.autoManage=true;r.autoShipType=type;r.cooldownUntil=day;
  r.transport={since:day,sales:0,costs:0,upkeep:0,deliveries:0};
}
const REASONS=['expanded','reused','replaced','shrunk','cooldown','sample','budget','reserve','minimumFleet','sailing','threshold','stopped','limit','noOpportunity','rivalExpanded','rivalReassigned','acquired','firstRank'];
export function managementLog(s,reason,routeId=null,cost=0) {
  // Keep the latest reason per route without filling the log on every tick.
  const last=[...s.managementLog].reverse().find(e=>e.routeId===routeId);
  if(last?.reason===reason && !['expanded','reused','replaced','shrunk','rivalExpanded','rivalReassigned','acquired'].includes(reason))return;
  s.managementLog.push({day:s.day,reason,routeId,cost});
  if(s.managementLog.length>100)s.managementLog.shift();
}
export function transportMargin(route) {
  const m=route.transport,expenses=m.costs+m.upkeep;
  return expenses>0 ? (m.sales-expenses)/expenses*100 : null;
}
export function setAutomation(s,settings) {
  check(!s.gameOver,'破産後は操作できません。新しいゲームを開始してください。');
  const {enabled,monthlyBudget,minCash,expandThreshold,shrinkThreshold}=settings;
  check(typeof enabled==='boolean'&&amount(monthlyBudget)&&amount(minCash)&&finite(expandThreshold)&&finite(shrinkThreshold)&&shrinkThreshold>=-100&&expandThreshold<=10000&&expandThreshold>=shrinkThreshold,'自動化の予算・最低資金・利益率閾値を確認してください。');
  const replaceLost=settings.replaceLost??s.automation.replaceLost;check(typeof replaceLost==='boolean','補充設定が不正です。');
  const spent=s.automation.month===monthFor(s.day)?s.automation.spent:0;
  check(monthlyBudget>=spent,'月間予算を今月の使用額より小さくできません。');
  Object.assign(s.automation,{enabled,replaceLost,monthlyBudget,minCash,expandThreshold,shrinkThreshold,spent,month:monthFor(s.day)});
}
export function automationShipTypes(r,s) {
  return Object.keys(shipCatalog(s)).filter(type=>canServe(s,type,r));
}
export function setRouteAutomationShip(s,routeId,type) {
  check(!s.gameOver,'破産後は操作できません。新しいゲームを開始してください。');
  const r=s.routes.find(r=>r.id===routeId);
  check(r&&automationShipTypes(r,s).includes(type),'このルートで使用できる自動増減用の船種を選んでください。');
  r.autoShipType=type;
}
function adjusted(s,r,cycle) {
  r.cooldownUntil=s.day+Math.max(cycle,routeSchedule(s,r).cycle);
  r.transport={since:s.day,sales:0,costs:0,upkeep:0,deliveries:0};
}
export function runAutomation(s) {
  const a=s.automation;
  if(a.month!==monthFor(s.day)){a.month=monthFor(s.day);a.spent=0;}
  if(!a.enabled || s.gameOver)return;
  const ordered=[...s.routes].sort((x,y)=>(transportMargin(y)??-Infinity)-(transportMargin(x)??-Infinity)||x.id.localeCompare(y.id));
  for(const r of ordered) {
    if(!r.autoManage||r.pendingReplacements.length)continue;
    const fleet=routeShips(s,r),cycle=routeSchedule(s,r).cycle,margin=transportMargin(r);
    const skip=reason=>managementLog(s,reason,r.id);
    if(!r.active){skip('stopped');continue;}
    if(s.day<r.cooldownUntil){skip('cooldown');continue;}
    if(s.day-r.transport.since<cycle || !r.transport.deliveries || margin===null){skip('sample');continue;}
    if(margin>a.expandThreshold) {
      const type=r.autoShipType;
      const idle=s.ships.find(v=>!v.routeId&&!v.voyage&&v.type===type);
      const cost=idle?0:shipSpec(s,type).price;
      if(!idle&&!canProduce(s,type)){skip('noOpportunity');continue;}
      if(!idle&&s.strategy&&s.ships.length>=PROFILES[s.strategy.kind].maxShips){skip('limit');continue;}
      if(a.spent+cost>a.monthlyBudget){skip('budget');continue;}
      if(s.cash-cost<a.minCash){skip('reserve');continue;}
      const ship=idle??buyShip(s,type);assignShip(s,r.id,ship.id);a.spent+=cost;
      adjusted(s,r,cycle);managementLog(s,idle?'reused':'expanded',r.id,cost);
    } else if(margin<a.shrinkThreshold) {
      if(fleet.length<=1){skip('minimumFleet');continue;}
      const preferred=fleet.filter(v=>v.type===r.autoShipType);
      const minimum=Math.min(...fleet.map(v=>shipSpec(s,v.type).capacity));
      const candidates=preferred.length?preferred:fleet.filter(v=>shipSpec(s,v.type).capacity===minimum);
      // Keep type/capacity priority even while the preferred ships are at sea.
      const ship=[...candidates].reverse().find(v=>!v.voyage);
      if(!ship){skip('sailing');continue;}
      releaseShip(s,ship.id);adjusted(s,r,cycle);managementLog(s,'shrunk',r.id);
    } else skip('threshold');
  }
}
export function rankings(s) {
  return [{id:'player',name:'',company:s},...s.competitors.map((company,i)=>({id:String(i),name:company.name,company}))]
    .map(row=>({...row,assets:assets(row.company)})).sort((a,b)=>b.assets-a.assets||a.id.localeCompare(b.id));
}
export function recordRank(s) {
  if(!s.gameOver&&s.firstRankDay===null&&s.competitors.every(c=>assets(s)>assets(c))) {
    s.firstRankDay=s.day;managementLog(s,'firstRank');
  }
}
// Monthly AI compares current market opportunities, then uses the same exact
// loading, prices, licenses and ship purchase functions as the player.
export function runCompetitor(s) {
  if(s.gameOver||!s.strategy||s.strategy.lastMonth===monthFor(s.day))return;
  s.strategy.lastMonth=monthFor(s.day);
  // Reconsider loss-making services even when the fleet is already at its cap.
  for(const old of [...s.routes])if(s.routes.length>1&&s.day-old.transport.since>90&&transportMargin(old)<0&&routeShips(s,old).every(v=>!v.voyage&&v.status==='waiting')) {
    removeRoute(s,old.id);managementLog(s,'rivalReassigned',old.id);break;
  }
  planRivalInvestment(s);
  const p=PROFILES[s.strategy.kind],candidates=[];
  const ids=Object.keys(CITIES),pairs=ids.flatMap((a,i)=>ids.slice(i+1).map(b=>[a,b]));
  // Rotate a bounded planning window; always consider reinforcing current routes.
  const month=Number(monthFor(s.day).slice(0,4))*12+Number(monthFor(s.day).slice(5));
  const offset=(month*120+Number(s.industry.id.split('-')[1])*37)%pairs.length;
  const sampled=new Map(s.routes.filter(r=>r.stops.length===2).map(r=>[circuitKey(r.stops),r.stops]));
  for(let i=0;i<Math.min(120,pairs.length);i++){const pair=pairs[(offset+i)%pairs.length];sampled.set(circuitKey(pair),pair);}
  for(const [a,b] of sampled.values())for(const type of p.types) {
    const ship=shipSpec(s,type);if(travelDistance(s,type,a,b)>ship.range)continue;
    const existing=s.routes.find(r=>r.mode===ship.mode&&circuitKey(r.stops)===circuitKey([a,b]));
    if(existing&&routeShips(s,existing).length>=3)continue;
    const missing=routeNations({stops:[a,b],mode:ship.mode}).filter(n=>!s.licenses.includes(n));
    if(missing.some(n=>!licenseTerms(s,n).canBuy))continue;
    const idle=s.ships.find(v=>!v.routeId&&v.type===type);
    const cost=(idle?0:ship.price)+missing.reduce((n,id)=>n+licenseTerms(s,id).fee,0);
    if(s.cash-cost<p.reserve || (!idle&&s.ships.length>=p.maxShips))continue;
    if(!existing&&s.routes.length>=p.maxRoutes)continue;
    const cycle=2*(sailingDays(s,type,a,b)+1),toll=ship.mode==='land'?roadToll(s,a,b)*2:0;
    const estimate=[[a,b],[b,a]].reduce((sum,[from,to])=>sum+Math.max(0,...GOODS.map(g=>(price(g.id,s.markets[to][g.id].stock)*(1-licenseTerms(s,CITIES[to].nation).tax)-price(g.id,s.markets[from][g.id].stock)*(1+licenseTerms(s,CITIES[from].nation).tax))*Math.min(ship.capacity,s.markets[from][g.id].stock))),0)/cycle-shipDaily(s,type)-toll/cycle;
    candidates.push({a,b,type,existing,missing,idle,cost,cycle,toll,estimate});
  }
  const best=candidates.sort((a,b)=>b.estimate-a.estimate).slice(0,4).map(c=>{
    const ship=shipSpec(s,c.type),budget=Math.max(0,s.cash-c.cost-p.reserve);
    const profit=[[c.a,c.b],[c.b,c.a]].reduce((sum,[a,b])=>sum+optimizeLoad(s,a,b,ship.capacity,budget,GOODS.map(g=>g.id),10).profit,0);
    return {...c,score:(profit-c.toll)/c.cycle-shipDaily(s,c.type)-c.missing.reduce((v,n)=>v+licenseTerms(s,n).daily,0)};
  }).sort((a,b)=>b.score-a.score)[0];
  if(!best || best.score<=2){managementLog(s,'noOpportunity');return;}
  for(const nation of best.missing)buyLicense(s,nation);
  const ship=best.idle??buyShip(s,best.type);
  const route=setCircuit(s,ship.id,[best.a,best.b]);
  managementLog(s,'rivalExpanded',route.id,best.cost);
}
export function acquisitionQuote(s,index) {
  const c=s.competitors[index];check(c,'買収対象が存在しません。');
  const price=Math.ceil(Math.max(0,assets(c))*1.15);
  const missing=c.licenses.filter(n=>!s.licenses.includes(n));
  const licenseCost=missing.reduce((n,id)=>n+licenseTerms(s,id).fee,0);
  return {price,licenseCost,missing,eligible:missing.every(n=>licenseTerms(s,n).canBuy),cash:c.cash,assets:assets(c),ships:c.ships.length,routes:c.routes.length,required:price+licenseCost+Math.max(0,-c.cash)};
}
export function acquireCompany(s,index) {
  check(!s.gameOver,'破産後は操作できません。新しいゲームを開始してください。');
  const q=acquisitionQuote(s,index),target=s.competitors[index];
  check(q.eligible,'友好度30以上で交易免許を取得できます。');
  check(s.cash>=q.required,'買収代金と必要な免許・債務を支払う資金が不足しています。');
  // Work on a validated clone: failed transfers cannot partially spend money.
  const copy=deserialize(serialize(s)),c=copy.competitors[index],routeMap=new Map(),touched=new Set();
  entry(copy,'acquisition',-q.price);
  for(const n of q.missing)buyLicense(copy,n);
  entry(copy,'acquiredCash',c.cash);
  for(const old of c.routes) {
    let route=copy.routes.find(r=>r.mode===old.mode&&circuitKey(r.stops)===circuitKey(old.stops));
    if(!route){route={...structuredClone(old),id:`route-${copy.nextId++}`,started:copy.day,profit:0,expenses:0,revenue:0,deliveries:0,lastForecast:0,lastActual:null,scheduleEpoch:copy.day+1};initializeRoute(route,copy.day);copy.routes.push(route);}else{check(route.pendingReplacements.length+old.pendingReplacements.length<=200,'補充待ちの上限を超えています。');route.pendingReplacements.push(...old.pendingReplacements);}
    const offset=route.stops.findIndex((_,i)=>old.stops.every((port,j)=>route.stops[(i+j)%route.stops.length]===port));
    routeMap.set(old.id,{route,offset,old});touched.add(route);
  }
  for(const old of c.ships) {
    const ship={...structuredClone(old),name:shipName(c,old),id:`ship-${copy.nextId++}`};
    if(old.routeId){const {route,offset,old:oldRoute}=routeMap.get(old.routeId);ship.routeId=route.id;ship.nextStop=((old.nextStop??oldRoute.stops.indexOf(old.nextFrom))+offset)%route.stops.length;ship.readyDay=Math.min(copy.day+1,old.readyDay+copy.day-c.day);}
    copy.ships.push(ship);
  }
  for(const route of touched){
    if(route.mode==='sea'&&[...routeShips(copy,route).map(v=>v.type),route.autoShipType,...route.pendingReplacements].some(type=>!canServe(copy,type,route))){route.rangeReview=true;route.active=false;}
    reschedule(copy,route);route.cooldownUntil=copy.day+routeSchedule(copy,route).cycle;
  }
  transferIndustry(copy,c);copy.competitors.splice(index,1);managementLog(copy,'acquired',null,q.price+q.licenseCost);recordRank(copy);
  const validated=deserialize(serialize(copy));Object.assign(s,validated);
  return q;
}
export function validateManagement(s,nested) {
  const a=s.automation;
  check(a&&typeof a.enabled==='boolean'&&amount(a.monthlyBudget)&&amount(a.minCash)&&amount(a.spent)&&a.spent<=a.monthlyBudget&&/^\d{4}-\d{2}$/.test(a.month)&&a.month<=monthFor(s.day)&&finite(a.expandThreshold)&&finite(a.shrinkThreshold)&&a.shrinkThreshold>=-100&&a.expandThreshold<=10000&&a.expandThreshold>=a.shrinkThreshold,'自動化設定が不正です。');
  check(s.firstRankDay===null||Number.isInteger(s.firstRankDay)&&s.firstRankDay>=0&&s.firstRankDay<=s.day,'達成記録が不正です。');
  check(Array.isArray(s.managementLog)&&s.managementLog.length<=100&&s.managementLog.every(e=>Number.isInteger(e.day)&&e.day>=0&&e.day<=s.day&&REASONS.includes(e.reason)&&(e.routeId===null||/^route-[1-9]\d*$/.test(e.routeId))&&amount(e.cost)),'経営履歴が不正です。');
  check(!nested||s.strategy&&Object.hasOwn(PROFILES,s.strategy.kind)&&/^\d{4}-\d{2}$/.test(s.strategy.lastMonth)&&s.strategy.lastMonth<=monthFor(s.day),'競合の戦略が不正です。');
  for(const r of s.routes){
    // Additive v4 migration: only an absent field gets a default. Preserve all
    // budget, observation and voyage state; reject explicitly invalid choices.
    if(!Object.hasOwn(r,'autoShipType'))r.autoShipType=routeShips(s,r)[0].type;
    check(automationShipTypes(r,s).includes(r.autoShipType)||r.rangeReview&&shipSpec(s,r.autoShipType)?.mode==='sea','航路の自動増減用の船種が不正です。');
    const m=r.transport;check(typeof r.autoManage==='boolean'&&Number.isSafeInteger(r.cooldownUntil)&&r.cooldownUntil>=0&&m&&Number.isSafeInteger(m.since)&&m.since>=0&&m.since<=s.day&&['sales','costs','upkeep'].every(k=>amount(m[k]))&&Number.isSafeInteger(m.deliveries)&&m.deliveries>=0,'航路の自動化実績が不正です。');
  }
}
