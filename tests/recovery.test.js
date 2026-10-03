import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,tick,serialize} from '../src/engine.js';
import {saveGame,listSaves,readSave,SAVE_KEYS,MANUAL_SLOTS,AUTO_HISTORY} from '../src/storage.js';
import {renderManualSaves} from '../src/storage-view.js';
import {LANGUAGES,setLanguage} from '../src/i18n.js';

function store(){
 const map=new Map(),removed=[];return {map,removed,limit:Infinity,getItem:k=>map.get(k)??null,removeItem:k=>{removed.push(k);map.delete(k);},size:()=>[...map].reduce((n,[k,v])=>n+2*(k.length+v.length),0),
 setItem(k,v){const previous=map.get(k),size=this.size()-(previous===undefined?0:2*(k.length+previous.length))+2*(k.length+v.length);if(size>this.limit)throw new DOMException('Full','QuotaExceededError');map.set(k,v);}};
}

test('five manual slots overwrite independently without generating backups or preservation copies',()=>{
 const storage=store(),s=createGame();for(const slot of MANUAL_SLOTS){saveGame(storage,s,slot);tick(s);}
 assert.equal(listSaves(storage).length,5);assert.deepEqual(listSaves(storage).map(s=>s.day),[0,1,2,3,4]);const untouched=MANUAL_SLOTS.filter(id=>id!=='manual3').map(id=>storage.getItem(SAVE_KEYS[id]));
 saveGame(storage,s,'manual3');assert.equal(readSave(storage.getItem(SAVE_KEYS.manual3)).day,5);assert.deepEqual(MANUAL_SLOTS.filter(id=>id!=='manual3').map(id=>storage.getItem(SAVE_KEYS[id])),untouched);assert.equal(storage.map.size,5);
 assert.throws(()=>saveGame(storage,s,'manual6'));assert.throws(()=>saveGame(storage,s,'backup'));
 // Exact-size replacement succeeds even though a duplicate backup would not fit.
 storage.limit=storage.size();saveGame(storage,s,'manual3');assert.equal(storage.map.size,5);assert.equal(storage.removed.length,0);
});

test('autosaves retain latest plus four generations, ordered by save time rather than game day',()=>{
 const storage=store(),s=createGame();for(let day=0;day<8;day++){saveGame(storage,s,'auto');tick(s);}
 const saves=listSaves(storage).filter(x=>x.automatic);assert.equal(saves.length,5);assert.deepEqual(saves.sort((a,b)=>a.savedAt-b.savedAt).map(s=>s.day),[3,4,5,6,7]);
 const reset=createGame(1);storage.limit=storage.size()+20;saveGame(storage,reset,'auto');assert.equal(readSave(storage.getItem(SAVE_KEYS.auto)).day,0);assert.equal(listSaves(storage).sort((a,b)=>b.savedAt-a.savedAt)[0].day,0);
});

test('full quota removes the oldest autosaves and retries while protecting manual, preserved and unrelated data',()=>{
 const storage=store(),s=createGame();saveGame(storage,s,'manual');storage.setItem(SAVE_KEYS.preserved,serialize(s));storage.setItem('unrelated','keep');
 for(let day=0;day<5;day++){tick(s);saveGame(storage,s,'auto');}
 const before=new Map(storage.map),oldest=listSaves(storage).filter(x=>AUTO_HISTORY.includes(x.slot)).sort((a,b)=>a.savedAt-b.savedAt)[0];
 storage.limit=storage.size();const bigger={...s,companyName:'A'.repeat(40)};const result=saveGame(storage,bigger,'auto');
 assert.equal(result.removed[0],oldest.slot);assert.equal(readSave(storage.getItem(SAVE_KEYS.auto)).companyName,bigger.companyName);
 for(const key of [SAVE_KEYS.manual,SAVE_KEYS.preserved,'unrelated'])assert.equal(storage.getItem(key),before.get(key));
});

