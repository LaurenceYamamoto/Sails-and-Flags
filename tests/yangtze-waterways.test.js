import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {bridgeWithPosts as bridge} from './post-fixture.js';
import {YANGTZE_WATERWAYS,RIVER_MOUTHS} from '../src/yangtze-waterways.js';
import {landSegment,onLand} from '../src/world-geometry.js';
import {cityNames} from '../src/city-names.js';
import {seaFromGateway,PORT_APPROACHES,waterSegment} from '../src/sea-routing.js';
const w=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const city=id=>w.cities.findIndex(c=>c.id===id),ids=['shanghai','jiujiang','yueyang','yangzhou','nanjing','hankou','yichang','nanchang','changsha'];
const binary=fs.readFileSync('assets/wasm/engine.wasm');
const display=c=>({x:c.displayX??c.x,y:c.displayY??c.y});
const orderedRoute=r=>({...r,buy_below:r.buy_below??0,sell_above:r.sell_above??0,stops:[...r.stops].sort((a,b)=>w.cities[a].order-w.cities[b].order)});
const orderedShip=(s,routes)=>{if(s.route==null)return s;const r=routes.find(r=>r.id===s.route);return {...s,next:orderedRoute(r).stops.indexOf(r.stops[s.next])};};
// Tests in this file run sequentially; reset all game state while reusing immutable world data.
let testCall;
async function engine(){if(!testCall)testCall=bridge((await WebAssembly.instantiate(binary)).instance);else testCall({op:'command',command:{action:'new',seed:1700,events:true}});const call=testCall;return {cmd:command=>call({op:'command',command}),query:request=>call({op:'query',request}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),view:()=>call({op:'view'}),catalog:()=>call({op:'catalog'})};}
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

test('yangtze-before-display-28 saves are rejected before altering trading-post state',async()=>{
 const e=await engine(),before=e.save(),old=JSON.parse(gunzipSync(fs.readFileSync('tests/fixtures/yangtze-before-display-28.json.gz')));assert.throws(()=>e.load(old),/旧版セーブ/);assert.deepEqual(e.save(),before);
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

test('yueyang-land-29 saves are rejected before altering trading-post state',async()=>{
 const e=await engine(),before=e.save(),old=JSON.parse(gunzipSync(fs.readFileSync('tests/fixtures/yueyang-land-29.json.gz')));assert.throws(()=>e.load(old),/旧版セーブ/);assert.deepEqual(e.save(),before);
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
  const q=e.query({query:'connection',stops:points});assert.equal(q.waterway,true);assert.deepEqual(q.types.filter(k=>!['wagon','caravan'].includes(k)),['sloop']);
  for(const kind of ['brig','fluyt','galleon'])assert.throws(()=>e.query({query:'opening',kind,stops:points}));
  open(e,points);const paths=e.view().paths,forward=paths[`sea:${points[0]}:${points[1]}`];assert.ok(forward.length);assert.deepEqual(paths[`sea:${points[1]}:${points[0]}`],forward.toReversed().map(p=>p.toReversed()));
 }
 assert.ok(e.query({query:'connection',stops:['yichang','chongqing'].map(city)}).types.includes('caravan'));assert.ok(!e.query({query:'connection',stops:['yichang','chongqing'].map(city)}).types.includes('sloop'));
 assert.throws(()=>e.query({query:'opening',kind:'sloop',stops:['london','yichang'].map(city)}));
 for(const kind of ['sloop','brig'])e.cmd({action:'research',kind,budgets:[1000,1000,1000,1000,1000]});const designs=Object.values(e.save().designs),small=designs.find(s=>s.baseHull==='sloop').id,large=designs.find(s=>s.baseHull==='brig').id;
 const stops=['ningbo','yichang'].map(city),q=e.query({query:'connection',stops});assert.ok(q.types.includes(small));assert.ok(!q.types.includes(large));
 const route=e.save().companies[0].routes.find(r=>r.stops.includes(city('ningbo'))&&r.stops.includes(city('yichang'))).id;e.cmd({action:'route',route,kind:small});const before=e.save();assert.throws(()=>e.cmd({action:'route',route,kind:large}));assert.deepEqual(e.save(),before);
 const catalog=e.catalog();assert.equal(catalog.waterAccess,undefined);assert.equal(catalog.cities.length,323);
});

test('pre-yangtze-26 saves are rejected before altering trading-post state',async()=>{
 const e=await engine(),before=e.save(),old=JSON.parse(gunzipSync(fs.readFileSync('tests/fixtures/pre-yangtze-26.json.gz')));assert.throws(()=>e.load(old),/旧版セーブ/);assert.deepEqual(e.save(),before);
});

test('Ningbo-Yichang trades through the estuary with no intermediate unloading and restores underway',async()=>{
 const e=await engine();fund(e);const stops=['ningbo','yichang'].map(city);open(e,stops);const g=e.save();for(const c of g.companies.slice(1))for(const r of c.routes)r.active=false;
 for(let i=0;i<w.goods.length;i++){g.markets[stops[0]*w.goods.length+i].stock=2000;g.markets[stops[1]*w.goods.length+i].stock=0;}e.load(g);
 const path=e.view().paths[`sea:${stops[0]}:${stops[1]}`].flat();for(const p of w.riverMouths[0].points.slice(1))assert.ok(path.some(q=>q.x===p.x&&q.y===p.y));
 let moving=false;for(let day=0;day<90;day++){e.cmd({action:'tick',days:1});const save=e.save();for(const ship of save.companies[0].ships){const trip=ship.voyage??ship.handling?.trip;if(trip)assert.ok(stops.includes(trip.from)&&stops.includes(trip.to));if(ship.voyage&&!moving){e.load(save);assert.deepEqual(e.save(),save);moving=true;}}}
 const after=e.save();assert.ok(moving);assert.ok(after.companies[0].routes[0].deliveries>0);assert.deepEqual(after.companies[0].routes[0].stops,[...stops].sort((a,b)=>w.cities[a].order-w.cities[b].order));assert.equal(after.markets.length,323*w.goods.length);e.load(after);assert.deepEqual(e.save(),after);
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
 const circuit=['shanghai','yangzhou','nanjing','jiujiang','nanchang','jiujiang','hankou','yueyang','yichang','yueyang','hankou','jiujiang'].map(city);assert.throws(()=>open(e,circuit));
});

test('yangtze-before-cities-27 saves are rejected before altering trading-post state',async()=>{
 const e=await engine(),before=e.save(),old=JSON.parse(gunzipSync(fs.readFileSync('tests/fixtures/yangtze-before-cities-27.json.gz')));assert.throws(()=>e.load(old),/旧版セーブ/);assert.deepEqual(e.save(),before);
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
 assert.throws(()=>e.query({query:'connection',stops:combined}));assert.deepEqual(e.query({query:'connection',stops:['ningbo','nanjing'].map(city)}).types.filter(k=>!['wagon','caravan'].includes(k)),['sloop']);
 for(const points of [combined,combined.toReversed()])for(const kind of ['brig','galleon',design])assert.throws(()=>e.query({query:'opening',kind,stops:points}));
 const current=e.save();e.load(current);assert.deepEqual(e.save(),current);
 e.cmd({action:'tick',days:31});e.load(e.save());
});

// Bulk replacement was removed. Sea/river policy fallback and renewal are covered in route-management.test.js.
