import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridgeWithPosts as bridge,postFixture} from './post-fixture.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('unified investment plans: monthly allocation, thresholds, reserve, priorities and persistence',async t=>{
 const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));
 const call=bridge(instance),cmd=command=>call({op:'command',command}),query=request=>call({op:'query',request});
 const save=()=>JSON.parse(call({op:'save'})),load=g=>call({op:'load',text:JSON.stringify(g)});
 cmd({action:'new',seed:1700,events:false});const data=call({op:'catalog'}),original=save();
 const city=id=>data.cities.findIndex(c=>c.id===id),cairo=city('cairo'),suez=city('suez');
 const road=data.roads.findIndex(r=>!r.retired&&[r.a,r.b].includes(cairo)&&[r.a,r.b].includes(suez));
 const fund=(g,cash)=>{g.companies[0].initial_cash+=cash-g.companies[0].cash;g.companies[0].cash=cash;};
 const base=structuredClone(original);fund(base,1e8);base.companies[0].licenses=data.nations.map((_,i)=>i);
 base.companies[0].posts[cairo]=postFixture(data.goods.length);base.companies[0].posts[suez]=postFixture(data.goods.length);base.roads[road].owner='player';load(base);
 const defaults=()=>query({query:'investmentPlan'}).plan;
 const report=p=>query({query:'investmentPlan',plan:p});
 const apply=p=>cmd({action:'investmentPlan',plan:p});
 await t.test('fixed monthly totals are weighted without multiplying the total; filters are inclusive',()=>{
  const p=defaults();p.budgets=[{mode:'fixed',value:310},{mode:'fixed',value:620},{mode:'fixed',value:930}];
  p.min=0;p.max=0;p.weights[`city:${cairo}`]=3;p.weights[`city:${suez}`]=1;
  p.weights[`road:${road}:0`]=3;p.weights[`road:${road}:1`]=1;
  let q=report(p);assert.equal(q.days,31);near(q.daily,60);
  const row=key=>q.rows.find(r=>r.key===key);
  near(row(`city:${cairo}:0`).daily,7.5);near(row(`city:${suez}:0`).daily,2.5);
  near(row(`road:${road}:0`).daily,15);near(row(`road:${road}:1`).daily,5);
  assert.ok(q.rows.filter(r=>r.category===0&&r.item>0).every(r=>r.daily===0));
  const good=q.rows.find(r=>r.category===0&&r.base>0);p.min=good.base;p.max=good.base;
  q=report(p);assert.ok(q.rows.find(r=>r.key===good.key).daily>0);
  assert.ok(q.rows.filter(r=>r.category===0&&r.item>0&&r.base!==good.base).every(r=>r.daily===0));
  apply(p);const checkpoint=save();load(checkpoint);assert.deepEqual(save(),checkpoint);
  const before=save();assert.throws(()=>cmd({action:'cityInvestment',city:cairo,size:100}),/投資/);assert.deepEqual(save(),before);
  for(const change of [p=>p.min=p.max+1,p=>p.budgets[0]={mode:'profit',value:101},p=>p.reserve=-1,p=>p.weights['city:99999']=1,p=>p.weights['tech:0']=-1]){
   const bad=structuredClone(p);change(bad);assert.throws(()=>apply(bad));assert.deepEqual(save(),before);
   const badSave=structuredClone(before);badSave.companies[0].investment_plan=bad;assert.throws(()=>load(badSave));assert.deepEqual(save(),before);
  }
 });
 await t.test('profit uses the previous calendar month and excludes investments; missing and negative profit produce zero',()=>{
  load(base);const p=defaults();p.budgets=p.budgets.map(()=>({mode:'profit',value:10}));assert.deepEqual(report(p).monthly,[0,0,0]);
  const g=structuredClone(base);g.day=31;g.companies[0].accounts={since:0,months:{0:{income:{sale:2000,roadIncome:100,developmentSale:9000},expense:{purchase:400,tax:200,upkeep:100,cityInvestment:9000},assets:1000,as_of:30}},years:null};load(g);
  let q=report(p);assert.equal(q.profit,1400);assert.equal(q.days,28);assert.deepEqual(q.monthly,[140,140,140]);near(q.daily,15);
  p.budgets[0]={mode:'fixed',value:280};near(report(p).daily,20);
  g.companies[0].accounts.months[0].expense.upkeep=2000;load(g);assert.ok(report(p).profit<0);assert.deepEqual(report(p).monthly,[280,0,0]);
  // March uses February, not an older profitable month; leap February has 29 days.
  g.day=59;load(g);assert.deepEqual(report(p).monthly,[280,0,0]);assert.equal(report(p).days,31);
  g.day=Math.round((Date.UTC(1704,1,1)-Date.UTC(1700,0,1))/86400000);load(g);assert.equal(report(p).days,29);
  g.day=30;g.companies[0].accounts.months[0].expense.upkeep=100;load(g);
  p.budgets=p.budgets.map(()=>({mode:'profit',value:10}));apply(p);
  assert.deepEqual(report(p).monthly,[0,0,0]);cmd({action:'tick',days:1});
  assert.deepEqual(query({query:'investmentPlan'}).monthly,[140,140,140]);
  near(save().companies[0].tech_budget.reduce((a,b)=>a+b,0),5);
 });
 await t.test('no targets or zero weights leave budgets unspent; insufficient cash scales categories equally',()=>{
  load(base);const p=defaults();p.budgets=p.budgets.map(()=>({mode:'fixed',value:3100}));p.min=0;p.max=0;p.reserve=1000;
  apply(p);let g=save();fund(g,1030+call({op:'view'}).companies[0].fixed);load(g);cmd({action:'tick',days:1});g=save();
  for(const k of ['technologyInvestment','cityInvestment','roadInvestment'])near(-g.companies[0].totals[k],10);
  assert.ok(g.companies[0].cash>=1000-1e-8);
  load(original);const none=defaults();none.budgets=none.budgets.map(()=>({mode:'fixed',value:310}));for(let i=0;i<8;i++)none.weights[`tech:${i}`]=0;
  apply(none);near(report(none).daily,0);const cash=save().companies[0].cash;cmd({action:'tick',days:1});near(save().companies[0].cash,cash);
 });
 await t.test('fleet purchases precede roads, roads precede cities; automatic rights repeat and honor switches',()=>{
  load(base);cmd({action:'openRoute',kind:'caravan',stops:[cairo,suez],allowed:[0],margin:100});
  let g=save();g.roads[road].owner='state';delete g.companies[0].posts[suez];
  g.companies[0].routes[0].replacements=['caravan'];load(g);
  const p=defaults();p.budgets=p.budgets.map(()=>({mode:'fixed',value:0}));p.roads=true;p.cities=true;p.reserve=1000;p.route_only=true;
  const a={enabled:true,replaceLost:true,expand:10,shrink:30};
  // Measure unavoidable daily operating costs independently of automated purchases.
  cmd({action:'tick',days:1});const expense=g.companies[0].cash-save().companies[0].cash;load(g);
  const roadCost=query({query:'bulkInvestment',mode:'roadPurchase',rivals:false}).cost;
  const price=data.specs.find(s=>s.id==='caravan').price;
  fund(g,1000+expense+price+roadCost+1);load(g);cmd({action:'investmentPlan',plan:p,automation:a});cmd({action:'tick',days:1});
  let after=save(),co=after.companies[0];assert.equal(co.ships.length,2);assert.equal(after.roads[road].owner,'player');assert.equal(after.development[cairo].owner,'state');assert.equal(after.development[suez].owner,'state');assert.ok(co.cash>=1000-1e-7);
  const log=co.ledger.filter(x=>x.day===1);assert.ok(log.findIndex(x=>x.category==='shipPurchase')<log.findIndex(x=>x.category==='roadPurchase'));
  // Existing posts remain; the missing endpoint receives an independent post.
  fund(after,1e7);load(after);cmd({action:'tick',days:1});assert.ok(save().companies[0].posts[suez]);assert.ok(save().companies[0].posts[cairo]);
  p.cities=false;apply(p);const saved=save();load(saved);assert.deepEqual(save(),saved);
 });
});
