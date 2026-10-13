import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {bridge} from '../src/wasm-bridge.js';
import {YANGTZE_WATERWAYS,RIVER_MOUTHS} from '../src/yangtze-waterways.js';
import {landSegment,onLand} from '../src/world-geometry.js';
import {cityNames} from '../src/city-names.js';
import {seaFromGateway,PORT_APPROACHES,waterSegment} from '../src/sea-routing.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const city=id=>w.cities.findIndex(c=>c.id===id),ids=['shanghai','jiujiang','yueyang','yangzhou','nanjing','hankou','yichang','nanchang','changsha'];
const binary=fs.readFileSync('assets/wasm/engine.wasm');
const display=c=>({x:c.displayX??c.x,y:c.displayY??c.y});
async function engine(){const {instance}=await WebAssembly.instantiate(binary),call=bridge(instance);return {cmd:command=>call({op:'command',command}),query:request=>call({op:'query',request}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),view:()=>call({op:'view'}),catalog:()=>call({op:'catalog'})};}
function fund(e){const g=e.save();g.events_enabled=false;g.companies[0].cash+=1e9;g.companies[0].initial_cash+=1e9;g.companies[0].technology[0]=30;e.load(g);}
function open(e,stops,kind='sloop'){for(const nation of e.query({query:'opening',kind,stops}).missing)e.cmd({action:'license',nation});return e.cmd({action:'openRoute',kind,stops,allowed:w.goods.map((_,i)=>i),margin:0});}

test('schematic river junctions meet only at Yangzhou and Jiujiang while distances remain unchanged',async()=>{
 const e=await engine();fund(e);
 const expected=[129.12256130376875,142.50610847939998,49.295896256367335,169.29776569443766,235.80838707262743,119.31025864871526,114.93256436846976,169.11773416563327,88.19323582619853];
 assert.deepEqual(w.waterways.slice(0,9).map(r=>r.nm),expected);
 for(const id of ['yangzhou','jiujiang']){
  const ci=city(id),links=w.waterways.filter(r=>r.a===ci||r.b===ci);
  assert.equal(links.length,id==='yangzhou'?2:3);
  for(let i=0;i<links.length;i++)for(let j=i+1;j<links.length;j++){
   const common=links[i].displayPoints.filter(p=>links[j].displayPoints.some(q=>q.x===p.x&&q.y===p.y));
   assert.deepEqual(common,[display(w.cities[ci])]);
  }
 }
 for(const stops of [['shanghai','yichang'],['nanjing','nanchang']].map(pair=>pair.map(city))){
  open(e,stops);const paths=e.view().paths,f=paths[`sea:${stops[0]}:${stops[1]}`];assert.equal(f.length,1);
  for(const id of stops[0]===city('shanghai')?['yangzhou','jiujiang']:['jiujiang'])assert.ok(f[0].some(p=>JSON.stringify(p)===JSON.stringify(display(w.cities[city(id)]))));
  assert.deepEqual(paths[`sea:${stops[1]}:${stops[0]}`],f.toReversed().map(l=>l.toReversed()));
 }
});

test('revision28 saves append Shanghai-Suzhou without changing the existing campaign',async()=>{
 const e=await engine(),old=JSON.parse(gunzipSync(fs.readFileSync('tests/fixtures/yangtze-before-display-28.json.gz')));
 assert.equal(old.city_version,28);e.load(old);const after=e.save();assert.equal(after.city_version,30);assert.equal(after.roads.length,356);
 const prior=structuredClone(after);prior.city_version=28;prior.roads.pop();assert.deepEqual(prior,old);
 e.load(after);assert.deepEqual(e.save(),after);
 for(const stops of [['shanghai','suzhou'],['suzhou','shanghai']].map(pair=>pair.map(city))){assert.ok(e.query({query:'connection',stops}).types.includes('caravan'));open(e,stops,'caravan');}
 e.load(e.save());
});

