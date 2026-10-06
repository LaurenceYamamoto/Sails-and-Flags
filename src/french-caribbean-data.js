// Requested eighteenth-century French ports are available from scenario start.
// New Orleans (1718) and Port-au-Prince (1749) deliberately postdate 1700.
export const FRENCH_CARIBBEAN_PORTS={
 neworleans:{mapName:'New Orleans',nation:'france',lon:-90.07,lat:29.95,exports:['food','timber','tobacco'],marketRegion:'americas',gateway:[-89.2,28.7],label:[5,-5]},
 portauprince:{mapName:'Port-au-Prince',nation:'france',lon:-72.34,lat:18.54,exports:['sugar','indigo'],marketRegion:'americas',gateway:[-73.45,19.15],label:[5,-5]},
 saintpierre:{mapName:'Saint-Pierre',nation:'france',lon:-61.175,lat:14.744,exports:['sugar','rum'],marketRegion:'americas',gateway:[-61.3,14.74],label:[5,-5]},
};
export const FRENCH_CARIBBEAN_APPROACHES={
 // Simplified Mississippi channel down to the Gulf, not a direct coastal jump.
 neworleans:[[-89.99,29.85],[-89.75,29.6],[-89.35,29.2],[-89.25,28.95],[-89.2,28.7]],
 // Leave the Gulf of Gonave on the south side of the island before turning west.
 portauprince:[[-72.65,18.55],[-73.15,18.6],[-73.45,19.15]],
 saintpierre:[[-61.3,14.74]],
};
export const FRENCH_CARIBBEAN_ROADS={
 neworleans_pensacola:{a:'neworleans',b:'pensacola',km:330,terrain:'plain',penalty:1,safety:.94,nations:['france','spain'],via:[[-89.5,30.3],[-88.9,30.4],[-88,30.7],[-87.55,30.55]]},
 portauprince_santodomingo:{a:'portauprince',b:'santodomingo',km:330,terrain:'hill',penalty:.65,safety:.9,nations:['france','spain'],via:[[-71.65,18.6],[-70.6,18.7]]},
};
