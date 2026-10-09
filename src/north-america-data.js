// Representative eighteenth-century markets, available from scenario start.
// Historical river/portage corridors currently use the land transport system.
const rows=[
 ['vincennes','Vincennes','france',-87.53,38.68,'fur food','temperate'],
 ['kaskaskia','Kaskaskia','france',-89.91,37.92,'food','temperate'],
 ['louisbourg','Louisbourg','france',-59.98,45.89,'food','cold',[-59.7,45.7]],
 ['stjohns','St. John’s','england',-52.71,47.56,'food','cold',[-52.4,47.6]],
 ['durango','Durango','spain',-104.65,24.03,'silver','arid'],
 ['chihuahua','Chihuahua','spain',-106.07,28.63,'silver food','arid'],
 ['elpasodelnorte','El Paso del Norte','spain',-106.48,31.74,'food','arid'],
 ['santafe','Santa Fe','spain',-105.94,35.69,'cloth food','arid'],
];
export const NORTH_AMERICA_CITIES=Object.fromEntries(rows.map(([id,mapName,nation,lon,lat,goods,climate,gateway])=>[id,{
 mapName,nation,lon,lat,exports:goods.split(' '),climate,marketRegion:'americas',inland:!gateway,label:[5,-5],...(gateway?{gateway}:{}),
}]));
export const NORTH_AMERICA_PORTS=Object.fromEntries(Object.entries(NORTH_AMERICA_CITIES).filter(([,c])=>!c.inland));
export const NORTH_AMERICA_APPROACHES=Object.fromEntries(Object.entries(NORTH_AMERICA_PORTS).map(([id,c])=>[id,[c.gateway]]));
const roads=[
 ['detroit','vincennes',650,'hill','france',[[-83.6,41.6],[-85.14,41.08],[-86.1,40.6],[-86.9,39.8]]],
 ['vincennes','kaskaskia',260,'plain','france',[[-88.2,38.45],[-89.2,38.2]]],
 ['kaskaskia','neworleans',1400,'plain','france',[[-90.2,37.2],[-90.1,36.2],[-90,35.1],[-90.8,33.5],[-91.4,31.55],[-91.15,30.45],[-90.5,30.05]]],
 ['zacatecas','durango',310,'hill','spain',[[-103.1,23.2],[-103.8,23.7]]],
 ['durango','chihuahua',700,'hill','spain',[[-104.8,25.1],[-105.3,26.1],[-105.66,26.93],[-105.8,27.7]]],
 ['chihuahua','elpasodelnorte',380,'plain','spain',[[-106.4,29.5],[-106.5,30.6]]],
 ['elpasodelnorte','santafe',550,'hill','spain',[[-106.8,32.3],[-107,33.2],[-106.9,34.1],[-106.65,35.08]]],
];
export const NORTH_AMERICA_ROADS=Object.fromEntries(roads.map(([a,b,km,terrain,nation,via])=>[`${a}_${b}`,{
 a,b,km,terrain,via,nations:[nation],region:'americas',climate:nation==='spain'?'arid':'temperate',penalty:terrain==='plain'?1:.65,safety:terrain==='plain'?.94:.9,
}]));

// One ocean attachment per new port prevents shortcuts between existing ports.
export const NORTH_AMERICA_CONNECTIONS={louisbourg:[[-59,45]],stjohns:[[-51,47]]};
