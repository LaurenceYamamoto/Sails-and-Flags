// GPL-3.0-or-later. Same-origin header adapter; no caching or game data access.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const request=event.request;
 if(request.method!=='GET'||new URL(request.url).origin!==self.location.origin)return;
 if(request.cache==='only-if-cached'&&request.mode!=='same-origin')return;
 event.respondWith(fetch(request).then(response=>{
  if(response.status===0||response.type==='opaqueredirect')return response;
  const headers=new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy','same-origin');
  headers.set('Cross-Origin-Embedder-Policy','require-corp');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
 }));
});
