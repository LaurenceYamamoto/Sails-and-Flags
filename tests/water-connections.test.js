import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
const world=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));
const binary=fs.readFileSync('assets/wasm/engine.wasm');
const city=id=>world.cities.findIndex(c=>c.id===id);
async function engine(){const {instance}=await WebAssembly.instantiate(binary);const call=bridge(instance);const e={cmd:command=>call({op:'command',command}),query:request=>call({op:'query',request}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),view:()=>call({op:'view'})};e.cmd({action:'new',seed:1700,events:false});const g=e.save();g.companies[0].cash+=1e9;g.companies[0].initial_cash+=1e9;g.companies[0].technology[0]=30;e.load(g);return e;}
function open(e,stops,kind='sloop'){for(const nation of e.query({query:'opening',stops,kind}).missing)e.cmd({action:'license',nation});return e.cmd({action:'openRoute',stops,kind,allowed:world.goods.map((_,i)=>i),margin:10});}
const [johns,quebec,montreal,albany,newyork]=['stjohns','quebec','montreal','albany','newyork'].map(city);
const stlawrence=world.waterways.find(w=>w.id==='quebec_montreal'),hudson=world.waterways.find(w=>w.id==='newyork_albany');
const reversed=lines=>[...lines].reverse().map(l=>[...l].reverse());

test('ocean-river and river-ocean-river through services use summed distances and continuous geometry',async()=>{
 const e=await engine();
 for(const [a,b,nm,via]of [[johns,montreal,world.distances[johns][quebec]+stlawrence.nm,[quebec]],[albany,montreal,hudson.nm+world.distances[newyork][quebec]+stlawrence.nm,[newyork,quebec]]]){
  for(const stops of [[a,b],[b,a]]){const q=e.query({query:'connection',stops});assert.equal(q.waterway,true);assert.deepEqual(q.types,['sloop']);const quote=e.query({query:'opening',kind:'sloop',stops});assert.ok(Math.abs(quote.longest-nm)<1e-8);assert.deepEqual(quote.travelDays,[Math.ceil(nm/150),Math.ceil(nm/150)]);for(const kind of ['brig','fluyt','galleon','wagon','caravan'])assert.throws(()=>e.query({query:'opening',kind,stops}));}
  open(e,[a,b]);const v=e.view(),forward=v.paths[`sea:${a}:${b}`];assert.ok(forward.length);assert.deepEqual(v.paths[`sea:${b}:${a}`],reversed(forward));
  for(const i of [a,...via,b])assert.ok(forward.flat().some(p=>p.x===world.cities[i].x&&p.y===world.cities[i].y),'path includes '+world.cities[i].id);
  const riverPoints=stlawrence.points;for(const p of riverPoints)assert.ok(forward.flat().some(q=>q.x===p.x&&q.y===p.y));
 }
 // Pure ocean voyages still allow larger hulls and use the original matrix.
 const sea=e.query({query:'opening',kind:'brig',stops:[johns,quebec]});assert.equal(sea.waterway,false);assert.equal(sea.longest,world.distances[johns][quebec]);
 for(const inland of ['detroit','osaka','kyoto'])assert.ok(!e.query({query:'connection',stops:[johns,city(inland)]}).types.includes('sloop'));
 assert.throws(()=>e.query({query:'opening',kind:'sloop',stops:[city('london'),montreal]}),'whole through leg must fit range');
});

test('through services restrict designs, assignment, managed renewal, scaling and save loads to the Sloop family',async()=>{
 const e=await engine(),stops=[johns,montreal],route=open(e,stops);
 for(const kind of ['sloop','brig'])e.cmd({action:'research',kind,budgets:[1000,1000,1000,1000,1000]});
 const designs=Object.values(e.save().designs),small=designs.find(d=>d.baseHull==='sloop').id,large=designs.find(d=>d.baseHull==='brig').id;
 e.cmd({action:'rename',kind:'design',id:large,name:'Sloop'});const types=e.query({query:'connection',stops}).types;assert.ok(types.includes(small));assert.ok(!types.includes(large));
 e.cmd({action:'routePolicy',policy:{enabled:true,ships:[large,small],vehicles:[]}});e.cmd({action:'automation',enabled:true,replaceLost:true,budget:1e7,reserve:0,expand:0,shrink:100});e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].ships[0].kind,small);e.cmd({action:'route',route,kind:small,auto:true});const ship=e.cmd({action:'buyShip',kind:'brig'}),before=e.save();
 for(const command of [{action:'assign',route,ship},{action:'route',route,kind:large}]){assert.throws(()=>e.cmd(command));assert.deepEqual(e.save(),before);}
 for(const mutate of [g=>g.companies[0].ships[0].kind='brig',g=>g.companies[0].routes[0].auto_type=large,g=>g.companies[0].routes[0].replacements=['brig'],g=>g.companies[0].licenses.splice(g.companies[0].licenses.indexOf(world.cities[quebec].nation),1)]){const g=structuredClone(before);mutate(g);assert.throws(()=>e.load(g));assert.deepEqual(e.save(),before);}
 e.cmd({action:'automation',enabled:true,replaceLost:true,budget:50000,reserve:0,expand:10,shrink:30});const g=e.save();g.day=100;const r=g.companies[0].routes[0];r.cooldown=0;r.activity={since:0,moving:100,loading:20,unloading:20,waiting:0};g.companies[0].ships.forEach(s=>s.ready=10000);e.load(g);e.cmd({action:'tick',days:1});assert.equal(e.save().companies[0].ships.filter(s=>s.route===route&&s.kind===small).length,2);
});

test('direct ocean-river journeys deliver only at requested stops and restore while underway',async()=>{
 const e=await engine(),stops=[johns,montreal];open(e,stops);const g=e.save();for(const c of g.companies.slice(1))for(const r of c.routes)r.active=false;
 for(let i=0;i<world.goods.length;i++){g.markets[johns*world.goods.length+i].stock=2000;g.markets[montreal*world.goods.length+i].stock=0;}e.load(g);
 let moving=false,handling=false;for(let day=0;day<60;day++){
  e.cmd({action:'tick',days:1});const save=e.save(),p=save.companies[0];assert.deepEqual(p.routes[0].stops,[...stops].sort((a,b)=>world.cities[a].order-world.cities[b].order));
  for(const s of p.ships){const trip=s.voyage??s.handling?.trip;if(trip){assert.ok(stops.includes(trip.from)&&stops.includes(trip.to));assert.notEqual(trip.from,trip.to);}if(s.voyage&&!moving){e.load(save);assert.deepEqual(e.save(),save);moving=true;}if(s.handling)handling=true;}
 }
 assert.ok(moving&&handling);const after=e.save();assert.ok(after.companies[0].routes[0].deliveries>0);assert.ok(after.companies[0].routes[0].activity.unloading>0);e.load(after);assert.deepEqual(e.save(),after);assert.equal(e.view().companies[0].routes[0].waterway,true);
});
