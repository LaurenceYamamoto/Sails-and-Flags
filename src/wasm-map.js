import {compilePath,shipPoint} from './map-motion.js';
import {VesselGPU} from './map-gpu.js';
import {cityName,nameOf,t} from './i18n.js';
import {cameraFor,installMapNavigation,updateCameraElement,cityCamera} from './map-camera.js';
import {CITY_HIT_RADIUS,nearestCity} from './map-hit-test.js';
const NS='http://www.w3.org/2000/svg';
const node=(tag,attrs={})=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
const path=lines=>lines.map(line=>line.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')).join(' ');
const colors=['#f4d78b','#ee91ed','#7ce4fc','#9def9a','#ffad75','#aba8ff','#f5a6c9','#f5f0c7','#68d3bf','#cfb083','#b7c9f2','#ff8c9b','#c9e46b','#91bbff','#ddaeef'];
const rgb=colors.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255));
// Only presentation state is kept here: camera, DOM nodes and animation samples.
export class WorldMap {
 constructor(host,catalog,handlers){
  this.host=host;this.catalog=catalog;
  // Presentation offsets are separate from all game geography and saved coordinates.
  this.cities=catalog.cities.map(c=>c.id==='lima'?{...c,x:c.x+1.7,y:c.y-1.7}:{...c,x:c.displayX??c.x,y:c.displayY??c.y});
  this.handlers=handlers;this.camera=cameraFor('world');this.markers=new Map();this.key='';this.paths={};this.motionPaths=new Map();this.samples=[];this.sampleVersion=0;
  this.svg=node('svg',{class:'map wasm-map',viewBox:'0 0 900 450',tabindex:0,role:'group','aria-label':t('map')});
  this.svg.append(node('path',{d:catalog.land,class:'world-land','fill-rule':'evenodd'}));
  const roads=node('g',{class:'world-roads'});for(const r of catalog.roads.filter(r=>!r.retired))roads.append(node('path',{d:path(this.displayLines([r.points],r.a,r.b))}));this.svg.append(roads);
  const waterways=node('g',{class:'world-waterways'});for(const w of catalog.waterways){const line=node('path',{d:path(this.displayLines([w.displayPoints??w.points],w.a,w.b))});const title=node('title');title.textContent=w.river;line.append(title);waterways.append(line);}this.svg.append(waterways);
  this.routeLayer=node('g',{class:'world-routes'});this.svg.append(this.routeLayer);
  this.cityLayer=node('g');this.svg.append(this.cityLayer);
  // City labels and markers remain selectable even when vessels occupy a port.
  this.labelLayer=node('g',{class:'world-city-labels','aria-hidden':'true'});
  this.cities.forEach((c,i)=>{
   const g=node('g',{'data-city':i,transform:`translate(${c.x} ${c.y})`,tabindex:0,role:'button','aria-label':cityName(c)});
   g.append(node('circle',{class:'city-hit',r:CITY_HIT_RADIUS,fill:'transparent'}));
   g.append(node(c.inland&&!c.riverPort?'rect':'circle',{...(c.inland&&!c.riverPort?{x:-2,y:-2,width:4,height:4,fill:catalog.nations[c.nation].color}:{r:2.5,fill:catalog.nations[c.nation].color}),...(['lima','callao'].includes(c.id)?{'pointer-events':'none'}:{})}));
   const title=node('title');title.textContent=(cityName(c))+' · '+nameOf(catalog.nations[c.nation]);g.append(title);
   const labelGroup=node('g',{'data-city':i,transform:`translate(${c.x} ${c.y})`});
   const label=node('text',{x:c.mapLabelOffset?.[0]??(c.id==='callao'?-4:4),y:c.mapLabelOffset?.[1]??-3,'text-anchor':c.id==='callao'?'end':'start',class:'city-label'});label.textContent=cityName(c);labelGroup.append(label);this.labelLayer.append(labelGroup);this.cityLayer.append(g);
  });
  this.ships=node('g',{class:'world-ships','aria-hidden':'true','pointer-events':'none'});this.svg.append(this.ships,this.labelLayer);host.append(this.svg);
  this.gpuLayer=node('foreignObject',{'pointer-events':'none','aria-hidden':'true'});this.gpuLayer.style.display='none';this.canvas=document.createElement('canvas');this.canvas.style.cssText='width:100%;height:100%;display:block;pointer-events:none';this.gpuLayer.append(this.canvas);this.svg.insertBefore(this.gpuLayer,this.labelLayer);
  this.resizeObserver=new ResizeObserver(()=>this.updateHitAreas());this.resizeObserver.observe(this.svg);this.updateHitAreas();
  installMapNavigation(host.closest('.map-panel'),{get:()=>this.camera,set:c=>this.setCamera(c),pause:handlers.pause,cancelRoute:()=>{}});
  let drag=null;
  this.svg.addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false||drag)return;const city=this.cityAt(e,e.target);if(city===null)return;handlers.pause();drag={city,id:e.pointerId};e.preventDefault();e.stopPropagation();});
  this.pointerUp=e=>{if(!drag||drag.id!==e.pointerId)return;const d=drag;drag=null;const city=this.cityAt(e,document.elementFromPoint(e.clientX,e.clientY));if(city===null)return;if(city!==d.city)handlers.connect([d.city,city]);else handlers.city(city);};
  window.addEventListener('pointerup',this.pointerUp);
  this.svg.addEventListener('pointercancel',e=>{if(drag?.id===e.pointerId)drag=null;});
  this.svg.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const n=e.target.closest('[data-city]');if(n){e.preventDefault();handlers.city(+n.dataset.city);}const r=e.target.closest('[data-route]');if(r){e.preventDefault();handlers.route(+r.dataset.company,+r.dataset.route);}}});
  this.svg.addEventListener('click',e=>{if(this.cityAt(e,e.target)!==null)return;const r=e.target.closest('[data-route]');if(r)handlers.route(+r.dataset.company,+r.dataset.route);});
 }
 cityAt(e,target){
  if(!target||!this.svg.contains(target))return null;
  const label=target.closest('.world-city-labels [data-city]');
  if(label)return +label.dataset.city;
  return nearestCity(this.cities,{x:e.clientX,y:e.clientY},this.svg.getScreenCTM());
 }
 updateHitAreas(){
  const box=this.svg.getBoundingClientRect(),scale=Math.min(box.width/this.camera[2],box.height/this.camera[3]);
  this.mapRect=box;this.lastFrame=null;
  if(scale>0)this.svg.style.setProperty('--city-hit-radius',`${CITY_HIT_RADIUS/scale}px`);
 }
 displayLines(lines,a,b){
  if(!lines.length||![a,b].some(i=>this.cities[i].x!==this.catalog.cities[i].x||this.cities[i].y!==this.catalog.cities[i].y))return lines;
  const copy=lines.map(line=>line.map(p=>({...p})));
  const from=this.cities[a],to=this.cities[b];
  copy[0][0]={x:from.x,y:from.y};copy.at(-1)[copy.at(-1).length-1]={x:to.x,y:to.y};
  return copy;
 }
 destroy(){window.removeEventListener('pointerup',this.pointerUp);this.resizeObserver.disconnect();this.gpu?.destroy();}
 setCamera(c){this.camera=c;this.updateHitAreas();const u=c[2]/900;for(const g of this.labelLayer.children){const label=g.querySelector('text'),c=this.cities[+g.dataset.city],[dx,dy]=c.mapLabelOffset??[c.id==='callao'?-5:5,-5];label.setAttribute('x',dx*u);label.setAttribute('y',dy*u);}}
 select(city){if(this.selectedCity===city)return;this.selectedCity=city;for(const layer of [this.cityLayer,this.labelLayer])for(const n of layer.children)n.classList.toggle('selected',+n.dataset.city===city);}
 focus(city){this.setCamera(cityCamera(this.cities[city]));updateCameraElement(this.svg,this.camera);}
 update(view,selected,city){
  this.view=view;this.sampled=performance.now();this.sampleVersion++;if(view.paths&&view.paths!==this.sourcePaths){this.sourcePaths=view.paths;this.paths=Object.fromEntries(Object.entries(view.paths).map(([key,lines])=>{const [,a,b]=key.split(':');return [key,this.displayLines(lines,+a,+b)];}));this.motionPaths=new Map(Object.entries(this.paths).map(([key,lines])=>[key,compilePath(lines)]));}
  const key=JSON.stringify([view.companies.map(c=>[c.index,this.handlers.companyName(c),c.routes.map(r=>[r.id,r.stops])]),selected,city]);
  if(key!==this.key){this.key=key;this.routeLayer.replaceChildren();for(const c of view.companies)for(const r of c.routes){
   const lines=r.stops.flatMap((a,i)=>this.paths[`${r.mode}:${a}:${r.stops[(i+1)%r.stops.length]}`]??[]);
   const p=node('path',{d:path(lines),stroke:colors[c.index%colors.length],class:'trade-path'+(selected===r.id?' chosen':'')+(r.stops.includes(city)?' city-related':''),'data-action':'select-route','data-route':r.id,'data-company':c.index,tabindex:0,role:'button','aria-label':this.handlers.companyName(c)+' '+t('routes')+' '+r.id});
   if(c.index)p.setAttribute('stroke-dasharray','4 3');this.routeLayer.append(p);
  }}
  const active=new Set();for(const c of view.companies)for(const s of c.ships){if(s.route===null)continue;active.add(s.id);let n=this.markers.get(s.id);if(!n){n=node('path',{d:'M 0 -3 L 2.8 2.3 L -2.8 2.3 Z',class:'vessel-marker'});this.markers.set(s.id,n);this.ships.append(n);}n.setAttribute('fill',colors[c.index%colors.length]);}
  for(const [id,n]of this.markers)if(!active.has(id)){n.remove();this.markers.delete(id);}
  this.samples=[];
  for(const c of view.companies){const routes=new Map(c.routes.map(r=>[r.id,r]));for(const s of c.ships){const r=routes.get(s.route);if(!r)continue;this.samples.push({id:s.id,fallback:this.cities[r.stops[s.next]],voyage:s.voyage,path:s.voyage?this.motionPaths.get(`${r.mode}:${s.voyage.from}:${s.voyage.to}`):null,color:rgb[c.index%rgb.length]});}}
  this.animate(false,1);
 }
 updateClock(view){this.view=view;this.sampled=performance.now();}
 animate(running,speed){if(!this.view)return;const extra=running?Math.min(.5,(performance.now()-this.sampled)/1000)*speed:0;
  const stamp=[this.sampleVersion,this.view.fraction,extra,...this.camera].join(':');if(stamp===this.lastFrame)return;this.lastFrame=stamp;
  const points=this.samples.map(s=>shipPoint(s,this.view.fraction??0,extra));
  if(this.samples.length>=200){
   this.gpu??=new VesselGPU(this.canvas);
   const [x,y,width,height]=this.camera;for(const [key,value]of Object.entries({x,y,width,height}))this.gpuLayer.setAttribute(key,value);
   if(this.gpu.draw(this.samples,points,this.camera,this.mapRect??this.svg.getBoundingClientRect())){this.gpuLayer.style.display='';this.ships.style.display='none';this.host.dataset.renderer='webgl';return;}
  }
  this.gpuLayer.style.display='none';this.ships.style.display='';this.host.dataset.renderer='svg';
  for(let i=0;i<this.samples.length;i++){const n=this.markers.get(this.samples[i].id),p=points[i];if(n)n.setAttribute('transform',`translate(${p.x} ${p.y}) scale(${Math.max(.2,this.camera[2]/900)})`);}
 }
}
