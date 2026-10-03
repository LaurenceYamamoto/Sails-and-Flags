import {CROSSING_PORTS,CROSSING_ROADS} from '../src/crossing-data.js';
import {CONTINENTAL_CITIES,CONTINENTAL_ROADS,CONTINENTAL_NATIONS} from '../src/continental-data.js';
import {WORLD_PORTS,WORLD_NATIONS} from '../src/world-data.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as old from '../src/legacy/engine-v9.js';
import {CITIES as OLD_CITIES,GOODS as OLD_GOODS,NATIONS as OLD_NATIONS,distance as oldDistance} from '../src/legacy/data-v9.js';
import * as game from '../src/engine.js';
import {CITIES,NATIONS,GOODS,distance} from '../src/data.js';
import {REGION_CITIES,REGION_NATIONS} from '../src/region-data.js';
import {seaRoute} from '../src/sea-routing.js';
import {saveGame,listSaves,SAVE_KEYS} from '../src/storage.js';
import {acquireCompany,acquisitionQuote,setAutomation} from '../src/management.js';
import {buyDevelopmentRight,setCityInvestment} from '../src/industry.js';
import {revokeLicense,setDiplomacyInvestment,advanceWorld} from '../src/security.js';
import {LANGUAGES,setLanguage,nameOf} from '../src/i18n.js';
import {renderMap} from '../src/map-view.js';
import {renderRoutes} from '../src/routes-view.js';
import {renderDiplomacy} from '../src/security-view.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const fmt={cash:String,decimal:String,signed:String,tone:()=>''};

test('P8 ports have distinct markets and licenses, while every old sea distance is unchanged',()=>{
  assert.equal(Object.keys(CITIES).length,114);assert.equal(GOODS.length,20);
  assert.equal(CITIES.genoa.nation,'genoa');assert.equal(CITIES.livorno.nation,'tuscany');
  assert.equal(new Set(Object.values(NATIONS).map(n=>n.color)).size,23);
  for(const n of Object.values(NATIONS))assert.ok(CITIES[n.tradePort]&&!CITIES[n.tradePort].inland);
  for(const a of Object.keys(OLD_CITIES))for(const b of Object.keys(OLD_CITIES))assert.equal(distance(a,b),oldDistance(a,b));
  const s=game.createGame(42,{events:false});
  assert.ok(game.price('cloth',s.markets.genoa.cloth.stock)<game.price('cloth',s.markets.livorno.cloth.stock));
  assert.ok(game.price('oliveOil',s.markets.livorno.oliveOil.stock)<game.price('oliveOil',s.markets.london.oliveOil.stock));
  const raw=game.serialize(s);assert.throws(()=>game.openCircuit(s,'sloop',['genoa','livorno']),/免許/);assert.equal(game.serialize(s),raw);
  game.buyLicense(s,'genoa');game.buyLicense(s,'tuscany');const r=game.openCircuit(s,'sloop',['genoa','livorno']);
  assert.ok(r.allowed.includes('oliveOil'));assert.ok(s.competitors.some(c=>c.industry.id==='company-3'&&c.routes[0].stops.includes('genoa')));
  assert.ok(seaRoute('livorno','london').coordinates.some(([lon,lat])=>lon<-5&&lon>-6&&lat<36.5));
});

test('v9 migration preserves every existing company field, goods, diplomacy pair and voyage, adds content once',()=>{
  const before=old.createGame(42,{events:false});old.buyLicense(before,'spain');old.openCircuit(before,'sloop',['kingston','havana']);
  for(let i=0;i<100;i++)old.tick(before);
  const raw=old.serialize(before),s=game.deserialize(raw);
  assert.equal(old.serialize(before),raw);assert.equal(s.version,14);
  for(const [i,c] of [before,...before.competitors].entries()){
    const after=structuredClone([s,...s.competitors][i]),expected=structuredClone(c);
    for(const n of Object.keys({...REGION_NATIONS,...WORLD_NATIONS,...CONTINENTAL_NATIONS}))for(const values of Object.values(after.diplomacy))delete values[n];
    for(const x of [after,expected]){delete x.world;delete x.markets;delete x.competitors;delete x.version;}
    assert.deepEqual(after,expected);
  }
  for(const id of Object.keys(before.markets))for(const g of OLD_GOODS)assert.deepEqual(s.markets[id][g.id],before.markets[id][g.id]);
  const world=structuredClone(s.world);for(const id of Object.keys(CROSSING_PORTS))delete world.development[id];for(const id of Object.keys(CROSSING_ROADS))delete world.roads[id];world.pairs=world.pairs.filter(p=>OLD_NATIONS[p.a]&&OLD_NATIONS[p.b]);for(const id of Object.keys({...REGION_CITIES,...WORLD_PORTS,...CONTINENTAL_CITIES}))delete world.development[id];for(const id of Object.keys(CONTINENTAL_ROADS))delete world.roads[id];assert.deepEqual(world,before.world);
  const rival=s.competitors.at(-1);assert.equal(rival.day,s.day);assert.equal(rival.industry.id,'company-3');assert.equal(rival.routes[0].scheduleEpoch,s.day+1);
  assert.deepEqual(game.deserialize(game.serialize(s)),s);
  const copy=game.deserialize(game.serialize(s));for(let i=0;i<365;i++){game.tick(s);game.tick(copy);}assert.deepEqual(copy,s);
});

