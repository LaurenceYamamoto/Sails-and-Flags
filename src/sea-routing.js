import {ASIA_PORTS,ASIA_APPROACHES} from './asia-expansion-data.js';
import {ASIA_CONNECTIONS} from './asia-sea-connections.js';
import {FRENCH_CARIBBEAN_PORTS,FRENCH_CARIBBEAN_APPROACHES} from './french-caribbean-data.js';
import {FRENCH_CARIBBEAN_CONNECTIONS} from './french-caribbean-connections.js';
import {TARANTO_PORTS,TARANTO_APPROACHES,TARANTO_CONNECTIONS} from './taranto-data.js';
import {ATLANTIC_PORTS,ATLANTIC_APPROACHES} from './atlantic-expansion-data.js';
import {ATLANTIC_CONNECTIONS} from './atlantic-sea-connections.js';
import {EUROPE_PORTS,EUROPE_APPROACHES,EUROPE_CONNECTIONS} from './europe-expansion-data.js';
import {EXPANSION_PORTS,EXPANSION_APPROACHES,EXPANSION_CONNECTIONS} from './port-expansion-data.js';
import {seaRoute as previousRoute,PORT_APPROACHES as OLD_APPROACHES} from './legacy/sea-routing-v12.js';
import {CROSSING_APPROACHES,CROSSING_PORTS,CROSSING_CONNECTIONS} from './crossing-data.js';
import {PORT_GEOGRAPHY,project} from './geography.js';
import {NETWORK as BASE_NETWORK} from '../assets/maps/world-network.js';
import {nauticalDistance,wrapLongitude,splitDateline} from './world-geometry.js';
export {nauticalDistance,onLand,waterSegment} from './world-geometry.js';
const ADDED_PORTS={...CROSSING_PORTS,...EXPANSION_PORTS,...EUROPE_PORTS,...ATLANTIC_PORTS,...FRENCH_CARIBBEAN_PORTS,...TARANTO_PORTS,...ASIA_PORTS},ADDED_CONNECTIONS={...CROSSING_CONNECTIONS,...EXPANSION_CONNECTIONS,...EUROPE_CONNECTIONS,...ATLANTIC_CONNECTIONS,...FRENCH_CARIBBEAN_CONNECTIONS,...TARANTO_CONNECTIONS,...ASIA_CONNECTIONS};
export const PORT_APPROACHES={...OLD_APPROACHES,...CROSSING_APPROACHES,...EXPANSION_APPROACHES,...EUROPE_APPROACHES,...ATLANTIC_APPROACHES,...FRENCH_CARIBBEAN_APPROACHES,...TARANTO_APPROACHES,...ASIA_APPROACHES};
// Extend a copy of the immutable ocean mesh. Original port pairs use the frozen router.
const NETWORK={points:[...BASE_NETWORK.points],links:BASE_NETWORK.links.map(edges=>[...edges])};
const portNodes=Object.fromEntries(BASE_NETWORK.ports.map((id,i)=>[id,i]));
for(const [id,c] of Object.entries(ADDED_PORTS)){
 const i=NETWORK.points.length,edges=[];portNodes[id]=i;NETWORK.points.push(c.gateway);NETWORK.links.push(edges);
 for(const point of ADDED_CONNECTIONS[id]){
  const j=BASE_NETWORK.points.findIndex(p=>p[0]===point[0]&&p[1]===point[1]);
  if(j<0)throw Error('Missing sea connection: '+id);
  const nm=nauticalDistance(c.gateway,point);edges.push([j,nm]);NETWORK.links[j].push([i,nm]);
 }
 if(!edges.length)throw Error('Disconnected sea gateway: '+id);
}
export const SEA_WAYPOINTS=NETWORK.points;
const trees=new Map(),cache=new Map();
// One shortest-path tree per origin, reused by AI, quotes and animation.
// Binary heap avoids quadratic scans of the world mesh.
function shortest(start){
  if(trees.has(start))return trees.get(start);
  const {points,links}=NETWORK,cost=new Float64Array(points.length).fill(Infinity),previous=new Int32Array(points.length).fill(-1),heap=[];
  const push=(item)=>{let i=heap.length;heap.push(item);while(i){const p=(i-1)>>1;if(heap[p][0]<=item[0])break;heap[i]=heap[p];i=p;}heap[i]=item;};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let c=2*i+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=last[0])break;heap[i]=heap[c];i=c;}heap[i]=last;}return top;};
  cost[start]=0;push([0,start]);
  while(heap.length){const [d,i]=pop();if(d!==cost[i])continue;for(const [j,nm] of links[i])if(d+nm<cost[j]){cost[j]=d+nm;previous[j]=i;push([cost[j],j]);}}
  const result={cost,previous};trees.set(start,result);return result;
}
export function seaRoute(a,b){
  if(!PORT_APPROACHES[a]||!PORT_APPROACHES[b]||a===b)return null;
  // Preserve existing voyages and all old port-pair distances exactly.
  if(!ADDED_PORTS[a]&&!ADDED_PORTS[b])return previousRoute(a,b);
  const [from,to]=[a,b].sort(),key=from+':'+to;
  if(!cache.has(key)){
    const start=portNodes[from],end=portNodes[to],{cost,previous}=shortest(start);
    if(!Number.isFinite(cost[end]))throw Error(`No sea path: ${from}–${to}`);
    const path=[];for(let i=end;i!==-1;i=previous[i])path.unshift(NETWORK.points[i]);
    const port=id=>[PORT_GEOGRAPHY[id].lon,PORT_GEOGRAPHY[id].lat];
    const coordinates=[port(from),...PORT_APPROACHES[from].slice(0,-1),...path,...PORT_APPROACHES[to].slice(0,-1).reverse(),port(to)];
    const nm=Math.ceil(coordinates.slice(1).reduce((sum,p,i)=>sum+nauticalDistance(coordinates[i],p),0));
    cache.set(key,{coordinates,offshore:path,nm});
  }
  const r=cache.get(key),reverse=a!==from;
  return {nm:r.nm,coordinates:reverse?[...r.coordinates].reverse():r.coordinates,offshore:reverse?[...r.offshore].reverse():r.offshore};
}
export const seaPoints=(a,b)=>seaRoute(a,b)?.coordinates.map(([lon,lat])=>project(lon,lat))??[];
export function seaLines(a,b){
  const points=seaRoute(a,b)?.coordinates??[],lines=[];
  for(let i=1;i<points.length;i++){
    const parts=splitDateline(points[i-1],points[i]);
    for(let j=0;j<parts.length;j++){const [a,b]=parts[j];if(!lines.length||j>0)lines.push([project(...a)]);lines.at(-1).push(project(...b));}
  }return lines;
}
const motionCache=new Map();
export function seaPosition(a,b,fraction){
 if(fraction<=0)return project(PORT_GEOGRAPHY[a].lon,PORT_GEOGRAPHY[a].lat);
 if(fraction>=1)return project(PORT_GEOGRAPHY[b].lon,PORT_GEOGRAPHY[b].lat);
 const key=a+':'+b;
 if(!motionCache.has(key)){
  const route=seaRoute(a,b);if(!route)return project(PORT_GEOGRAPHY[a].lon,PORT_GEOGRAPHY[a].lat);
  const points=route.coordinates,ends=[];let total=0;
  for(let i=1;i<points.length;i++){total+=nauticalDistance(points[i-1],points[i]);ends.push(total);}
  motionCache.set(key,{points,ends,total});
 }
 const {points,ends,total}=motionCache.get(key),target=Math.max(0,Math.min(1,fraction))*total;
 let low=0,high=ends.length-1;while(low<high){const mid=(low+high)>>1;if(ends[mid]<target)low=mid+1;else high=mid;}
 const start=low?ends[low-1]:0,length=ends[low]-start,t=length?(target-start)/length:0;
 return project(wrapLongitude(points[low][0]+wrapLongitude(points[low+1][0]-points[low][0])*t),points[low][1]+(points[low+1][1]-points[low][1])*t);
}
