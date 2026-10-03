export const MAP_PRESETS={world:[0,0,900,450],egypt:[510,140,37.5,18.75],panama:[232,190,37.5,18.75],europe:[415,62,115,57.5],mediterranean:[422,106,65,32.5],caribbean:[224,152,92,46],americas:[75,65,335,167.5],africa:[388,140,220,110],asia:[595,104,220,110]};
export const cameraFor=id=>[...(MAP_PRESETS[id]??MAP_PRESETS.world)];
export function constrainCamera([x,y,w]){w=Math.max(37.5,Math.min(900,w));const h=w/2;return [Math.max(0,Math.min(900-w,x)),Math.max(0,Math.min(450-h,y)),w,h];}
export function zoomCamera(camera,factor,anchor={x:camera[0]+camera[2]/2,y:camera[1]+camera[3]/2}){
  const w=Math.max(37.5,Math.min(900,camera[2]/factor)),ratio=w/camera[2];
  return constrainCamera([anchor.x-(anchor.x-camera[0])*ratio,anchor.y-(anchor.y-camera[1])*ratio,w]);
}
export const panCamera=(c,dx,dy)=>constrainCamera([c[0]+dx,c[1]+dy,c[2]]);
export const cityCamera=c=>constrainCamera([c.x-37.5,c.y-18.75,75]);
export function updateCameraElement(svg,camera){
  svg.setAttribute('viewBox',camera.join(' '));svg.style.setProperty('--map-unit',camera[2]/900);
  svg.classList.toggle('map-detail',camera[2]<=300);
  svg.closest('.map-panel')?.querySelector('[data-map-scale]')?.replaceChildren(`${(900/camera[2]).toFixed(1)}×`);
}
// Background drags pan; city drags continue to be handled by the route editor.
// Navigation edits only the camera DOM, never the simulation or saved game.
export function installMapNavigation(app,{get,set,pause,cancelRoute}){
  let pan=null;
  const apply=c=>{set(c);const svg=app.querySelector('svg.map');if(svg)updateCameraElement(svg,c);};
  const point=(svg,e)=>new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());
  const finish=()=>{if(!pan)return;const p=pan;pan=null;p.svg.classList.remove('panning');if(p.svg.hasPointerCapture(p.id))p.svg.releasePointerCapture(p.id);};
  app.addEventListener('wheel',e=>{const svg=e.target.closest('svg.map');if(!svg)return;e.preventDefault();pause();cancelRoute();apply(zoomCamera(get(),Math.exp(-Math.max(-300,Math.min(300,e.deltaY))*.003),point(svg,e)));},{passive:false});
  app.addEventListener('click',e=>{const b=e.target.closest('[data-map-nav]');if(!b)return;pause();const c=get(),dir=b.dataset.mapNav;apply(dir==='reset'?cameraFor('world'):dir==='in'||dir==='out'?zoomCamera(c,dir==='in'?1.5:1/1.5):panCamera(c,({left:-1,right:1})[dir]*c[2]*.2||0,({up:-1,down:1})[dir]*c[3]*.2||0));});
  app.addEventListener('pointerdown',e=>{const svg=e.target.closest('svg.map');if(!svg||e.button!==0||!e.isPrimary||e.target.closest('[data-city],[data-action]'))return;pause();pan={id:e.pointerId,svg,start:point(svg,e),camera:[...get()]};svg.setPointerCapture(e.pointerId);svg.classList.add('panning');e.preventDefault();});
  app.addEventListener('pointermove',e=>{if(!pan||pan.id!==e.pointerId)return;const p=point(pan.svg,e),c=get();apply(panCamera(c,pan.start.x-p.x,pan.start.y-p.y));e.preventDefault();});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])app.addEventListener(type,e=>{if(pan?.id===e.pointerId)finish();});
  app.addEventListener('keydown',e=>{if(!e.target.matches('svg.map'))return;const c=get();if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','=','-','Home','Escape'].includes(e.key)){e.preventDefault();pause();if(e.key==='Escape'){finish();return;}apply(e.key==='Home'?cameraFor('world'):['+','=','-'].includes(e.key)?zoomCamera(c,e.key==='-'?1/1.5:1.5):panCamera(c,({ArrowLeft:-1,ArrowRight:1})[e.key]*c[2]*.15||0,({ArrowUp:-1,ArrowDown:1})[e.key]*c[3]*.15||0));}});
}
