import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridge} from '../src/wasm-bridge.js';
async function engine(){
 const call=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance);
 return {cmd:command=>call({op:'command',command}),save:()=>JSON.parse(call({op:'save'})),load:g=>call({op:'load',text:JSON.stringify(g)})};
}
test('rival hubs cover every initial pair without redundant endpoint posts or additional capital',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});const g=e.save();
 assert.equal(g.companies[0].cash,5000);assert.deepEqual(g.companies[0].posts,{});
 assert.deepEqual(g.companies.slice(1).map(c=>Object.keys(c.posts).length),[1,2,1,3,2,2,2,1,1,1,1,1,1,1]);
 for(const c of g.companies.slice(1)){
  assert.equal(c.cash,c.initial_cash+Object.values(c.totals).reduce((n,v)=>n+v,0));
  assert.ok(c.routes.every(r=>r.stops.some(i=>c.posts[i])));
  for(const i of Object.keys(c.posts))assert.ok(c.routes.some(r=>r.stops.includes(+i)&&!r.stops.some(j=>j!==+i&&c.posts[j])));
 }
 e.load(g);assert.deepEqual(e.save(),g);
});
test('existing solvent rivals consolidate free redundant posts, but preserve paid facilities and player posts',async()=>{
 const e=await engine();e.cmd({action:'new',seed:1700,events:false});const g=e.save();
 for(const c of g.companies.slice(1))for(const r of c.routes)for(const city of r.stops)c.posts[city]??=structuredClone(Object.values(c.posts)[0]);
 const protectedCompany=g.companies[9];for(const p of Object.values(protectedCompany.posts))p.basis=500;
 g.companies[0].posts=structuredClone(protectedCompany.posts);g.companies[0].licenses=protectedCompany.licenses;
 e.load(g);e.cmd({action:'tick',days:1});const after=e.save();
 assert.equal(Object.keys(after.companies[1].posts).length,1);
 assert.equal(Object.keys(after.companies[9].posts).length,2);
 assert.equal(Object.keys(after.companies[0].posts).length,2);
 assert.ok(after.companies.slice(1).every(c=>c.routes.every(r=>r.stops.some(i=>c.posts[i]))));
 e.load(after);assert.deepEqual(e.save(),after);
});
test('rival campaigns retain active competition and valid accounting over 1080 days',async()=>{
 const e=await engine();
 for(const events of [false,true])for(const seed of [1700,1701,1702]){
  e.cmd({action:'new',seed,events});
  for(let i=0;i<36;i++){
   e.cmd({action:'tick',days:30});
   if(i===11){const live=e.save().companies.slice(1).filter(c=>!c.bankrupt);assert.ok(live.length>=10,`year 1 ${seed}/${events}: ${live.length}`);}
  }
  const g=e.save(),live=g.companies.slice(1).filter(c=>!c.bankrupt);
  assert.equal(g.day,1080);assert.ok(live.length>=8,`year 3 ${seed}/${events}: ${live.length}`);
  assert.ok(live.filter(c=>c.routes.some(r=>r.deliveries>0)).length>=8);
  for(const c of g.companies){assert.ok(Math.abs(c.cash-c.initial_cash-Object.values(c.totals).reduce((n,v)=>n+v,0))<1e-5);assert.ok(Number.isFinite(c.cash));}
  assert.ok(live.every(c=>c.routes.length<=50&&c.ships.length<=150));
  assert.ok(live.some(c=>c.technology[6]>0));
  assert.ok(live.some(c=>c.routes.some(r=>r.started>0)));
  e.load(g);assert.deepEqual(e.save(),g);
 }
});
