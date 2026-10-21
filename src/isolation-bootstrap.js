// This runs before any game worker exists. Unsupported contexts still boot serially.
export async function prepareIsolation(host=globalThis,timeoutMs=4000){
 const key='sails-flags-isolation-reload-4.1.4';
 let timer,changed;
 const sw=host.navigator?.serviceWorker;
 try{
  if(host.crossOriginIsolated){try{host.sessionStorage.removeItem(key);}catch{}return false;}
  if(!host.isSecureContext||!sw)return false;
  // Without a reliable reload guard, retain the working serial fallback.
  if(host.sessionStorage.getItem(key))return false;
  host.sessionStorage.setItem(key,'probe');host.sessionStorage.removeItem(key);
  const url=new URL('../isolation-worker.js',import.meta.url).href;
  const ours=()=>sw.controller?.scriptURL===url;
  if(sw.controller&&!ours())return false;
  const ready=new Promise((resolve,reject)=>{
   changed=()=>{if(ours())resolve(true);};
   sw.addEventListener('controllerchange',changed);
   sw.register(url,{scope:new URL('../',import.meta.url).href,updateViaCache:'none'}).then(changed,reject);
  });
  const controlled=await Promise.race([ready,new Promise(resolve=>{timer=setTimeout(()=>resolve(false),timeoutMs);})]);
  if(!controlled)return false;
  host.sessionStorage.setItem(key,'1');
  host.location.reload();
  return true;
 }catch{return false;}
 finally{clearTimeout(timer);if(changed)sw.removeEventListener('controllerchange',changed);}
}
