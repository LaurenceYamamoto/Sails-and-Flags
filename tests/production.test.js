import test from 'node:test';
import assert from 'node:assert/strict';
import {CITIES,GOODS,distance} from '../src/data.js';
import * as game from '../src/engine.js';
import * as old from '../src/legacy/engine-v14.js';
import {buyDevelopmentRight as oldRight,setCityInvestment as oldInvestment} from '../src/legacy/industry-v14.js';
import {buyDevelopmentRight,setCityInvestment,advanceIndustry,marketFactors,shipSpec} from '../src/industry.js';
import {productionSuitability,totalProductionBudget} from '../src/production-investment.js';
import {suggestedTransport,requiredRange} from '../src/route-selection.js';
import {marketFlow} from '../src/market-demand.js';
import {productionExpected} from './production-migration-expected.js';
import {SAVE_KEYS,saveGame,listSaves} from '../src/storage.js';
const supply=(city,good)=>CITIES[city].supply[GOODS.findIndex(g=>g.id===good)];
const rich=()=>{const s=game.createGame(42,{events:false});game.entry(s,'sale',1e7);return s;};

test('production reflects local origins, not the country owning an overseas port',()=>{
 for(const c of Object.values(CITIES)){assert.equal(c.supply.length,GOODS.length);assert.ok(c.supply.every(n=>Number.isFinite(n)&&n>=0));if(c.lon>-15&&c.lon<40&&c.lat>35)assert.equal(c.supply[GOODS.findIndex(g=>g.id==='spices')],0);}
 assert.ok(supply('batavia','spices')>=3.2);assert.equal(supply('amsterdam','spices'),0);
 assert.equal(supply('london','tea'),0);assert.equal(supply('muscat','spices'),0);assert.ok(supply('mocha','coffee')>=4);
 assert.equal(supply('cadiz','sugar'),.03);assert.ok(supply('havana','sugar')>3);
});

test('only the selected commodity grows, zero is blocked atomically, and low suitability limits huge budgets',()=>{
 const s=rich();game.buyLicense(s,'spain');buyDevelopmentRight(s,'kingston');buyDevelopmentRight(s,'cadiz');
 const d=s.world.development.kingston;setCityInvestment(s,'kingston',0,{rum:100});const before=s.cash,cloth=marketFlow(s,'kingston','cloth').production;
 advanceIndustry(s);assert.equal(s.cash,before-100+.3);assert.ok(d.production.rum>0);assert.equal(d.production.cloth,0);assert.equal(marketFlow(s,'kingston','cloth').production,cloth);assert.ok(s.ledger.some(e=>e.category==='cityInvestment'&&e.good==='rum'&&e.amount===-100));
 for(const budgets of [{spices:1},{rum:-1},{rum:NaN},{bogus:1},100,{rum:1e308,food:1e308}]){const raw=game.serialize(s);assert.throws(()=>setCityInvestment(s,'kingston',5,budgets));assert.equal(game.serialize(s),raw);}
 setCityInvestment(s,'cadiz',0,{sugar:100});advanceIndustry(s);assert.ok(d.production.rum>s.world.development.cadiz.production.sugar*50);
 s.world.development.cadiz.production.sugar=1e9;assert.ok(marketFlow(s,'cadiz','sugar').production<.04);
 d.production.spices=1e9;assert.equal(marketFlow(s,'kingston','spices').production,0);
 d.production.rum=1e9;assert.ok(marketFactors(s,'kingston','rum').production<=1+4*productionSuitability('kingston','rum'));
 setCityInvestment(s,'kingston',0,{});assert.equal(totalProductionBudget(d),0);
 assert.deepEqual(game.deserialize(game.serialize(s)),s);
});

test('production investment widens a specialty price advantage without increasing other output',()=>{
 const a=rich(),b=rich();for(const s of [a,b])buyDevelopmentRight(s,'kingston');setCityInvestment(a,'kingston',0,{rum:100});
 for(let day=0;day<365;day++){game.tick(a,{runCompetitors:false});game.tick(b,{runCompetitors:false});}
 assert.ok(a.markets.kingston.rum.stock>b.markets.kingston.rum.stock);assert.ok(game.price('rum',a.markets.kingston.rum.stock)<game.price('rum',b.markets.kingston.rum.stock));assert.equal(a.markets.kingston.cloth.stock,b.markets.kingston.cloth.stock);
});

test('v14 migration preserves all non-production data, allocates budgets, and keeps the original save',()=>{
 const before=old.createGame(42,{events:false});old.entry(before,'sale',100000);old.buyLicense(before,'spain');oldRight(before,'kingston');oldInvestment(before,'kingston',7,13);old.openCircuit(before,'sloop',['kingston','havana']);old.tick(before);
 const raw=old.serialize(before),s=game.deserialize(raw),expected=productionExpected(JSON.parse(raw));for(const c of [expected,...expected.competitors])c.version=15;
 assert.deepEqual(JSON.parse(game.serialize(s)),expected);assert.ok(Math.abs(totalProductionBudget(s.world.development.kingston)-13)<1e-10);assert.equal(s.world.development.kingston.dailyProduction.spices,0);
 const storage=new Map([[SAVE_KEYS.v14,raw]]),adapter={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};saveGame(adapter,s);assert.equal(storage.get(SAVE_KEYS.v14),raw);assert.equal(storage.get(SAVE_KEYS.preserved),undefined);assert.ok(listSaves(adapter).every(x=>x.valid));
 const copy=game.deserialize(game.serialize(s));game.tick(s);game.tick(copy);assert.deepEqual(s,copy);
 for(const corrupt of [s=>delete s.world.development.kingston.production.rum,s=>s.world.development.kingston.dailyProduction.spices=1,s=>s.world.development.kingston.production.extra=1,s=>s.world.development.kingston.dailyProduction.rum=-1]){const data=JSON.parse(game.serialize(s));corrupt(data);assert.throws(()=>game.deserialize(JSON.stringify(data)));}
});

test('map selections suggest a Pacific-capable ship and change back from land transport',()=>{
 const s=rich();for(const nation of ['spain','japan','qing','ottoman'])game.buyLicense(s,nation);
 assert.ok(game.quoteCircuitOpening(s,'sloop',['manila','acapulco']).error);
 for(const ports of [['manila','acapulco'],['nagasaki','acapulco'],['osaka','panama']]){
  const raw=game.serialize(s),type=suggestedTransport(s,ports,'sloop');assert.equal(type,'galleon');assert.equal(game.serialize(s),raw);assert.ok(requiredRange(s,type,ports)<=shipSpec(s,type).range);
  const q=game.quoteCircuitOpening(s,type,ports);assert.equal(q.error,null);const r=game.openCircuit(s,type,ports);assert.equal(r.mode,'sea');assert.ok(distance(...ports)>5000);
 }
 assert.equal(suggestedTransport(s,['manila','acapulco'],'wagon'),'galleon');assert.equal(suggestedTransport(s,['cairo','suez'],'galleon'),'wagon');
 for(let day=0;day<220;day++)game.tick(s);assert.ok(s.routes.every(r=>r.transport.deliveries>0));assert.deepEqual(game.deserialize(game.serialize(s)),s);
});
