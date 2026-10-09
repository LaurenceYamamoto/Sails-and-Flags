// Representative markets around 1700. Caspian navigation is not implemented:
// even historical ports currently participate in land transport only.
const rows=[
 ['astrakhan','Astrakhan','russia',48.04,46.35,'food','northEurope','cold'],
 ['derbent','Derbent','safavid',48.29,42.06,'food cloth','westAsia','temperate'],
 ['shamakhi','Shamakhi','safavid',48.64,40.63,'silk cloth','westAsia','temperate'],
 ['baku','Baku','safavid',49.87,40.37,'cloth food','westAsia','arid'],
 ['rasht','Rasht','safavid',49.59,37.28,'silk food','westAsia','temperate'],
 ['tsaritsyn','Tsaritsyn','russia',44.5,48.71,'food cloth','northEurope','cold'],
];
export const CASPIAN_CITIES=Object.fromEntries(rows.map(([id,mapName,nation,lon,lat,goods,marketRegion,climate])=>[id,{
 mapName,nation,lon,lat,exports:goods.split(' '),label:[5,-5],inland:true,marketRegion,climate,
}]));
// Intermediate settlements and river crossings are waypoints, not extra markets.
// No direct crossing of the high Caucasus to Moscow or of the Caspian Sea.
const roads=[
 ['tiflis','shamakhi',510,'hill','safavid',[[45.2,41.5],[46.36,41.06],[47.1,40.75],[47.9,40.65]],'westAsia','temperate'],
 ['shamakhi','derbent',250,'hill','safavid',[[48.9,40.95],[48.95,41.3],[48.6,41.7]],'westAsia','temperate'],
 ['derbent','astrakhan',800,'hill','safavid russia',[[47.9,42.3],[47.3,42.95],[47.1,43.5],[46.5,44.3],[46.2,44.8],[46.4,45.3],[47.8,46.1]],'westAsia','arid'],
 ['shamakhi','baku',130,'hill','safavid',[[49.15,40.55],[49.55,40.45]],'westAsia','arid'],
 ['baku','rasht',530,'hill','safavid',[[49.6,40.45],[49.2,40.1],[49.1,39.6],[48.85,39.2],[48.8,38.75],[48.85,38.3],[48.85,37.9],[49.1,37.45]],'westAsia','temperate'],
 ['rasht','tabriz',420,'mountain','safavid',[[48.9,37.5],[48.3,38.05],[47.8,38.1],[47,38]],'westAsia','temperate'],
 ['astrakhan','tsaritsyn',450,'plain','russia',[[47.5,46.7],[46.5,47.4],[45.5,48.1]],'northEurope','arid'],
 ['tsaritsyn','moscow',1050,'plain','russia',[[43.7,49.5],[42.4,50.5],[41.2,51.5],[40.4,52.6],[39.7,54],[38.7,54.9]],'northEurope','cold'],
];
export const CASPIAN_ROADS=Object.fromEntries(roads.map(([a,b,km,terrain,nations,via,region,climate])=>[`${a}_${b}`,{
 a,b,km,terrain,nations:nations.split(' '),via,region,climate,
 penalty:{plain:1,hill:.65,mountain:.5}[terrain],safety:{plain:.95,hill:.9,mountain:.86}[terrain],
}]));
