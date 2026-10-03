import {routeNations,confiscateRoads,roadRisk,canServe} from './land-v12.js';
import {shipSpec,canProduce,confiscateDevelopment} from './industry-v12.js';
import {CITIES,NATIONS,SHIPS,distance} from './data-v12.js';
import {entry,routeShips,routeLegs,reschedule,removeRoute,buyShip,assignShip,routeSchedule} from './engine-v12.js';
import {monthFor,managementLog} from './management-v12.js';
export const RULES={initial:60,buy:30,warn:35,revoke:20,hostile:10,escortDaily:4,grace:60};
const nations=Object.keys(NATIONS),cap=n=>Math.max(0,Math.min(100,n));
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const amount=n=>Number.isFinite(n)&&n>=0&&n<=1e12;
const country=n=>Object.hasOwn(NATIONS,n);
const capitals=Object.fromEntries(Object.entries(NATIONS).map(([id,n])=>[id,n.tradePort]));
const rivalry=[['england','france'],['england','spain'],['netherlands','france'],['netherlands','spain']];
export function random(s){s.rng=(Math.imul(s.rng,1664525)+1013904223)>>>0;return s.rng/4294967296;}
export function createWorld(day,seed,enabled=true){
  return {enabled,rng:seed>>>0,graceUntil:day+RULES.grace,lastMonth:monthFor(day),events:[],pairs:nations.flatMap((a,i)=>nations.slice(i+1).map(b=>{
    const base=rivalry.some(p=>p.includes(a)&&p.includes(b))?25:65;
    return {a,b,base,relation:base,until:null,cooldownUntil:day+365};
  }))};
}
export function initializeSecurity(s,world=createWorld(s.day,s.seed)){
  s.world=world;s.diplomacy={friendship:Object.fromEntries(nations.map(n=>[n,RULES.initial])),investment:Object.fromEntries(nations.map(n=>[n,0])),tradeToday:Object.fromEntries(nations.map(n=>[n,0])),lastChange:Object.fromEntries(nations.map(n=>[n,{trade:0,enemies:0,investment:0}]))};
  s.incidents=[];s.automation.replaceLost=false;
  for(const r of s.routes)initializeRouteSecurity(r);
}
export function initializeRouteSecurity(r){r.escorts=0;r.pendingReplacements=[];r.losses={cargo:0,ships:0,count:0};}
export function licenseTerms(s,n){
  const f=s.world?.enabled? s.diplomacy.friendship[n]:RULES.initial,factor=1+(RULES.initial-f)/100;
  return {fee:NATIONS[n].fee*factor,daily:NATIONS[n].daily*factor,tax:NATIONS[n].tax*factor,canBuy:f>=RULES.buy};
}
export const atWar=(s,a,b)=>s.world.pairs.some(p=>p.until!==null&&[p.a,p.b].includes(a)&&[p.a,p.b].includes(b)&&a!==b);
export const demandMultiplier=(s,n,good)=>s.world.enabled&&good==='weapons'&&s.world.pairs.some(p=>p.until!==null&&(p.a===n||p.b===n))?1.8:1;
export function recordTrade(s,n,value){if(s.world.enabled)s.diplomacy.tradeToday[n]=Math.min(5000,s.diplomacy.tradeToday[n]+value);}
function incident(s,kind,details={}){s.incidents.push({day:s.day,kind,...details});if(s.incidents.length>100)s.incidents.shift();}
export function advanceWorld(s){
  const w=s.world;if(!w.enabled)return;
  for(const p of w.pairs)if(p.until!==null&&s.day>=p.until){p.until=null;p.relation=60;p.cooldownUntil=s.day+365;w.events.push({day:s.day,kind:'peace',a:p.a,b:p.b});}
  if(w.lastMonth!==monthFor(s.day)){
    w.lastMonth=monthFor(s.day);
    for(const p of w.pairs)if(p.until===null){
      p.relation=cap(p.relation+(p.base-p.relation)*.05+(random(w)-.5)*8);
      const proximity=Math.min(1,1800/distance(capitals[p.a],capitals[p.b]));
      if(s.day>=p.cooldownUntil&&p.relation<30&&random(w)<.12*proximity){p.until=s.day+730+Math.floor(random(w)*2921);w.events.push({day:s.day,kind:'war',a:p.a,b:p.b});}
    }
  }
  w.events=w.events.slice(-100);
}
export function setDiplomacyInvestment(s,n,value){
  check(!s.gameOver&&country(n)&&amount(value),'外交投資の国・金額を確認してください。');s.diplomacy.investment[n]=value;
}
export function donate(s,n,value){
  check(!s.gameOver&&country(n)&&amount(value)&&value>0&&s.cash>=value,'外交投資の国・金額を確認してください。');
  entry(s,'diplomacyInvestment',-value,null,{nation:n});s.diplomacy.friendship[n]=cap(s.diplomacy.friendship[n]+value/100);incident(s,'donation',{nation:n,cost:value});
}
export function revokeLicense(s,n){
  if(!s.licenses.includes(n))return;
  let cargoCost=0,ships=0;
  for(const r of [...s.routes])if(routeNations(r).includes(n)){
    for(const v of routeShips(s,r)){
      cargoCost+=v.cargo.reduce((sum,c)=>sum+c.total,0);ships++;
      v.cargo=[];v.voyage=null;v.status='ready';
    }
    removeRoute(s,r.id);
  }
  confiscateDevelopment(s,n);confiscateRoads(s,n);
  s.licenses=s.licenses.filter(id=>id!==n);incident(s,'revoked',{nation:n,cargoCost,ships});
}
export function advanceDiplomacy(s){
  if(!s.world.enabled)return;
  const d=s.diplomacy,trade=d.tradeToday,enemyTrade=Object.fromEntries(nations.map(n=>[n,0]));
  for(const p of s.world.pairs)if(p.until!==null){enemyTrade[p.a]+=trade[p.b];enemyTrade[p.b]+=trade[p.a];}
  for(const n of nations){
    const before=d.friendship[n],investment=d.investment[n];
    let gain=0;
    if(investment>0){
      if(s.cash>=investment){entry(s,'diplomacyInvestment',-investment,null,{nation:n});gain=Math.sqrt(investment)/50;}
      else if(s.day%30===1)incident(s,'investmentSkipped',{nation:n});
    }
    const own=trade[n]/100000,enemies=enemyTrade[n]/100000*1.5;
    d.lastChange[n]={trade:own,enemies:enemies?-enemies:0,investment:gain};d.friendship[n]=cap(before+own-enemies+gain);
    if(s.licenses.includes(n)&&before>RULES.warn&&d.friendship[n]<=RULES.warn)incident(s,'warning',{nation:n});
    if(d.friendship[n]<=RULES.revoke)revokeLicense(s,n);
  }
  d.tradeToday=Object.fromEntries(nations.map(n=>[n,0]));
}
export function setEscort(s,id,count){
  const r=s.routes.find(r=>r.id===id);check(!s.gameOver&&r&&Number.isInteger(count)&&count>=0&&count<=3,'護衛船は0～3隻で指定してください。');r.escorts=count;
}
export function riskFor(s,r,type,from=r.a,to=r.b){
  if(shipSpec(s,type).mode==='land')return roadRisk(s,r,from,to);
  const ship=shipSpec(s,type),caribbean=[from,to].some(id=>CITIES[id].lon<-55&&CITIES[id].lon>-90&&CITIES[id].lat>5&&CITIES[id].lat<25);
  // Nearby hostile ports can intercept services even after their license is revoked.
  const hostile=Object.entries(CITIES).some(([id,c])=>!c.inland&&s.diplomacy.friendship[c.nation]<=RULES.hostile&&(id===from||id===to||Math.min(distance(id,from),distance(id,to))<=400));
  const base=(caribbean?.002:.0008)+(hostile?.004:0),defense=1+ship.guns/10+Math.max(0,ship.speed-90)/100+r.escorts*.8;
  return {daily:s.world.enabled?base/(1+r.escorts*.8):0,lossFraction:.6/defense,sinkChance:.025/defense,hostile};
}
export function resolveAttack(s,r,v,severity,sinking){
  const risk=riskFor(s,r,v.type,v.voyage.from,v.voyage.to),lost=sinking<risk.sinkChance;
  let cargoCost=0;
  for(const c of v.cargo){const fraction=lost?1:risk.lossFraction*(.5+severity/2),q=Math.min(c.quantity,Math.ceil(c.quantity*fraction)),cost=c.total*q/c.quantity;c.quantity-=q;c.total-=cost;cargoCost+=cost;}
  v.cargo=v.cargo.filter(c=>c.quantity>0);v.voyage.lostCost=(v.voyage.lostCost??0)+cargoCost;v.voyage.cost=Math.max(0,v.voyage.cost-cargoCost);
  r.transport.costs+=cargoCost;r.losses.cargo+=cargoCost;
  const shipValue=lost?shipSpec(s,v.type).price:0;
  incident(s,lost?'shipLost':'raided',{routeId:r.id,type:v.type,cargoCost,shipValue,hostile:risk.hostile});
  if(lost){
    r.losses.ships+=shipValue;r.losses.count++;r.transport.costs+=shipValue;
    // Replacement claims cannot grow unbounded even after repeated manual fleet changes.
    if(r.pendingReplacements.length<200)r.pendingReplacements.push(v.type);
    s.ships=s.ships.filter(ship=>ship.id!==v.id);
    if(routeShips(s,r).length)reschedule(s,r);else r.scheduleEpoch=s.day+1;
  }
  return lost;
}
export function checkAttack(s,r,v){
  if(!s.world.enabled||s.day<=s.world.graceUntil)return false;
  const p=riskFor(s,r,v.type,v.voyage.from,v.voyage.to);
  if(random(s)>=p.daily)return false;
  return resolveAttack(s,r,v,random(s),random(s));
}
export function runReplacements(s){
  const a=s.automation;
  if(a.month!==monthFor(s.day)){a.month=monthFor(s.day);a.spent=0;}
  if(!a.enabled||!a.replaceLost||s.gameOver)return;
  for(const r of s.routes){
    if(!r.active||!r.autoManage||!r.pendingReplacements.length)continue;
    const type=r.pendingReplacements[0],idle=s.ships.find(v=>!v.routeId&&!v.voyage&&v.type===type),cost=idle?0:shipSpec(s,type).price;
    const reason=!idle&&!canProduce(s,type)?'noOpportunity':a.spent+cost>a.monthlyBudget?'budget':s.cash-cost<a.minCash?'reserve':null;
    if(reason){managementLog(s,reason,r.id);continue;}
    const ship=idle??buyShip(s,type);assignShip(s,r.id,ship.id);a.spent+=cost;
    r.cooldownUntil=s.day+routeSchedule(s,r).cycle;r.transport={since:s.day,sales:0,costs:0,upkeep:0,deliveries:0};
    managementLog(s,'replaced',r.id,cost);
  }
}
export function validateSecurity(s,nested=false){
  const w=s.world,d=s.diplomacy;
  const keys=o=>o&&Object.keys(o).length===nations.length&&nations.every(n=>Object.hasOwn(o,n));
  check(w&&typeof w.enabled==='boolean'&&Number.isInteger(w.rng)&&w.rng>=0&&w.rng<=0xffffffff&&Number.isSafeInteger(w.graceUntil)&&w.graceUntil>=0&&/^\d{4}-\d{2}$/.test(w.lastMonth),'世界情勢が不正です。');
  check(Number.isInteger(s.rng)&&s.rng>=0&&s.rng<=0xffffffff&&(nested||w.lastMonth<=monthFor(s.day)),'乱数・情勢時刻が不正です。');
  const pairKeys=new Set();check(Array.isArray(w.pairs)&&w.pairs.length===nations.length*(nations.length-1)/2&&w.pairs.every(p=>{const key=[p.a,p.b].sort().join(':');if(pairKeys.has(key))return false;pairKeys.add(key);return country(p.a)&&country(p.b)&&p.a!==p.b&&amount(p.base)&&p.base<=100&&amount(p.relation)&&p.relation<=100&&(p.until===null||Number.isSafeInteger(p.until)&&p.until>=0)&&Number.isSafeInteger(p.cooldownUntil)&&p.cooldownUntil>=0;}),'国家間関係が不正です。');
  check(Array.isArray(w.events)&&w.events.length<=100&&w.events.every(e=>Number.isInteger(e.day)&&e.day>=0&&['war','peace'].includes(e.kind)&&country(e.a)&&country(e.b)&&e.a!==e.b),'戦争履歴が不正です。');
  check(nested||w.events.every(e=>e.day<=s.day),'戦争履歴の時刻が不正です。');
  check(d&&keys(d.friendship)&&keys(d.investment)&&keys(d.tradeToday)&&keys(d.lastChange)&&nations.every(n=>amount(d.friendship[n])&&d.friendship[n]<=100&&amount(d.investment[n])&&amount(d.tradeToday[n])&&d.tradeToday[n]<=5000&&['trade','enemies','investment'].every(k=>Number.isFinite(d.lastChange[n]?.[k]))),'外交設定が不正です。');
  check(typeof s.automation.replaceLost==='boolean','補充設定が不正です。');
  check(Array.isArray(s.incidents)&&s.incidents.length<=100&&s.incidents.every(e=>Number.isInteger(e.day)&&e.day>=0&&e.day<=s.day&&['raided','shipLost','warning','revoked','donation','investmentSkipped'].includes(e.kind)&&(e.nation===undefined||country(e.nation))&&(e.routeId===undefined||/^route-[1-9]\d*$/.test(e.routeId))&&(e.type===undefined||Boolean(shipSpec(s,e.type)))&&['cargoCost','shipValue','cost','ships'].every(k=>e[k]===undefined||amount(e[k]))),'被害・外交履歴が不正です。');
  for(const r of s.routes)check(Number.isInteger(r.escorts)&&r.escorts>=0&&r.escorts<=3&&Array.isArray(r.pendingReplacements)&&r.pendingReplacements.length<=200&&r.pendingReplacements.every(type=>canServe(s,type,r)||r.rangeReview&&shipSpec(s,type)?.mode==='sea')&&r.losses&&['cargo','ships','count'].every(k=>amount(r.losses[k])),'航路の保護設定が不正です。');
}
