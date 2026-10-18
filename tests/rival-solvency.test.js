import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bridge} from '../src/wasm-bridge.js';
import {RIVAL_STARTS} from '../src/rival-starts.js';
import {postFixture} from './post-fixture.js';
let call;
async function engine(){
 call??=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance);
 call({op:'command',command:{action:'new',seed:1700,events:false}});
 return {call,cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)}),data:call({op:'catalog'})};
}
const advance=(e,days)=>{while(days>0){const n=Math.min(30,days);e.cmd({action:'tick',days:n});days-=n;}};

test('rivals start with exactly one configured random post, no fleet, and unchanged capital/charters',async()=>{
 const e=await engine(),chosen=new Map();
 for(let seed=1700;seed<1730;seed++){
  e.cmd({action:'new',seed,events:false});const g=e.save();assert.equal(g.companies[0].cash,5000);assert.deepEqual(g.companies[0].posts,{});
  for(const [i,start]of RIVAL_STARTS.entries()){
   const c=g.companies[i+1],cities=Object.keys(c.posts).map(n=>e.data.cities[n].id);assert.equal(cities.length,1);assert.ok(start.posts.includes(cities[0]));
   assert.equal(c.cash,start.capital);assert.equal(c.initial_cash,start.capital);assert.deepEqual(c.routes,[]);assert.deepEqual(c.ships,[]);assert.equal(Object.values(c.posts)[0].warehouse,0);assert.equal(Object.values(c.posts)[0].handling,0);
   assert.deepEqual(c.licenses.map(n=>e.data.nations[n].id),start.licenses);assert.equal(c.friendship[c.licenses[0]],100);
   if(!chosen.has(c.id))chosen.set(c.id,new Set());chosen.get(c.id).add(cities[0]);
  }
  e.cmd({action:'new',seed,events:false});assert.deepEqual(e.save(),g);e.load(g);assert.deepEqual(e.save(),g);
 }
 for(const start of RIVAL_STARTS)if(start.posts.length>1)assert.equal(chosen.get(start.id).size,start.posts.length);
});

test('first services use existing posts, and new routes have exactly two ordered licensed endpoints',async()=>{
 const e=await engine(),initial=e.save();e.cmd({action:'tick',days:1});const g=e.save();
 for(const c of g.companies.slice(1)){
  assert.deepEqual(Object.keys(c.posts),Object.keys(initial.companies.find(x=>x.id===c.id).posts));assert.ok(c.routes.length>0,c.id);
  for(const r of c.routes){assert.equal(r.stops.length,2);assert.ok(e.data.cities[r.stops[0]].order<e.data.cities[r.stops[1]].order);assert.ok(r.stops.some(i=>c.posts[i]));assert.ok(r.stops.every(i=>c.licenses.includes(e.data.cities[i].nation)));}
 }
 const saved=e.save();advance(e,62);const end=e.save();e.load(saved);advance(e,62);assert.deepEqual(e.save(),end);
});

