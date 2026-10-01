import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick,serialize,deserialize} from '../src/engine.js';
import {saveGame,listSaves,SAVE_KEYS} from '../src/storage.js';
import * as legacy from '../src/legacy/engine-v5.js';
const store=()=>{const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};

test('P6 pins the furthest valid old save as original JSON before rotating current slots',()=>{
  const storage=store(),old=legacy.createGame();for(let i=0;i<50;i++)legacy.tick(old);const raw=legacy.serialize(old);
  storage.setItem(SAVE_KEYS.v5,raw);storage.setItem(SAVE_KEYS.manual,serialize(createGame()));storage.setItem(SAVE_KEYS.auto,'corrupt');
  const s=deserialize(raw);saveGame(storage,s);assert.equal(storage.getItem(SAVE_KEYS.preserved),raw);assert.equal(storage.getItem(SAVE_KEYS.v5),raw);
  for(let i=0;i<5;i++){tick(s);saveGame(storage,s,'auto');saveGame(storage,s);}
  assert.equal(storage.getItem(SAVE_KEYS.preserved),raw);assert.ok(listSaves(storage).some(s=>s.slot==='preserved'&&s.valid&&s.day===50));
});

test('corrupt pinned slots are visible but never overwritten and failed preservation leaves live slots intact',()=>{
  const storage=store(),s=createGame(),raw=serialize(s);storage.setItem(SAVE_KEYS.manual,raw);
  const write=storage.setItem;storage.setItem=(k,v)=>{if(k===SAVE_KEYS.preserved)throw Error('Quota');write(k,v);};tick(s);assert.throws(()=>saveGame(storage,s));assert.equal(storage.getItem(SAVE_KEYS.manual),raw);
  storage.setItem=write;storage.setItem(SAVE_KEYS.preserved,'corrupt');saveGame(storage,s);assert.equal(storage.getItem(SAVE_KEYS.preserved),'corrupt');assert.equal(listSaves(storage).find(v=>v.slot==='preserved').valid,false);assert.equal(storage.getItem(SAVE_KEYS.backup),raw);
  storage.setItem(SAVE_KEYS.preserved,'');saveGame(storage,s);assert.equal(storage.getItem(SAVE_KEYS.preserved),'');assert.equal(listSaves(storage).find(v=>v.slot==='preserved').valid,false);
});
