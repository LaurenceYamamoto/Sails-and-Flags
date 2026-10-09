// Inland markets from the early eighteenth century, available at scenario start.
// Detroit's historical water/portage connections are temporarily land corridors.
export const AMERICAN_INTERIOR_CITIES={
 vilarica:{mapName:'Vila Rica',nation:'portugal',lon:-43.50,lat:-20.39,exports:['gold'],marketRegion:'americas',climate:'temperate',inland:true,label:[5,-5]},
 detroit:{mapName:'Detroit',nation:'france',lon:-83.045,lat:42.331,exports:['fur'],marketRegion:'americas',climate:'cold',inland:true,label:[5,-5]},
};
export const AMERICAN_INTERIOR_ROADS={
 vilarica_rio:{a:'vilarica',b:'rio',km:520,terrain:'mountain',penalty:.5,safety:.88,nations:['portugal'],region:'americas',via:[[-43.8,-21.2],[-43.35,-21.76],[-43.2,-22.15],[-43.25,-22.5]]},
 vilarica_saopaulo:{a:'vilarica',b:'saopaulo',km:650,terrain:'mountain',penalty:.5,safety:.88,nations:['portugal'],region:'americas',via:[[-44.26,-21.13],[-44.98,-21.97],[-45.2,-22.7],[-45.55,-22.95],[-46.1,-23.2]]},
 detroit_montreal:{a:'detroit',b:'montreal',km:1100,terrain:'hill',penalty:.65,safety:.9,nations:['france'],region:'americas',climate:'cold',via:[[-82.8,42.2],[-82.4,42.3],[-81.5,42.85],[-80.6,43.5],[-79.8,44.1],[-78.5,44.6],[-77,44.8],[-75.7,45.5],[-74.2,45.8]]},
 detroit_albany:{a:'detroit',b:'albany',km:1050,terrain:'hill',penalty:.65,safety:.88,nations:['france','england'],region:'americas',climate:'cold',via:[[-83.3,41.5],[-82.5,41.1],[-80.7,41.4],[-79.5,42],[-78.5,42.2],[-76.5,42.7],[-74.8,42.9]]},
};