// Use a genuine player-created service to exercise AI withdrawal without a
// special gameplay command or fabricated route/vessel structure.
async function withdrawalFixture(){
 const e=await engine(),city=id=>e.data.cities.findIndex(c=>c.id===id);
 e.cmd({action:'license',nation:e.data.nations.findIndex(n=>n.id==='japan')});e.cmd({action:'buildPost',city:city('osaka')});e.cmd({action:'openRoute',kind:'sloop',stops:[city('osaka'),city('nagasaki')],allowed:[0]});
 const g=e.save(),p=g.companies[0],c=g.companies[8];
 c.routes=p.routes;c.ships=p.ships;c.posts=p.posts;p.routes=[];p.ships=[];p.posts={};
 for(const other of g.companies.slice(1))if(other!==c)other.acquired=true;
 g.day=200;c.cash=10000;c.initial_cash=10000;c.totals={};c.ledger=[];
 const r=c.routes[0],s=c.ships[0];r.transport={since:0,sales:100000,costs:99000,upkeep:200,deliveries:10};
 c.rival_state={routes:{[r.id]:{day:100,since:0,sales:100000,costs:98000,upkeep:0,daily:30}},posts:Object.fromEntries(Object.keys(c.posts).map(i=>[i,0])),closed:[],closed_posts:{}};
 s.cargo=[{good:0,quantity:5,cost:100}];s.voyage={from:r.stops[0],to:r.stops[1],total:2,remaining:1,original_cost:100,upkeep:0,direct_sale:true};s.handling=null;
 return {e,g,c,r};
}
function addSurvivingRoute({e,g,c,r}) {
 const other=structuredClone(r);other.id=g.next_id++;other.stops=[e.data.cities.findIndex(x=>x.id==='osaka'),e.data.cities.findIndex(x=>x.id==='edo')].sort((a,b)=>e.data.cities[a].order-e.data.cities[b].order);c.routes.push(other);
 const ship=structuredClone(c.ships[0]);ship.id=g.next_id++;ship.route=other.id;ship.cargo=[];ship.voyage=null;ship.handling=null;ship.next=0;ship.ready=9999;c.ships.push(ship);
 c.rival_state.routes[other.id]={day:200,since:0,sales:other.transport.sales,costs:other.transport.costs,upkeep:other.transport.upkeep,daily:30};
 return other;
}

test('recent losses retire a busy route, settle cargo, sell its vessel and keep the last service',async()=>{
 const f=await withdrawalFixture(),{e,g,c,r}=f,other=addSurvivingRoute(f);e.load(g);e.cmd({action:'tick',days:1});const after=e.save().companies[8];
 assert.ok(r.transport.sales>r.transport.costs+r.transport.upkeep);assert.deepEqual(after.routes.map(r=>r.id),[other.id]);assert.equal(after.ships.length,1);assert.equal(after.totals.routeReorganization,100);assert.equal(after.totals.shipSale,1800);
 assert.ok(after.rival_state.closed.some(x=>x.until===381));assert.equal(Object.keys(after.posts).length,1);assert.ok(!after.bankrupt);
 advance(e,20);assert.ok(!e.save().companies[8].routes.some(x=>x.mode===r.mode&&x.stops.every(i=>r.stops.includes(i))));e.load(e.save());
});

test('uneconomic extra posts close without refunds while the last post and last route remain',async()=>{
 const f=await withdrawalFixture(),{e,g,c,r}=f,other=addSurvivingRoute(f),osaka=e.data.cities.findIndex(x=>x.id==='osaka'),edo=e.data.cities.findIndex(x=>x.id==='edo');
 c.posts[osaka].basis=500;c.posts[edo]=postFixture(e.data.goods.length);c.rival_state.posts[edo]=0;c.rival_state.routes[r.id]={day:100,since:0,sales:99800,costs:99000,upkeep:200,daily:30};
 e.load(g);e.cmd({action:'tick',days:1});const after=e.save().companies[8];assert.deepEqual(Object.keys(after.posts),[String(edo)]);assert.deepEqual(after.routes.map(r=>r.id),[other.id]);assert.equal(after.totals.routeReorganization,100);assert.equal(after.totals.shipSale,1800);
 assert.ok(!Object.keys(after.totals).some(k=>/post.*refund/i.test(k)));e.load(e.save());
});

test('last post cannot close indirectly through its last route, even with recent losses',async()=>{
 const {e,g,c,r}=await withdrawalFixture();e.load(g);e.cmd({action:'tick',days:1});const after=e.save().companies[8];
 assert.deepEqual(Object.keys(after.posts),Object.keys(c.posts));assert.deepEqual(after.routes.map(x=>x.id),[r.id]);assert.equal(after.totals.shipSale,undefined);assert.equal(after.totals.routeReorganization,undefined);assert.ok(!after.bankrupt);e.load(e.save());
});

