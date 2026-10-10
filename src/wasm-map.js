import {cityName,nameOf,t} from './i18n.js';
import {cameraFor,installMapNavigation,updateCameraElement,cityCamera} from './map-camera.js';
const NS='http://www.w3.org/2000/svg';
const node=(tag,attrs={})=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
const path=lines=>lines.map(line=>line.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')).join(' ');
const colors=['#f4d78b','#ee91ed','#7ce4fc','#9def9a','#ffad75','#aba8ff','#f5a6c9','#f5f0c7','#68d3bf','#cfb083','#b7c9f2','#ff8c9b','#c9e46b','#91bbff','#ddaeef'];
// Only presentation state is kept here: camera, DOM nodes and animation samples.
export class WorldMap {
 constructor(host,catalog,handlers){
  this.host=host;this.catalog=catalog;
  // Presentation offsets are separate from all game geography and saved coordinates.
  this.cities=catalog.cities.map(c=>c.id==='lima'?{...c,x:c.x+1.7,y:c.y-1.7}:{...c,x:c.displayX??c.x,y:c.displayY??c.y});
  this.handlers=handlers;this.camera=cameraFor('world');this.markers=new Map();this.key='';this.paths={};
  this.svg=node('svg',{class:'map wasm-map',viewBox:'0 0 900 450',tabindex:0,role:'group','aria-label':t('map')});
  this.svg.append(node('path',{d:catalog.land,class:'world-land','fill-rule':'evenodd'}));
  const roads=node('g',{class:'world-roads'});for(const r of catalog.roads.filter(r=>!r.retired))roads.append(node('path',{d:path(this.displayLines([r.points],r.a,r.b))}));this.svg.append(roads);
  this.routeLayer=node('g',{class:'world-routes'});this.svg.append(this.routeLayer);
  this.cityLayer=node('g');this.svg.append(this.cityLayer);
  // Keep names above vessels so an occupied port remains selectable by its label.
  this.labelLayer=node('g',{class:'world-city-labels','aria-hidden':'true'});
  this.cities.forEach((c,i)=>{
   const g=node('g',{'data-city':i,transform:`translate(${c.x} ${c.y})`,tabindex:0,role:'button','aria-label':cityName(c)});
   // Keep the close Lima/Callao hit areas from covering the other city's marker.
   g.append(node('circle',{class:'city-hit',r:10,fill:'transparent',...(['lima','callao'].includes(c.id)?{style:'r:min(1.5px, calc(4px * var(--map-unit,1)))'}:{})}));
   g.append(node(c.inland?'rect':'circle',{...(c.inland?{x:-2,y:-2,width:4,height:4,fill:catalog.nations[c.nation].color}:{r:2.5,fill:catalog.nations[c.nation].color}),...(['lima','callao'].includes(c.id)?{'pointer-events':'none'}:{})}));
   const title=node('title');title.textContent=(cityName(c))+' · '+nameOf(catalog.nations[c.nation]);g.append(title);
   const labelGroup=node('g',{'data-city':i,transform:`translate(${c.x} ${c.y})`});
   const label=node('text',{x:c.mapLabelOffset?.[0]??(c.id==='callao'?-4:4),y:c.mapLabelOffset?.[1]??-3,'text-anchor':c.id==='callao'?'end':'start',class:'city-label'});label.textContent=cityName(c);labelGroup.append(label);this.labelLayer.append(labelGroup);this.cityLayer.append(g);
  });
  this.ships=node('g',{class:'world-ships'});this.svg.append(this.ships,this.labelLayer);host.append(this.svg);
  installMapNavigation(host.closest('.map-panel'),{get:()=>this.camera,set:c=>this.setCamera(c),pause:handlers.pause,cancelRoute:()=>{}});
  let drag=null;
  this.svg.addEventListener('pointerdown',e=>{const n=e.target.closest('[data-city]');if(!n||e.button!==0)return;handlers.pause();drag={city:+n.dataset.city,x:e.clientX,y:e.clientY};e.preventDefault();});
  this.pointerUp=e=>{if(!drag)return;const d=drag;drag=null;const n=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-city]');if(!n)return;const city=+n.dataset.city;if(city!==d.city)handlers.connect([d.city,city]);else handlers.city(city);};
  window.addEventListener('pointerup',this.pointerUp);
  this.svg.addEventListener('pointercancel',()=>drag=null);
  this.svg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const n=e.target.closest('[data-city]');if(n){e.preventDefault();handlers.city(+n.dataset.city);}const r=e.target.closest('[data-route]');if(r){e.preventDefault();handlers.route(+r.dataset.company,+r.dataset.route);}}});
  this.svg.addEventListener('click',e=>{const r=e.target.closest('[data-route]');if(r)handlers.route(+r.dataset.company,+r.dataset.route);});
 }
 displayLines(lines,a,b){
  if(!lines.length||![a,b].some(i=>this.cities[i].x!==this.catalog.cities[i].x||this.cities[i].y!==this.catalog.cities[i].y))return lines;
  const copy=lines.map(line=>line.map(p=>({...p})));
  const from=this.cities[a],to=this.cities[b];
  copy[0][0]={x:from.x,y:from.y};copy.at(-1)[copy.at(-1).length-1]={x:to.x,y:to.y};
  return copy;
 }
 destroy(){window.removeEventListener('pointerup',this.pointerUp);}
 setCamera(c){this.camera=c;const u=c[2]/900;for(const g of this.labelLayer.children){const label=g.querySelector('text'),c=this.cities[+g.dataset.city],[dx,dy]=c.mapLabelOffset??[c.id==='callao'?-5:5,-5];label.setAttribute('x',dx*u);label.setAttribute('y',dy*u);}}
 select(city){for(const layer of [this.cityLayer,this.labelLayer])for(const n of layer.children)n.classList.toggle('selected',+n.dataset.city===city);}
 focus(city){this.setCamera(cityCamera(this.cities[city]));updateCameraElement(this.svg,this.camera);}
 update(view,selected){
  this.view=view;this.sampled=performance.now();if(view.paths)this.paths=Object.fromEntries(Object.entries(view.paths).map(([key,lines])=>{const [,a,b]=key.split(':');return [key,this.displayLines(lines,+a,+b)];}));
  const key=JSON.stringify([view.companies.map(c=>[c.index,this.handlers.companyName(c),c.routes.map(r=>[r.id,r.stops])]),selected]);
  if(key!==this.key){this.key=key;this.routeLayer.replaceChildren();for(const c of view.companies)for(const r of c.routes){
   const lines=r.stops.flatMap((a,i)=>this.paths[`${r.mode}:${a}:${r.stops[(i+1)%r.stops.length]}`]??[]);
   const p=node('path',{d:path(lines),stroke:colors[c.index%colors.length],class:'trade-path'+(selected===r.id?' chosen':''),'data-action':'select-route','data-route':r.id,'data-company':c.index,tabindex:0,role:'button','aria-label':this.handlers.companyName(c)+' '+t('routes')+' '+r.id});
   if(c.index)p.setAttribute('stroke-dasharray','4 3');this.routeLayer.append(p);
  }}
  const active=new Set();for(const c of view.companies)for(const s of c.ships){if(s.route===null)continue;active.add(s.id);let n=this.markers.get(s.id);if(!n){n=node('path',{d:'M 0 -3 L 2.8 2.3 L -2.8 2.3 Z',class:'vessel-marker','data-action':'select-route',tabindex:0,role:'button'});this.markers.set(s.id,n);this.ships.append(n);}n.setAttribute('fill',colors[c.index%colors.length]);n.dataset.route=s.route;n.dataset.company=c.index;n.setAttribute('aria-label',s.name);}
  for(const [id,n]of this.markers)if(!active.has(id)){n.remove();this.markers.delete(id);}
  this.animate(false,1);
 }
 animate(running,speed){if(!this.view)return;const extra=running?Math.min(.5,(performance.now()-this.sampled)/1000)*speed:0;
  for(const c of this.view.companies)for(const s of c.ships){const n=this.markers.get(s.id);if(!n)continue;const r=c.routes.find(r=>r.id===s.route);if(!r)continue;let p=this.cities[r.stops[s.next]];
   if(s.voyage){const v=s.voyage,lines=this.paths[`${r.mode}:${v.from}:${v.to}`]??[],segments=[];let total=0;for(const line of lines)for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],len=Math.hypot(b.x-a.x,b.y-a.y);segments.push({a,b,len});total+=len;}let remaining=total*Math.min(1,(v.total-v.remaining+(this.view.fraction??0)+extra)/v.total);for(const seg of segments){if(remaining<=seg.len){const t=seg.len?remaining/seg.len:0;p={x:seg.a.x+(seg.b.x-seg.a.x)*t,y:seg.a.y+(seg.b.y-seg.a.y)*t};break;}remaining-=seg.len;}}
   n.setAttribute('transform',`translate(${p.x} ${p.y}) scale(${Math.max(.2,this.camera[2]/900)})`);
  }
 }
}
