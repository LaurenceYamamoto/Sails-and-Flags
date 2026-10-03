import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCampaign} from '../scripts/campaign-validation.mjs';
import {createGame,tick,entry,serialize,deserialize,openCircuit,buyLicense} from '../src/engine.js';
import {recordRank} from '../src/management.js';
import {saveGame,listSaves,SAVE_KEYS} from '../src/storage.js';

test('three seeds run 50 years with industry, wars, automation, losses and annual deterministic recovery',()=>{
  for(const seed of [1,42,1700]) {const report=validateCampaign(seed);assert.equal(report.days,18250);assert.equal(report.restores,50);console.log('P6 campaign '+JSON.stringify(report));}
});

test('asset lead continues, bankruptcy stops time, and a good save restores the company without overwriting corrupt slots',()=>{
  const s=createGame(1700),map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  // Accelerated balance fixture for the lifecycle boundaries, not a growth/balance claim.
  entry(s,'sale',50000);recordRank(s);assert.equal(s.firstRankDay,0);buyLicense(s,'spain');openCircuit(s,'sloop',['kingston','havana']);
  tick(s);assert.equal(s.day,1);assert.equal(s.gameOver,false);saveGame(storage,s);const good=serialize(s);
  entry(s,'purchase',-s.cash-1);tick(s);assert.equal(s.gameOver,true);const day=s.day;tick(s);assert.equal(s.day,day);
  map.set(SAVE_KEYS.auto,'{"version":6');const before=map.get(SAVE_KEYS.manual);assert.equal(listSaves(storage).find(v=>v.slot==='auto').valid,false);assert.equal(map.get(SAVE_KEYS.manual),before);
  const restored=deserialize(good);assert.equal(restored.gameOver,false);tick(restored);assert.equal(restored.day,2);assert.equal(restored.firstRankDay,0);
  saveGame(storage,restored);assert.equal(map.get(SAVE_KEYS.backup),undefined);assert.deepEqual(listSaves(storage).find(v=>v.slot==='manual').state,restored);assert.equal(map.get(SAVE_KEYS.auto),'{"version":6');
});
