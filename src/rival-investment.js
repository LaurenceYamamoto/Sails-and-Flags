import {CITIES,GOODS} from './data.js';
import {ROADS,roadBetween} from './land-data.js';
import {routeShips,routeLegs} from './engine.js';
import {PROFILES} from './management.js';
import {licenseTerms,RULES} from './security.js';
import {shipSpec,shipDaily,industryDaily,developmentQuote,buyDevelopmentRight,setCityInvestment,setTechnologyInvestment} from './industry.js';
import {roadQuote,buyRoadRight,setRoadInvestment} from './land.js';

export const INVESTMENT_POLICY={small:{daily:6,cities:1,roads:1,purchaseShare:.1},large:{daily:18,cities:3,roads:3,purchaseShare:.15}};
// Keep ninety days of mandatory costs and a per-capacity trading allowance.
export function rivalInvestmentBudget(s){
 const p=PROFILES[s.strategy.kind],policy=INVESTMENT_POLICY[s.strategy.kind];
 const upkeep=s.ships.reduce((n,v)=>n+shipDaily(s,v.type),0),fixed=s.licenses.reduce((n,id)=>n+licenseTerms(s,id).daily,0)+s.routes.reduce((n,r)=>n+r.escorts*RULES.escortDaily,0)+Object.values(s.diplomacy.investment).reduce((n,v)=>n+v,0);
 const reserve=p.reserve+90*(upkeep+fixed)+s.ships.reduce((n,v)=>n+shipSpec(s,v.type).capacity*50,0);
 // Route observations include transport upkeep; subtract only other overheads.
 const earned=s.routes.reduce((n,r)=>n+(s.day-r.transport.since>=30&&r.transport.deliveries>0?(r.transport.sales-r.transport.costs-r.transport.upkeep)/Math.max(30,s.day-r.transport.since):0),0)-fixed-s.ships.filter(v=>!v.routeId).reduce((n,v)=>n+shipDaily(s,v.type),0);
 return {reserve,daily:Math.floor(Math.max(0,Math.min(policy.daily,earned*.15,(s.cash-reserve)/180))*100)/100};
}
function commitments(s){
 return [...Object.keys(s.industry.investment).map(key=>[s.industry.investment,key]),...Object.values(s.world.development).filter(d=>d.owner===s.industry.id).flatMap(d=>[[d,'dailySize'],...Object.keys(d.dailyProduction).map(key=>[d.dailyProduction,key])]),...Object.values(s.world.roads).filter(d=>d.owner===s.industry.id).flatMap(d=>[[d,'dailyRoad'],[d,'dailySecurity']])];
}
export function guardRivalInvestment(s){
 if(!s.strategy||s.gameOver)return;
 const current=industryDaily(s);if(!current)return;
 const {daily}=rivalInvestmentBudget(s);
 // Splitting city/road budgets into thirds can add sub-cent floating-point noise.
 if(current>daily+1e-9){const ratio=daily/current;for(const [target,key]of commitments(s))target[key]=Math.floor(target[key]*ratio*100)/100;
  if(daily===0){s.industry.log.push({day:s.day,kind:'skipped',city:null,cost:0});s.industry.log=s.industry.log.slice(-60);}
 }
}
function activity(s){
 const cities=new Map(),roads=new Map();
 for(const r of s.routes){const fleet=routeShips(s,r);if(!r.active||!fleet.length||!r.transport.deliveries||r.transport.sales<=r.transport.costs+r.transport.upkeep)continue;
  const traffic=fleet.reduce((n,v)=>n+shipSpec(s,v.type).capacity,0);
  for(const id of new Set(r.stops))cities.set(id,(cities.get(id)??0)+traffic);
  if(r.mode==='land')for(const id of new Set(routeLegs(r).map(([a,b])=>roadBetween(a,b)[0])))roads.set(id,(roads.get(id)??0)+traffic);
 }
 return {cities,roads};
}
export function planRivalInvestment(s){
 if(!s.strategy||s.gameOver)return;
 // A monthly reassessment also releases commitments to abandoned services.
 for(const [target,key]of commitments(s))target[key]=0;
 const policy=INVESTMENT_POLICY[s.strategy.kind],budget=rivalInvestmentBudget(s),used=activity(s);
 if(budget.daily<=0)return;
 const ownedCities=Object.values(s.world.development).filter(d=>d.owner===s.industry.id).length,ownedRoads=Object.values(s.world.roads).filter(d=>d.owner===s.industry.id).length;
 const candidates=[];
 if(budget.daily>=1){
  if(ownedCities<policy.cities)for(const [id,traffic]of used.cities){const q=developmentQuote(s,id);if(q.eligible&&['state','private'].includes(q.owner))candidates.push({kind:'city',id,cost:q.cost,score:traffic/q.cost});}
  if(ownedRoads<policy.roads)for(const [id,traffic]of used.roads){const q=roadQuote(s,id);if(q.eligible&&['state','private'].includes(q.owner))candidates.push({kind:'road',id,cost:q.cost,score:traffic/q.cost});}
 }
 const purchaseLimit=Math.max(0,s.cash-budget.reserve)*policy.purchaseShare;
 const best=candidates.filter(q=>q.cost<=purchaseLimit&&s.cash-q.cost>=budget.reserve+180*budget.daily).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id,'en'))[0];
 if(best){if(best.kind==='city')buyDevelopmentRight(s,best.id);else buyRoadRight(s,best.id);}
 const allocations=[],active=s.routes.filter(r=>r.active&&routeShips(s,r).length);
 if(active.some(r=>r.mode==='sea'))allocations.push({weight:3,apply:v=>setTechnologyInvestment(s,'seafaring',v)});
 if(active.some(r=>r.mode==='land'))allocations.push({weight:3,apply:v=>setTechnologyInvestment(s,'land',v)});
 for(const id of used.cities.keys())if(s.world.development[id].owner===s.industry.id&&s.licenses.includes(CITIES[id].nation))allocations.push({weight:3,apply:v=>setCityInvestment(s,id,v/3,{[GOODS[CITIES[id].supply.indexOf(Math.max(...CITIES[id].supply))].id]:2*v/3})});
 for(const id of used.roads.keys())if(s.world.roads[id].owner===s.industry.id&&ROADS[id].nations.every(n=>s.licenses.includes(n)))allocations.push({weight:3,apply:v=>setRoadInvestment(s,id,2*v/3,v/3)});
 const total=allocations.reduce((n,a)=>n+a.weight,0);
 for(const a of allocations)a.apply(Math.floor(budget.daily*a.weight/total*100)/100);
}
