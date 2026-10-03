import {SAVE_VERSION,routeShips,reschedule} from './engine-v10.js';
import {canServe} from './land-v10.js';

export function migrateSeaRoutes(s){
  for(const c of [s,...s.competitors]){
    c.version=SAVE_VERSION;
    for(const v of c.ships)if(v.voyage&&c.routes.find(r=>r.id===v.routeId)?.mode==='sea')v.voyage.seaDistanceVersion=8;
    for(const r of c.routes)if(r.mode==='sea'){
      if([...routeShips(c,r).map(v=>v.type),r.autoShipType,...r.pendingReplacements].some(type=>!canServe(c,type,r))){r.active=false;r.rangeReview=true;}
      reschedule(c,r);
    }
  }
  return s;
}
