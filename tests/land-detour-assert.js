import assert from 'node:assert/strict';
import fs from 'node:fs';
const data=JSON.parse(fs.readFileSync('wasm-core/data/world.json'));

// A retired edge cannot be resurrected, but its cities may now be connected by
// an active-road detour within the vehicle's cumulative range.
export function assertDetour(query,stops,kind='caravan') {
 const connection=query({query:'connection',stops});
 if(!connection.types.includes(kind)) {assert.throws(()=>query({query:'opening',stops,kind}));return;}
 const q=query({query:'opening',stops,kind});assert.ok(q.roads.legs.length>=4);
 assert.ok(q.roads.legs.every(l=>!data.roads[l.road].retired));
 assert.ok(q.roads.legs.every(l=>!(stops.includes(l.from)&&stops.includes(l.to))));
}
