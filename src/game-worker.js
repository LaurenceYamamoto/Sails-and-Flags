import {bridge} from './wasm-bridge.js';
import {IndexedSaves} from './indexed-saves.js';
const storage=new IndexedSaves();
const ready=WebAssembly.instantiateStreaming(fetch('../assets/wasm/engine.wasm')).then(r=>bridge(r.instance));
let queue=Promise.resolve(),selectedCity=0,lastAutoDay=0;
onmessage=({data})=>{queue=queue.then(async()=>{
  try{
    const core=await ready;let value;
    if(data.op==='boot'){
      try {
        const rows=(await storage.list()).sort((a,b)=>b.savedAt-a.savedAt);
        for(const row of rows){try{core({op:'load',text:await storage.read(row.id)});lastAutoDay=row.day;break;}catch{postMessage({notice:'A save could not be loaded; trying the next most recent save.'});}}
      } catch(e){postMessage({notice:'Save storage unavailable: '+e.message});}
      value={catalog:core({op:'catalog'}),view:core({op:'view'})};
    }
    else if(data.op==='save'){
      const view=core({op:'view',city:selectedCity});
      value=await storage.write(data.slot,core({op:'save'}),{day:view.day,name:view.companies[0].name});
    }else if(data.op==='saves')value=await storage.list();
    else if(data.op==='loadSlot'){core({op:'load',text:await storage.read(data.slot)});lastAutoDay=0;value=core({op:'view',city:selectedCity});}
    else if(data.op==='export')value=core({op:'save'});
    else{
      if(data.op==='view')selectedCity=data.city??0;
      value=core(data);
      if(['command','load','advance'].includes(data.op))value=core({op:'view',city:selectedCity});
      if(data.op==='load'||data.command?.action==='new')lastAutoDay=value.day;
      if(data.op==='advance'&&value.day-lastAutoDay>=30){
        lastAutoDay=value.day;
        try{await storage.write(null,core({op:'save'}),{day:value.day,name:value.companies[0].name});}
        catch(e){postMessage({notice:'Autosave failed: '+e.message});}
      }
    }
    postMessage({id:data.id,ok:true,value});
  }catch(e){postMessage({id:data.id,ok:false,error:e.message});}
}).catch(e=>postMessage({notice:e.message}));};
