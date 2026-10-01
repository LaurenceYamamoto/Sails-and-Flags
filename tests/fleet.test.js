import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,buyLicense,buyShip,openCircuit,assignShip,tick,serialize,deserialize,trade,assets,operatingProfit,entry} from '../src/engine.js';
import {shipSpec,designQuote,researchDesign,buyShipyard} from '../src/industry.js';
import {quoteFleetReplacement,replaceFleet,renameCompany,renameDesign,renameShip} from '../src/fleet.js';
import {shipName,SHIP_NAMES} from '../src/identity.js';
import {renderFleet,renderReplacement,renderRename} from '../src/fleet-view.js';
import {renderRoutes} from '../src/routes-view.js';
import {renderIndustry} from '../src/industry-view.js';
import {renderCompetition} from '../src/management-view.js';
import {renderMap} from '../src/map-view.js';
import {acquireCompany} from '../src/management.js';
import {resolveAttack,runReplacements} from '../src/security.js';
import {setLanguage} from '../src/i18n.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
function ready(){const s=createGame(42,{events:false});trade(s,'kingston','food',100000,'sell');buyLicense(s,'spain');s.industry.technology.shipbuilding=30;buyShipyard(s);return s;}
function design(s){return researchDesign(s,'sloop',{cargo:1000,speed:1000,guns:1000,range:1000,upkeep:1000});}
const fmt={cash:String,decimal:String,signed:String,tone:()=>''};

test('type replacement includes idle and assigned ships, pays only the net price and leaves rivals and automation unchanged',()=>{
 const s=ready(),id=design(s),r=openCircuit(s,'sloop',['kingston','havana']);buyShip(s,'sloop');buyShip(s,'brig');const before=serialize(s),q=quoteFleetReplacement(s,{mode:'type',source:'sloop',target:id});assert.equal(serialize(s),before);assert.equal(q.count,2);assert.equal(q.sale,3600);assert.equal(q.purchase,2*shipSpec(s,id).price);
 const cash=s.cash,value=assets(s),operating=operatingProfit(s),rivals=structuredClone(s.competitors);replaceFleet(s,{mode:'type',source:'sloop',target:id});near(s.cash,cash-q.cost);near(assets(s),value);near(operatingProfit(s),operating);assert.equal(s.ships.filter(v=>v.type===id).length,2);assert.equal(s.routes[0].autoShipType,'sloop');assert.deepEqual(s.competitors,rivals);assert.equal(s.routes[0].profit,r.profit);assert.deepEqual(deserialize(serialize(s)),s);
});

test('route replacement keeps at-sea cargo, cursor, remaining time and names even when the new hold is smaller',()=>{
 const s=ready(),r=openCircuit(s,'fluyt',['kingston','havana']),idle=buyShip(s,'fluyt');renameShip(s,s.ships[0].id,'Sea Flower');tick(s);const old=structuredClone(s.ships[0]);assert.ok(old.cargo.reduce((n,c)=>n+c.quantity,0)>30);const cash=s.cash,value=assets(s);
 replaceFleet(s,{mode:'route',routeId:r.id,target:'sloop'});const ship=s.ships.find(v=>v.id===old.id);assert.equal(ship.name,'Sea Flower');assert.equal(ship.type,'sloop');assert.equal(ship.voyage.departureType,'fluyt');assert.equal(ship.voyage.remaining,old.voyage.remaining);assert.equal(ship.nextStop,old.nextStop);assert.deepEqual(ship.cargo,old.cargo);assert.equal(s.ships.find(v=>v.id===idle.id).type,'fluyt');near(s.cash,cash+6700);near(assets(s),value);
 const copy=deserialize(serialize(s));for(let i=0;i<old.voyage.remaining;i++){tick(s);tick(copy);}assert.deepEqual(copy,s);assert.equal(s.ships.find(v=>v.id===old.id).voyage,null);assert.equal(s.ships.find(v=>v.id===old.id).cargo.length,0);for(let i=0;i<40;i++)tick(s);assert.deepEqual(deserialize(serialize(s)),s);
});

test('bulk automation edits only matching settings, including stopped routes, without trading ships or touching budgets',()=>{
 const s=ready(),id=design(s),a=openCircuit(s,'sloop',['kingston','havana']),b=openCircuit(s,'sloop',['santiago','sanjuan']);b.active=false;const before=structuredClone({ships:s.ships,cash:s.cash,automation:s.automation,ledger:s.ledger});replaceFleet(s,{mode:'automation',source:'sloop',target:id});assert.ok(s.routes.every(r=>r.autoShipType===id));assert.deepEqual({ships:s.ships,cash:s.cash,automation:s.automation,ledger:s.ledger},before);assert.deepEqual(deserialize(serialize(s)),s);
});

