import {FRENCH_CARIBBEAN_PORTS} from '../src/french-caribbean-data.js';
import {TARANTO_PORTS} from '../src/taranto-data.js';
import {SIBERIAN_CITIES} from '../src/siberian-data.js';
// Build-time presentation coordinates. Gameplay coordinates and distances stay intact.
import {onLand} from '../src/world-geometry.js';
import {ATLANTIC_CITIES} from '../src/atlantic-expansion-data.js';
export function layoutAddedCities(cities){
 const named=id=>cities.find(c=>c.id===id),s=named('santiagodechile'),v=named('valparaiso');
 const minimum=Math.hypot(s.x-v.x,s.y-v.y),placed=[];
 for(const c of cities){
  if(!ATLANTIC_CITIES[c.id]&&!SIBERIAN_CITIES[c.id]&&!FRENCH_CARIBBEAN_PORTS[c.id]&&!TARANTO_PORTS[c.id]){placed.push(c.id==='lima'?{...c,x:c.x+1.7,y:c.y-1.7}:c);continue;}
  const valid=p=>onLand([p.x/2.5-180,90-p.y/2.5])&&placed.every(b=>Math.hypot(p.x-b.x,p.y-b.y)>=minimum);
  let p={x:c.x,y:c.y};if(!valid(p)){
   const near=[...placed].sort((a,b)=>Math.hypot(c.x-a.x,c.y-a.y)-Math.hypot(c.x-b.x,c.y-b.y))[0];
   const direction=Math.atan2(c.y-near.y,c.x-near.x);let found=false;
   for(let r=.05;r<=3&&!found;r+=.05)for(let k=0;k<72;k++){const angle=direction+Math.PI*2*k/72,q={x:c.x+r*Math.cos(angle),y:c.y+r*Math.sin(angle)};if(valid(q)){p=q;found=true;break;}}
   if(!found)throw Error('No suitably spaced land display position: '+c.id);
  }
  c.displayX=p.x;c.displayY=p.y;placed.push({...c,...p});
 }
 return cities;
}
