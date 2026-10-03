import test from 'node:test';
import assert from 'node:assert/strict';
import {IndexedSaves} from '../src/indexed-saves.js';
// Transaction-level fault injection: changes are staged, and quota rejection
// discards the whole transaction, like IndexedDB. Real IDB is tested in-browser.
class LimitedStore extends IndexedSaves {
 constructor(){super(null);this.snapshots=new Map();this.metadata=new Map();this.limit=Infinity;}
 async list(){return [...this.metadata.values()];}
 async transaction(_,work){const s=new Map(this.snapshots),m=new Map(this.metadata);const store=map=>({delete:id=>map.delete(id),put:row=>map.set(row.id,row)});work(store(s),store(m));if([...s.values()].reduce((n,r)=>n+r.bytes.length,0)>this.limit)throw new DOMException('Full','QuotaExceededError');this.snapshots=s;this.metadata=m;}
}
test('five manual slots overwrite independently; autos retain only five generations',async()=>{
 const s=new LimitedStore();for(let i=1;i<=5;i++)await s.write(i,'manual',{day:i,name:'test'});
 for(let i=0;i<9;i++)await s.write(null,'auto',{day:i,name:'test'});
 let rows=await s.list();assert.equal(rows.filter(r=>r.auto).length,5);assert.equal(rows.filter(r=>!r.auto).length,5);
 await s.write(3,'replacement',{day:22});assert.equal((await s.list()).length,10);assert.equal(s.metadata.get('manual-3').day,22);await assert.rejects(s.write(6,'x',{}));
});
test('quota retry evicts oldest autos, never manual slots; final failure preserves all saves',async()=>{
 const s=new LimitedStore();await s.write(1,'m'.repeat(30),{day:0});
 for(let i=0;i<4;i++){const row=await s.write(null,'a'.repeat(10),{day:i});s.metadata.get(row.id).savedAt=i;}
 s.limit=65;await s.write(null,'x'.repeat(15),{day:5});let rows=await s.list();assert.deepEqual(rows.filter(r=>r.auto).map(r=>r.day).sort(),[2,3,5]);assert.equal(s.snapshots.get('manual-1').bytes.length,30);
 const before=structuredClone([...s.snapshots]);await assert.rejects(s.write(null,'y'.repeat(100),{day:6}),{name:'QuotaExceededError'});assert.deepEqual([...s.snapshots],before);
});
test('unavailable IndexedDB reports failure instead of false success',async()=>{await assert.rejects(new IndexedSaves(null).list(),/unavailable/);});
