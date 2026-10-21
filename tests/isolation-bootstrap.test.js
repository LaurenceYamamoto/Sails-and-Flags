import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {prepareIsolation} from '../src/isolation-bootstrap.js';

function fixture(register){
 const listeners=new Set(),data=new Map();let reloads=0,registrations=0;
 const sw={controller:null,addEventListener:(_,f)=>listeners.add(f),removeEventListener:(_,f)=>listeners.delete(f),
  async register(url){registrations++;await register?.(sw,url,()=>{for(const f of listeners)f();});}};
 const host={navigator:{serviceWorker:sw},crossOriginIsolated:false,isSecureContext:true,
  sessionStorage:{getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},location:{reload:()=>reloads++}};
 return {host,sw,listeners,get reloads(){return reloads;},get registrations(){return registrations;}};
}
test('isolation reload happens once, before boot; unsuccessful isolation cannot loop',async()=>{
 const f=fixture((sw,url,notify)=>{sw.controller={scriptURL:url};notify();});
 assert.equal(await prepareIsolation(f.host),true);assert.equal(f.reloads,1);
 assert.equal(await prepareIsolation(f.host),false);assert.equal(f.reloads,1);
 assert.equal(f.listeners.size,0);
 f.host.crossOriginIsolated=true;assert.equal(await prepareIsolation(f.host),false);
 assert.equal(f.registrations,1);
});
test('late registration after timeout cannot reload a running game',async()=>{
 let finish;const f=fixture((sw,url,notify)=>new Promise(resolve=>{finish=()=>{sw.controller={scriptURL:url};notify();resolve();};}));
 assert.equal(await prepareIsolation(f.host,5),false);assert.equal(f.listeners.size,0);
 finish();await new Promise(resolve=>setTimeout(resolve,5));assert.equal(f.reloads,0);
});
test('unavailable storage, rejected registration and unrelated worker keep serial boot usable',async()=>{
 const a=fixture();a.host.sessionStorage.getItem=()=>{throw Error('denied');};assert.equal(await prepareIsolation(a.host),false);assert.equal(a.registrations,0);
 const b=fixture(()=>{throw Error('worker blocked');});assert.equal(await prepareIsolation(b.host),false);assert.equal(b.listeners.size,0);
 const c=fixture();c.sw.controller={scriptURL:'https://example.test/unrelated.js'};assert.equal(await prepareIsolation(c.host),false);assert.equal(c.registrations,0);
});
test('header adapter preserves response bytes/status and ignores unrelated requests',async()=>{
 const handlers=new Map();let calls=0;
 const self={location:{origin:'https://game.test'},addEventListener:(k,v)=>handlers.set(k,v)};
 vm.runInNewContext(fs.readFileSync('isolation-worker.js','utf8'),{self,URL,Headers,Response,fetch:async()=>{calls++;return new Response('module bytes',{status:200,headers:{'Content-Type':'text/javascript','ETag':'abc'}});}});
 let response;handlers.get('fetch')({request:new Request('https://game.test/src/game-worker.js'),respondWith:p=>{response=p;}});
 const r=await response;assert.equal(await r.text(),'module bytes');assert.equal(r.status,200);assert.equal(r.headers.get('etag'),'abc');assert.equal(r.headers.get('cross-origin-opener-policy'),'same-origin');assert.equal(r.headers.get('cross-origin-embedder-policy'),'require-corp');
 for(const req of [new Request('https://elsewhere.test/'),new Request('https://game.test/save',{method:'POST'})])handlers.get('fetch')({request:req,respondWith:()=>assert.fail('Should not intercept')});
 assert.equal(calls,1);
});
