import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';

test('license surrender immediately settles ships and warehouses, including inland transit licenses',async()=>{
 const call=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance),cmd=command=>call({op:'command',command}),query=request=>call({op:'query',request}),save=()=>JSON.parse(call({op:'save'})),load=g=>call({op:'load',text:JSON.stringify(g)});
 cmd({action:'new',seed:1700,events:false});const w=call({op:'catalog'}),city=id=>w.cities.findIndex(c=>c.id===id),nation=id=>w.nations.findIndex(n=>n.id===id);
 let g=save();g.companies[0].cash=g.companies[0].initial_cash=1e7;load(g);
 for(const id of ['genoa','tuscany','papal','japan'])cmd({action:'license',nation:nation(id)});
 for(const id of ['genoa','livorno','osaka'])cmd({action:'buildPost',city:city(id)});
 cmd({action:'upgradePost',city:city('livorno'),facility:'warehouse'});
 const open=(a,b,kind)=>{const stops=[city(a),city(b)];for(const n of query({query:'opening',kind,stops}).missing)cmd({action:'license',nation:n});return cmd({action:'openRoute',kind,stops,allowed:[0,1]});};
 const land=open('genoa','rome','caravan'),sea=open('genoa','livorno','sloop'),safe=open('osaka','edo','sloop');
 cmd({action:'autoRoutes',city:city('livorno'),enabled:true});
 g=save();const p=g.companies[0],post=p.posts[city('livorno')];post.stock=[{good:0,quantity:3,cost:30,from:null},{good:0,quantity:4,cost:50,from:null},{good:1,quantity:5,cost:80,from:null}];
 for(const s of p.ships.filter(s=>s.route!==safe)){
  const r=p.routes.find(r=>r.id===s.route),trip={from:r.stops[0],to:r.stops[1],total:3,remaining:s.route===land?3:2,original_cost:100,upkeep:0,direct_sale:true};
  s.cargo=[{good:0,quantity:5,cost:100}];s.voyage=s.route===sea?trip:null;s.handling=s.route===land?{unloading:false,rate:5,total:1,remaining:1,trip}:null;
 }
 const tuscany=nation('tuscany'),road=w.roads.findIndex(r=>!r.retired&&r.nations.includes(tuscany));Object.assign(g.roads[road],{owner:'player',basis:100,pool:50,road_budget:1,security_budget:1});p.diplomacy_budget[tuscany]=4;load(g);
 const before=save(),cash=p.cash,q=query({query:'returnLicense',nation:tuscany});assert.deepEqual(new Set(q.routes),new Set([land,sea]));assert.deepEqual(q.posts,[city('livorno')]);assert.equal(q.ships,2);assert.equal(q.cargoRefund,200);assert.ok(q.stockSale>0);assert.deepEqual(save(),before);
 cmd({action:'returnLicense',nation:tuscany});const after=save(),co=after.companies[0];assert.ok(Math.abs(co.cash-cash-q.cargoRefund-q.stockSale)<1e-7);assert.deepEqual(co.routes.map(r=>r.id),[safe]);assert.equal(co.ships.length,3);
 for(const s of co.ships.filter(s=>s.route!==safe)){assert.equal(s.route,null);assert.equal(s.voyage,null);assert.equal(s.handling,null);assert.deepEqual(s.cargo,[]);}
 assert.ok(!co.licenses.includes(tuscany));assert.ok(!co.posts[city('livorno')]);assert.ok(co.posts[city('genoa')]);assert.ok(co.posts[city('osaka')]);assert.ok(!(co.auto_route_cities??[]).includes(city('livorno')));assert.equal(co.diplomacy_budget[tuscany],0);
 assert.equal(after.roads[road].owner,'state');assert.equal(after.roads[road].basis,0);assert.equal(after.roads[road].pool,0);assert.deepEqual(after.companies.slice(1),before.companies.slice(1));
 assert.equal(after.markets[city('livorno')*w.goods.length].stock,before.markets[city('livorno')*w.goods.length].stock+7);
 assert.throws(()=>cmd({action:'returnLicense',nation:tuscany}));assert.deepEqual(save(),after);load(after);assert.deepEqual(save(),after);
 // The player's home license and last post/route can be surrendered explicitly.
 cmd({action:'returnLicense',nation:nation('japan')});assert.equal(save().companies[0].routes.length,0);assert.ok(!save().companies[0].posts[city('osaka')]);
 cmd({action:'returnLicense',nation:nation('genoa')});assert.deepEqual(save().companies[0].posts,{});load(save());
});
