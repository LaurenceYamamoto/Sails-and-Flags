/*
 * Copyright 2022 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy at https://www.apache.org/licenses/LICENSE-2.0
 * Unless required by law or agreed in writing, software is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND.
 * See the License for the specific permissions and limitations.
 *
 * Modified for Sails & Flags: same-origin module workers, bounded startup,
 * startup failure cleanup. Only thread initialization occurs here; Rayon
 * schedules all work through shared memory after wbg_rayon_start_worker.
 */
self.addEventListener('message',async function init({data}) {
 if(data?.type!=='wasm_bindgen_worker_init')return;
 self.removeEventListener('message',init);
 try{
  const pkg=await import(data.mainJS);
  await pkg.default({module_or_path:data.module,memory:data.memory});
  postMessage({type:'wasm_bindgen_worker_ready'});
  pkg.wbg_rayon_start_worker(data.receiver);
 }catch(e){postMessage({type:'wasm_bindgen_worker_failed',error:String(e)});throw e;}
});
let workers=[];
export async function startWorkers(module,memory,builder){
 if(builder.numThreads()===0)throw Error('Thread pool must not be empty');
 const pending=[];
 try{
  for(let i=0;i<builder.numThreads();i++){
   const worker=new Worker(new URL(import.meta.url),{type:'module'});workers.push(worker);
   pending.push(new Promise((resolve,reject)=>{
    const done=(error)=>{clearTimeout(timer);worker.removeEventListener('message',message);worker.removeEventListener('error',failed);error?reject(error):resolve();};
    const message=({data})=>{if(data?.type==='wasm_bindgen_worker_ready')done();else if(data?.type==='wasm_bindgen_worker_failed')done(Error(data.error));};
    const failed=e=>done(Error(e.message||'WASM worker failed to start'));
    const timer=setTimeout(()=>done(Error('WASM worker startup timeout')),30000);
    worker.addEventListener('message',message);worker.addEventListener('error',failed);
    worker.postMessage({type:'wasm_bindgen_worker_init',module,memory,receiver:builder.receiver(),mainJS:builder.mainJS()});
   }));
  }
  await Promise.all(pending);builder.build();
 }catch(e){for(const w of workers)w.terminate();workers=[];await Promise.allSettled(pending);throw e;}
}
