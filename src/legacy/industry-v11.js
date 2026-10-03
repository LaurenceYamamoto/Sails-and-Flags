import {COMPANY_IDS} from './region-data-v11.js';
import {RETIRED_CITIES} from './retired-network-v11.js';
import {WAGONS} from './land-data-v11.js';
import {roadDays,roadDaily,roadAssets,advanceRoads,transferRoads} from './land-v11.js';
import {validName} from './identity-v11.js';
import {CITIES,GOODS,SHIPS,distance} from './data-v11.js';
import {entry} from './engine-v11.js';
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const amount=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export const HULLS={...SHIPS,corvette:{name:'コルベット',nameEn:'Corvette',mode:'sea',price:11000,capacity:50,speed:170,range:5500,daily:11,guns:20}};
export const HULL_LEVELS={galleon:25,sloop:5,brig:10,fluyt:15,corvette:30};
export const YARD_COST=4000;
export function initializeIndustry(s,id){s.industry={id,technology:{shipbuilding:0,seafaring:0,land:0},investment:{shipbuilding:0,seafaring:0,land:0},shipyard:false,yardValue:0,designIds:[],log:[]};}
export function initializeDevelopment(w){w.designs={};w.nextDesign=1;w.development=Object.fromEntries(Object.keys(CITIES).map(id=>[id,{owner:['havana','nantes'].includes(id)?'private':'state',basis:0,size:0,production:0,invested:0,dailySize:0,dailyProduction:0,taxPool:0}]));}
export function shipSpec(s,type){return SHIPS[type]??WAGONS[type]??s?.world?.designs?.[type]?.spec;}
export function shipCatalog(s){return {...SHIPS,...WAGONS,...Object.fromEntries((s?.industry?.designIds??[]).map(id=>[id,shipSpec(s,id)]))};}
export function sailingDays(s,type,a,b){return shipSpec(s,type).mode==='land'?roadDays(s,type,a,b):Math.ceil(distance(a,b)/shipSpec(s,type).speed);}
export function shipDaily(s,type){if(shipSpec(s,type).mode==='land'){const level=s.industry.technology.land;return shipSpec(s,type).daily*(1-.35*level/(50+level));}return shipSpec(s,type).daily*(1-.25*(s.industry?.technology.seafaring??0)/(50+(s.industry?.technology.seafaring??0)));}
export function canProduce(s,type){return Object.hasOwn(SHIPS,type)||Object.hasOwn(WAGONS,type)||Boolean(s.industry?.shipyard&&s.industry.designIds.includes(type));}
function log(s,kind,city=null,cost=0){s.industry.log.push({day:s.day,kind,city,cost});s.industry.log=s.industry.log.slice(-60);}
function playable(s){check(!s.gameOver,'破産後は操作できません。新しいゲームを開始してください。');}
export function setTechnologyInvestment(s,kind,value){playable(s);check(Object.hasOwn(s.industry.investment,kind)&&amount(value),'技術投資の項目・金額を確認してください。');s.industry.investment[kind]=value;}
export function buyShipyard(s){playable(s);check(!s.industry.shipyard&&s.industry.technology.shipbuilding>=5&&s.cash>=YARD_COST,'造船技術5と設備資金4,000が必要です。');entry(s,'shipyardPurchase',-YARD_COST);s.industry.shipyard=true;s.industry.yardValue=YARD_COST;log(s,'shipyard',null,YARD_COST);}
// Frozen formula for designs researched before monetary budgets.
function legacyDesignQuote(s,hull,settings){
  const base=HULLS[hull],level=s.industry.technology.shipbuilding;
  check(base&&settings&&['cargo','speed','guns'].every(k=>amount(settings[k])),'設計の船型・数値を確認してください。');
  const total=settings.cargo+settings.speed+settings.guns;check(Number.isFinite(total),'設計の船型・数値を確認してください。');
  const soft=x=>x/(1+x),c=soft(settings.cargo),v=soft(settings.speed),g=soft(settings.guns),eff=.5+level/(level+50);
  const price=Math.ceil(base.price*(1+.6*(c+v+g)+.002*total));
  check(Number.isFinite(price)&&Number.isFinite(price*.25),'設計の船型・数値を確認してください。');
  const spec={name:`${base.name} 設計`,nameEn:`${base.nameEn??{sloop:'Sloop',brig:'Brig',fluyt:'Fluyt'}[hull]} design`,mode:'sea',price,capacity:Math.max(1,Math.floor(base.capacity*(1+.9*eff*c)/(1+.6*v+.45*g))),speed:base.speed*(1+.5*eff*v)/(1+.4*c+.2*g),range:base.range,daily:base.daily*(1+.35*(c+v+g)+.001*total),guns:base.guns+30*eff*g};
  return {hull,settings:{...settings},level,spec,researchCost:Math.ceil(price*.25),eligible:s.industry.shipyard&&level>=HULL_LEVELS[hull]};
}
export const DESIGN_BUDGET_KEYS=['cargo','speed','guns','range','upkeep'];
// Recurring costs depend only on resulting physical performance and servicing efficiency.
export function designCosts(base,spec){
  const c=spec.capacity/base.capacity,v=(spec.speed/base.speed)**2,r=spec.range/base.range,g=(spec.guns+10)/(base.guns+10);
  return {price:Math.ceil(base.price*(.45*c+.25*v+.15*r+.15*g)*(1+.25*spec.maintenanceEfficiency)),daily:base.daily*(.45*c+.25*v+.10*r+.20*g)*(1-spec.maintenanceEfficiency)};
}
export function designQuote(s,hull,settings){
  const base=Object.hasOwn(HULLS,hull)?HULLS[hull]:null,level=s.industry.technology.shipbuilding;
  check(base&&settings&&DESIGN_BUDGET_KEYS.every(k=>amount(settings[k])),'設計の船型・数値を確認してください。');
  const budgets=Object.fromEntries(DESIGN_BUDGET_KEYS.map(k=>[k,settings[k]])),total=Object.values(budgets).reduce((sum,n)=>sum+n,0),baseResearchCost=Math.ceil(base.price*.25),researchCost=baseResearchCost+total;
  check(Number.isFinite(researchCost),'設計の船型・数値を確認してください。');
  const soft=x=>x===0?0:1/(1+base.price/x),c=soft(budgets.cargo),v=soft(budgets.speed),g=soft(budgets.guns),r=soft(budgets.range),m=soft(budgets.upkeep),eff=.5+level/(level+50);
  const spec={name:base.name+' 設計',nameEn:(base.nameEn??{sloop:'Sloop',brig:'Brig',fluyt:'Fluyt'}[hull])+' design',mode:'sea',capacity:Math.max(1,Math.floor(base.capacity*(1+.9*eff*c)/(1+.6*v+.45*g)+1e-9)),speed:base.speed*(1+.5*eff*v)/(1+.4*c+.2*g),range:base.range*(1+1.2*eff*r),guns:base.guns+30*eff*g,maintenanceEfficiency:.35*(eff/1.5)*m};
  Object.assign(spec,designCosts(base,spec));
  return {formulaVersion:2,hull,settings:budgets,level,spec,baseResearchCost,budgetTotal:total,researchCost,eligible:s.industry.shipyard&&level>=HULL_LEVELS[hull]};
}
export function researchDesign(s,hull,settings){
  playable(s);const q=designQuote(s,hull,settings);check(q.eligible,'造船設備と船型に必要な造船技術が必要です。');
  check(Object.keys(s.world.designs).length<100,'設計の保存上限（100件）に達しました。');check(s.cash>=q.researchCost,'設計研究の資金が不足しています。');
  const id=`design-${s.world.nextDesign++}`;entry(s,'designResearch',-q.researchCost);q.spec.name+=` #${id.split('-')[1]}`;q.spec.nameEn+=` #${id.split('-')[1]}`;
  s.world.designs[id]={formulaVersion:q.formulaVersion,hull,settings:q.settings,level:q.level,spec:q.spec};s.industry.designIds.push(id);log(s,'research',null,q.researchCost);return id;
}
export function developmentQuote(s,city){const d=s.world.development[city];check(d,'都市を確認してください。');const base=CITIES[city].lon<-20?2000:6000;return {cost:Math.ceil(base*(1+.15*(d.size+d.production))*(d.owner==='state'?1:1.5)),owner:d.owner,eligible:s.licenses.includes(CITIES[city].nation)&&d.owner!==s.industry.id};}
export function buyDevelopmentRight(root,city,buyer=root){
  playable(buyer);const q=developmentQuote(buyer,city),d=buyer.world.development[city];check(q.eligible,'交易免許と未取得の都市開発権が必要です。');check(buyer.cash>=q.cost,'都市開発権の資金が不足しています。');
  const seller=[root,...root.competitors].find(c=>c.industry.id===d.owner);check(['state','private'].includes(d.owner)||seller,'開発権の所有者を確認してください。');
  entry(buyer,'developmentPurchase',-q.cost,null,{city});if(seller){entry(seller,'developmentSale',q.cost,null,{city});seller.gameOver=seller.cash<0;log(seller,'sold',city,q.cost);}
  Object.assign(d,{owner:buyer.industry.id,basis:q.cost,dailySize:0,dailyProduction:0});log(buyer,'right',city,q.cost);
}
export function setCityInvestment(s,city,size,production){playable(s);const d=s.world.development[city];check(d?.owner===s.industry.id&&amount(size)&&amount(production)&&Number.isFinite(size+production),'都市の権利・投資額を確認してください。');d.dailySize=size;d.dailyProduction=production;}
export function industryDaily(s){return roadDaily(s)+Object.values(s.industry.investment).reduce((a,b)=>a+b,0)+Object.values(s.world.development).filter(d=>d.owner===s.industry.id).reduce((n,d)=>n+d.dailySize+d.dailyProduction,0);}
export function rightsAssets(s){if(!s.industry||!s.world?.development)return 0;return roadAssets(s)+Object.values(s.world.development).filter(d=>d.owner===s.industry.id).reduce((n,d)=>n+d.basis,0)+s.industry.yardValue;}
export function marketFactors(s,city,good){
  const d=s.world.development[city],c=CITIES[city],scale=c.lon<-20?1:.35,i=GOODS.findIndex(g=>g.id===good),specialty=c.supply[i]/Math.max(...c.supply);
  return {demand:1+scale*1.5*(d.size/(5+d.size)),production:1+scale*2*(d.production/(5+d.production))*specialty};
}
export function recordCityTax(s,city,tax){const d=s.world.development[city];if(!['state','private'].includes(d.owner))d.taxPool+=tax*.15;}
export function confiscateDevelopment(s,nation){for(const [city,d]of Object.entries(s.world.development))if(d.owner===s.industry.id&&CITIES[city].nation===nation){log(s,'confiscated',city,d.basis+d.invested);Object.assign(d,{owner:'state',basis:0,size:0,production:0,invested:0,dailySize:0,dailyProduction:0,taxPool:0});}}
export function advanceIndustry(s){
  advanceRoads(s);
  for(const [city,d]of Object.entries(s.world.development))if(d.owner===s.industry.id){const income=.15+.35*d.size/(5+d.size)+d.taxPool;d.taxPool=0;entry(s,'developmentIncome',income,null,{city});}
  for(const [kind,value]of Object.entries(s.industry.investment))if(value>0){if(s.cash>=value){entry(s,'technologyInvestment',-value);s.industry.technology[kind]+=Math.sqrt(value)/100/(1+s.industry.technology[kind]/50);}else if(s.day%30===1)log(s,'skipped');}
  for(const [city,d]of Object.entries(s.world.development))if(d.owner===s.industry.id)for(const [kind,key]of [['size','dailySize'],['production','dailyProduction']]){const value=d[key];if(value>0){if(s.cash>=value){entry(s,'cityInvestment',-value,null,{city});d.invested+=value;d[kind]+=Math.sqrt(value)/200/(1+d[kind]/5);}else if(s.day%30===1)log(s,'skipped',city);}}
}
export function transferIndustry(buyer,seller){transferRoads(buyer,seller);for(const d of Object.values(buyer.world.development))if(d.owner===seller.industry.id){d.owner=buyer.industry.id;d.dailySize=0;d.dailyProduction=0;}buyer.industry.designIds=[...new Set([...buyer.industry.designIds,...seller.industry.designIds])];buyer.industry.shipyard||=seller.industry.shipyard;buyer.industry.yardValue+=seller.industry.yardValue;}
export function validateIndustry(s,nested=false){
  const i=s.industry,w=s.world,hasKeys=(o,keys)=>o&&Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
  check(i&&['player',...COMPANY_IDS].includes(i.id)&&hasKeys(i.technology,['shipbuilding','seafaring','land'])&&hasKeys(i.investment,['shipbuilding','seafaring','land'])&&[...Object.values(i.technology),...Object.values(i.investment)].every(amount)&&typeof i.shipyard==='boolean'&&amount(i.yardValue)&&(i.shipyard?i.yardValue>=YARD_COST:i.yardValue===0),'技術・設備が不正です。');
  check(w.designs&&typeof w.designs==='object'&&!Array.isArray(w.designs)&&Object.keys(w.designs).length<=100&&Number.isSafeInteger(w.nextDesign)&&w.nextDesign>0,'設計データが不正です。');
  for(const [id,d]of Object.entries(w.designs)){check(/^design-[1-9]\d*$/.test(id)&&Number(id.slice(7))<w.nextDesign&&amount(d.level),'設計データが不正です。');check(d.spec?.customName===undefined||validName(d.spec.customName),'設計名が不正です。');check(d.formulaVersion===undefined||d.formulaVersion===1||d.formulaVersion===2,'設計データが不正です。');const temp={industry:{technology:{shipbuilding:d.level},shipyard:true}},q=(d.formulaVersion===2?designQuote:legacyDesignQuote)(temp,d.hull,d.settings);check(d.formulaVersion!==2||d.spec?.maintenanceEfficiency===q.spec.maintenanceEfficiency,'設計性能が不正です。');check(d.level>=HULL_LEVELS[d.hull]&&d.spec&&['price','capacity','speed','range','daily','guns'].every(k=>d.spec[k]===q.spec[k])&&d.spec.mode==='sea'&&d.spec.name===q.spec.name+` #${id.slice(7)}`&&d.spec.nameEn===q.spec.nameEn+` #${id.slice(7)}`,'設計性能が不正です。');}
  check(Array.isArray(i.designIds)&&new Set(i.designIds).size===i.designIds.length&&i.designIds.every(id=>Object.hasOwn(w.designs,id)),'設計の所有が不正です。');
  check(hasKeys(w.development,Object.keys(CITIES)),'都市開発が不正です。');
  for(const [city,d]of Object.entries(w.development)){check(['state','private','player',...COMPANY_IDS].includes(d.owner)&&['basis','size','production','invested','dailySize','dailyProduction','taxPool'].every(k=>amount(d[k])),'都市開発が不正です。');if(d.owner===i.id)check(s.licenses.includes(CITIES[city].nation),'都市開発の免許が不正です。');}
  check(Array.isArray(i.log)&&i.log.length<=60&&i.log.every(e=>Number.isInteger(e.day)&&e.day>=0&&e.day<=s.day&&['shipyard','research','sold','right','confiscated','skipped'].includes(e.kind)&&(e.city===null||(Object.hasOwn(CITIES,e.city)||Object.hasOwn(RETIRED_CITIES,e.city)))&&amount(e.cost)),'投資履歴が不正です。');
  if(!nested){const companies=[s,...s.competitors],ids=companies.map(c=>c.industry.id);check(s.industry.id==='player'&&new Set(ids).size===ids.length&&Object.values(w.development).every(d=>['state','private',...ids].includes(d.owner)),'開発権の所有者が不正です。');}
}