test('Yueyang-Changsha is a Sloop-only Dongting/Xiang branch and delivers from the ocean',async()=>{
 const e=await engine();fund(e);const a=city('yueyang'),b=city('changsha'),r=w.waterways.find(r=>r.id==='yueyang_changsha');
 assert.equal(w.cities[b].riverPort,true);assert.equal(w.cities[b].inland,true);assert.equal(r.river,'Dongting / Xiang');assert.equal(w.roads.find(r=>r.id==='yueyang_changsha').retired_since,30);
 assert.deepEqual(r.displayPoints[0],display(w.cities[a]));assert.deepEqual(r.displayPoints.at(-1),display(w.cities[b]));
 for(const main of w.waterways.filter(w=>w.id!=='yueyang_changsha'&&(w.a===a||w.b===a))){const shared=r.displayPoints.filter(p=>main.displayPoints.some(q=>p.x===q.x&&p.y===q.y));assert.deepEqual(shared,[display(w.cities[a])]);}
 const stops=['ningbo','changsha'].map(city);open(e,stops);const g=e.save();for(const c of g.companies.slice(1))for(const route of c.routes)route.active=false;
 for(let i=0;i<w.goods.length;i++){g.markets[stops[0]*w.goods.length+i].stock=2000;g.markets[stops[1]*w.goods.length+i].stock=0;}e.load(g);
 const path=e.view().paths[`sea:${stops[0]}:${stops[1]}`].flat();assert.ok(path.some(p=>p.x===r.displayPoints[0].x&&p.y===r.displayPoints[0].y));
 let moving=false;for(let day=0;day<90;day++){e.cmd({action:'tick',days:1});const save=e.save(),s=save.companies[0].ships[0];const trip=s.voyage??s.handling?.trip;if(trip)assert.ok(stops.includes(trip.from)&&stops.includes(trip.to));if(s.voyage&&!moving){e.load(save);assert.deepEqual(e.save(),save);moving=true;}}
 assert.ok(moving);assert.ok(e.save().companies[0].routes[0].deliveries>0);e.load(e.save());
});

