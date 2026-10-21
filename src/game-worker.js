import {SaveClient} from './save-client.js';
import {createSimulation} from './simulation-runtime.js';
const storage=new SaveClient();
let simulation;
const ready=createSimulation().then(runtime=>{simulation=runtime;return runtime.core;});
let queue=Promise.resolve(),selectedCity=0,lastAutoDay=0,lastViewDay=-1,autosaving=null;
onmessage=({data})=>{queue=queue.then(async()=>{
  try{
    const core=await ready;let value;
    const view=(paths=false)=>{const v=core({op:'runtimeView',city:selectedCity,company:data.company,route:data.route,paths});lastViewDay=v.day;return v;};
    if(data.op==='parallelStatus'){value=simulation.status();}
    else if(data.op==='boot'){
      let restored=false;
      try {
        const rows=(await storage.list()).sort((a,b)=>b.savedAt-a.savedAt);
        for(const row of rows){try{core({op:'load',text:await storage.read(row.id)});lastAutoDay=row.day;restored=true;break;}catch{postMessage({notice:'A save could not be loaded; trying the next most recent save.'});}}
      } catch(e){postMessage({notice:'Save storage unavailable: '+e.message});}
      if(!restored)core({op:'command',command:{action:'new',name:data.name}});
      value={catalog:core({op:'catalog'}),view:view(true)};
    }
    else if(data.op==='save'){
      const snapshot=core({op:'save'}),info=core({op:'saveInfo'});
      value=await storage.write(data.slot,snapshot,info);
    }else if(data.op==='saves')value=await storage.list();
    else if(data.op==='loadSlot'){if(autosaving)await autosaving;core({op:'load',text:await storage.read(data.slot)});lastAutoDay=0;value=view(true);}
    else if(data.op==='export')value=core({op:'save'});
    else{
      if(data.op==='view')selectedCity=data.city??0;
      if(data.op==='view')value=view();
      else {
        if(data.op==='load'||data.command?.action==='new'){if(autosaving)await autosaving;}
        value=await simulation.call(data);
        if(data.op==='advance'){
          const clock=core({op:'clock'});
          value=clock.day===lastViewDay?{...clock,frame:true}:view();
        }else if(['command','load'].includes(data.op))value=view(data.op==='load'||data.command?.action==='new');
      }
      if(data.op==='load'||data.command?.action==='new')lastAutoDay=value.day;
      if(data.op==='advance'&&!autosaving&&value.day-lastAutoDay>=30){
        const day=value.day,snapshot=core({op:'save'}),info=core({op:'saveInfo'});
        // At most one autosave in flight. Encoding/IndexedDB proceed on the IO
        // worker while simulation can answer the next request.
        lastAutoDay=day;
        autosaving=storage.write(null,snapshot,info).catch(e=>postMessage({notice:'Autosave failed: '+e.message})).finally(()=>{autosaving=null;});
      }
    }
    postMessage({id:data.id,ok:true,value});
  }catch(e){postMessage({id:data.id,ok:false,error:e.message});}
}).catch(e=>postMessage({notice:e.message}));};
