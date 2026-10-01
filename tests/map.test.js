import test from 'node:test';
import assert from 'node:assert/strict';
import { LAND } from '../assets/maps/land.js';
import { CITIES } from '../src/data.js';
import { PORT_GEOGRAPHY,project } from '../src/geography.js';
import { setLanguage,nameOf } from '../src/i18n.js';
import { serialize } from '../src/engine.js';
import {createGame} from './baseline.js';
import { renderMap } from '../src/map-view.js';
function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)yes=!yes;}return yes;}
function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
test('all cities use the same projection as land and lie on land or its generalized coast',()=>{
  const polygons=LAND.map(poly=>poly.map(r=>r.map(([lon,lat])=>project(lon,lat))));
  for(const [id,city]of Object.entries(CITIES)){
    assert.deepEqual({x:city.x,y:city.y},project(PORT_GEOGRAPHY[id].lon,PORT_GEOGRAPHY[id].lat));
    const land=polygons.some(poly=>inside(city,poly[0])&&!poly.slice(1).some(r=>inside(city,r)));
    const distance=land?0:Math.min(...polygons.flat().map(r=>Math.min(...r.map((p,i)=>segmentDistance(city,p,r[(i+1)%r.length])))));
    assert.ok(distance<1,`${id}: ${distance} px from land`);
  }
});
test('city labels keep configured script in Japanese and English, including future kanji names',()=>{
  for(const lang of ['ja','en']){setLanguage(lang);for(const city of Object.values(CITIES))assert.equal(nameOf(city),city.mapName);assert.equal(nameOf({name:'横浜',mapName:'横浜'}),'横浜');}setLanguage('ja');
});
test('map renders all circuit preview legs and selectable rival routes without changing the game',()=>{
  const state=createGame(),before=serialize(state),transform=()=> 'translate(0,0)';
  const html=renderMap(state,'kingston',null,transform,{mapPlanning:true,plannedStops:['kingston','havana','santiago'],selectedCompetitor:1});
  assert.equal((html.match(/class="planned-route/g)||[]).length,3);assert.match(html,/return-leg/);assert.equal((html.match(/class="rival-route/g)||[]).length,2);assert.match(html,/Antilles Company/);assert.match(html,/data-action="select-competitor"/);assert.match(html,/Santiago 〔3〕/);
  const hidden=renderMap(state,'kingston',null,transform,{showRivals:false});assert.doesNotMatch(hidden,/class="rival-route/);assert.equal(serialize(state),before);
});
