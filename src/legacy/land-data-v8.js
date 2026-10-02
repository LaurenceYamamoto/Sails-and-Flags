import {PORT_GEOGRAPHY,project} from './geography-v8.js';
// Stylized links and market profiles for gameplay, not reconstructed historic roads.
export const INLAND = {
  madrid:{nation:'spain',lon:-3.70,lat:40.42,mapName:'Madrid',label:[20,-4]},
  paris:{nation:'france',lon:2.35,lat:48.86,mapName:'Paris',label:[18,9]},
};
export const WAGONS={wagon:{name:'馬車',nameEn:'Wagon',mode:'land',price:600,capacity:15,speed:40,range:2000,daily:1.2,guns:0}};
export const ROADS={
  lisbon_porto:{a:'lisbon',b:'porto',km:310,terrain:'hill',penalty:.8,safety:.95,nations:['portugal']},
  porto_madrid:{a:'porto',b:'madrid',km:560,terrain:'hill',penalty:.65,safety:.90,nations:['portugal','spain']},
  madrid_barcelona:{a:'madrid',b:'barcelona',km:620,terrain:'hill',penalty:.65,safety:.92,nations:['spain']},
  barcelona_marseille:{a:'barcelona',b:'marseille',km:510,via:[[2.9,42.7],[3.1,43.4],[4.4,43.7]],terrain:'hill',penalty:.8,safety:.93,nations:['spain','france']},
  paris_marseille:{a:'paris',b:'marseille',km:775,via:[[4.83,45.76]],terrain:'hill',penalty:.8,safety:.94,nations:['france']},
  cadiz_madrid:{a:'cadiz',b:'madrid',km:550,terrain:'hill',penalty:.65,safety:.90,nations:['spain']},
  nantes_paris:{a:'nantes',b:'paris',km:385,terrain:'plain',penalty:1,safety:.96,nations:['france']},
  madrid_paris:{a:'madrid',b:'paris',km:1280,via:[[-1.64,42.81],[-1.47,43.49],[-.58,44.84]],terrain:'mountain',penalty:.5,safety:.92,nations:['spain','france']},
};
export const roadBetween=(a,b)=>Object.entries(ROADS).find(([,r])=>r.a===a&&r.b===b||r.a===b&&r.b===a);

// Map geometry follows land rather than a straight chord across the Bay of Biscay.
export function roadPoints(a,b){const link=roadBetween(a,b);if(!link)return [];const [,r]=link,from=PORT_GEOGRAPHY[r.a]??INLAND[r.a],to=PORT_GEOGRAPHY[r.b]??INLAND[r.b];const points=[[from.lon,from.lat],...(r.via??[]),[to.lon,to.lat]].map(([lon,lat])=>project(lon,lat));return a===r.a?points:points.reverse();}
export function roadPosition(a,b,fraction){const points=roadPoints(a,b),lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));let rest=Math.max(0,Math.min(1,fraction))*lengths.reduce((a,b)=>a+b,0);for(let i=0;i<lengths.length;i++){if(rest<=lengths[i]||i===lengths.length-1){const t=rest/lengths[i];return {x:points[i].x+(points[i+1].x-points[i].x)*t,y:points[i].y+(points[i+1].y-points[i].y)*t};}rest-=lengths[i];}return points[0];}
