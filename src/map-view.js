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
function line(a,b,attributes=''){const from=CITIES[a],to=CITIES[b];return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" ${attributes}/>`;}
export function renderMap(state, selectedCity, selectedRoute, shipTransform, {plannedStops=[],mapPlanning=false,showRivals=true,selectedCompetitor=null}={}) {
  const rivalLines=showRivals?state.competitors.map((company,index)=>company.routes.map(r=>`<g class="rival-route ${selectedCompetitor===index?'selected':''} ${company.gameOver?'inactive':''}" data-action="select-competitor" data-id="${index}" role="button" tabindex="0" aria-label="${escape(company.name)} · ${routeTitle(r)}"><title>${escape(company.name)} · ${routeTitle(r)}</title>${routeLegs(r).map(([a,b])=>line(a,b,'class="rival-hit"')+line(a,b,'class="rival-line"')).join('')}</g>`).join('')+company.ships.filter(s=>s.routeId).map(ship=>`<g class="rival-ship" data-rival-ship="${ship.id}" data-company="${index}" data-action="select-competitor" data-id="${index}" role="button" tabindex="0" aria-label="${escape(company.name)} · ${escape(shipName(company,ship))} · ${name(shipSpec(company,ship.type))}" transform="${shipTransform(ship)}"><title>${escape(company.name)}</title><circle r="13" class="ship-hit"/><path d="M0-8L8 0L0 8L-8 0Z" fill="#93e2f5" stroke="#153740" stroke-width="2"/></g>`).join('')).join(''):'';
  const lines=state.routes.map(r=>routeLegs(r).map(([a,b])=>line(a,b,`class="route-line ${r.active?'':'inactive'} ${r.id===selectedRoute&&selectedCompetitor===null?'selected':''}"`)).join('')).join('');
  const markers=state.routes.map(r=>routeShips(state,r).map(ship=>`<g class="ship-marker ${r.id===selectedRoute&&selectedCompetitor===null?'selected':''}" data-ship="${ship.id}" data-action="select-route" data-id="${r.id}" tabindex="0" role="button" aria-label="${escape(shipName(state,ship))} · ${name(shipSpec(state,ship.type))} #${ship.id.split('-')[1]} · ${t('routes')}" transform="${shipTransform(ship)}"><title>${routeTitle(r)}</title><circle r="14" class="ship-hit"/><circle r="10" fill="#edc786"/><path d="M-5 3H6L3 6H-3ZM0-8V1H6Z" fill="#17383b"/></g>`).join('')).join('');
  const planned=plannedStops.length>1?routeLegs({stops:plannedStops}).map(([a,b],i)=>line(a,b,`class="planned-route ${i===normalizeStops(plannedStops).length-1?'return-leg':''}"`)).join(''):'';
  return `<svg class="map" viewBox="0 0 900 520" role="group" aria-label="${t('map')}">
    <defs><pattern id="grid" width="75" height="75" patternUnits="userSpaceOnUse"><path d="M75 0H0V75" fill="none" stroke="#ffffff" stroke-opacity=".055"/></pattern><radialGradient id="sea"><stop stop-color="#24515b"/><stop offset="1" stop-color="#153740"/></radialGradient></defs>
    <rect width="900" height="520" fill="url(#sea)"/><rect width="900" height="520" fill="url(#grid)"/>
    <path class="land" d="${landPath}" fill-rule="evenodd" fill="#496268" stroke="#85958d" stroke-opacity=".6" stroke-width=".6"/>
    <g class="map-label"><text x="355" y="255" class="ocean">NORTH ATLANTIC</text><text x="465" y="280">1700</text><text x="145" y="505">CARIBBEAN SEA</text><text x="805" y="180">EUROPE</text></g>
    ${rivalLines}${lines}${planned}${markers}<line id="route-drag-preview" hidden/><text id="route-drag-label" x="475" y="480" text-anchor="middle" hidden></text>
    ${Object.entries(CITIES).map(([id,c])=>{const [dx,dy]=c.label,indices=plannedStops.flatMap((port,i)=>port===id?[i+1]:[]),index=indices.length?indices[0]-1:-1;return `<g class="port ${id===selectedCity?'selected':''} ${index>=0?'planned-port':''}" data-city="${id}" tabindex="0" role="button" aria-label="${name(c)} · ${mapPlanning?tx('寄港地に追加','Add stop'):t('market')}"><title>${name(c)} · ${name(NATIONS[c.nation])}</title><path class="label-leader" d="M${c.x},${c.y}L${c.x+dx},${c.y+dy-4}"/><circle cx="${c.x}" cy="${c.y}" r="10" class="halo"/><circle cx="${c.x}" cy="${c.y}" r="4.5" fill="${NATIONS[c.nation].color}"/><text x="${c.x+dx}" y="${c.y+dy}" text-anchor="${dx>=0?'start':'end'}">${name(c)}${index>=0?` 〔${indices.join(",")}〕`:''}</text></g>`;}).join('')}
  </svg>`;
}
