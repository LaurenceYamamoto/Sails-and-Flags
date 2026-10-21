// Historical 4.1.3 transport, retained only for regression and before/after measurements.
// Transport only. Eligibility, inputs, evaluation and committing results live
// in Rust. No game rule or mutable game state is owned by this worker pool.
export class ParallelSimulation {
  constructor(core,module,{concurrency=globalThis.navigator?.hardwareConcurrency??1,
    createWorker=()=>new Worker(new URL('./legacy-simulation-compute-worker.js',import.meta.url),{type:'module'}),
    timeout=30000,initTimeout=120000,maxWorkers=4,adaptive=true}={}) {
    this.core=core;this.module=module;this.createWorker=createWorker;this.timeout=timeout;this.initTimeout=initTimeout;
    this.count=Math.min(maxWorkers,Math.max(0,Math.floor(concurrency)-2));
    if(this.count<2)this.count=0;
    this.workers=[];this.serial=0;this.failed=false;
    this.adaptive=adaptive;this.minimum={schedules:0,rival:0,movement:0,cities:0,investments:0};this.samples={};
    this.stats={workers:0,batches:0,schedules:0,rival:0,movement:0,cities:0,investments:0,fallbacks:0,roundtripMs:{}};
    this.initialized=false;
    this.ready=this.start().then(()=>{this.initialized=true;});
  }
  async start(){
    if(!this.count)return;
    try{
      for(let i=0;i<this.count;i++){
        const worker=this.createWorker(),slot={worker,pending:new Map()};
        worker.onmessage=({data})=>{
          const request=slot.pending.get(data.id);if(!request)return;
          slot.pending.delete(data.id);clearTimeout(request.timer);
          data.ok?request.resolve(data.value):request.reject(Error(data.error??'Simulation worker failed'));
        };
        worker.onerror=worker.onmessageerror=e=>this.disable(e?.message??'Simulation worker unavailable');
        this.workers.push(slot);
      }
      const topology=this.core({op:'planningTopology'});
      await Promise.all(this.workers.map(slot=>this.send(slot,{op:'init',module:this.module,topology},this.initTimeout)));
      this.stats.workers=this.workers.length;
    }catch(e){this.disable(e.message);}
  }
  send(slot,message,timeout=this.timeout){
    return new Promise((resolve,reject)=>{
      const id=++this.serial;
      const timer=setTimeout(()=>{slot.pending.delete(id);reject(Error('Simulation worker timeout'));},timeout);
      slot.pending.set(id,{resolve,reject,timer});
      try{slot.worker.postMessage({...message,id});}
      catch(e){clearTimeout(timer);slot.pending.delete(id);reject(e);}
    });
  }
  disable(reason){
    if(reason&&!this.stats.lastError)this.stats.lastError=reason;
    this.failed=true;this.stats.workers=0;
    for(const slot of this.workers){
      slot.worker.terminate();
      for(const p of slot.pending.values()){clearTimeout(p.timer);p.reject(Error('Simulation worker unavailable'));}
      slot.pending.clear();
    }
    this.workers=[];
  }
  async evaluate(batch){
    if(this.failed||!this.workers.length)return null;
    try{
      const started=performance.now();
      const size=Math.ceil(batch.items.length/this.workers.length);
      const jobs=this.workers.map((slot,i)=>({slot,items:batch.items.slice(i*size,(i+1)*size)})).filter(j=>j.items.length);
      const rows=await Promise.all(jobs.map(async({slot,items})=>{
        const rows=await this.send(slot,{op:'compute',kind:batch.kind,context:batch.context,items});
        if(!Array.isArray(rows)||rows.length!==items.length)throw Error('Incomplete simulation result');
        return rows;
      }));
      this.stats.batches++;this.stats[batch.kind]+=batch.items.length;
      this.stats.roundtripMs[batch.kind]=(this.stats.roundtripMs[batch.kind]??0)+performance.now()-started;
      // Promise.all preserves chunk order even when workers finish out of order.
      return rows.flat();
    }catch(e){
      this.stats.fallbacks++;this.disable(e.message);
      // Null asks the coordinator to recompute only this uncommitted batch.
      // Earlier phases are never replayed, so no tax/cargo is charged twice.
      return null;
    }
  }
  async call(request){
    const advances=request.op==='advance'||request.op==='command'&&request.command?.action==='tick';
    if(!advances)return this.core(request);
    if(!this.initialized||!this.workers.length)return this.core(request);
    let reply=this.core({op:'parallelBegin',request,minimum:this.minimum});
    while(!reply.done){
      const batch=reply.batch;
      let results;
      // Calibrate on real work, not a synthetic benchmark. If transfer and
      // copying outweigh the kernel, Rust skips future packet creation until
      // workload grows substantially. No game decisions are made here.
      const sample=this.samples[batch.kind];
      if(this.adaptive&&(!sample||batch.weight>=sample.weight*2||sample.batches>=32)){
        const start=performance.now();
        this.core({op:'parallelProbe',token:batch.token});
        const localMs=performance.now()-start;
        // Warm the worker kernels once; retain the measured local result in
        // the coordinator so failure or choosing local never replays a day.
        if(!sample)await this.evaluate(batch);
        const parallelStart=performance.now();
        results=await this.evaluate(batch);
        const parallelMs=performance.now()-parallelStart;
        this.samples[batch.kind]={weight:batch.weight,localMs,parallelMs,batches:0};
        if(!results||parallelMs>localMs*0.7){
          this.minimum[batch.kind]=batch.weight*4;
          results=null;
        }
      }else{
        results=await this.evaluate(batch);
        if(sample)sample.batches++;
      }
      reply=this.core({op:'parallelResume',token:batch.token,results,minimum:this.minimum});
    }
    return true;
  }
  status(){return {...this.stats,roundtripMs:{...this.stats.roundtripMs},disabled:this.failed,minimum:{...this.minimum},samples:structuredClone(this.samples)};}
  close(){this.disable();}
}
