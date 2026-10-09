// Circa-1700 overland markets. Crossings and minor stations are road waypoints.
const rows=[
 ['shanhaiguan','山海関','qing',119.75,40.01,'food tools'],
 ['jinzhou','錦州','qing',121.13,41.10,'food cloth'],
 ['shenyang','瀋陽','qing',123.43,41.80,'cloth tools'],
 ['liaoyang','遼陽','qing',123.17,41.27,'food cloth'],
 ['fenghuangcheng','鳳凰城','qing',124.06,40.45,'timber food'],
 ['uiju','義州','joseon',124.53,40.20,'cloth food'],
 ['kaesong','開城','joseon',126.55,37.97,'cloth tools'],
 ['jilin','吉林','qing',126.55,43.84,'fur food'],
 ['ningguta','寧古塔','qing',129.48,44.34,'fur timber'],
];
export const MANCHURIA_KOREA_CITIES=Object.fromEntries(rows.map(([id,mapName,nation,lon,lat,goods])=>[id,{
 mapName,nation,lon,lat,exports:goods.split(' '),label:[5,-5],inland:true,
 marketRegion:'eastAsia',productionZone:'northernInterior',climate:lat>=43?'cold':'temperate',
}]));
const rowsRoad=[
 ['beijing','shanhaiguan',350,'plain','qing',[[117.4,39.95],[118.2,39.95],[118.88,39.94]]],
 ['shanhaiguan','jinzhou',200,'hill','qing',[[120.35,40.33],[120.7,40.65]]],
 ['jinzhou','shenyang',280,'plain','qing',[[121.8,41.6],[122.25,41.8],[122.85,42.02]]],
 ['shenyang','liaoyang',75,'plain','qing'],
 ['liaoyang','fenghuangcheng',230,'mountain','qing',[[123.4,41],[123.65,40.85]]],
 ['fenghuangcheng','uiju',100,'hill','qing joseon',[[124.3,40.32],[124.45,40.23]]],
 ['uiju','pyongyang',220,'hill','joseon',[[124.75,40.03],[125.2,39.8],[125.65,39.62],[125.75,39.3]]],
 ['pyongyang','kaesong',180,'hill','joseon',[[125.85,38.7],[126.1,38.45],[126.3,38.15]]],
 ['kaesong','hanseong',80,'hill','joseon',[[126.8,37.9],[126.9,37.75]]],
 ['shenyang','jilin',470,'hill','qing',[[123.85,42.3],[124.35,43.17],[125.3,43.4],[126,43.7]]],
 ['jilin','ningguta',420,'mountain','qing',[[127.1,43.75],[128.23,43.37],[128.85,43.85]]],
];
export const MANCHURIA_KOREA_ROADS=Object.fromEntries(rowsRoad.map(([a,b,km,terrain,nations,via])=>[`${a}_${b}`,{
 a,b,km,terrain,nations:nations.split(' '),region:'eastAsia',...(via?{via}:{}),
 penalty:{plain:1,hill:.8,mountain:.5}[terrain],safety:{plain:.95,hill:.92,mountain:.86}[terrain],
}]));
// Keep this slot for old saves; current routes must stop at Kaesong.
export const MANCHURIA_KOREA_RETIRED_ROADS=['hanseong_pyongyang'];
