import test from 'node:test';
import assert from 'node:assert/strict';
import {CITY_HIT_RADIUS,nearestCity} from '../src/map-hit-test.js';

test('city hit radius stays 22 CSS pixels on narrow screens and at every zoom',()=>{
 const cities=[{x:450,y:225}];
 for(const scale of [.35,.8,1,4,12]){
  const matrix={a:scale,b:0,c:0,d:scale,e:17,f:29};
  const center={x:450*scale+17,y:225*scale+29};
  assert.equal(CITY_HIT_RADIUS,22);
  assert.equal(nearestCity(cities,{x:center.x+21.9,y:center.y},matrix),0);
  assert.equal(nearestCity(cities,{x:center.x+22.1,y:center.y},matrix),null);
  assert.equal(nearestCity(cities,{x:center.x+16,y:center.y+16},matrix),null);
 }
});
test('overlapping city targets select the nearest center, independent of paint order',()=>{
 const cities=[{id:'lima',x:10,y:10},{id:'callao',x:12.4,y:10}];
 const matrix={a:4,b:0,c:0,d:4,e:100,f:50};
 for(const city of cities){
  const point={x:matrix.e+city.x*4,y:matrix.f+city.y*4};
  assert.equal(cities[nearestCity(cities,point,matrix)].id,city.id);
  const reversed=cities.toReversed();assert.equal(reversed[nearestCity(reversed,point,matrix)].id,city.id);
 }
 const mid={x:144.8,y:90};assert.equal(nearestCity(cities,mid,matrix),0);
 assert.equal(nearestCity(cities,{x:148,y:90},matrix),1);
});
test('empty maps, detached SVG and off-target points do not select cities or change coordinates',()=>{
 const cities=[{x:100,y:100}],before=structuredClone(cities),matrix={a:1,b:0,c:0,d:1,e:0,f:0};
 assert.equal(nearestCity([],cities[0],matrix),null);
 assert.equal(nearestCity(cities,cities[0],null),null);
 assert.equal(nearestCity(cities,{x:200,y:100},matrix),null);
 assert.deepEqual(cities,before);
});