test('revision29 Yueyang land convoy and road assets migrate once without changing unrelated routes',async()=>{
 const e=await engine(),old=JSON.parse(gunzipSync(fs.readFileSync('tests/fixtures/yueyang-land-29.json.gz'))),road=w.roads.findIndex(r=>r.id==='yueyang_changsha');
 assert.equal(old.city_version,29);e.load(old);const after=e.save(),p=after.companies[0],prior=old.companies[0];assert.equal(after.city_version,30);
 assert.equal(p.cash,prior.cash+old.roads[road].basis+old.roads[road].pool+100);assert.deepEqual(p.routes,prior.routes.slice(1));assert.deepEqual(p.ships.slice(1),prior.ships.slice(1));
 assert.equal(p.ships[0].id,prior.ships[0].id);assert.equal(p.ships[0].kind,'caravan');assert.equal(p.ships[0].route,null);assert.equal(p.ships[0].voyage,null);assert.deepEqual(p.ships[0].cargo,[]);
 assert.deepEqual(after.markets,old.markets);assert.deepEqual(after.development,old.development);assert.equal(after.rng,old.rng);assert.equal(after.next_id,old.next_id);
 assert.equal(after.roads[road].owner,'state');assert.equal(after.roads[road].basis,0);assert.equal(after.roads[road].pool,0);
 e.load(after);assert.deepEqual(e.save(),after);
 for(const change of [g=>g.roads[road].pool=-1,g=>g.companies[0].ships[0].cargo[0].cost=-1]){const bad=structuredClone(old);change(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 for(const command of [{action:'buyRoad',road},{action:'roadInvestment',road,roadBudget:100,securityBudget:0}])assert.throws(()=>e.cmd(command));
});

test('Yangtze network uses Poyang, ends at Yichang and reaches the ocean through Shanghai',()=>{
 assert.equal(w.cities.length,323);assert.equal(w.nations.length,52);assert.equal(w.roads.length,356);assert.equal(w.roads.filter(r=>!r.retired).length,330);assert.equal(w.waterways.length,10);
 assert.equal(city('shanghai'),320);assert.ok(ids.every(id=>w.cities[city(id)].inland));
 assert.equal(w.riverMouths.length,1);const mouth=w.riverMouths[0];assert.equal(mouth.a,city('shanghai'));assert.deepEqual(mouth.coordinates.at(-1),RIVER_MOUTHS.yangtze.gateway);
 assert.equal(w.waterAccess.length,w.cities.filter(c=>!c.inland).length);
 for(const r of w.waterways.filter(r=>Object.hasOwn(YANGTZE_WATERWAYS,r.id))){assert.ok(r.nm>0);assert.deepEqual(r.nations,[w.cities[city('yangzhou')].nation]);assert.ok(r.points.length>3);assert.ok([r.a,r.b].every(i=>ids.includes(w.cities[i].id)));}
 for(const id of ['jiujiang_nanchang']){const r=w.waterways.find(x=>x.id===id);assert.ok(r.river.includes('Poyang'));assert.ok(r.points.some(p=>Math.abs(p.x-(116.23+180)*2.5)<1e-8&&Math.abs(p.y-(90-29.74)*2.5)<1e-8),'Hukou junction');}
 assert.ok(!w.roads.find(r=>r.id==='yichang_chongqing').retired);
 // Every virtual-mouth ocean attachment follows the existing offshore mesh.
 const segments=new Map();for(const id of Object.keys(PORT_APPROACHES)){const points=seaFromGateway(RIVER_MOUTHS.yangtze.gateway,id),gateway=PORT_APPROACHES[id].at(-1);const last=points.findIndex(p=>p[0]===gateway[0]&&p[1]===gateway[1]);assert.ok(last>=0,id);for(let i=1;i<=last;i++)segments.set(JSON.stringify([points[i-1],points[i]].sort()),[points[i-1],points[i]]);}
 for(const [key,[a,b]]of segments)assert.ok(waterSegment(a,b),key);
});

test('all requested river links and ocean connections allow only Sloop hulls and enforce total range',async()=>{
 const e=await engine();fund(e);
 const links=w.waterways.filter(r=>Object.hasOwn(YANGTZE_WATERWAYS,r.id)).map(r=>[r.a,r.b]);
 for(const stops of [...links,...ids.filter(id=>id!=='shanghai').map(id=>[city('ningbo'),city(id)])])for(const points of [stops,stops.toReversed()]){
  const q=e.query({query:'connection',stops:points});assert.equal(q.waterway,true);assert.deepEqual(q.types,['sloop']);
  for(const kind of ['brig','fluyt','galleon','caravan','wagon'])assert.throws(()=>e.query({query:'opening',kind,stops:points}));
  open(e,points);const paths=e.view().paths,forward=paths[`sea:${points[0]}:${points[1]}`];assert.ok(forward.length);assert.deepEqual(paths[`sea:${points[1]}:${points[0]}`],forward.toReversed().map(p=>p.toReversed()));
 }
 assert.ok(e.query({query:'connection',stops:['yichang','chongqing'].map(city)}).types.includes('caravan'));assert.ok(!e.query({query:'connection',stops:['yichang','chongqing'].map(city)}).types.includes('sloop'));
 assert.throws(()=>e.query({query:'opening',kind:'sloop',stops:['london','yichang'].map(city)}));
 for(const kind of ['sloop','brig'])e.cmd({action:'research',kind,budgets:[1000,1000,1000,1000,1000]});const designs=Object.values(e.save().designs),small=designs.find(s=>s.baseHull==='sloop').id,large=designs.find(s=>s.baseHull==='brig').id;
 const stops=['ningbo','yichang'].map(city),q=e.query({query:'connection',stops});assert.ok(q.types.includes(small));assert.ok(!q.types.includes(large));
 const route=e.save().companies[0].routes.find(r=>r.stops.includes(city('ningbo'))&&r.stops.includes(city('yichang'))).id;e.cmd({action:'replace',mode:'route',route,target:small,source:''});const before=e.save();assert.throws(()=>e.cmd({action:'replace',mode:'route',route,target:large,source:''}));assert.deepEqual(e.save(),before);
 const catalog=e.catalog();assert.equal(catalog.waterAccess,undefined);assert.equal(catalog.cities.length,323);
});

test('real 3.3.12 land voyages migrate once while preserving unrelated sea-river services',async()=>{
 const e=await engine(),old=JSON.parse(gunzipSync(fs.readFileSync('tests/fixtures/pre-yangtze-26.json.gz')));assert.equal(old.city_version,26);e.load(old);const g=e.save(),p=g.companies[0];
 assert.equal(g.city_version,30);assert.equal(p.cash,old.companies[0].cash+2700);assert.deepEqual(g.markets.slice(0,old.markets.length),old.markets);assert.deepEqual(g.development.slice(0,old.development.length),old.development);assert.equal(g.rng,old.rng);
 assert.deepEqual(p.routes,[old.companies[0].routes[2]]);assert.deepEqual(p.ships[2],old.companies[0].ships[2]);
 for(let i=0;i<2;i++){assert.equal(p.ships[i].id,old.companies[0].ships[i].id);assert.equal(p.ships[i].kind,old.companies[0].ships[i].kind);assert.equal(p.ships[i].route,null);assert.equal(p.ships[i].voyage,null);assert.deepEqual(p.ships[i].cargo,[]);}
 for(const id of ['yangzhou_nanjing','hankou_yichang']){const i=w.roads.findIndex(r=>r.id===id);assert.equal(g.roads[i].owner,'state');assert.equal(g.roads[i].basis,0);const bad=structuredClone(old);bad.roads[i].basis=-1;assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),g);}
 e.load(g);assert.deepEqual(e.save(),g);
});

