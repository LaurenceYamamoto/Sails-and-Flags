import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bridgeWithPosts as bridge} from './post-fixture.js';

test('bulk escorts separate modes, include paused waterways, preserve rivals and persist with correct costs',async()=>{
 const {instance}=await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'));
 const call=bridge(instance),cmd=command=>call({op:'command',command}),save=()=>JSON.parse(call({op:'save'})),load=g=>call({op:'load',text:JSON.stringify(g)});
 cmd({action:'new',seed:1700,events:false});
 const data=call({op:'catalog'}),city=id=>data.cities.findIndex(c=>c.id===id);
 const groups=()=>call({op:'view'}).escortGroups;
 assert.ok(groups().every(g=>g.count===0&&g.current===null&&g.daily===0));
 cmd({action:'bulkEscorts',mode:'sea',escorts:3});
 let g=save();g.companies[0].initial_cash=1e8;g.companies[0].cash=1e8;g.companies[0].licenses=data.nations.map((_,i)=>i);load(g);
 const open=(a,b,kind)=>cmd({action:'openRoute',kind,stops:[city(a),city(b)],allowed:[0],margin:100});
 open('kingston','havana','sloop');open('shanghai','yangzhou','sloop');open('cairo','suez','caravan');
 const routes=save().companies[0].routes,sea=routes.filter(r=>r.mode==='sea'),land=routes.find(r=>r.mode==='land');
 cmd({action:'route',route:sea[1].id,active:false,escorts:1});
 assert.equal(groups()[0].current,null);
 assert.equal(groups()[0].count,2);
 const before=save();
 cmd({action:'bulkEscorts',mode:'sea',escorts:3});
 const after=save();
 assert.deepEqual(after.companies.slice(1),before.companies.slice(1));
 assert.deepEqual(after.companies[0].routes,before.companies[0].routes.map(r=>r.mode==='sea'?{...r,escorts:3}:r));
 assert.deepEqual(after.companies[0].ships,before.companies[0].ships);
 assert.equal(after.companies[0].cash,before.companies[0].cash);
 assert.equal(groups()[0].daily,24);assert.equal(groups()[0].current,3);
 assert.deepEqual(groups()[0].options.map(o=>o.daily),[0,8,16,24]);
 cmd({action:'bulkEscorts',mode:'land',escorts:2});
 assert.equal(save().companies[0].routes.find(r=>r.id===land.id).escorts,2);
 assert.ok(save().companies[0].routes.filter(r=>r.mode==='sea').every(r=>r.escorts===3));
 assert.equal(groups()[1].daily,8);
 g=save();load(g);assert.deepEqual(save(),g);
 for(const invalid of [{mode:'river',escorts:1},{mode:'SEA',escorts:1},{escorts:1},...[undefined,-1,4,1.5,'2',null,4294967296].map(escorts=>({mode:'sea',escorts}))]){
  assert.throws(()=>cmd({action:'bulkEscorts',...invalid}));assert.deepEqual(save(),g);
 }
 cmd({action:'tick',days:1});
 const fees=save().companies[0].ledger.filter(e=>e.category==='escort');
 assert.equal(fees.reduce((sum,e)=>sum+e.amount,0),-32);
 cmd({action:'bulkEscorts',mode:'sea',escorts:0});
 assert.equal(groups()[0].daily,0);assert.equal(groups()[1].daily,8);
 open('london','nantes','sloop');
 assert.equal(save().companies[0].routes.at(-1).escorts,0);
});
