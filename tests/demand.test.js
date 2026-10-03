import test from 'node:test';
import assert from 'node:assert/strict';
import {CITIES,GOODS} from '../src/data.js';
import {DEMAND_REGIONS,DEMAND_CLIMATES,demandProfile} from '../src/demand-data.js';
import {cityDemandProfile,demandModifiers,marketFlow,winterStrength} from '../src/market-demand.js';
import {createGame,tick,serialize,deserialize,buyLicense,openCircuit,trade} from '../src/engine.js';
import {renderMarketDemand} from '../src/market-view.js';
import {LANGUAGES,setLanguage} from '../src/i18n.js';

test('all cities and goods have bounded demand profiles independent of ruling nation',()=>{
 const ids=new Set(GOODS.map(g=>g.id));
 for(const group of [DEMAND_REGIONS,DEMAND_CLIMATES])for(const profile of Object.values(group))for(const g of Object.keys(profile.goods))assert.ok(ids.has(g),g);
 for(const [city,c] of Object.entries(CITIES)){
  assert.deepEqual(demandProfile(city,c),demandProfile(city,{...c,nation:'other'}));
  for(const g of GOODS)for(const day of [0,90,181,270,365,36525]){const f=demandModifiers(city,g.id,day);for(const n of Object.values(f))assert.ok(Number.isFinite(n)&&n>=.65&&n<=1.4);}
 }
 assert.equal(cityDemandProfile('kingston').region,'americas');assert.equal(cityDemandProfile('moscow').region,'northEurope');assert.equal(cityDemandProfile('guangzhou').region,'eastAsia');assert.equal(cityDemandProfile('cairo').climate,'arid');assert.equal(cityDemandProfile('quito').climate,'temperate');
 assert.ok(demandModifiers('guangzhou','tea',0).regional>demandModifiers('kingston','tea',0).regional);
 assert.ok(demandModifiers('london','fur',0).climate>demandModifiers('kingston','fur',0).climate);
});

test('annual demand is smooth, reverses hemispheres and remains flat in the tropics',()=>{
 for(const day of [0,365,36524])assert.ok(Math.abs(winterStrength(day+1)-winterStrength(day))<.02);
 assert.ok(demandModifiers('london','fur',0).season>1);assert.ok(demandModifiers('london','fur',181).season<1);
 assert.ok(demandModifiers('capetown','fur',0).season<1);assert.ok(demandModifiers('capetown','fur',181).season>1);
 assert.equal(demandModifiers('kingston','fur',0).season,1);assert.equal(demandModifiers('kingston','fur',181).season,1);
 assert.equal(winterStrength(0),1);assert.equal(winterStrength(365),1);
});

test('daily stock uses the displayed flow including war, city growth and price response exactly once',()=>{
 const s=createGame(42,{events:false});s.world.development.london.size=2;s.world.development.london.production.cloth=3;
 const expected=Object.fromEntries(Object.keys(CITIES).map(c=>[c,Object.fromEntries(GOODS.map(g=>[g.id,marketFlow(s,c,g.id,1).stock]))]));
 tick(s,{runCompetitors:false});for(const [c,market]of Object.entries(s.markets))for(const [g,m]of Object.entries(market))assert.equal(m.stock,expected[c][g]);
 const peace=marketFlow(s,'london','weapons');s.world.enabled=true;s.world.pairs.find(p=>p.a==='england'&&p.b==='spain').until=1000;
 const war=marketFlow(s,'london','weapons');assert.equal(war.war,1.8);assert.ok(Math.abs(war.demand/peace.demand-1.8)<1e-10);assert.equal(war.production,peace.production);
 const f=marketFlow(s,'london','fur');assert.ok(Math.abs(f.demand-f.base*f.development*f.regional*f.climate*f.season)<1e-10);
 s.markets.london.fur.stock=0;s.markets.london.fur.production=0;assert.equal(marketFlow(s,'london','fur').consumption,0);assert.equal(marketFlow(s,'london','fur').stock,0);
});

