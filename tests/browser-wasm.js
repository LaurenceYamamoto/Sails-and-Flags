import {IndexedSaves} from '../src/indexed-saves.js';
const lines=[],out=document.querySelector('#result');
const ok=(condition,label)=>{if(!condition)throw new Error(label);lines.push('PASS '+label);out.textContent=lines.join('\n');};
const dbName='sails-flags-integration-'+crypto.randomUUID(),s=new IndexedSaves(indexedDB,dbName);
let w;
try{
 for(let i=1;i<=5;i++)await s.write(i,'snapshot-'+i,{day:i,name:'Test'});
 await s.write(2,'replacement',{day:12,name:'New name'});
 ok(await s.read('manual-2')==='replacement','real IndexedDB manual overwrite');
 ok((await s.list()).length===5,'five manual slots');
 for(let i=0;i<8;i++)await s.write(null,'auto-'+i,{day:20+i,name:'Auto'});
 ok((await s.list()).filter(r=>r.auto).length===5,'autosave retention');
 s.db.close();s.db=null;
 ok(await s.read('manual-2')==='replacement','close and reopen persists bytes');
 try{await s.transaction('readwrite',(snap,meta)=>{snap.put({id:'manual-2',bytes:new TextEncoder().encode('bad')});throw new Error('injected abort');});}catch{}
 ok(await s.read('manual-2')==='replacement','aborted transaction preserves previous save');
 w=new Worker('../src/game-worker.js',{type:'module'});let id=0;const pending=new Map();w.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.ok?p[0](data.value):p[1](new Error(data.error));};w.onerror=e=>{for(const p of pending.values())p[1](new Error(e.message));};
 const rpc=data=>new Promise((resolve,reject)=>{pending.set(++id,[resolve,reject]);w.postMessage({...data,id});});
 const boot=await rpc({op:'boot'});ok(boot.catalog.cities.length===114,'worker instantiates production Wasm');
 await rpc({op:'command',command:{action:'new',seed:1700}});
 await rpc({op:'command',command:{action:'license',nation:0}});
 const v=await rpc({op:'advance',ms:500,speed:4,running:true});ok(v.day===2,'Worker clock executes game logic');
 const raw=await rpc({op:'export'});await rpc({op:'command',command:{action:'tick',days:10}});const loaded=await rpc({op:'load',text:raw});ok(loaded.day===2&&loaded.licenses[0].owned,'Worker save/load roundtrip');
 out.textContent+='\nALL CHECKS PASSED';
}catch(e){out.textContent=lines.join('\n')+'\nFAIL '+e.stack;}finally{w?.terminate();s.db?.close();indexedDB.deleteDatabase(dbName);}
