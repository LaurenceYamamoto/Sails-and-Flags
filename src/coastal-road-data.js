// Presentation corridors follow the land polygon used by the map. Existing road
// distances, terrain, licenses and save indices are deliberately unchanged.
export const COASTAL_ROAD_VIA={
 bilbao_bordeaux:[[-2.4,43.1],[-1.8,43.2],[-1.3,43.5],[-.95,44.1]],
 thessaloniki_athens:[[22.5,40.55],[22.4,40.15],[22.2,39.65],[22.45,39.05],[22.7,38.5],[23.35,38.3]],
 tripoli_alexandria:[[14,32.5],[15,32],[16,31.1],[17,30.4],[18.3,30.2],[19.5,29.8],[20.4,30.4],[20.7,31.2],[20.5,32.2],[21.5,32.4],[22.4,32.3],[23.3,31.95],[24.2,31.65],[25.1,31.3],[26.5,31.2],[27.2,31.05],[28.5,30.8],[29.5,30.5],[29.9,30.85]],
 tunis_tripoli:[[10.1,36.4],[10.3,35.8],[10.4,35.2],[10.1,34.5],[10,34],[10.3,33.5],[11,33.2],[11.5,32.95],[12.3,32.75],[12.7,32.6],[13.05,32.7]],
 luanda_benguela:[[13.4,-9.1],[13.65,-9.6],[14,-10.2],[14.1,-10.8],[14,-11.5],[13.85,-12.1],[13.85,-12.45]],
 veracruz_merida:[[-96.3,18.8],[-95.7,18.5],[-94.4,18],[-93.3,17.85],[-92.2,17.85],[-91.3,18.2],[-90.7,18.75],[-90.4,19.5],[-89.9,20.2]],
 // Pass south of Lake Maracaibo; a straight road would cross the lake.
 cartagena_caracas:[[-75.2,10.25],[-74.6,10.3],[-74,10.4],[-73.25,10.2],[-72.5,9.7],[-71.75,8.7],[-71,8.7],[-70.3,9.6],[-69.3,10.1],[-68.2,10.1],[-67.4,10.25]],
 charleston_staugustine:[[-80.3,32.65],[-80.6,32.6],[-80.95,32.45],[-80.85,32.3],[-81.3,31.9],[-81.7,31.2],[-81.65,30.65],[-81.55,30.2]],
 accra_benin:[[.25,6],[1.2,6.5],[2.3,6.7],[3.4,6.8],[4.5,6.8],[5.2,6.6]],
};
// Mainland display anchors for ports on simplified coastal edges or small islands.
// Presentation only: real geography and all sea distances stay fixed.
export const COASTAL_CITY_DISPLAY={phohien:[105.55,20],luanda:[13.35,-8.82],xiamen:[118.05,24.65],cochin:[76.35,9.98],bombay:[72.85,19.02]};
