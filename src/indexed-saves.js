// This store contains opaque Wasm snapshots; it never interprets game rules.
const request=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
export class IndexedSaves {
  constructor(factory=globalThis.indexedDB,name='sails-flags-wasm-v1'){this.factory=factory;this.name=name;}
  async open(){
    if(this.db)return this.db;
    if(!this.factory)throw new Error('IndexedDB is unavailable. Export a save file.');
    this.db=await new Promise((resolve,reject)=>{
      const r=this.factory.open(this.name,1);
      r.onupgradeneeded=()=>{r.result.createObjectStore('snapshots',{keyPath:'id'});r.result.createObjectStore('metadata',{keyPath:'id'});};
      r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();this.db=null;};resolve(r.result);};
      r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Close other game tabs and retry saving.'));
    });return this.db;
  }
  async transaction(mode,work){
    const db=await this.open();return new Promise((resolve,reject)=>{
      const tx=db.transaction(['snapshots','metadata'],mode);let result;
      tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error||new Error('Save transaction aborted'));tx.onerror=()=>{};
      try{result=work(tx.objectStore('snapshots'),tx.objectStore('metadata'));}catch(e){tx.abort();reject(e);}
    });
  }
  async list(){const db=await this.open();return request(db.transaction('metadata').objectStore('metadata').getAll());}
  async read(id){const db=await this.open();const row=await request(db.transaction('snapshots').objectStore('snapshots').get(id));if(!row)throw new Error('No save in this slot.');return new TextDecoder().decode(row.bytes);}
  async remove(id){await this.transaction('readwrite',(s,m)=>{s.delete(id);m.delete(id);});}
  async write(slot,text,info){
    const locks=globalThis.navigator?.locks;
    if(locks)return locks.request(this.name+'-save',()=>this.writeLocked(slot,text,info));
    return this.writeLocked(slot,text,info);
  }
  async writeLocked(slot,text,info){
    if(slot!==null&&(!Number.isInteger(slot)||slot<1||slot>5))throw new Error('Choose manual slot 1–5.');
    const rows=await this.list(),autos=rows.filter(r=>r.auto).sort((a,b)=>a.savedAt-b.savedAt||a.id.localeCompare(b.id));
    const id=slot===null?'auto-'+crypto.randomUUID():'manual-'+slot;
    const meta={...info,id,auto:slot===null,slot,savedAt:Date.now()},bytes=new TextEncoder().encode(text);
    const commit=async deletions=>this.transaction('readwrite',(s,m)=>{for(const old of deletions){s.delete(old.id);m.delete(old.id);}s.put({id,bytes});m.put(meta);});
    // Retention cleanup and the new snapshot commit atomically. On quota failure
    // roll back the entire transaction and retry with more old autos removed.
    // Manual slots are never candidates, including when saving a manual slot.
    const initial=slot===null?Math.max(0,autos.length-4):0;
    for(let n=initial;n<=autos.length;n++){
      try{await commit(autos.slice(0,n));return meta;}catch(e){if(e.name!=='QuotaExceededError'||n===autos.length)throw e;}
    }
  }
}
