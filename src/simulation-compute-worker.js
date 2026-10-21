import {bridge} from './wasm-bridge.js';
let compute;
onmessage=async({data})=>{
  try{
    if(data.op==='init'){
      const instance=await WebAssembly.instantiate(data.module);
      compute=bridge(instance,'compute_execute');
      compute({op:'initPlanning',topology:data.topology});
      // Warm catalog/topology initialization before acknowledging readiness.
      // The first real context arrives later; no saves or authoritative state
      // are accessible from this worker.
      postMessage({id:data.id,ok:true,value:true});
    }else if(data.op==='compute'&&compute){
      postMessage({id:data.id,ok:true,value:compute(data)});
    }else throw Error('Simulation worker is not initialized');
  }catch(e){postMessage({id:data.id,ok:false,error:e.message});}
};
