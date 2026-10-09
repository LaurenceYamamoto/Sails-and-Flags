// Long-distance regional exchange, with intermediate markets abstracted into
// waypoints. Distances/terrain are gameplay approximations, not surveyed roads.
export const REGIONAL_LINK_ROADS={
 kano_benin:{a:'kano',b:'benin',km:1100,terrain:'hill',penalty:.65,safety:.9,
  nations:['kano','benin'],region:'africa',climate:'tropical',
  // Northern interior, Nupe region and a Niger crossing, avoiding the delta.
  via:[[7.7,11.1],[7.2,10.2],[6.1,9.3],[5.4,8.8],[5.1,8.2],[5.3,7.4]]},
 mecca_sanaa:{a:'mecca',b:'sanaa',km:1450,terrain:'mountain',penalty:.5,safety:.86,
  nations:['ottoman','yemen'],region:'westAsia',climate:'arid',
  // Inland Yemeni pilgrimage corridor: Taif, Bisha, Asir and Sa'dah.
  via:[[40.42,21.27],[41.65,21.05],[42.6,20],[42.6,18.3],[43.3,17.1],[43.76,16.94],[44.05,16.2]]},
};
