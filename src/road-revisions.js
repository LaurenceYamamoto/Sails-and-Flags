// Removed links remain reserved in ROAD_SLOTS solely to read indexed older saves.
export const RETIRED_ROADS = [
 'quito_lima','lima_arequipa',
 'lisbon_porto','porto_madrid','cadiz_madrid','madrid_barcelona',
 'nantes_lyon','paris_frankfurt','madrid_paris',
];
// Approximate gameplay distances; geometry and terrain follow the regional corridor.
export const ADDED_ROADS = {
 valencia_barcelona:{a:'valencia',b:'barcelona',km:350,via:[[.55,40.62],[1.24,41.12]],terrain:'hill',penalty:.8,safety:.94,nations:['spain']},
 madrid_bilbao:{a:'madrid',b:'bilbao',km:400,via:[[-3.7,42.34]],terrain:'mountain',penalty:.5,safety:.91,nations:['spain']},
};
