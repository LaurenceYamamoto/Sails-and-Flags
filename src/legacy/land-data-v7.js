import {PORT_GEOGRAPHY,project} from './geography-v7.js';
// Stylized links and market profiles for gameplay, not reconstructed historic roads.
export const INLAND = {
  oxford:{nation:'england',lon:-1.26,lat:51.75,mapName:'Oxford',label:[-15,-22]},
  madrid:{nation:'spain',lon:-3.70,lat:40.42,mapName:'Madrid',label:[20,-4]},
  paris:{nation:'france',lon:2.35,lat:48.86,mapName:'Paris',label:[18,9]},
  utrecht:{nation:'netherlands',lon:5.12,lat:52.09,mapName:'Utrecht',label:[18,20]},
  evora:{nation:'portugal',lon:-7.91,lat:38.57,mapName:'Evora',label:[18,12]},
};
export const WAGONS={wagon:{name:'馬車',nameEn:'Wagon',mode:'land',price:600,capacity:15,speed:40,range:2000,daily:1.2,guns:0}};
export const ROADS={
  london_oxford:{a:'london',b:'oxford',km:100,terrain:'plain',penalty:1,safety:.98,nations:['england']},
  cadiz_madrid:{a:'cadiz',b:'madrid',km:550,terrain:'hill',penalty:.65,safety:.90,nations:['spain']},
  nantes_paris:{a:'nantes',b:'paris',km:385,terrain:'plain',penalty:1,safety:.96,nations:['france']},
  amsterdam_utrecht:{a:'amsterdam',b:'utrecht',km:45,terrain:'plain',penalty:1,safety:.98,nations:['netherlands']},
  lisbon_evora:{a:'lisbon',b:'evora',km:135,terrain:'hill',penalty:.8,safety:.94,nations:['portugal']},
  evora_madrid:{a:'evora',b:'madrid',km:620,terrain:'hill',penalty:.65,safety:.90,nations:['portugal','spain']},
  madrid_paris:{a:'madrid',b:'paris',km:1280,via:[[-1.64,42.81],[-1.47,43.49],[-.58,44.84]],terrain:'mountain',penalty:.5,safety:.92,nations:['spain','france']},
};
export const roadBetween=(a,b)=>Object.entries(ROADS).find(([,r])=>r.a===a&&r.b===b||r.a===b&&r.b===a);

// Map geometry follows land rather than a straight chord across the Bay of Biscay.
export function roadPoints(a,b){const link=roadBetween(a,b);if(!link)return [];const [,r]=link,from=PORT_GEOGRAPHY[r.a]??INLAND[r.a],to=PORT_GEOGRAPHY[r.b]??INLAND[r.b];const points=[[from.lon,from.lat],...(r.via??[]),[to.lon,to.lat]].map(([lon,lat])=>project(lon,lat));return a===r.a?points:points.reverse();}
export function roadPosition(a,b,fraction){const points=roadPoints(a,b),lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));let rest=Math.max(0,Math.min(1,fraction))*lengths.reduce((a,b)=>a+b,0);for(let i=0;i<lengths.length;i++){if(rest<=lengths[i]||i===lengths.length-1){const t=rest/lengths[i];return {x:points[i].x+(points[i+1].x-points[i].x)*t,y:points[i].y+(points[i+1].y-points[i].y)*t};}rest-=lengths[i];}return points[0];}
