import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,buyLicense,openCircuit,tick,serialize,deserialize,trade,assets} from '../src/engine.js';
import {HULLS,DESIGN_BUDGET_KEYS,designQuote,designCosts,researchDesign,buyShipyard,shipSpec,shipDaily} from '../src/industry.js';
import {initialDesign,renderDesignEstimate,renderIndustry} from '../src/industry-view.js';
import {setLanguage} from '../src/i18n.js';
const zero=()=>Object.fromEntries(DESIGN_BUDGET_KEYS.map(k=>[k,0]));
function ready(){const s=createGame(42,{events:false});trade(s,'kingston','food',100000,'sell');s.industry.technology.shipbuilding=100;buyShipyard(s);buyLicense(s,'spain');return s;}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('research charges the base fee plus the five explicit monetary budgets once, independent of construction',()=>{
 const s=ready(),budgets={cargo:120.25,speed:300,guns:50,range:800,upkeep:1000},q=designQuote(s,'sloop',budgets),cash=s.cash,value=assets(s);
 assert.equal(q.budgetTotal,2270.25);assert.equal(q.researchCost,2720.25);assert.equal(q.baseResearchCost,450);
 const id=researchDesign(s,'sloop',budgets);close(s.cash,cash-q.researchCost);close(assets(s),value-q.researchCost);assert.equal(s.world.designs[id].formulaVersion,2);
 openCircuit(s,id,['kingston','havana']);close(s.cash,cash-q.researchCost-q.spec.price);assert.equal(s.totals.designResearch,-q.researchCost);assert.deepEqual(deserialize(serialize(s)),s);
});

test('each budget has diminishing gains and huge research spending leaves construction and upkeep bounded',()=>{
 const s=ready();
 for(const [key,metric]of [['cargo','capacity'],['speed','speed'],['guns','guns'],['range','range'],['upkeep','maintenanceEfficiency']]){
  const values=[0,1800,3600].map(b=>designQuote(s,'sloop',{...zero(),[key]:b}).spec[metric]);assert.ok(values[1]>values[0],key);assert.ok(values[2]-values[1]<values[1]-values[0],key);
 }
 for(const hull of Object.keys(HULLS)){
  const mid=designQuote(s,hull,Object.fromEntries(DESIGN_BUDGET_KEYS.map(k=>[k,1e12]))),high=designQuote(s,hull,Object.fromEntries(DESIGN_BUDGET_KEYS.map(k=>[k,1e100])));
  assert.ok(high.spec.price<HULLS[hull].price*5);assert.ok(high.spec.daily<HULLS[hull].daily*5);assert.ok(high.spec.price<=mid.spec.price+1);assert.ok(Math.abs(high.spec.daily-mid.spec.daily)<1e-6);
  assert.equal(high.researchCost,5e100);assert.deepEqual({price:high.spec.price,daily:high.spec.daily},designCosts(HULLS[hull],high.spec));
 }
});

test('range research unlocks a route and remains usable after an in-transit save',()=>{
 const s=ready();assert.throws(()=>openCircuit(s,'sloop',['kingston','cadiz']));const id=researchDesign(s,'sloop',{...zero(),range:10000});assert.ok(shipSpec(s,id).range>3800);
 const route=openCircuit(s,id,['kingston','cadiz']);tick(s);assert.ok(s.ships[0].voyage);const copy=deserialize(serialize(s));for(let i=0;i<70;i++){tick(s);tick(copy);}assert.deepEqual(copy,s);assert.ok(route.deliveries>0);
});

test('upkeep research reduces recurring cost without worsening other performance and stacks with seafaring technology',()=>{
 const s=ready(),base=designQuote(s,'brig',zero()),improved=designQuote(s,'brig',{...zero(),upkeep:5200});
 for(const k of ['capacity','speed','range','guns'])assert.equal(improved.spec[k],base.spec[k]);assert.ok(improved.spec.daily<base.spec.daily);assert.ok(improved.spec.price<base.spec.price*1.1);
 const id=researchDesign(s,'brig',{...zero(),upkeep:5200});openCircuit(s,id,['kingston','havana']);s.industry.technology.seafaring=50;close(shipDaily(s,id),improved.spec.daily*.875);tick(s);close(s.totals.upkeep,-improved.spec.daily*.875);
});

test('pre-budget v6 designs retain exact historic costs and performance alongside new designs',()=>{
 const s=ready(),spec={name:'スループ 設計 #1',nameEn:'Sloop design #1',mode:'sea',price:2344,capacity:43,speed:125,range:1800,daily:3*(1+.35*.5+.001),guns:6};
 s.world.designs['design-1']={hull:'sloop',settings:{cargo:1,speed:0,guns:0},level:50,spec};s.world.nextDesign=2;s.industry.designIds.push('design-1');openCircuit(s,'design-1',['kingston','havana']);tick(s);
 const raw=serialize(s),copy=deserialize(raw);assert.deepEqual(copy,s);const before=structuredClone(copy.world.designs['design-1']);researchDesign(copy,'sloop',{...zero(),range:2000,upkeep:2000});assert.deepEqual(copy.world.designs['design-1'],before);assert.deepEqual(deserialize(serialize(copy)),copy);
 const bad=JSON.parse(raw);bad.world.designs['design-1'].spec.price++;assert.throws(()=>deserialize(JSON.stringify(bad)));
});

test('insufficient or invalid budgets do not mutate state; saved formula and efficiency are validated',()=>{
 const s=ready(),before=serialize(s);for(const budgets of [{...zero(),range:-1},{...zero(),upkeep:Infinity},{...zero(),cargo:Number.MAX_VALUE,speed:Number.MAX_VALUE},{cargo:1,speed:1,guns:1},{...zero(),range:s.cash+1}]){assert.throws(()=>researchDesign(s,'sloop',budgets));assert.equal(serialize(s),before);}
 const id=researchDesign(s,'sloop',zero());for(const mutate of [d=>d.formulaVersion=3,d=>d.spec.maintenanceEfficiency=.9,d=>d.settings.range=-1,d=>d.spec.range+=100]){const bad=JSON.parse(serialize(s));mutate(bad.world.designs[id]);assert.throws(()=>deserialize(JSON.stringify(bad)));}
});

test('Japanese and English forms expose five budgets, research breakdown, remaining funds and insufficient-funds state',()=>{
 const s=ready(),fmt={cash:String,decimal:String},draft={...initialDesign(),upkeep:s.cash+100};
 for(const lang of ['ja','en']){setLanguage(lang);const html=renderIndustry(s,fmt,draft);for(const key of DESIGN_BUDGET_KEYS)assert.match(html,new RegExp(`name="${key}"`));assert.match(html,/button disabled/);assert.match(renderDesignEstimate(s,draft,fmt),lang==='ja'?/研究資金が不足/:/Insufficient research funds/);assert.match(html,lang==='ja'?/研究後の保有資金/:/Cash after research/);}
 setLanguage('ja');
});