test('v9 migration rejects corruption and preserves old slots; P8 bankruptcy and acquired rivals cannot respawn on reload',()=>{
  const before=old.createGame(42),raw=old.serialize(before),map=new Map([[SAVE_KEYS.v9,raw],[SAVE_KEYS.preservedSea,raw]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  const s=listSaves(storage).find(x=>x.slot==='v9').state;saveGame(storage,s);
  assert.equal(map.get(SAVE_KEYS.v9),raw);assert.equal(map.get(SAVE_KEYS.preservedSea),raw);assert.equal(map.get(SAVE_KEYS.preserved),raw);
  for(const mutate of [s=>s.cash++,s=>s.markets.kingston.food.stock=-1,s=>s.world.pairs.pop()]){const x=JSON.parse(raw);mutate(x);assert.throws(()=>game.deserialize(JSON.stringify(x)));}
  game.entry(s,'sale',100000);acquireCompany(s,2);const count=s.competitors.length;game.entry(s,'purchase',-s.cash-1);
  const loaded=game.deserialize(game.serialize(s));assert.equal(loaded.competitors.length,count);assert.equal(loaded.gameOver,true);assert.equal(loaded.cash,-1);
});

test('regional buyout conserves assets and transfers rights and cargo; revocation confiscates only its nation',()=>{
  const s=game.createGame(42,{events:false});game.entry(s,'sale',100000);const rival=s.competitors[2];game.entry(rival,'sale',10000);
  buyDevelopmentRight(s,'genoa',rival);game.tick(s);assert.ok(rival.ships[0].voyage);
  const q=acquisitionQuote(s,2),expected=game.assets(s)+game.assets(rival)-q.price-q.licenseCost;
  acquireCompany(s,2);near(game.assets(s),expected);assert.equal(s.world.development.genoa.owner,'player');
  assert.ok(s.ships.some(v=>v.voyage?.from==='genoa'));assert.deepEqual(game.deserialize(game.serialize(s)),s);
  buyDevelopmentRight(s,'livorno');setCityInvestment(s,'livorno',1,1);revokeLicense(s,'genoa');
  assert.equal(s.world.development.genoa.owner,'state');assert.equal(s.world.development.livorno.owner,'player');
  assert.ok(s.ships.every(v=>!v.routeId&&v.cargo.length===0));assert.deepEqual(game.deserialize(game.serialize(s)),s);
});

test('new nations participate in bounded diplomatic updates and reject missing or duplicate pairs',()=>{
  const s=game.createGame(1);assert.equal(s.world.pairs.length,253);
  for(const p of s.world.pairs){p.relation=0;p.cooldownUntil=0;}
  s.day=366;advanceWorld(s);assert.ok(s.world.pairs.every(p=>Number.isFinite(p.relation)));
  for(const mutate of [x=>x.world.pairs.pop(),x=>x.world.pairs[0]={...x.world.pairs[1]},x=>delete x.diplomacy.friendship.genoa]){const x=game.createGame();mutate(x);assert.throws(()=>game.deserialize(game.serialize(x)));}
});

test('regional markets, map, cargo policies and diplomatic names work in all six languages',()=>{
  const s=game.createGame();game.buyLicense(s,'genoa');game.buyLicense(s,'tuscany');const r=game.openCircuit(s,'sloop',['genoa','livorno']);const raw=game.serialize(s);
  for(const lang of Object.keys(LANGUAGES)){
    setLanguage(lang);const html=renderMap(s,'genoa',r.id,()=> 'translate(0,0)',{mapRegion:'mediterranean'})+renderRoutes(s,fmt)+renderDiplomacy(s,fmt);
    assert.match(html,/Genoa/);assert.match(html,/Livorno/);assert.ok(html.includes(nameOf(NATIONS.genoa)));assert.doesNotMatch(html,/undefined|\[object Object\]|\uFFFD/);
    assert.notEqual(nameOf(GOODS.at(-1)),'oliveOil');assert.equal(game.serialize(s),raw);
  }setLanguage('ja');
});

test('normal funds sustain regional and connected routes for ten years across three seeds with yearly recovery',()=>{
  for(const seed of [1,42,1700]){
    const s=game.createGame(seed);for(const n of ['genoa','tuscany','france'])game.buyLicense(s,n);
    game.openCircuit(s,'sloop',['genoa','livorno','marseille']);let joined=false,oilSold=false;
    for(let day=1;day<=3650;day++){
      const restored=day%365===0?game.deserialize(game.serialize(s)):null;
      game.tick(s);if(restored){game.tick(restored);assert.deepEqual(restored,s);}
      assert.equal(s.gameOver,false,`seed ${seed}, day ${day}`);
      if(!joined&&s.cash>15000){game.openCircuit(s,'brig',['livorno','london']);setAutomation(s,{enabled:true,replaceLost:true,monthlyBudget:5200,minCash:9000,expandThreshold:25,shrinkThreshold:0});joined=true;}
      for(const n of s.licenses)setDiplomacyInvestment(s,n,s.diplomacy.friendship[n]<55?.25:0);
      oilSold ||= s.ledger.some(e=>e.category==='sale'&&e.good==='oliveOil');
      if(day%365===0){near(s.cash,s.initialCash+Object.values(s.totals).reduce((a,b)=>a+b,0));}
    }
    assert.ok(joined&&oilSold);assert.ok(s.routes.every(r=>r.deliveries>20));assert.deepEqual(game.deserialize(game.serialize(s)),s);
    console.log('P8 regional',JSON.stringify({seed,day:s.day,cash:s.cash,assets:game.assets(s),deliveries:s.routes.map(r=>r.deliveries)}));
  }
});
