import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bridge} from '../src/wasm-bridge.js';
import {fleetFixture} from './helpers/fleet-fixture.js';
import {warehouseFixture} from './helpers/warehouse-fleet-fixture.js';
const path=process.env.RETREAT_BASELINE??'sites/retreat-before.wasm';
const old=fs.existsSync(path)?fs.readFileSync(path):execFileSync('git',['show','4.1.7:assets/wasm/engine.wasm'],{maxBuffer:32*1024*1024});
const before=bridge((await WebAssembly.instantiate(old)).instance);
const after=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance);
const base=fleetFixture(before,{routes:60,shipsPerRoute:10});
const fixtures=[['600 ships',base],['600 ships with immediate warehouses',warehouseFixture(before,base)],
 ['2400 ships',fleetFixture(before,{routes:60,shipsPerRoute:40})]];
if(process.env.BENCH_SAVE)fixtures.push(['provided save',fs.readFileSync(process.env.BENCH_SAVE,'utf8')]);
for(const [name,text] of fixtures)test('4.1.7 exact daily state: '+name,()=>{
 for(const core of [before,after])core({op:'load',text});
 for(let day=0;day<720;day++){
  for(const core of [before,after])core({op:'command',command:{action:'tick',days:1}});
  assert.equal(after({op:'save'}),before({op:'save'}),`${name}, day ${day+1}`);
  if(day===359){const save=after({op:'save'});after({op:'load',text:save});assert.equal(after({op:'save'}),before({op:'save'}));}
 }
});
