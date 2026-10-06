// Representative eighteenth-century Siberian fur/tea corridors. Distances and
// mixed river, portage and winter-road travel are abstracted as land transport.
const rows=[
 ['kungur','Kungur','russia',56.96,57.43,'food tools'],
 ['tyumen','Tyumen','russia',65.53,57.15,'fur cloth'],
 ['tobolsk','Tobolsk','russia',68.25,58.20,'fur timber'],
 ['tara','Tara','russia',74.37,56.90,'fur food'],
 ['tomsk','Tomsk','russia',84.97,56.49,'fur timber'],
 ['krasnoyarsk','Krasnoyarsk','russia',92.87,56.01,'fur timber'],
 ['irkutsk','Irkutsk','russia',104.30,52.29,'fur food'],
 ['verkhneudinsk','Verkhneudinsk','russia',107.58,51.83,'food fur'],
 ['kyakhta','Kyakhta','russia',106.45,50.35,'food cloth'],
 ['urga','庫倫','qing',106.92,47.92,'food'],
 ['kalgan','張家口','qing',114.88,40.81,'cloth food'],
 ['yeniseysk','Yeniseysk','russia',92.17,58.45,'fur timber'],
 ['kirensk','Kirensk','russia',108.11,57.78,'fur timber'],
 ['yakutsk','Yakutsk','russia',129.73,62.04,'fur'],
];
export const SIBERIAN_CITIES=Object.fromEntries(rows.map(([id,mapName,nation,lon,lat,exports])=>[id,{
 mapName,nation,lon,lat,exports:exports.split(' '),inland:true,label:[5,-5],
 marketRegion:nation==='russia'?'siberia':'eastAsia',productionZone:'northernInterior',
 climate:nation==='russia'?'cold':id==='urga'?'cold':'temperate',
}]));
// The Kyakhta border market developed after 1727; this scenario makes the
// eighteenth-century network available from the start, without a date unlock.
const links=[
 ['kazan','kungur',950,'hill',[[52.5,56.2],[55.3,56.8]]],
 ['kungur','tyumen',650,'mountain',[[59.7,57],[60.6,57],[63,57.2]]],
 ['tyumen','tobolsk',250,'plain'],
 ['tobolsk','tara',650,'hill',[[70.8,57.4]]],
 ['tara','tomsk',900,'hill',[[78,56.2],[81,56.1]]],
 ['tomsk','krasnoyarsk',600,'hill',[[87.7,56.2],[90.5,56.2]]],
 ['krasnoyarsk','irkutsk',1100,'hill',[[96,55.9],[98,54.9],[101,53.5]]],
 // Route around the southern shore instead of drawing a road across Lake Baikal.
 ['irkutsk','verkhneudinsk',500,'mountain',[[104,51.7],[105.3,51.4],[106.6,51.7]]],
 ['verkhneudinsk','kyakhta',240,'hill',[[106.7,51.2]]],
 ['kyakhta','urga',350,'hill',[[106.2,49.5],[106.5,48.6]]],
 ['urga','kalgan',1150,'hill',[[108.3,46.2],[110.5,44.5],[112.7,42.5]],'arid'],
 ['kalgan','beijing',220,'mountain',[[115.6,40.5]]],
 ['tomsk','yeniseysk',750,'hill',[[87.5,57.3],[90,58.1]]],
 ['yeniseysk','krasnoyarsk',340,'hill'],
 ['yeniseysk','kirensk',1250,'hill',[[98,58.2],[102,57.7],[105.5,57.6]]],
 ['irkutsk','kirensk',1000,'hill',[[105.6,54],[106,55.5]]],
 ['kirensk','yakutsk',1950,'hill',[[110,59],[114,60.7],[119,60.8],[124,61.2]]],
];
export const SIBERIAN_ROADS=Object.fromEntries(links.map(([a,b,km,terrain,via,climate])=>[a+'_'+b,{
 a,b,km,terrain,penalty:terrain==='mountain'?.5:terrain==='hill'?.65:1,
 safety:terrain==='mountain'?.86:terrain==='hill'?.9:.94,
 nations:[...new Set([SIBERIAN_CITIES[a]?.nation??'russia',SIBERIAN_CITIES[b]?.nation??(b==='beijing'?'qing':'russia')])],
 ...(via?{via}:{}),...(climate?{climate}:{}),
}]));