test('Ningbo-Yichang trades through the estuary with no intermediate unloading and restores underway',async()=>{
 const e=await engine();fund(e);const stops=['ningbo','yichang'].map(city);open(e,stops);const g=e.save();for(const c of g.companies.slice(1))for(const r of c.routes)r.active=false;
 for(let i=0;i<w.goods.length;i++){g.markets[stops[0]*w.goods.length+i].stock=2000;g.markets[stops[1]*w.goods.length+i].stock=0;}e.load(g);
 const path=e.view().paths[`sea:${stops[0]}:${stops[1]}`].flat();for(const p of w.riverMouths[0].points.slice(1))assert.ok(path.some(q=>q.x===p.x&&q.y===p.y));
 let moving=false;for(let day=0;day<90;day++){e.cmd({action:'tick',days:1});const save=e.save();for(const ship of save.companies[0].ships){const trip=ship.voyage??ship.handling?.trip;if(trip)assert.ok(stops.includes(trip.from)&&stops.includes(trip.to));if(ship.voyage&&!moving){e.load(save);assert.deepEqual(e.save(),save);moving=true;}}}
 const after=e.save();assert.ok(moving);assert.ok(after.companies[0].routes[0].deliveries>0);assert.deepEqual(after.companies[0].routes[0].stops,stops);assert.equal(after.markets.length,323*w.goods.length);e.load(after);assert.deepEqual(e.save(),after);
});


test('three new Yangtze cities and the exact requested river/road network are connected and spaced',async()=>{
 const e=await engine();fund(e);
 assert.deepEqual(w.cities.slice(320).map(c=>c.id),['shanghai','jiujiang','yueyang']);
 const links=['shanghai_yangzhou','yangzhou_nanjing','nanjing_jiujiang','jiujiang_hankou','hankou_yueyang','yueyang_yichang','jiujiang_nanchang','yueyang_changsha'];
 assert.deepEqual(Object.keys(YANGTZE_WATERWAYS).sort(),links.sort());
 const roads=[['shanghai','suzhou'],['yangzhou','suzhou'],['nanjing','kaifeng'],['jiujiang','jingdezhen'],['nanchang','jingdezhen'],['nanchang','changsha'],['hankou','kaifeng'],['hankou','xian'],['yichang','chongqing']];
 for(const pair of roads){const stops=pair.map(city),r=w.roads.find(r=>!r.retired&&stops.includes(r.a)&&stops.includes(r.b));assert.ok(r,pair.join('-'));assert.ok(e.query({query:'connection',stops}).types.includes('caravan'));open(e,stops,'caravan');
 const points=r.points.map(p=>({...p}));for(const [at,i]of [[0,r.a],[points.length-1,r.b]]){const c=w.cities[i];points[at]={x:c.displayX??c.x,y:c.displayY??c.y};}for(let i=1;i<points.length;i++)assert.ok(landSegment([points[i-1].x/2.5-180,90-points[i-1].y/2.5],[points[i].x/2.5-180,90-points[i].y/2.5]));}
 assert.ok(w.roads.find(r=>r.id==='nanjing_suzhou').retired);for(const id of ['jingdezhen_hankou','hankou_changsha'])assert.equal(w.roads.find(r=>r.id===id).retired_since,28);
 const a=w.cities[city('santiagodechile')],b=w.cities[city('valparaiso')],minimum=Math.hypot(a.x-b.x,a.y-b.y);
 for(const c of w.cities.slice(320)){assert.equal(cityNames[c.id].length,5);assert.ok(onLand([c.displayX/2.5-180,90-c.displayY/2.5]));for(const d of w.cities.filter(d=>d!==c))assert.ok(Math.hypot(c.displayX-(d.displayX??d.x),c.displayY-(d.displayY??d.y))>=minimum-1e-8,c.id+' '+d.id);}
 const circuit=['shanghai','yangzhou','nanjing','jiujiang','nanchang','jiujiang','hankou','yueyang','yichang','yueyang','hankou','jiujiang'].map(city);open(e,circuit);e.load(e.save());assert.deepEqual(e.save().companies[0].routes.at(-1).stops,circuit);
});