test('range, funding and empty-selection failures are atomic, while net funding can be lower than gross purchases',()=>{
 const s=ready();openCircuit(s,'brig',['kingston','london']);const bad={mode:'type',source:'brig',target:'sloop'},before=serialize(s);assert.match(quoteFleetReplacement(s,bad).error,/航続/);assert.throws(()=>replaceFleet(s,bad));assert.equal(serialize(s),before);
 const small=createGame(42,{events:false});buyShip(small,'sloop');entry(small,'designResearch',-(small.cash-3400));const q={mode:'type',source:'sloop',target:'brig'};replaceFleet(small,q);near(small.cash,0);assert.equal(small.gameOver,false);
 for(const action of [{mode:'type',source:'brig',target:'fluyt'},{mode:'type',source:'sloop',target:'brig'},{mode:'type',source:'brig',target:'brig'},{mode:'route',routeId:'missing',target:'sloop'}]){const raw=serialize(small);assert.throws(()=>replaceFleet(small,action));assert.equal(serialize(small),raw);}
});

test('repeated replacement in one voyage retains departure limits; losses claim the purchased type',()=>{
 const s=ready(),r=openCircuit(s,'brig',['kingston','havana']);tick(s);const original=structuredClone(s.ships[0].voyage);replaceFleet(s,{mode:'route',routeId:r.id,target:'fluyt'});replaceFleet(s,{mode:'route',routeId:r.id,target:'sloop'});assert.equal(s.ships[0].voyage.departureType,'brig');assert.equal(s.ships[0].voyage.total,original.total);assert.deepEqual(deserialize(serialize(s)),s);
 resolveAttack(s,s.routes[0],s.ships[0],0,0);assert.deepEqual(s.routes[0].pendingReplacements,['sloop']);assert.deepEqual(deserialize(serialize(s)),s);
});

test('company, design and ship names persist without changing fixed specifications, accounts or random streams',()=>{
 const s=ready(),id=design(s),ship=buyShip(s,id),spec=structuredClone(shipSpec(s,id)),cash=s.cash,rng=s.rng,worldRng=s.world.rng;
 renameCompany(s,'  Atlantic & Co.  ');renameDesign(s,id,'Swift Trader');renameShip(s,ship.id,'Morning Star');assert.equal(s.companyName,'Atlantic & Co.');assert.deepEqual({...shipSpec(s,id),customName:undefined},{...spec,customName:undefined});assert.equal(shipSpec(s,id).customName,'Swift Trader');assert.equal(ship.name,'Morning Star');assert.equal(s.cash,cash);assert.equal(s.rng,rng);assert.equal(s.world.rng,worldRng);assert.deepEqual(deserialize(serialize(s)),s);
 for(const value of ['', '  ', 'a'.repeat(81), 'Bad\nName']){const raw=serialize(s);assert.throws(()=>renameCompany(s,value));assert.throws(()=>renameShip(s,ship.id,value));assert.throws(()=>renameDesign(s,id,value));assert.equal(serialize(s),raw);}
 assert.throws(()=>renameDesign(s,'sloop','Base override'));assert.throws(()=>renameShip(s,'missing','Missing'));
});

test('automatic names are deterministic, allow pool reuse and survive acquisition, including old unnamed ships',()=>{
 const a=ready(),b=deserialize(serialize(a));for(let i=0;i<30;i++){const x=buyShip(a,'sloop'),y=buyShip(b,'sloop');assert.ok(SHIP_NAMES.includes(x.name));assert.equal(x.name,y.name);}assert.ok(new Set(a.ships.map(v=>v.name)).size<30);
 const old=deserialize(serialize(a));delete old.ships[0].name;const fallback=shipName(old,old.ships[0]);assert.equal(shipName(deserialize(serialize(old)),old.ships[0]),fallback);
 const c=a.competitors[0];delete c.ships[0].name;const acquired=shipName(c,c.ships[0]);renameCompany(a,'Home Company');acquireCompany(a,0);assert.equal(a.companyName,'Home Company');assert.ok(a.ships.some(v=>v.name===acquired));assert.deepEqual(deserialize(serialize(a)),a);
});

test('names are rendered as text in controls, maps, rankings and designs in both languages',()=>{
 const s=ready(),id=design(s);openCircuit(s,id,['kingston','havana']);const value='<img src=x onerror="alert(1)"> & \'test\'';renameCompany(s,value);renameDesign(s,id,value);renameShip(s,s.ships[0].id,value);
 for(const lang of ['ja','en']){setLanguage(lang);const html=renderFleet(s)+renderIndustry(s,fmt)+renderRoutes(s,fmt)+renderCompetition(s,null,fmt)+renderMap(s,'kingston',null,()=>'',{})+renderRename({kind:'ship',value})+renderReplacement(s,{mode:'type',source:id,target:'sloop'},fmt);assert.doesNotMatch(html,/<img src=x/);assert.match(html,/&lt;img/);assert.match(html,/&quot;/);assert.match(html,/data-action="rename-ship"/);assert.match(html,/fleet-replacement-form/);}
 setLanguage('ja');
});

test('invalid saved names and voyage departure types are rejected without breaking pre-feature saves',()=>{
 const s=ready();openCircuit(s,'sloop',['kingston','havana']);tick(s);for(const corrupt of [x=>x.companyName='',x=>x.ships[0].name='\n',x=>x.ships[0].voyage.departureType='missing',x=>x.ships[0].voyage.departureType='fluyt']){const bad=JSON.parse(serialize(s));corrupt(bad);assert.throws(()=>deserialize(JSON.stringify(bad)));}
 const id=design(s),bad=JSON.parse(serialize(s));bad.world.designs[id].spec.customName=4;assert.throws(()=>deserialize(JSON.stringify(bad)));
});