test('v15 round trip preserves every field and calculations consume neither RNG nor saved demand',()=>{
 const s=createGame(1700);buyLicense(s,'spain');openCircuit(s,'sloop',['kingston','havana']);tick(s);const raw=serialize(s);assert.equal(s.version,15);
 for(const c of Object.keys(CITIES))for(const g of GOODS)marketFlow(s,c,g.id);
 assert.equal(serialize(s),raw);const restored=deserialize(raw);assert.equal(serialize(restored),raw);tick(s);tick(restored);assert.deepEqual(restored,s);
});

test('six languages expose consumption and its factors without changing game state',()=>{
 const s=createGame(),raw=serialize(s);for(const lang of Object.keys(LANGUAGES)){setLanguage(lang);const html=renderMarketDemand(s,'london',{decimal:String,money:String});assert.equal((html.match(/data-market-good=/g)??[]).length,20);assert.match(html,/demand-details/);assert.doesNotMatch(html,/undefined|NaN|Infinity|\uFFFD/);}
 setLanguage('ja');assert.equal(serialize(s),raw);
});


test('every city and commodity retains positive consumption demand without local stock or production',()=>{
 const s=createGame(42,{events:false});let nonProducers=0;
 for(const [city,market]of Object.entries(s.markets))for(const g of GOODS){
  market[g.id].stock=0;
  for(const day of [0,91,182,273]){
   const f=marketFlow(s,city,g.id,day);assert.ok(f.requested>0,city+' / '+g.id);assert.ok(f.consumption>=0&&f.consumption<=f.production);assert.ok(Math.abs(f.requested-f.consumption-f.unmet)<1e-10);
   if(market[g.id].production===0){assert.equal(f.consumption,0);assert.equal(f.unmet,f.requested);assert.equal(f.stock,0);}
  }
  if(market[g.id].production===0)nonProducers++;
 }
 assert.ok(nonProducers>1000);
});

test('imported spices sell and are consumed in an empty European non-producing market',()=>{
 const s=createGame(42,{events:false});const m=s.markets.london.spices;m.stock=0;assert.equal(m.production,0);const empty=marketFlow(s,'london','spices');assert.ok(empty.requested>0);assert.equal(empty.consumption,0);
 const cash=s.cash,sale=trade(s,'london','spices',10,'sell');assert.equal(sale.quantity,10);assert.ok(s.cash>cash);assert.equal(m.stock,10);
 const supplied=marketFlow(s,'london','spices',s.day+1);assert.ok(supplied.consumption>0);assert.equal(supplied.unmet,0);tick(s);assert.equal(m.stock,supplied.stock);assert.ok(m.stock<10&&m.stock>=0);assert.equal(m.production,0);
 assert.deepEqual(deserialize(serialize(s)),s);
});

test('market UI shows positive demand and separately exposes empty-stock consumption in all six languages',()=>{
 const s=createGame(42,{events:false});s.markets.london.spices.stock=0;const raw=serialize(s);
 for(const lang of Object.keys(LANGUAGES)){
  setLanguage(lang);const html=renderMarketDemand(s,'london',{decimal:String,money:String});
  const main=html.split('data-market-good="spices"')[1].split('</tr>')[0],detail=html.split('data-demand-good="spices"')[1].split('</tr>')[0];
  const expected=new Intl.NumberFormat(LANGUAGES[lang].locale,{maximumFractionDigits:3}).format(marketFlow(s,'london','spices').requested);
  assert.ok(main.endsWith('<td>'+expected+'</td>'));assert.ok(detail.includes('<td>'+expected+'</td><td>0</td><td>'+expected+'</td>'));
  if(lang==='en'){assert.match(html,/Consumption demand \/ day/);assert.doesNotMatch(html,/Expected consumption \/ day/);}
 }
 assert.equal(serialize(s),raw);setLanguage('ja');
});
