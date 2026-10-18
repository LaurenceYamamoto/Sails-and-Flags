import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridgeWithPosts as bridge,postFixture} from './post-fixture.js';
const module=WebAssembly.compile(fs.readFileSync('assets/wasm/engine.wasm'));
const world=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
async function engine(){
 const call=bridge(await WebAssembly.instantiate(await module));
 const e={call,cmd:command=>call({op:'command',command}),query:request=>call({op:'query',request}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),data:call({op:'catalog'})};
 e.cmd({action:'new',seed:1700,events:false});
 const g=e.save();g.companies[0].cash=1e9;g.companies[0].initial_cash=1e9;g.companies[0].licenses=e.data.nations.map((_,i)=>i);e.load(g);
 e.city=id=>e.data.cities.findIndex(c=>c.id===id);
 e.road=(a,b)=>e.data.roads.findIndex(r=>!r.retired&&[r.a,r.b].includes(e.city(a))&&[r.a,r.b].includes(e.city(b)));
 e.open=(a,b,kind='caravan')=>e.cmd({action:'openRoute',kind,stops:[e.city(a),e.city(b)],allowed:[0],margin:10});
 e.quote=options=>e.query({query:'bulkInvestment',...options});
 e.apply=options=>e.cmd({action:'bulkInvestment',...options,quote:e.quote(options)});
 return e;
}
test('city bulk construction is independent, filters licenses and route stops, and is atomic',async()=>{
 const e=await engine();e.open('kingston','havana','sloop');const a=e.city('kingston'),b=e.city('havana'),g=e.save();
 const own=Object.keys(g.companies[0].posts).map(Number);const missing=[a,b].find(i=>!own.includes(i));
 const options={mode:'cityPurchase',rivals:false,routeOnly:true},q=e.quote(options);assert.deepEqual(q.rows.map(r=>r.city),[missing]);
 assert.ok(e.quote({...options,routeOnly:false}).count>q.count);
 const poor=structuredClone(g);poor.companies[0].initial_cash+=q.cost-1-poor.companies[0].cash;poor.companies[0].cash=q.cost-1;e.load(poor);const before=e.save();assert.throws(()=>e.apply(options));assert.deepEqual(e.save(),before);
 e.load(g);e.apply(options);const after=e.save();assert.equal(after.companies[0].cash,g.companies[0].cash-q.cost);assert.deepEqual(after.companies.slice(1),g.companies.slice(1));for(const i of [a,b])assert.ok(after.companies[0].posts[i]);assert.equal(e.quote(options).count,0);
});

