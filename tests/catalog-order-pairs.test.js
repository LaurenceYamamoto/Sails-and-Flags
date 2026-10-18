import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {bridgeWithPosts as bridge} from './post-fixture.js';
import {sortedCities,sortedCompanies} from '../src/wasm-lists.js';
import {setLanguage} from '../src/i18n.js';
const world=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));

test('display regions, capital-based nation order, cities and fixed company order agree',()=>{
 assert.deepEqual(world.regions.map(r=>r.id),['northEurope','westEurope','centralEurope','mediterranean','balkans','scandinavia','africa','westAsia','southAsia','eastAsia','southeastAsia','centralAsia','siberia','caribbean','northAmerica','centralAmerica','southAmerica','other']);
 const nations=[...world.nations].sort((a,b)=>a.order-b.order),rank=r=>world.regions.findIndex(x=>x.id===r);
 for(let i=1;i<nations.length;i++){const a=nations[i-1],b=nations[i];assert.ok(rank(a.capitalRegion)<=rank(b.capitalRegion));if(a.capitalRegion===b.capitalRegion)assert.ok(a.cityCount>=b.cityCount);}
 const city=id=>world.cities.find(c=>c.id===id);assert.equal(city('kingston').region,'caribbean');assert.equal(world.nations[city('kingston').nation].capitalRegion,'northEurope');assert.equal(city('cairo').region,'africa');assert.equal(city('stockholm').region,'scandinavia');
 for(const lang of ['ja','en','zh-CN','ko']){setLanguage(lang);assert.deepEqual(sortedCities(world.cities,world.regions,'region',lang),world.cities.map((_,i)=>i).sort((a,b)=>world.cities[a].order-world.cities[b].order));}
 const byCountry=sortedCities(world.cities,world.regions,'nation','en');for(let i=1;i<byCountry.length;i++)assert.ok(world.cities[byCountry[i-1]].nationOrder<=world.cities[byCountry[i]].nationOrder);
 const rivals=world.starts.map(s=>({...s,homeNation:s.licenses[0],initialScale:s.capital})),companies=rivals.map((r,i)=>({id:r.id,index:i+1,cash:1,homeNation:0}));
 const order=sortedCompanies(companies,world.nations,rivals).map(c=>c.id);companies.forEach((c,i)=>c.cash=i*1e9);assert.deepEqual(sortedCompanies(companies.reverse(),world.nations,rivals).map(c=>c.id),order);
 assert.ok(order.indexOf('company-4')<order.indexOf('company-1'));
 for(const homeNation of [null,world.nations.findIndex(n=>n.id==='japan')]){
  const player={id:'player',index:0,homeNation,cash:0};const sorted=sortedCompanies([...companies,player],world.nations,rivals);
  assert.equal(sorted[0].id,'player');assert.deepEqual(sorted.slice(1).map(c=>c.id),order);
 }
});

test('old circuit saves are rejected and new routes require two distinct ordered cities',async()=>{
 const call=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance),save=()=>JSON.parse(call({op:'save'}));
 const before=save(),legacy=JSON.parse(gunzipSync(fs.readFileSync('tests/fixtures/pre-route-pairs-3.4.3.json.gz')));
 assert.throws(()=>call({op:'load',text:JSON.stringify(legacy)}),/旧版セーブ/);assert.deepEqual(save(),before);
 const ids=['kingston','havana','santiago'].map(id=>world.cities.findIndex(c=>c.id===id));
 for(const stops of [ids,[ids[0],ids[0]]])assert.throws(()=>call({op:'command',command:{action:'openRoute',kind:'sloop',stops,allowed:[0]}}));
 const q=call({op:'query',request:{query:'connection',stops:[ids[1],ids[0]]}});assert.deepEqual(q.stops,ids.slice(0,2).sort((a,b)=>world.cities[a].order-world.cities[b].order));
 assert.ok(before.companies.every(c=>c.routes.every(r=>r.stops.length===2&&world.cities[r.stops[0]].order<world.cities[r.stops[1]].order)));

});
