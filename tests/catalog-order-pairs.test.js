import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {bridge} from '../src/wasm-bridge.js';
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

test('two-city routes migrate old circuits without losing cargo, movement or accounting',async()=>{
 const instantiate=async bytes=>bridge((await WebAssembly.instantiate(bytes)).instance);
 const current=await instantiate(fs.readFileSync('assets/wasm/engine.wasm'));
 const cmd=(call,command)=>call({op:'command',command}),save=call=>JSON.parse(call({op:'save'})),load=(call,g)=>call({op:'load',text:JSON.stringify(g)});
 const legacy=JSON.parse(gunzipSync(fs.readFileSync('tests/fixtures/pre-route-pairs-3.4.3.json.gz')));
 const p=legacy.companies[0],circuit=p.routes.find(r=>r.stops.length>2),ships=p.ships.filter(s=>s.route===circuit.id);
 const ids=['kingston','havana','santiago'].map(id=>world.cities.findIndex(c=>c.id===id)),[a,b,c]=ids;
 load(current,legacy);const migrated=save(current),co=migrated.companies[0];
 assert.equal(migrated.route_pair_version,1);assert.equal(co.routes.length,2);assert.equal(co.cash,p.cash);assert.deepEqual(co.totals,p.totals);assert.deepEqual(migrated.markets,legacy.markets);
 for(const company of migrated.companies){assert.ok(company.routes.every(r=>r.stops.length===2&&world.cities[r.stops[0]].order<world.cities[r.stops[1]].order));if(company.id!=='player')assert.ok(company.routes.length<=50);}
 for(const original of ships){const ship=co.ships.find(s=>s.id===original.id);for(const key of ['cargo','voyage','handling','ready','kind','name'])assert.deepEqual(ship[key],original[key],key);}
 assert.equal(co.routes.reduce((n,r)=>n+r.revenue,0),120);assert.equal(co.routes.reduce((n,r)=>n+r.profit,0),80);assert.equal(co.routes.reduce((n,r)=>n+r.deliveries,0),7);assert.equal(co.routes.reduce((n,r)=>n+r.replacements.length,0),2);
 load(current,migrated);assert.deepEqual(save(current),migrated);
 for(const query of ['connection','opening'])assert.throws(()=>current({op:'query',request:{query,kind:'sloop',stops:ids}}));
 assert.throws(()=>cmd(current,{action:'openRoute',kind:'sloop',stops:ids,allowed:[0],margin:10}));
 const result=current({op:'query',request:{query:'connection',stops:[b,a]}});assert.deepEqual(result.stops,[a,b].sort((x,y)=>world.cities[x].order-world.cities[y].order));assert.equal(result.routes.length,1);
 const count=co.routes.length;cmd(current,{action:'openRoute',kind:'sloop',stops:[b,a],allowed:[0],margin:10});assert.equal(save(current).companies[0].routes.length,count);
 cmd(current,{action:'tick',days:3});save(current);
 const queued=structuredClone(legacy);for(const r of queued.companies[0].routes)r.replacements=Array(200).fill(r.auto_type);
 load(current,queued);const merged=save(current);assert.equal(merged.companies[0].routes.reduce((n,r)=>n+r.replacements.length,0),400);assert.ok(merged.companies[0].routes.some(r=>r.replacements.length>200));load(current,merged);assert.deepEqual(save(current),merged);
 const invalid=structuredClone(merged);invalid.route_pair_version=2;assert.throws(()=>load(current,invalid));assert.deepEqual(save(current),merged);
 cmd(current,{action:'new',seed:1700,events:false});const crowded=save(current),rival=crowded.companies[1],template=rival.routes[0];crowded.route_pair_version=0;
 const ports=['london','amsterdam','lisbon','cadiz','marseille','nantes','barcelona','porto','genoa','livorno','venice','naples'].map(id=>world.cities.findIndex(c=>c.id===id));
 rival.licenses=world.nations.map((_,i)=>i);rival.routes=[];for(let i=1;i<ports.length;i++)for(let j=i+1;j<ports.length;j++)if(rival.routes.length<50)rival.routes.push({...structuredClone(template),id:crowded.next_id++,stops:[ports[0],ports[i],ports[j]]});
 for(const ship of rival.ships){ship.route=null;ship.next=0;}load(current,crowded);const capped=save(current);assert.equal(capped.companies[1].routes.length,50);assert.equal(capped.companies[1].ships.length,rival.ships.length);assert.equal(capped.companies[1].cash,rival.cash);load(current,capped);assert.deepEqual(save(current),capped);
});