test('real revision27 saves append markets and retire replaced roads without losing existing river fleets',async()=>{
 const e=await engine(),old=JSON.parse(gunzipSync(fs.readFileSync('tests/fixtures/yangtze-before-cities-27.json.gz')));assert.equal(old.city_version,27);e.load(old);const after=e.save(),p=after.companies[0];
 assert.equal(after.city_version,30);assert.equal(after.development.length,323);assert.equal(after.roads.length,356);assert.equal(after.rng,old.rng);assert.equal(after.next_id,old.next_id);
 assert.deepEqual(after.markets.slice(0,old.markets.length),old.markets);assert.deepEqual(after.development.slice(0,320),old.development);
 assert.equal(p.cash,old.companies[0].cash+1350);assert.deepEqual(p.routes,old.companies[0].routes.slice(1));assert.deepEqual(p.ships.slice(1),old.companies[0].ships.slice(1));assert.equal(p.ships[0].route,null);assert.deepEqual(p.ships[0].cargo,[]);
 for(const change of [g=>g.markets.at(-1).stock=-1,g=>g.companies[0].ships[0].cargo[0].cost=-1,g=>g.development.push(g.development[0]),g=>g.companies[0].routes[1].stops[0]=320]){const bad=structuredClone(old);change(bad);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),after);}
 e.load(after);assert.deepEqual(e.save(),after);e.cmd({action:'tick',days:31});e.load(e.save());
});


test('Shanghai admits every sea hull from the ocean, while upstream legs remain Sloop-only',async()=>{
 const e=await engine();fund(e);const stops=['ningbo','shanghai'].map(city);
 assert.ok(w.waterAccess.every(a=>a.allShips));
 for(const points of [stops,stops.toReversed()]){
  const connection=e.query({query:'connection',stops:points});assert.equal(connection.waterway,false);
  for(const kind of w.specs.filter(s=>s.mode==='sea').map(s=>s.id)){
   assert.ok(connection.types.includes(kind),kind);const q=e.query({query:'opening',kind,stops:points});
   assert.equal(q.longest,w.waterAccess.find(a=>a.b===city('ningbo')).nm);
  }
 }
 const route=open(e,stops,'galleon');assert.equal(e.view().companies[0].routes.find(r=>r.id===route).waterway,false);
 e.cmd({action:'research',kind:'brig',budgets:[1000,1000,1000,1000,1000]});const design=Object.values(e.save().designs).find(s=>s.baseHull==='brig').id;
 assert.ok(e.query({query:'connection',stops}).types.includes(design));
 const combined=['ningbo','shanghai','nanjing'].map(city);
 assert.deepEqual(e.query({query:'connection',stops:combined}).types,['sloop']);
 for(const points of [combined,combined.toReversed()])for(const kind of ['brig','galleon',design])assert.throws(()=>e.query({query:'opening',kind,stops:points}));
 const current=e.save();e.load(current);assert.deepEqual(e.save(),current);
 e.cmd({action:'tick',days:31});e.load(e.save());
});

