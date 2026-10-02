import {seaPoints} from './sea-routing.js';
import {ROADS,roadPoints} from './land-data.js';
import {shipName} from './identity.js';
import {shipSpec} from './industry.js';
import { CITIES, NATIONS, SHIPS } from './data.js';
import { routeShips, routeLegs, normalizeStops } from './engine.js';
import { routeTitle } from './routes-view.js';
import { t, tx, nameOf as name } from './i18n.js';
import { project } from './geography.js';
import { LAND } from '../assets/maps/land.js';
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const landPath=LAND.map(poly=>poly.map(ring=>ring.map(([lon,lat],i)=>{const p=project(lon,lat);return `${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`;}).join('')+'Z').join('')).join('');
function line(a,b,attributes='',land=false){const points=land?roadPoints(a,b):seaPoints(a,b);return points.length?`<polyline points="${points.map(p=>p.x+','+p.y).join(' ')}" fill="none" ${attributes}/>`:'';}
export function renderMap(state, selectedCity, selectedRoute, shipTransform, {plannedStops=[],mapPlanning=false,showRivals=true,selectedCompetitor=null,mapRegion='world'}={}) {
  const rivalLines=showRivals?state.competitors.map((company,index)=>company.routes.map(r=>`<g class="rival-route ${selectedCompetitor===index?'selected':''} ${company.gameOver?'inactive':''}" data-action="select-competitor" data-id="${index}" role="button" tabindex="0" aria-label="${escape(company.name)} · ${routeTitle(r)}"><title>${escape(company.name)} · ${routeTitle(r)}</title>${routeLegs(r).map(([a,b])=>line(a,b,'class="rival-hit"',r.mode==='land')+line(a,b,'class="rival-line"',r.mode==='land')).join('')}</g>`).join('')+company.ships.filter(s=>s.routeId).map(ship=>`<g class="rival-ship" data-rival-ship="${ship.id}" data-company="${index}" data-action="select-competitor" data-id="${index}" role="button" tabindex="0" aria-label="${escape(company.name)} · ${escape(shipName(company,ship))} · ${name(shipSpec(company,ship.type))}" transform="${shipTransform(ship)}"><title>${escape(company.name)}</title><circle r="13" class="ship-hit"/><path d="M0-8L8 0L0 8L-8 0Z" fill="#93e2f5" stroke="#153740" stroke-width="2"/></g>`).join('')).join(''):'';
  // Player routes are selected via ships; draw shared legs once per visual state.
  // Selected legs go last so an overlapping route cannot obscure the selection.
  const shared=new Map();
  for(const r of state.routes)for(const [a,b] of routeLegs(r)) {
    const selected=r.id===selectedRoute&&selectedCompetitor===null;
    const key=[a,b].sort().join(':')+':'+r.mode+':'+r.active+':'+selected;
    shared.set(key,{a,b,active:r.active,selected,mode:r.mode});
  }
  const lines=[...shared.values()].sort((a,b)=>Number(a.selected)-Number(b.selected)).map(({a,b,active,selected,mode})=>line(a,b,`class="route-line ${mode==='land'?'land-route':''} ${active?'':'inactive'} ${selected?'selected':''}"`,mode==='land')).join('');
  const markers=state.routes.map(r=>routeShips(state,r).map(ship=>`<g class="ship-marker ${r.id===selectedRoute&&selectedCompetitor===null?'selected':''}" data-ship="${ship.id}" data-action="select-route" data-id="${r.id}" tabindex="0" role="button" aria-label="${escape(shipName(state,ship))} · ${name(shipSpec(state,ship.type))} #${ship.id.split('-')[1]} · ${t('routes')}" transform="${shipTransform(ship)}"><title>${routeTitle(r)}</title><circle r="14" class="ship-hit"/><circle r="10" fill="#edc786"/>${r.mode==='land'?'<path d="M-6-4H6V3H-6Z M-4 3V6 M4 3V6" fill="#17383b" stroke="#17383b"/>':'<path d="M-5 3H6L3 6H-3ZM0-8V1H6Z" fill="#17383b"/>'}</g>`).join('')).join('');
  const planned=plannedStops.length>1?routeLegs({stops:plannedStops}).map(([a,b],i)=>line(a,b,`class="planned-route ${i===normalizeStops(plannedStops).length-1?'return-leg':''}"`,plannedStops.some(id=>CITIES[id].inland))).join(''):'';
  return `<svg class="map ${mapRegion}" viewBox="${mapRegion==='europe'?'625 35 275 235':mapRegion==='mediterranean'?'710 130 190 125':'0 0 900 520'}" role="group" aria-label="${t('map')}">
    <defs><pattern id="grid" width="75" height="75" patternUnits="userSpaceOnUse"><path d="M75 0H0V75" fill="none" stroke="#ffffff" stroke-opacity=".055"/></pattern><radialGradient id="sea"><stop stop-color="#24515b"/><stop offset="1" stop-color="#153740"/></radialGradient></defs>
    <rect width="900" height="520" fill="url(#sea)"/><rect width="900" height="520" fill="url(#grid)"/>
    <path class="land" d="${landPath}" fill-rule="evenodd" fill="#496268" stroke="#85958d" stroke-opacity=".6" stroke-width=".6"/>
    <g class="map-label"><text x="355" y="255" class="ocean">NORTH ATLANTIC</text><text x="465" y="280">1700</text><text x="145" y="505">CARIBBEAN SEA</text><text x="805" y="180">EUROPE</text></g>
    ${Object.values(ROADS).map(r=>line(r.a,r.b,'class="road-link"',true)).join('')}${rivalLines}${lines}${planned}${markers}<line id="route-drag-preview" hidden/><text id="route-drag-label" x="475" y="480" text-anchor="middle" hidden></text>
    ${Object.entries(CITIES).map(([id,c])=>{const [dx,dy]=(mapRegion==='mediterranean'?({genoa:[3,-6],livorno:[4,7],marseille:[-5,-5],barcelona:[5,8],madrid:[5,-4],cadiz:[5,7]})[id]:null)??c.label,indices=plannedStops.flatMap((port,i)=>port===id?[i+1]:[]),index=indices.length?indices[0]-1:-1;return `<g class="port ${id===selectedCity?'selected':''} ${index>=0?'planned-port':''}" data-city="${id}" tabindex="0" role="button" aria-label="${name(c)} · ${mapPlanning?tx('寄港地に追加','Add stop'):t('market')}"><title>${name(c)} · ${name(NATIONS[c.nation])}</title><path class="label-leader" d="M${c.x},${c.y}L${c.x+dx},${c.y+dy-4}"/><circle cx="${c.x}" cy="${c.y}" r="10" class="halo"/>${c.inland?`<rect x="${c.x-3}" y="${c.y-3}" width="6" height="6" fill="${NATIONS[c.nation].color}"/>`:`<circle cx="${c.x}" cy="${c.y}" r="4.5" fill="${NATIONS[c.nation].color}"/>`}<text x="${c.x+dx}" y="${c.y+dy}" text-anchor="${dx>=0?'start':'end'}">${name(c)}${index>=0?` 〔${indices.join(",")}〕`:''}</text></g>`;}).join('')}
  </svg>`;
}
