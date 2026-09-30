import { readFileSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
// Natural Earth v5.1.2, ne_50m_land.geojson, public domain.
// Download the pinned source listed in assets/maps/README.md, then pass its path.
const raw=readFileSync(process.argv[2]), source=JSON.parse(raw);
const bounds=[-92,14,6,60];
function clip(ring,axis,bound,greater){
  const out=[];
  for(let i=0;i<ring.length;i++){
    const a=ring[(i+ring.length-1)%ring.length],b=ring[i],inside=p=>greater?p[axis]>=bound:p[axis]<=bound;
    if(inside(a)!==inside(b)){const t=(bound-a[axis])/(b[axis]-a[axis]);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
    if(inside(b))out.push(b);
  }
  return out;
}
const polygons=source.features.flatMap(f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).map(poly=>poly.map(ring=>{
  let clipped=ring;for(const [axis,bound,greater]of[[0,bounds[0],true],[0,bounds[1],false],[1,bounds[2],true],[1,bounds[3],false]])clipped=clip(clipped,axis,bound,greater);
  return clipped.map(p=>p.map(v=>+v.toFixed(4)));
}).filter(r=>r.length>=3)).filter(p=>p.length);
const sha=createHash('sha256').update(raw).digest('hex');
writeFileSync('assets/maps/land.js',`// Natural Earth 1:50m land v5.1.2 (public domain), clipped to the Atlantic region.\n// Source SHA256: ${sha}\nexport const LAND = ${JSON.stringify(polygons)};\n`);
console.log(JSON.stringify({polygons:polygons.length,points:polygons.flat(1).reduce((n,r)=>n+r.length,0),sha}));