test('legacy automatic backups are reclaimable; old manuals and migration originals remain readable',()=>{
 const storage=store(),s=createGame(),raw=serialize(s);for(const key of [SAVE_KEYS.v15,SAVE_KEYS.preserved,SAVE_KEYS.autoV15,SAVE_KEYS.backup])storage.setItem(key,raw);
 storage.limit=storage.size();saveGame(storage,s,'auto');assert.equal(readSave(storage.getItem(SAVE_KEYS.auto)).day,0);assert.ok(storage.removed.includes(SAVE_KEYS.autoV15)||storage.removed.includes(SAVE_KEYS.backup));assert.equal(storage.getItem(SAVE_KEYS.v15),raw);assert.equal(storage.getItem(SAVE_KEYS.preserved),raw);
 assert.ok(listSaves(storage).find(x=>x.slot==='v15').valid);
});

test('optional history failure cannot turn a successfully committed autosave into a failure',()=>{
 const storage=store(),s=createGame();saveGame(storage,s,'auto');const set=storage.setItem.bind(storage);storage.setItem=(k,v)=>{if(AUTO_HISTORY.some(id=>SAVE_KEYS[id]===k))throw new DOMException('Full','QuotaExceededError');set(k,v);};
 tick(s);assert.doesNotThrow(()=>saveGame(storage,s,'auto'));assert.equal(readSave(storage.getItem(SAVE_KEYS.auto)).day,1);assert.equal(storage.map.size,1);
 const get=storage.getItem;storage.getItem=k=>{if(AUTO_HISTORY.some(id=>SAVE_KEYS[id]===k))throw new DOMException('Blocked','SecurityError');return get(k);};tick(s);assert.doesNotThrow(()=>saveGame(storage,s,'auto'));assert.equal(readSave(storage.getItem(SAVE_KEYS.auto)).day,2);
});

test('unwritable or oversized saves retain the last good save and roll back failed cleanup',()=>{
 const storage=store(),s=createGame();saveGame(storage,s,'manual');saveGame(storage,s,'auto');tick(s);saveGame(storage,s,'auto');const before=new Map(storage.map),set=storage.setItem.bind(storage);
 storage.setItem=()=>{throw new DOMException('Blocked','SecurityError');};assert.throws(()=>saveGame(storage,s,'auto'),{name:'SecurityError'});assert.equal(storage.removed.length,0);assert.deepEqual(storage.map,before);
 storage.setItem=(k,v)=>{if(k===SAVE_KEYS.manual2)throw new DOMException('Full','QuotaExceededError');set(k,v);};assert.throws(()=>saveGame(storage,s,'manual2'),{name:'QuotaExceededError'});assert.deepEqual(storage.map,before);
 const invalid={...s,cash:-999};storage.removed.length=0;assert.throws(()=>saveGame(storage,invalid,'auto'));assert.equal(storage.removed.length,0);assert.deepEqual(storage.map,before);
});

test('corrupt and empty legacy slots stay visible, but are never copied into new history',()=>{
 const storage=store(),s=createGame();storage.setItem(SAVE_KEYS.preserved,'');storage.setItem(SAVE_KEYS.auto,'broken');saveGame(storage,s,'auto');assert.equal(listSaves(storage).find(s=>s.slot==='preserved').valid,false);assert.equal(storage.getItem(SAVE_KEYS.preserved),'');assert.equal(listSaves(storage).filter(s=>s.automatic).length,1);
});

test('five-slot picker renders empty, occupied and corrupt choices in all six languages',()=>{
 const storage=store(),s=createGame();saveGame(storage,s);storage.setItem(SAVE_KEYS.manual2,'broken');const saves=listSaves(storage);
 for(const lang of Object.keys(LANGUAGES)){setLanguage(lang);const html=renderManualSaves(saves,{cash:String});assert.equal((html.match(/data-action="save-slot"/g)||[]).length,5);assert.doesNotMatch(html,/undefined|NaN|�/);assert.match(html,/data-id="manual5"/);assert.match(renderManualSaves(saves,{cash:String,error:'Storage full'}),/role="alert">Storage full/);}setLanguage('ja');
});
