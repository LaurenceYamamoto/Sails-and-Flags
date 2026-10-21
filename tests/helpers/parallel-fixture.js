import {Worker} from 'node:worker_threads';
import {bridge} from '../../src/wasm-bridge.js';
export {fleetFixture} from './fleet-fixture.js';

export function nodeComputeWorker(){
  const thread=new Worker(new URL('./simulation-worker-node.js',import.meta.url),{execArgv:[]});
  const wrapper={postMessage:data=>thread.postMessage(data),terminate:()=>thread.terminate()};
  thread.on('message',data=>wrapper.onmessage?.({data}));
  thread.on('error',error=>wrapper.onerror?.(error));
  thread.on('messageerror',error=>wrapper.onmessageerror?.(error));
  return wrapper;
}
export async function coreFrom(module){return bridge(await WebAssembly.instantiate(module));}
