import {IndexedSaves} from './indexed-saves.js';
// IO-only worker: game rules and authoritative data remain in the Wasm worker.
// One additional thread, regardless of hardware core count; no large worker pool.
export class SaveClient {
 constructor(){
  this.serial=0;this.pending=new Map();
  try {
   this.worker=new Worker(new URL('./save-worker.js',import.meta.url),{type:'module'});
   this.worker.onmessage=({data})=>{const p=this.pending.get(data.id);if(!p)return;this.pending.delete(data.id);data.ok?p.resolve(data.value):p.reject(new Error(data.error));};
   this.worker.onerror=()=>{
    if(!this.worker)return;
    this.worker.terminate();this.worker=null;this.local=new IndexedSaves();
    for(const p of this.pending.values()){
     // Reads are safe to retry and preserve boot-time save restoration.
     // A write may already have committed, so report uncertainty without replay.
     if(p.method==='write')p.reject(new Error('Save worker unavailable. Retry saving.'));
     else this.local[p.method](...p.args).then(p.resolve,p.reject);
    }
    this.pending.clear();
   };
  }catch{this.local=new IndexedSaves();}
 }
 request(method,args){
  if(!this.worker)return this.local[method](...args);
  return new Promise((resolve,reject)=>{
   const id=++this.serial;this.pending.set(id,{resolve,reject,method,args});
   try{this.worker.postMessage({id,method,args});}catch(e){this.pending.delete(id);reject(e);}
  });
 }
 list(){return this.request('list',[]);}
 read(id){return this.request('read',[id]);}
 write(slot,text,info){return this.request('write',[slot,text,info]);}
}
