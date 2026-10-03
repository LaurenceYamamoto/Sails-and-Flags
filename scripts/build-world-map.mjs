import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
// Input: pinned Natural Earth v5.1.2 ne_50m_land.geojson (public domain).
// Keep land.js unchanged: frozen validators depend on the regional coastline.
const raw=readFileSync(process.argv[2]),source=JSON.parse(raw);
const polygons=source.features.flatMap(f=>f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).map(p=>p.map(r=>r.map(x=>x.map(v=>+v.toFixed(4)))));
writeFileSync('assets/maps/world-land.js',`// Natural Earth 1:50m land v5.1.2, public domain. Full world; no clipping.\n// Source SHA256: ${createHash('sha256').update(raw).digest('hex')}\nexport const LAND=${JSON.stringify(polygons)};\n`);
console.log(JSON.stringify({polygons:polygons.length,points:polygons.flat().reduce((n,r)=>n+r.length,0)}));
