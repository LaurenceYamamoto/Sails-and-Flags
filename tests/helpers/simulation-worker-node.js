// Run the actual browser compute worker unchanged in a Node worker thread.
import {parentPort} from 'node:worker_threads';
globalThis.onmessage=null;
globalThis.postMessage=data=>parentPort.postMessage(data);
await import('../../src/simulation-compute-worker.js');
parentPort.on('message',data=>globalThis.onmessage({data}));
