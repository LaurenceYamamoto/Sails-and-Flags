import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bridge} from '../src/wasm-bridge.js';
import {fleetFixture} from './helpers/fleet-fixture.js';
import {warehouseFixture} from './helpers/warehouse-fleet-fixture.js';
import {postFixture} from './post-fixture.js';
const path=process.env.WAREHOUSE_BASELINE??'sites/warehouse-before.wasm';
const old=fs.existsSync(path)?fs.readFileSync(path):execFileSync('git',['show','4.1.5:assets/wasm/engine.wasm'],{maxBuffer:32*1024*1024});
const before=bridge((await WebAssembly.instantiate(old)).instance);
const after=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance);
const base=fleetFixture(before,{routes:60,shipsPerRoute:10});
const warehouse=warehouseFixture(before,base),catalog=before({op:'catalog'});
const multiple=JSON.parse(warehouse),co=multiple.companies[0];
for(const city of new Set(co.routes.slice(0,8).flatMap(r=>r.stops))){
 const p=co.posts[city]??=postFixture(catalog.goods.length);
 p.warehouse=10;p.handling=2;
 p.stock=catalog.goods.map((g,good)=>({good,quantity:20,cost:20*g.base,from:null}));
}
co.facility_policy.warehouse_up.days=10;co.facility_policy.warehouse_down.days=20;
co.facility_policy.handling_down={enabled:true,percent:50,days:20};
before({op:'load',text:JSON.stringify(multiple)});
const fixtures=[['600 ships / automation disabled',base,false],['600 ships / immediate warehouses',warehouse,true],
 ['multiple warehouses / daily streaks',before({op:'save'}),true]];
if(process.env.BENCH_SAVE)fixtures.push(['provided save',fs.readFileSync(process.env.BENCH_SAVE,'utf8'),false]);
for(const [name,text,editFacilities] of fixtures)test('4.1.5 exact daily state: '+name,()=>{
 for(const core of [before,after])core({op:'load',text});
 const city=catalog.cities.findIndex(c=>c.id==='london');
 for(let day=0;day<720;day++){
  const commands=[];
  if(editFacilities&&day===60)commands.push({action:'lowerPost',city,facility:'warehouse',target:0});
  if(editFacilities&&day===61)commands.push({action:'upgradePost',city,facility:'warehouse'});
  if(editFacilities&&day===120){
   const policy=JSON.parse(before({op:'save'})).companies[0].facility_policy;
   policy.warehouse_up.days=1;policy.warehouse_down.days=1;
   commands.push({action:'facilityPolicy',policy});
  }
  commands.push({action:'tick',days:1});
  for(const command of commands){
   for(const core of [before,after])core({op:'command',command});
   assert.equal(after({op:'save'}),before({op:'save'}),`${name}, day ${day+1}, ${command.action}`);
  }
  if(day===359){const saved=after({op:'save'});after({op:'load',text:saved});assert.equal(after({op:'save'}),before({op:'save'}));}
 }
});
