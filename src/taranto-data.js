// Position: Port of Taranto authority, 40°27'N 17°12'E.
// https://www.port.taranto.it/index.php/en/user-services/11-il-porto/60-general-information
export const TARANTO_PORTS={
 taranto:{mapName:'Taranto',nation:'spain',lon:17.2,lat:40.45,exports:['food','oliveOil'],marketRegion:'westEurope',gateway:[17.15,40.2],label:[5,7]},
};
export const TARANTO_APPROACHES={taranto:[[17.15,40.2]]};
// One water-only leaf edge preserves every existing port-pair path.
export const TARANTO_CONNECTIONS={taranto:[[19,39]]};
export const TARANTO_ROADS={
 naples_taranto:{a:'naples',b:'taranto',km:310,via:[[14.79,40.91],[15.8,40.64],[16.6,40.67]],terrain:'mountain',penalty:.5,safety:.91,nations:['spain']},
};
