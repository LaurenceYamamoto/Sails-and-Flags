import {LAND} from '../assets/maps/world-land.js';
export const wrapLongitude=x=>((x+180)%360+360)%360-180;
export function nauticalDistance(a,b){
  const r=Math.PI/180,h=Math.sin((b[1]-a[1])*r/2)**2+Math.cos(a[1]*r)*Math.cos(b[1]*r)*Math.sin((b[0]-a[0])*r/2)**2;
  return 6880.13*Math.asin(Math.min(1,Math.sqrt(h)));
}
function inside([x,y],ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])yes=!yes;
}return yes;}
const bounds=ring=>ring.reduce((b,p)=>[Math.min(b[0],p[0]),Math.max(b[1],p[0]),Math.min(b[2],p[1]),Math.max(b[3],p[1])],[Infinity,-Infinity,Infinity,-Infinity]);
const polygons=LAND.map(poly=>({poly,box:bounds(poly[0])}));
export const onLand=p=>polygons.some(({poly,box:b})=>p[0]>=b[0]&&p[0]<=b[1]&&p[1]>=b[2]&&p[1]<=b[3]&&inside(p,poly[0])&&!poly.slice(1).some(r=>inside(p,r)));
let index;
function coastline(){
  if(index)return index;index=new Map();
  for(const {poly} of polygons)for(const ring of poly)for(let i=1;i<ring.length;i++){
    const a=ring[i-1],b=ring[i],box=bounds([a,b]),edge={a,b,box};
    for(let x=Math.floor(box[0]/2);x<=Math.floor(box[1]/2);x++)for(let y=Math.floor(box[2]/2);y<=Math.floor(box[3]/2);y++){
      const key=`${x},${y}`;if(!index.has(key))index.set(key,[]);index.get(key).push(edge);
    }
  }return index;
}
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function clearSegment(a,b,land=false){
  if(onLand(a)!==land||onLand(b)!==land)return false;
  const box=bounds([a,b]),seen=new Set(),edges=coastline();
  for(let x=Math.floor(box[0]/2);x<=Math.floor(box[1]/2);x++)for(let y=Math.floor(box[2]/2);y<=Math.floor(box[3]/2);y++)for(const e of edges.get(`${x},${y}`)??[]){
    if(seen.has(e))continue;seen.add(e);const q=e.box;
    if(q[1]>=box[0]&&q[0]<=box[1]&&q[3]>=box[2]&&q[2]<=box[3]&&cross(a,b,e.a)*cross(a,b,e.b)<=0&&cross(e.a,e.b,a)*cross(e.a,e.b,b)<=0)return false;
  }return true;
}
// Split antimeridian segments before land intersection and SVG projection.
export function splitDateline(a,b){
  const delta=wrapLongitude(b[0]-a[0]);
  if(Math.abs(b[0]-a[0])<=180)return [[a,b]];
  const end=a[0]+delta,bound=end>180?180:-180,t=(bound-a[0])/delta,y=a[1]+(b[1]-a[1])*t;
  return [[a,[bound,y]],[[-bound,y],b]];
}
export const waterSegment=(a,b)=>splitDateline(a,b).every(([u,v])=>clearSegment(u,v));
// Used at build/test time to reject road segments crossing seas, bays or lakes.
export const landSegment=(a,b)=>splitDateline(a,b).every(([u,v])=>clearSegment(u,v,true));