test('automatic road purchases persist, repeat for new routes, obey reserve and rivals switch, and exclude sea-only roads',async()=>{
 const e=await engine();e.open('cairo','suez');const i=e.road('cairo','suez');
 let g=e.save();g.roads[i].owner=g.companies[1].id;g.roads[i].pool=40;e.load(g);
 assert.equal(e.quote({mode:'roadPurchase',rivals:false}).count,0);
 assert.deepEqual(e.quote({mode:'roadPurchase',rivals:true}).rows.map(r=>r.road),[i]);
 e.cmd({action:'roadAuto',enabled:true,rivals:true,reserve:1e9});e.cmd({action:'tick',days:1});assert.notEqual(e.save().roads[i].owner,'player');
 e.cmd({action:'roadAuto',enabled:true,rivals:true,reserve:1000});const saved=e.save();e.load(saved);assert.deepEqual(e.save(),saved);
 e.cmd({action:'tick',days:1});assert.equal(e.save().roads[i].owner,'player');assert.equal(e.save().roads[i].pool,0);
 assert.equal(e.save().companies[0].ledger.filter(x=>x.category==='roadPurchase').length,1);
 e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].ledger.filter(x=>x.category==='roadPurchase').length,1);
 e.open('kingston','havana','sloop');assert.equal(e.quote({mode:'roadPurchase',rivals:true}).count,0);
 e.open('shanghai','suzhou');const j=e.road('shanghai','suzhou');g=e.save();g.roads[j].owner='state';e.load(g);
 assert.equal(e.quote({mode:'roadPurchase',rivals:true}).count,1);
 e.cmd({action:'roadAuto',enabled:false,rivals:true,reserve:1000});e.cmd({action:'tick',days:1});assert.equal(e.save().roads[j].owner,'state');
 e.cmd({action:'roadAuto',enabled:true,rivals:false,reserve:1000});e.cmd({action:'tick',days:1});assert.equal(e.save().roads[j].owner,'player');
});
test('road budgets affect all owned live roads once and preserve rival budgets and route state',async()=>{
 const e=await engine(),g=e.save();const indices=e.data.roads.flatMap((r,i)=>!r.retired?[i]:[]).slice(0,3);
 for(const i of indices.slice(0,2)){g.roads[i].owner='player';g.roads[i].road_budget=3;g.roads[i].security_budget=4;}
 g.roads[indices[2]].owner=g.companies[1].id;g.roads[indices[2]].road_budget=17;e.load(g);
 const options={mode:'roadBudget',roadBudget:21,securityBudget:6},q=e.quote(options);assert.equal(q.count,2);assert.equal(q.before,14);assert.equal(q.after,54);
 e.apply(options);const after=e.save();assert.equal(after.companies[0].cash,g.companies[0].cash);
 for(const i of indices.slice(0,2)){assert.equal(after.roads[i].road_budget,21);assert.equal(after.roads[i].security_budget,6);}
 assert.deepEqual(after.roads[indices[2]],g.roads[indices[2]]);assert.deepEqual(after.companies[0].routes,g.companies[0].routes);
});
test('production budget thresholds use base supply inclusively and preserve excluded goods and unrelated size budgets',async()=>{
 const e=await engine(),g=e.save(),cities=[e.city('bandaneira'),e.city('london')];
 for(const i of cities){g.companies[0].posts[i]=postFixture(e.data.goods.length);g.companies[0].posts[i].size_budget=7;g.companies[0].posts[i].production_budget.fill(2);g.development[i].production.fill(100);}
 e.load(g);const base=world.cities[cities[0]].supply.find(n=>n>1);
 const options={mode:'cityBudget',production:12,min:base,max:base};const q=e.quote(options);assert.ok(q.cells>0);e.apply(options);let after=e.save();
 for(const i of cities){assert.equal(after.companies[0].posts[i].size_budget,7);for(let k=0;k<e.data.goods.length;k++)assert.equal(after.companies[0].posts[i].production_budget[k],world.cities[i].supply[k]===base?12:2);}
 const before=after;e.apply({mode:'cityBudget',size:30});after=e.save();
 for(const i of cities){assert.equal(after.companies[0].posts[i].size_budget,30);assert.deepEqual(after.companies[0].posts[i].production_budget,before.companies[0].posts[i].production_budget);}
 for(let i=0;i<g.development.length;i++)if(!cities.includes(i))assert.deepEqual(after.development[i],g.development[i]);
 const zero=e.quote({mode:'cityBudget',production:10,min:0,max:0});assert.equal(zero.cells,0);
 e.apply({mode:'cityBudget',size:0,production:0,min:0,max:100});after=e.save();for(const i of cities){assert.equal(after.companies[0].posts[i].size_budget,0);assert.ok(after.companies[0].posts[i].production_budget.every(n=>n===0));}
});
test('bulk commands reject stale quotes and invalid values without partial changes; legacy settings default off',async()=>{
 const e=await engine(),g=e.save(),i=e.city('london');g.companies[0].posts[i]=postFixture(e.data.goods.length);delete g.companies[0].road_auto;e.load(g);
 assert.deepEqual(e.call({op:'view'}).roadAuto,{enabled:false,rivals:false,reserve:0});assert.deepEqual(e.save(),g);
 const options={mode:'cityBudget',size:10},q=e.quote(options);e.cmd({action:'cityInvestment',city:i,size:1});let before=e.save();
 assert.throws(()=>e.cmd({action:'bulkInvestment',...options,quote:q}),/見積/);assert.deepEqual(e.save(),before);
 for(const invalid of [{mode:'cityBudget',production:5,min:10,max:1},{mode:'cityBudget',size:-1},{mode:'roadBudget',roadBudget:2,securityBudget:-1},{mode:'cityBudget'}, {mode:'cityPurchase',routeOnly:'yes'}]){
  assert.throws(()=>e.apply(invalid));assert.deepEqual(e.save(),before);
 }
 assert.throws(()=>e.cmd({action:'roadAuto',enabled:true,rivals:false,reserve:-1}));assert.deepEqual(e.save(),before);
 const bad=e.save();bad.companies[0].road_auto={enabled:true,rivals:false,reserve:-10};assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),before);
});
