import {NATIONS as OLD_NATIONS} from '../src/legacy/data-v7.js';
import {withoutSeaVersion} from './baseline.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as old from '../src/legacy/engine-v7.js';
import * as game from '../src/engine.js';
import {buyRoadRight,setRoadInvestment} from '../src/legacy/land-v7.js';
import {buyDevelopmentRight,setCityInvestment} from '../src/legacy/industry-v7.js';
import {CITIES,NATIONS} from '../src/data.js';
import {INLAND,ROADS} from '../src/land-data.js';
import {RETIRED_CITIES,RETIRED_ROADS} from '../src/retired-network.js';
import {SAVE_KEYS,saveGame,listSaves} from '../src/storage.js';
import {renderIndustry} from '../src/industry-view.js';
import {roadTitle} from '../src/land-view.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function fixture(){
 const s=old.createGame(42,{events:false});old.entry(s,'sale',100000);
 for(const n of Object.keys(OLD_NATIONS))if(!s.licenses.includes(n))old.buyLicense(s,n);
 old.openCircuit(s,'wagon',['london','oxford']);old.openCircuit(s,'wagon',['lisbon','evora','madrid','evora']);
 old.openCircuit(s,'wagon',['nantes','paris']);old.openCircuit(s,'sloop',['kingston','havana']);
 buyRoadRight(s,'london_oxford');setRoadInvestment(s,'london_oxford',10,5);
 buyDevelopmentRight(s,'oxford');setCityInvestment(s,'oxford',10,5);
 const c=s.competitors[0];old.entry(c,'sale',30000);old.openCircuit(c,'wagon',['amsterdam','utrecht']);buyRoadRight(s,'amsterdam_utrecht',c);buyDevelopmentRight(s,'utrecht',c);
 old.tick(s);return s;
}
test('city selection prioritizes ports and inland hubs without a country quota',()=>{
 assert.deepEqual(Object.keys(INLAND).sort(),['madrid','paris']);
 for(const id of ['porto','barcelona','marseille'])assert.ok(CITIES[id]&&!CITIES[id].inland);
 for(const id of Object.keys(RETIRED_CITIES))assert.equal(CITIES[id],undefined);
 assert.equal(Object.keys(ROADS).length,8);
 assert.ok(Object.values(ROADS).every(r=>!r.nations.includes('england')&&!r.nations.includes('netherlands')));
 const s=game.createGame(42,{events:false});game.buyLicense(s,'portugal');
 game.openCircuit(s,'sloop',['lisbon','porto']);game.openCircuit(s,'wagon',['lisbon','porto']);
 assert.equal(s.routes.length,2);for(let i=0;i<60;i++)game.tick(s);
 assert.ok(s.routes.every(r=>r.deliveries>0));assert.deepEqual(game.deserialize(game.serialize(s)),s);
});
test('v7 migration returns vehicles and refunds remaining cargo and removed investments to their actual owners',()=>{
 const before=fixture(),raw=old.serialize(before),s=game.deserialize(raw);
 assert.equal(old.serialize(before),raw);assert.equal(s.version,10);
 for(const [index,c] of [before,...before.competitors].entries()){
  const after=[s,...s.competitors][index],removed=c.routes.filter(r=>r.stops.some(id=>RETIRED_CITIES[id]));
  const vehicles=c.ships.filter(v=>removed.some(r=>r.id===v.routeId));
  const cargo=vehicles.flatMap(v=>v.cargo).reduce((n,x)=>n+x.total,0);
  const city=Object.entries(c.world.development).filter(([id,d])=>RETIRED_CITIES[id]&&d.owner===c.industry.id).reduce((n,[,d])=>n+d.basis+d.invested+d.taxPool,0);
  const roads=Object.entries(c.world.roads).filter(([id,d])=>RETIRED_ROADS[id]&&d.owner===c.industry.id).reduce((n,[,d])=>n+d.basis+d.invested+d.tollPool,0);
  near(after.cash,c.cash+cargo+city+roads);assert.equal(after.ships.length,c.ships.length);
  for(const v of vehicles){const returned=after.ships.find(x=>x.id===v.id);assert.equal(returned.name,v.name);assert.equal(returned.routeId,null);assert.equal(returned.voyage,null);assert.deepEqual(returned.cargo,[]);assert.equal(returned.nextStop,undefined);}
  for(const v of c.ships.filter(v=>!vehicles.includes(v)))assert.deepEqual(withoutSeaVersion(after.ships.find(x=>x.id===v.id)),v);
  assert.equal(after.rng,c.rng);near(game.operatingProfit(after),old.operatingProfit(c));
 }
 assert.deepEqual(s.world.roads.nantes_paris,before.world.roads.nantes_paris);
 for(const id of Object.keys(CITIES).filter(id=>before.markets[id]))assert.deepEqual(Object.fromEntries(Object.keys(before.markets[id]).map(g=>[g,s.markets[id][g]])),before.markets[id]);
 assert.deepEqual(s.world.designs,before.world.designs);assert.equal(s.world.rng,before.world.rng);
 assert.equal(s.networkMigration.removedRoutes,2);
 assert.ok(s.ledger.some(e=>e.city==='oxford'));assert.match(roadTitle('london_oxford'),/Oxford/);
 assert.doesNotMatch(renderIndustry(s,{cash:String,decimal:String}),/undefined/);
 const restored=game.deserialize(game.serialize(s));assert.deepEqual(restored,s);
 for(let i=0;i<90;i++){game.tick(s);game.tick(restored);}assert.deepEqual(restored,s);
});
test('v7 source saves remain untouched and compensation cannot repeat on v8 reload',()=>{
 const raw=old.serialize(fixture()),map=new Map([[SAVE_KEYS.v7,raw],[SAVE_KEYS.preservedP7,raw]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const s=listSaves(storage).find(x=>x.slot==='v7').state;saveGame(storage,s);
 assert.equal(map.get(SAVE_KEYS.v7),raw);assert.equal(map.get(SAVE_KEYS.preservedP7),raw);assert.equal(map.get(SAVE_KEYS.preserved),raw);
 const loaded=game.deserialize(map.get(SAVE_KEYS.manual));assert.equal(loaded.cash,s.cash);assert.deepEqual(loaded.totals,s.totals);
 for(const corrupt of [c=>c.world.roads.london_oxford.owner='unknown',c=>c.ships[0].cargo[0].total=-1,c=>c.markets.oxford.food.stock=-1]){const copy=JSON.parse(raw);corrupt(copy);assert.throws(()=>game.deserialize(JSON.stringify(copy)));}
});
test('refund can clear a stopped rival debt without leaving its clock behind the world',()=>{
 const s=old.createGame(42,{events:false}),c=s.competitors[0];buyRoadRight(s,'amsterdam_utrecht',c);
 old.entry(c,'purchase',-c.cash-1);old.tick(s);old.tick(s);
 const restored=game.deserialize(old.serialize(s)),rival=restored.competitors[0];
 assert.equal(rival.gameOver,false);assert.equal(rival.day,restored.day);near(rival.cash,589);
 game.tick(restored);assert.deepEqual(game.deserialize(game.serialize(restored)),restored);
});
