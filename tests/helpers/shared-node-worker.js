// Node host shim for the unmodified browser thread bootstrap. Messages only
// initialize workers; all subsequent jobs use the Rust shared-memory pool.
import {Worker as NodeWorker,parentPort,workerData} from 'node:worker_threads';
export const liveWorkers=new Set();
export const messages={sent:0};
export class BrowserWorker {
 constructor(url){
  this.events=new Map();
  this.thread=new NodeWorker(new URL(import.meta.url),{workerData:{url:String(url)},execArgv:[]});
  liveWorkers.add(this);
  this.thread.on('message',data=>this.emit('message',{data}));
  this.thread.on('error',error=>this.emit('error',error));
  this.thread.on('exit',()=>liveWorkers.delete(this));
 }
 addEventListener(type,f){if(!this.events.has(type))this.events.set(type,new Set());this.events.get(type).add(f);}
 removeEventListener(type,f){this.events.get(type)?.delete(f);}
 emit(type,e){for(const f of this.events.get(type)??[])f(e);}
 postMessage(data){messages.sent++;this.thread.postMessage(data);}
 terminate(){liveWorkers.delete(this);return this.thread.terminate();}
}
export function installHost(){
 globalThis.Worker=BrowserWorker;globalThis.self=globalThis;
 const events=new Map();
 globalThis.addEventListener=(type,f)=>{if(!events.has(type))events.set(type,new Set());events.get(type).add(f);};
 globalThis.removeEventListener=(type,f)=>events.get(type)?.delete(f);
 globalThis.postMessage=data=>parentPort?.postMessage(data);
 parentPort?.on('message',data=>{for(const f of events.get('message')??[])f({data});});
}
if(workerData?.url){installHost();await import(workerData.url);}