test('bulk hull and automation replacement skips restricted services and prices only eligible ships',async()=>{
 const e=await engine();fund(e);
 const sea=open(e,['ningbo','shanghai'].map(city));
 const river=open(e,['shanghai','yangzhou'].map(city));
 const mixed=open(e,['stjohns','montreal'].map(city));
 const extra=e.cmd({action:'buyShip',kind:'sloop'});e.cmd({action:'assign',route:river,ship:extra});
 const idle=e.cmd({action:'buyShip',kind:'sloop'});
 let base=e.save();base.day=50;e.load(base);base=e.save();
 const player=base.companies[0],restricted=[river,mixed],spec=kind=>w.specs.find(s=>s.id===kind);
 const q=e.query({query:'replacement',mode:'type',source:'sloop',target:'brig'});
 assert.equal(q.count,2);assert.equal(q.skipped,3);assert.deepEqual(q.skippedRoutes,restricted);assert.ok(q.ships.includes(idle));
 assert.equal(q.purchase,2*spec('brig').price);assert.equal(q.sale,2*spec('sloop').price);
 assert.deepEqual(e.save(),base,'quotes do not mutate the game');
 const poor=structuredClone(base);poor.companies[0].initial_cash+=q.cost-1-poor.companies[0].cash;poor.companies[0].cash=q.cost-1;e.load(poor);const poorBefore=e.save();
 assert.equal(e.query({query:'replacement',mode:'type',source:'sloop',target:'brig'}).affordable,false);
 assert.throws(()=>e.cmd({action:'replace',mode:'type',source:'sloop',target:'brig'}));assert.deepEqual(e.save(),poorBefore);
 e.load(base);e.cmd({action:'replace',mode:'type',source:'sloop',target:'brig'});
 const after=e.save(),p=after.companies[0];assert.equal(p.cash,player.cash-q.cost);
 for(const s of p.ships)if(restricted.includes(s.route))assert.deepEqual(s,player.ships.find(old=>old.id===s.id));else assert.equal(s.kind,'brig');
 for(const id of restricted)assert.deepEqual(p.routes.find(r=>r.id===id),player.routes.find(r=>r.id===id),'skipped schedules and statistics stay intact');
 e.load(after);assert.deepEqual(e.save(),after);
 const empty=e.query({query:'replacement',mode:'type',source:'sloop',target:'brig'});assert.equal(empty.count,0);assert.equal(empty.skipped,3);assert.equal(empty.affordable,false);
 assert.throws(()=>e.cmd({action:'replace',mode:'type',source:'sloop',target:'brig'}));assert.deepEqual(e.save(),after);
 e.load(base);const auto=e.query({query:'replacement',mode:'automation',source:'sloop',target:'brig'});assert.equal(auto.count,1);assert.equal(auto.skipped,2);assert.deepEqual(auto.routes,[sea]);
 e.cmd({action:'replace',mode:'automation',source:'sloop',target:'brig'});const autoAfter=e.save();assert.equal(autoAfter.companies[0].cash,player.cash);assert.deepEqual(autoAfter.companies[0].ships,player.ships);
 for(const r of autoAfter.companies[0].routes)if(r.id===sea)assert.equal(r.auto_type,'brig');else assert.deepEqual(r,player.routes.find(old=>old.id===r.id));
 const none=e.query({query:'replacement',mode:'automation',source:'sloop',target:'brig'});assert.equal(none.count,0);assert.equal(none.skipped,2);assert.equal(none.affordable,false);
 assert.throws(()=>e.cmd({action:'replace',mode:'automation',source:'sloop',target:'brig'}));assert.deepEqual(e.save(),autoAfter);
 e.load(base);for(const kind of ['sloop','brig'])e.cmd({action:'research',kind,budgets:[1000,1000,1000,1000,1000]});
 const small=Object.values(e.save().designs).find(s=>s.baseHull==='sloop').id,large=Object.values(e.save().designs).find(s=>s.baseHull==='brig').id;
 assert.equal(e.query({query:'replacement',mode:'type',source:'sloop',target:large}).skipped,3);
 for(const mode of ['type','automation']){const quote=e.query({query:'replacement',mode,source:'sloop',target:small});assert.equal(quote.skipped,0);assert.equal(quote.count,mode==='type'?5:3);e.cmd({action:'replace',mode,source:'sloop',target:small});}
 assert.ok(e.save().companies[0].ships.every(s=>s.kind===small));assert.ok(e.save().companies[0].routes.every(r=>r.auto_type===small));e.load(e.save());
});
