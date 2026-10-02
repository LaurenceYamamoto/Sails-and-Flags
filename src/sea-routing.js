import {PORT_GEOGRAPHY,project} from './geography.js';
import {LAND} from '../assets/maps/land.js';

// Port approaches represent access through harbours/estuaries omitted by the
// generalized land data. Only these short, explicit approaches may cross land.
// Points are [longitude, latitude]; this is a game network, not navigation data.
export const PORT_APPROACHES={
  london:[[.5,51.5],[.95,51.5],[1.45,51.7]],
  nantes:[[-1.9,47.22],[-2.25,47.25],[-2.6,47.1]],
  amsterdam:[[5.15,52.45],[5.15,52.75],[4.9,53.05],[4.5,53.1]],
  cadiz:[[-6.5,36.45]],lisbon:[[-9.4,38.65]],porto:[[-8.85,41.15]],
  barcelona:[[2.35,41.3]],marseille:[[5.2,43.15]],
  kingston:[[-76.8,17.8]],havana:[[-82.4,23.3]],santiago:[[-75.85,19.8]],
  santodomingo:[[-69.9,18.3]],sanjuan:[[-66.1,18.6]],
  bridgetown:[[-59.7,13.1]],willemstad:[[-68.95,11.95]],
};
// Headlands, straits and offshore alternatives seed a water-only visibility
// graph. Dijkstra chooses the shortest navigable polyline between gateways.
export const SEA_WAYPOINTS=[
  [-85,22],[-84.5,21],[-80,19],[-84,23],[-79,24],[-74,22],[-73.8,20],
  [-75,18],[-72,17],[-68,17],[-67.5,19.3],[-65,19],[-63,17],[-60,15],
  [-70,26],[-65,24],[-60,30],[-35,35],[-13,43],[-9.8,43.3],[-9.7,44],
  [-5,46],[-6.5,49],[-3,49.7],[0,50.2],[1.6,50.9],[2.2,52],
  [-9.65,38.8],[-9.6,40],[-9.25,41.6],[-9.7,37],[-9.1,36.7],[-6,35.8],[-5.6,35.95],[-5.1,36],
  [-3,36.1],[-1.8,36.6],[.5,38],[1.8,40.3],[3.8,40.5],[4.6,42],
];
export function nauticalDistance(a,b){
  const radians=Math.PI/180,[x,y]=a.map(n=>n*radians),[u,v]=b.map(n=>n*radians);
  const h=Math.sin((v-y)/2)**2+Math.cos(y)*Math.cos(v)*Math.sin((u-x)/2)**2;
  return 3440.065*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
function inside([x,y],ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;
}return yes;}
export const onLand=p=>LAND.some(poly=>inside(p,poly[0])&&!poly.slice(1).some(r=>inside(p,r)));
const edges=LAND.flatMap(poly=>poly.flatMap(ring=>ring.map((a,i)=>{const b=ring[(i+1)%ring.length];return {a,b,minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])};})));
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
export function waterSegment(a,b){
  if(onLand(a)||onLand(b))return false;
  const minX=Math.min(a[0],b[0]),maxX=Math.max(a[0],b[0]),minY=Math.min(a[1],b[1]),maxY=Math.max(a[1],b[1]);
  return !edges.some(e=>e.maxX>=minX&&e.minX<=maxX&&e.maxY>=minY&&e.minY<=maxY&&cross(a,b,e.a)*cross(a,b,e.b)<=0&&cross(e.a,e.b,a)*cross(e.a,e.b,b)<=0);
}
let graph;
function network(){
  if(graph)return graph;
  const ports=Object.keys(PORT_APPROACHES),points=[...ports.map(id=>PORT_APPROACHES[id].at(-1)),...SEA_WAYPOINTS],links=points.map(()=>[]);
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)if(waterSegment(points[i],points[j])){const nm=nauticalDistance(points[i],points[j]);links[i].push([j,nm]);links[j].push([i,nm]);}
  return graph={ports,points,links};
}
const cache=new Map();
export function seaRoute(a,b){
  if(!Object.hasOwn(PORT_APPROACHES,a)||!Object.hasOwn(PORT_APPROACHES,b)||a===b)return null;
  const key=[a,b].sort().join(':');
  if(!cache.has(key)){
    const [from,to]=[a,b].sort(),{ports,points,links}=network(),start=ports.indexOf(from),end=ports.indexOf(to),cost=points.map(()=>Infinity),previous=points.map(()=>-1),visited=new Set();cost[start]=0;
    for(let step=0;step<points.length;step++){
      let n=-1;for(let i=0;i<points.length;i++)if(!visited.has(i)&&(n<0||cost[i]<cost[n]))n=i;
      if(n<0||!Number.isFinite(cost[n]))break;if(n===end)break;visited.add(n);
      for(const [next,nm] of links[n])if(cost[n]+nm<cost[next]){cost[next]=cost[n]+nm;previous[next]=n;}
    }
    if(!Number.isFinite(cost[end]))throw Error(`No sea path: ${from}–${to}`);
    const path=[];for(let i=end;i!==-1;i=previous[i])path.unshift(points[i]);
    const port=id=>[PORT_GEOGRAPHY[id].lon,PORT_GEOGRAPHY[id].lat];
    const coordinates=[port(from),...PORT_APPROACHES[from].slice(0,-1),...path,...PORT_APPROACHES[to].slice(0,-1).reverse(),port(to)];
    const nm=coordinates.slice(1).reduce((sum,p,i)=>sum+nauticalDistance(coordinates[i],p),0);
    cache.set(key,{from,coordinates,offshore:path,nm:Math.ceil(nm)});
  }
  const r=cache.get(key),reverse=a!==r.from;
  return {nm:r.nm,coordinates:reverse?[...r.coordinates].reverse():[...r.coordinates],offshore:reverse?[...r.offshore].reverse():[...r.offshore]};
}
export const seaPoints=(a,b)=>seaRoute(a,b)?.coordinates.map(([lon,lat])=>project(lon,lat))??[];
export function seaPosition(a,b,fraction){
  const route=seaRoute(a,b);if(!route)return project(PORT_GEOGRAPHY[a].lon,PORT_GEOGRAPHY[a].lat);
  const points=route.coordinates,lengths=points.slice(1).map((p,i)=>nauticalDistance(points[i],p));let rest=Math.max(0,Math.min(1,fraction))*lengths.reduce((sum,n)=>sum+n,0);
  for(let i=0;i<lengths.length;i++)if(rest<=lengths[i]||i===lengths.length-1){const t=rest/lengths[i];return project(points[i][0]+(points[i+1][0]-points[i][0])*t,points[i][1]+(points[i+1][1]-points[i][1])*t);}else rest-=lengths[i];
}
