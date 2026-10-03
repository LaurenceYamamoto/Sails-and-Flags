import {seaRoute as previousRoute,PORT_APPROACHES as OLD_APPROACHES} from './sea-routing-v10.js';
import {WORLD_APPROACHES,WORLD_PORTS} from './world-data-v12.js';
import {PORT_GEOGRAPHY,project} from './geography-v12.js';
import {NETWORK} from '../../assets/maps/world-network.js';
import {nauticalDistance,wrapLongitude,splitDateline} from './world-geometry-v12.js';
export {nauticalDistance,onLand,waterSegment} from './world-geometry-v12.js';
export const PORT_APPROACHES={...OLD_APPROACHES,...WORLD_APPROACHES};
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
  if(!WORLD_PORTS[a]&&!WORLD_PORTS[b])return previousRoute(a,b);
  const [from,to]=[a,b].sort(),key=from+':'+to;
  if(!cache.has(key)){
    const start=NETWORK.ports.indexOf(from),end=NETWORK.ports.indexOf(to),{cost,previous}=shortest(start);
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
