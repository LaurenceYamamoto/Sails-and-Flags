import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {CITIES, GOODS} from '../src/data.js';
import {GLOBAL_DEMAND_TO_SUPPLY, MARKET_SIZE_GROUPS, applyMarketSizes} from '../src/city-market-size.js';
import {marketQuantity} from '../src/market-format.js';
import {bridge} from '../src/wasm-bridge.js';
const world=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const binary=fs.readFileSync('assets/wasm/engine.wasm');
const index=id=>world.cities.findIndex(c=>c.id===id);
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
async function engine(){const {instance}=await WebAssembly.instantiate(binary),call=bridge(instance);return {call,cmd:command=>call({op:'command',command}),view:city=>call({op:'view',city}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};}

test('every city has positive consumption, distinct market size, and unchanged production and stocks',()=>{
 const seen=new Set();for(const list of Object.values(MARKET_SIZE_GROUPS))for(const id of list.split(/\s+/)){assert.ok(CITIES[id],id);assert.ok(!seen.has(id),id);seen.add(id);}
 assert.deepEqual(world.cities.map(c=>c.id),Object.keys(CITIES));
 for(const c of world.cities){assert.ok(c.marketSize>=.25&&c.marketSize<=6,c.id);assert.ok(c.demand.every(n=>Number.isFinite(n)&&n>0),c.id);assert.deepEqual(c.supply,CITIES[c.id].supply,c.id);assert.deepEqual(c.stocks,CITIES[c.id].stocks,c.id);}
 for(const large of ['london','paris','beijing','edo','istanbul']){
  const a=world.cities[index(large)],b=world.cities[index('bandaneira')];
  const sum=c=>c.demand.reduce((n,d,g)=>n+d*c.modifiers[g]*c.marketSize,0);
  assert.ok(sum(a)>sum(b)*10,large);
 }
 for(const [id,good] of [['bandaneira','spices'],['mocha','coffee'],['ambon','spices']]){const c=world.cities[index(id)];assert.ok(c.marketSize<=.5);assert.ok(c.supply[GOODS.findIndex(g=>g.id===good)]>=3.2,id);}
});

test('each commodity balances independently and catalog regeneration is deterministic without mutating source arrays',()=>{
 const input=()=>world.cities.map(c=>({...c,demand:CITIES[c.id].demand}));
 const a=input(),b=input(),original=JSON.stringify(CITIES);const report=applyMarketSizes(a,GOODS);applyMarketSizes(b,GOODS);assert.deepEqual(a,b);assert.equal(JSON.stringify(CITIES),original);
 for(let g=0;g<GOODS.length;g++){
  const supply=world.cities.reduce((n,c)=>n+c.supply[g],0);
  const demand=world.cities.reduce((n,c)=>n+c.demand[g]*c.marketSize*c.modifiers[g],0);
  near(demand/supply,GLOBAL_DEMAND_TO_SUPPLY);near(report[g].target,demand);
  for(let i=0;i<a.length;i++)near(a[i].demand[g],world.cities[i].demand[g]);
 }
});

test('Wasm consumption uses base market size and uncapped development, independent of production',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});const base=e.save();
 for(const id of ['london','bandaneira']){
  const ci=index(id);let previous=null,firstGain=null;
  for(const level of [0,5,10,1000000]){
   const g=structuredClone(base);g.development[ci].size=level;e.load(g);const rows=e.view(ci).market;
   for(const m of rows){const d=m.details;near(d.marketSize,world.cities[ci].marketSize);near(m.demand,d.base*d.marketSize*d.location*d.season*d.city*d.war*d.price);assert.ok(m.demand>0);near(m.production,world.cities[ci].supply[m.good]);}
   const effect=rows[0].details.city;if(previous!==null){assert.ok(effect>previous);if(level===5)firstGain=effect-previous;if(level===10)assert.ok(effect-previous<firstGain);}previous=effect;
  }
  assert.ok(previous>5);
 }
});

test('actual pre-change save restores without changing investments, stocks, cargo, schedules or accounting',async()=>{
 const e=await engine(),old=JSON.parse(gunzipSync(fs.readFileSync('tests/fixtures/pre-market-size-3.3.14.json.gz')));assert.equal(old.day,3);
 e.load(old);const migrated=e.save();
 for(const key of ['markets','development','roads','rng','day','ledger'])assert.deepEqual(migrated[key],old[key]);
 for(const [i,co] of old.companies.entries()){
  const {routes,ships,...financial}=co,{routes:nextRoutes,ships:nextShips,...nextFinancial}=migrated.companies[i];assert.deepEqual(nextFinancial,financial);
  assert.ok(nextRoutes.every(r=>r.stops.length===2));
  assert.deepEqual(nextShips.map(({route,next,...s})=>s),ships.map(({route,next,...s})=>s));
 }
 e.load(migrated);assert.deepEqual(e.save(),migrated);
 e.cmd({action:'tick',days:1});const after=e.save();assert.equal(after.day,4);e.load(old);e.cmd({action:'tick',days:1});assert.deepEqual(e.save(),after);
});

test('one year of local simulation keeps markets finite and ships trading across fixed seeds',async()=>{
 const e=await engine();
 for(const seed of [1700,42,2026]){
  e.cmd({action:'new',seed,events:false});
  for(let day=0;day<365;day+=31)e.cmd({action:'tick',days:Math.min(31,365-day)});
  const g=e.save();assert.equal(g.day,365);assert.ok(g.markets.every(m=>Number.isFinite(m.stock)&&m.stock>=0));
  assert.ok(g.companies.slice(1).some(c=>c.routes.some(r=>r.deliveries>0)),'rivals still trade');
  assert.ok(g.companies.every(c=>c.routes.length<=50));e.load(g);assert.deepEqual(e.save(),g);
 }
});

test('small positive market quantities never display as zero in any supported locale',()=>{
 for(const locale of ['en','ja','zh-CN','zh-TW','ko','fr','es'])for(const n of [.000001,.00049,.004,.03,.25])assert.notEqual(marketQuantity(n,locale),marketQuantity(0,locale));
 assert.equal(marketQuantity(0,'en'),'0');assert.equal(marketQuantity(.25,'en'),'0.25');assert.equal(marketQuantity(12.345,'en'),'12.3');
});
