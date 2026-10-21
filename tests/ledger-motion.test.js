import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {bridge} from '../src/wasm-bridge.js';
import {fleetFixture} from './helpers/fleet-fixture.js';
import {warehouseFixture} from './helpers/warehouse-fleet-fixture.js';
const oldPath=process.env.LEDGER_MOTION_BASELINE??'sites/ledger-motion-before.wasm';
const old=fs.existsSync(oldPath)?fs.readFileSync(oldPath):execFileSync('git',['show','4.1.4:assets/wasm/engine.wasm'],{maxBuffer:32*1024*1024});
const before=bridge((await WebAssembly.instantiate(old)).instance);
const after=bridge((await WebAssembly.instantiate(fs.readFileSync('assets/wasm/engine.wasm'))).instance);
const base=fleetFixture(before,{routes:60,shipsPerRoute:10});
const fixtures=[['600 ships',base],['warehouse reservations and N=1 adjustment',warehouseFixture(before,base)]];
if(process.env.BENCH_SAVE)fixtures.push(['provided save',fs.readFileSync(process.env.BENCH_SAVE,'utf8')]);
for(const [name,text] of fixtures)test('4.1.4 daily exact equivalence: '+name,()=>{
 for(const core of [before,after])core({op:'load',text});
 for(let day=0;day<180;day++){
  for(const core of [before,after])core({op:'command',command:{action:'tick',days:1}});
  const expected=before({op:'save'}),actual=after({op:'save'});
  assert.equal(actual,expected,`${name}, day ${day+1}`);
  if(day===89){after({op:'load',text:actual});assert.equal(after({op:'save'}),expected);}
 }
});
