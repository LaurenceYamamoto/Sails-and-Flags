// Overland transshipment corridors circa 1700; no navigable canals.
// Distances, terrain and market profiles are gameplay approximations.
export const CROSSING_PORTS={
 suez:{mapName:'Suez',nation:'ottoman',lon:32.55,lat:29.97,label:[5,-5],exports:['coffee','spices'],gateway:[32.55,29.8]},
 panama:{mapName:'Panama City',nation:'spain',lon:-79.53,lat:8.95,label:[5,12],exports:['silver','food'],gateway:[-79.52,8.8]},
};
export const CROSSING_APPROACHES=Object.fromEntries(Object.entries(CROSSING_PORTS).map(([id,c])=>[id,[c.gateway]]));
export const CROSSING_ROADS={
 cairo_suez:{region:'africa',a:'cairo',b:'suez',km:150,terrain:'plain',penalty:1,safety:.92,nations:['ottoman'],via:[[31.8,30.05],[32.4,30.02]]},
 portobelo_panama:{region:'northAmerica',a:'portobelo',b:'panama',km:100,terrain:'mountain',penalty:.5,safety:.88,nations:['spain'],via:[[-79.6,9.35],[-79.53,9.15]]},
};
export const CROSSINGS={egypt:['alexandria','cairo','suez','cairo'],panama:['portobelo','panama']};

export const isCrossingRoad=(a,b)=>Object.values(CROSSING_ROADS).some(r=>r.a===a&&r.b===b||r.a===b&&r.b===a);

// Water-visible links into the frozen world mesh; checked by all-port geometry tests.
export const CROSSING_CONNECTIONS={suez:[[33,29]],panama:[[-80,5],[-79,3],[-79,5],[-79,7]]};