test('emergency liquidation sells extra services before upkeep and old 4.0.0 saves keep their assets on load',async()=>{
 const f=await withdrawalFixture(),{e,g,c,r}=f;addSurvivingRoute(f);c.cash=1;c.initial_cash=1;c.rival_state.routes[r.id].day=200;c.rival_state.routes[r.id].daily=-10;
 e.load(g);e.cmd({action:'tick',days:1});const after=e.save().companies[8];assert.ok(!after.bankrupt);assert.ok(after.cash>1);assert.equal(after.ships.length,1);assert.equal(after.routes.length,1);assert.equal(Object.keys(after.posts).length,1);e.load(e.save());
 const old=bridge((await WebAssembly.instantiate(execFileSync('git',['show','4.0.0:assets/wasm/engine.wasm'],{maxBuffer:30e6}))).instance);const before=JSON.parse(old({op:'save'}));e.load(before);assert.deepEqual(e.save(),before);advance(e,31);e.load(e.save());
});

test('bankruptcy removes all private assets and the company from views without refunds or resurrection',async()=>{
 for(const alreadyBankrupt of [false,true]) {
  const {e,g,c}=await withdrawalFixture();c.cash=alreadyBankrupt?-1:1;c.initial_cash=1;c.totals=alreadyBankrupt?{upkeep:-2}:{};c.bankrupt=alreadyBankrupt;
  for(const key of Object.keys(c.posts))c.rival_state.posts[key]=200;
  const post=Object.values(c.posts)[0];post.warehouse=1;post.basis=1000;post.stock=[{good:0,quantity:3,cost:60,from:null}];
  const road=e.data.roads.findIndex(r=>!r.retired&&r.nations.every(n=>c.licenses.includes(n)));assert.ok(road>=0);Object.assign(g.roads[road],{owner:c.id,basis:100,pool:50,road_budget:1,security_budget:1,quality:2});
  const playerCash=g.companies[0].cash,otherPosts=structuredClone(g.companies[9].posts);
  e.load(g);if(!alreadyBankrupt)e.cmd({action:'tick',days:1});let end=e.save(),dead=end.companies[8];
  assert.ok(dead.bankrupt);for(const list of ['routes','ships','licenses','designs'])assert.deepEqual(dead[list],[]);assert.deepEqual(dead.posts,{});assert.equal(dead.rival_state,undefined);assert.ok(dead.tech_budget.every(n=>n===0));
  assert.equal(dead.totals.shipSale,undefined);assert.equal(dead.totals.routeReorganization,undefined);assert.equal(end.roads[road].owner,'state');assert.equal(end.roads[road].basis,0);assert.equal(end.roads[road].pool,0);assert.equal(end.roads[road].quality,2);
  assert.equal(end.companies[0].cash,playerCash+(end.companies[0].totals.licenseDaily??0));assert.deepEqual(end.companies[9].posts,otherPosts);assert.equal(end.companies.length,15);
  assert.ok(!e.call({op:'view'}).companies.some(x=>x.id===dead.id));assert.throws(()=>e.call({op:'query',request:{query:'acquisition',company:8}}));
  e.load(end);assert.deepEqual(e.save(),end);advance(e,62);dead=e.save().companies[8];assert.ok(dead.bankrupt);assert.deepEqual(dead.routes,[]);assert.deepEqual(dead.posts,{});
 }
});

test('loss-making services shrink before closure and get a fresh observation interval',async()=>{
 const f=await withdrawalFixture(),{e,g,c,r}=f;addSurvivingRoute(f);const extra=structuredClone(c.ships[0]);extra.id=g.next_id++;c.ships.push(extra);
 e.load(g);e.cmd({action:'tick',days:1});let after=e.save().companies[8];assert.ok(after.routes.some(x=>x.id===r.id));assert.equal(after.ships.filter(s=>s.route===r.id).length,1);assert.equal(after.totals.shipSale,1800);assert.equal(after.totals.routeReorganization,100);assert.equal(after.rival_state.routes[r.id].daily,null);assert.equal(after.rival_state.routes[r.id].day,201);
 e.cmd({action:'tick',days:1});after=e.save().companies[8];assert.ok(after.routes.some(x=>x.id===r.id));assert.equal(after.totals.shipSale,1800);e.load(e.save());
});

