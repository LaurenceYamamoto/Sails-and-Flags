import {IndexedSaves} from './indexed-saves.js';
const storage=new IndexedSaves();
let queue=Promise.resolve();
onmessage=({data})=>{
 queue=queue.then(async()=>{
  try {
   if(!['list','read','write'].includes(data.method))throw Error('Unknown save operation');
   const value=await storage[data.method](...data.args);
   postMessage({id:data.id,ok:true,value});
  }catch(e){postMessage({id:data.id,ok:false,error:e.message});}
 });
};
