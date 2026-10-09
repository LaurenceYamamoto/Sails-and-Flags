// Northern Tarim oases and Hexi corridor, using the game's fixed circa-1700 authorities.
// Hami's local Qing-aligned government is represented by the Qing trading license.
const rows=[
 ['aksu','Aksu','dzungar',80.26,41.17,'cotton food'],
 ['kucha','Kucha','dzungar',82.96,41.72,'cloth tools'],
 ['karashahr','Karashahr','dzungar',86.57,42.06,'food cotton'],
 ['turpan','Turpan','dzungar',89.18,42.95,'cotton cloth'],
 ['hami','Hami','qing',93.51,42.83,'food cloth'],
 ['jiuquan','酒泉','qing',98.51,39.74,'cloth tools'],
 ['zhangye','張掖','qing',100.45,38.93,'food cotton'],
 ['wuwei','武威','qing',102.64,37.93,'food tools'],
 ['lanzhou','蘭州','qing',103.83,36.06,'cloth tools'],
];
export const SILK_ROAD_CITIES=Object.fromEntries(rows.map(([id,mapName,nation,lon,lat,goods],i)=>[id,{
 mapName,nation,lon,lat,exports:goods.split(' '),label:[5,-5],inland:true,
 marketRegion:i<5?'centralAsia':'eastAsia',productionZone:'centralAsianOasis',climate:'arid',
}]));
// Corridor estimates in km. Intermediate points follow oasis foothills, not desert chords.
const rowsRoad=[
 ['kashgar','aksu',500,'hill','dzungar',[[78.55,39.79],[79.15,40.35],[79.8,40.65]]],
 ['aksu','kucha',280,'plain','dzungar',[[81.15,41.3],[82,41.55]]],
 ['kucha','karashahr',380,'plain','dzungar',[[84.25,41.78],[85.65,41.78],[86.17,41.76]]],
 ['karashahr','turpan',350,'mountain','dzungar',[[87.2,42.23],[88.1,42.5]]],
 ['turpan','hami',420,'hill','dzungar qing',[[90.25,42.86],[91.5,43.05]]],
 ['hami','jiuquan',850,'hill','qing',[[94.5,42.1],[95.2,41.9],[95.78,40.52],[97.05,40.28],[98.29,39.78]]],
 ['jiuquan','zhangye',220,'plain','qing',[[99.2,39.4],[99.8,39.2]]],
 ['zhangye','wuwei',250,'plain','qing',[[101.08,38.79],[101.95,38.25]]],
 ['wuwei','lanzhou',300,'mountain','qing',[[102.9,37.5],[103.15,37.15],[103.5,36.65]]],
 ['lanzhou','xian',720,'hill','qing',[[104.62,35.58],[105.73,34.58],[107.24,34.36]]],
];
export const SILK_ROAD_ROADS=Object.fromEntries(rowsRoad.map(([a,b,km,terrain,nations,via])=>[`${a}_${b}`,{
 a,b,km,terrain,nations:nations.split(' '),via,climate:'arid',
 region:['jiuquan','zhangye','wuwei','lanzhou'].includes(a)?'eastAsia':'centralAsia',
 penalty:{plain:1,hill:.65,mountain:.5}[terrain],safety:{plain:.95,hill:.9,mountain:.86}[terrain],
}]));