test('an uneconomic expanded post reduces facilities before closure and waits to reassess',async()=>{
 const f=await withdrawalFixture(),{e,g,c,r}=f;addSurvivingRoute(f);const osaka=e.data.cities.findIndex(x=>x.id==='osaka'),edo=e.data.cities.findIndex(x=>x.id==='edo');
 c.posts[osaka].warehouse=2;c.posts[osaka].basis=1500;c.posts[edo]=postFixture(e.data.goods.length);c.rival_state.posts[edo]=200;
 c.rival_state.routes[r.id]={day:100,since:0,sales:99800,costs:99000,upkeep:200,daily:30};e.load(g);e.cmd({action:'tick',days:1});let after=e.save().companies[8];
 assert.equal(after.posts[osaka].warehouse,1);assert.equal(after.posts[osaka].basis,1000);assert.equal(Object.keys(after.posts).length,2);assert.equal(after.routes.length,2);assert.equal(after.rival_state.posts[osaka],201);assert.equal(after.totals.routeReorganization,undefined);
 e.cmd({action:'tick',days:1});after=e.save().companies[8];assert.equal(after.posts[osaka].warehouse,1);assert.equal(after.routes.length,2);e.load(e.save());
});

test('existing saves start a new review interval instead of treating lifetime profits as recent earnings',async()=>{
 const {e,g,c,r}=await withdrawalFixture();delete c.rival_state;e.load(g);e.cmd({action:'tick',days:1});const after=e.save().companies[8],review=after.rival_state.routes[r.id];
 assert.ok(after.routes.some(x=>x.id===r.id));assert.equal(review.day,201);assert.equal(review.sales,100000);assert.equal(review.costs,99000);assert.equal(review.upkeep,200);assert.equal(review.daily,null);e.load(e.save());
});

test('AI review and cooldown validation rejects malformed saves atomically',async()=>{
 const e=await engine();advance(e,31);const before=e.save();
 for(const mutate of [s=>s.closed=[{a:0,b:0,mode:'sea',until:40}],s=>s.posts={9999:0},s=>s.routes={1:{day:99999,since:0,sales:0,costs:0,upkeep:0,daily:null}}]){
  const bad=structuredClone(before);mutate(bad.companies[1].rival_state);assert.throws(()=>e.load(bad));assert.deepEqual(e.save(),before);
 }
});
test('six three-year campaigns retain active competition, bounded state and valid accounting',async()=>{
 const e=await engine();
 for(const events of [false,true])for(const seed of [1700,1701,1702]){
  e.cmd({action:'new',seed,events});advance(e,1080);const g=e.save(),live=g.companies.slice(1).filter(c=>!c.bankrupt);
  assert.equal(g.day,1080);assert.ok(live.length>=12,`${seed}/${events}: ${live.length}`);assert.ok(live.filter(c=>c.routes.some(r=>r.deliveries>0)).length>=12);
  for(const c of g.companies){assert.ok(Math.abs(c.cash-c.initial_cash-Object.values(c.totals).reduce((n,v)=>n+v,0))<1e-5);assert.ok(Number.isFinite(c.cash));}
  assert.ok(live.every(c=>c.routes.length<=50&&c.ships.length<=150&&c.rival_state.closed.length<=100));e.load(g);assert.deepEqual(e.save(),g);
 }
});


test('AI voluntarily returns unused foreign licenses while keeping its home license and last hub',async()=>{
 const e=await engine(),g=e.save(),c=g.companies[9],home=c.licenses[0],foreign=c.licenses[1];
 for(const other of g.companies.slice(1))if(other!==c)other.acquired=true;
 g.day=30;e.load(g);e.cmd({action:'tick',days:1});const after=e.save().companies[9];
 assert.ok(after.licenses.includes(home));assert.ok(!after.licenses.includes(foreign));
 assert.deepEqual(Object.keys(after.posts),Object.keys(c.posts));assert.ok(after.rival_state.released_licenses[foreign]>g.day);
 e.load(e.save());assert.ok(!e.save().companies[9].licenses.includes(foreign));
});
