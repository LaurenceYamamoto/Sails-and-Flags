import {CITIES} from './data.js';
import {isCrossingRoad} from './crossing-data.js';
import {shipCatalog,shipSpec} from './industry.js';
import {canServe,travelDistance} from './land.js';
import {normalizeStops,routeLegs} from './engine.js';

// Suggest a viable hull when ports change; never purchase or alter a live route.
export function suggestedTransport(s,ports,current,explicitMode){
 const stops=normalizeStops(ports.filter(Boolean));
 if(stops.length<2||stops.some(id=>!CITIES[id]))return current;
 const mode=explicitMode??(stops.some(id=>CITIES[id].inland)||routeLegs({stops}).some(([a,b])=>isCrossingRoad(a,b))?'land':'sea');
 const route={stops,mode};
 if(canServe(s,current,route))return current;
 const candidates=Object.entries(shipCatalog(s)).filter(([,v])=>v.mode===mode);
 const eligible=candidates.filter(([type])=>canServe(s,type,route));
 const idle=type=>s.ships.some(v=>v.type===type&&!v.routeId&&!v.voyage);
 eligible.sort(([a,x],[b,y])=>Number(idle(b))-Number(idle(a))||x.price-y.price||a.localeCompare(b));
 return eligible[0]?.[0]??(shipSpec(s,current)?.mode===mode?current:candidates[0]?.[0]??current);
}
export function requiredRange(s,type,ports){
 const stops=normalizeStops(ports.filter(Boolean));
 if(stops.length<2||stops.some(id=>!CITIES[id]))return 0;
 return Math.max(...routeLegs({stops}).map(([a,b])=>travelDistance(s,type,a,b)));
}
