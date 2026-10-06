import {ASIA_PORTS} from '../src/asia-expansion-data.js';
import {TARANTO_PORTS} from '../src/taranto-data.js';
import {FRENCH_CARIBBEAN_PORTS} from '../src/french-caribbean-data.js';
import {ATLANTIC_PORTS} from '../src/atlantic-expansion-data.js';
import {EUROPE_PORTS} from '../src/europe-expansion-data.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {CITIES} from '../src/data.js';
import {EXPANSION_PORTS} from '../src/port-expansion-data.js';
import {PORT_APPROACHES,seaRoute,seaPosition,waterSegment,onLand} from '../src/sea-routing.js';
import {seaRoute as frozenRoute} from '../src/legacy/sea-routing-v12.js';
import {CROSSING_PORTS} from '../src/crossing-data.js';
test('Pondicherry lies on the coast and connects to every port over the sea',()=>{
 const c=CITIES.pondicherry;assert.equal(c.nation,'france');assert.equal(Object.keys(CITIES).indexOf('pondicherry'),114);assert.ok(onLand([c.lon,c.lat]));assert.ok(!onLand(EXPANSION_PORTS.pondicherry.gateway));
 const segments=new Map();for(const id of Object.keys(PORT_APPROACHES).filter(id=>id!=='pondicherry')){
  const r=seaRoute('pondicherry',id),reverse=seaRoute(id,'pondicherry');assert.ok(r.nm>0&&Number.isFinite(r.nm));assert.equal(r.nm,reverse.nm);assert.deepEqual(r.coordinates,[...reverse.coordinates].reverse());assert.deepEqual(seaPosition('pondicherry',id,0),{x:c.x,y:c.y});
  for(let i=1;i<r.offshore.length;i++){const a=r.offshore[i-1],b=r.offshore[i];segments.set(JSON.stringify([a,b].sort()),[a,b]);}
 }
 for(const [key,[a,b]]of segments)assert.ok(waterSegment(a,b),key);assert.ok(seaRoute('pondicherry','hughli').nm<=1800);
});
test('adding a port leaves all frozen sea-route distances unchanged',()=>{
 const ports=Object.keys(PORT_APPROACHES).filter(id=>!CROSSING_PORTS[id]&&!EXPANSION_PORTS[id]&&!EUROPE_PORTS[id]&&!ATLANTIC_PORTS[id]&&!FRENCH_CARIBBEAN_PORTS[id]&&!TARANTO_PORTS[id]&&!ASIA_PORTS[id]);for(let i=0;i<ports.length;i++)for(let j=i+1;j<ports.length;j++)assert.equal(seaRoute(ports[i],ports[j]).nm,frozenRoute(ports[i],ports[j]).nm);
});


test('Edo uses a water-only bay approach and connects to every port without relocating older cities',()=>{
 const c=CITIES.edo;assert.equal(Object.keys(CITIES)[115],'edo');assert.equal(c.mapName,'江戸');assert.equal(c.nation,'japan');assert.ok(onLand([c.lon,c.lat]));assert.ok(!onLand(EXPANSION_PORTS.edo.gateway));
 const approach=PORT_APPROACHES.edo;for(let i=1;i<approach.length;i++)assert.ok(waterSegment(approach[i-1],approach[i]));
 const segments=new Map();for(const id of Object.keys(PORT_APPROACHES).filter(id=>id!=='edo')){const r=seaRoute('edo',id);assert.ok(Number.isFinite(r.nm)&&r.nm>0);assert.equal(r.nm,seaRoute(id,'edo').nm);assert.deepEqual(r.coordinates[0],[c.lon,c.lat]);for(let i=1;i<r.offshore.length;i++)segments.set(JSON.stringify([r.offshore[i-1],r.offshore[i]].sort()),[r.offshore[i-1],r.offshore[i]]);}
 for(const [a,b]of segments.values())assert.ok(waterSegment(a,b));assert.ok(seaRoute('edo','osaka').nm<=1800);assert.ok(seaRoute('edo','nagasaki').nm<=1800);
});
