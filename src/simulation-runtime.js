import {bridge} from './wasm-bridge.js';

// Host initialization and external I/O only. Rust owns all scheduling,
// thresholds, shared job data, synchronization and commits.
export async function createSimulation({isolated=globalThis.crossOriginIsolated,
 hardware=globalThis.navigator?.hardwareConcurrency??1,
 loadShared=()=>import('../assets/wasm/shared/engine.js'),
 loadSerial=()=>WebAssembly.instantiateStreaming(fetch(new URL('../assets/wasm/engine.wasm',import.meta.url)))}={}) {
 let reason;
 if(isolated&&typeof SharedArrayBuffer!=='undefined'){
  try{
   const shared=await loadShared();
   await shared.default();
   const count=shared.thread_count(hardware);
   await shared.initThreadPool(count);
   shared.threads_ready(count);
   const core=q=>{const r=JSON.parse(shared.request(JSON.stringify(q)));if(!r.ok)throw Error(r.error);return r.value;};
   return {core,call:core,status:()=>({...core({op:'threadStatus'}),backend:'rust-shared-memory'})};
  }catch(e){reason=e.message;}
 }else reason='Shared WebAssembly memory is unavailable in this context';
 const r=await loadSerial(),core=bridge(r.instance);
 return {core,call:core,status:()=>({...core({op:'threadStatus'}),backend:'rust-serial',reason})};
}
