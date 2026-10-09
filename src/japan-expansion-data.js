// Representative regional markets around 1700; minor post towns are waypoints.
const rows=[
 ['nagoya','名古屋',136.91,35.18,'cloth porcelain'],
 ['sunpu','駿府',138.38,34.98,'tea timber'],
 ['hiroshima','広島',132.46,34.39,'food timber'],
 ['hakata','博多',130.41,33.59,'cloth food'],
 ['kanazawa','金沢',136.66,36.56,'silk tools'],
 ['sendai','仙台',140.87,38.27,'food timber'],
];
export const JAPAN_APPROACHES={
 hiroshima:[[132.4,34.25],[132.175,33.9],[132.025,33.35],[132,32]],
 hakata:[[130.3,33.7],[130.1,33.85],[129.8,34]],
};
export const JAPAN_CITIES=Object.fromEntries(rows.map(([id,mapName,lon,lat,goods])=>[id,{
 mapName,nation:'japan',lon,lat,exports:goods.split(' '),label:[5,-5],marketRegion:'eastAsia',climate:'temperate',
 inland:!JAPAN_APPROACHES[id],...(JAPAN_APPROACHES[id]?{gateway:JAPAN_APPROACHES[id].at(-1)}:{}),
}]));
export const JAPAN_PORTS=Object.fromEntries(Object.entries(JAPAN_CITIES).filter(([,c])=>!c.inland));
export const JAPAN_CONNECTIONS={hiroshima:[[133,31]],hakata:[[130,34]]};
// Distances include minor stations and passes without additional market stops.
// Nagoya–Kyoto uses the inland Mino/Sekigahara corridor, not the Ise Bay ferry.
const roads=[
 ['kyoto','nagoya',170,'hill',[[135.87,35.05],[136.1,35.2],[136.3,35.35],[136.47,35.37],[136.62,35.32],[136.8,35.25]]],
 ['nagoya','sunpu',185,'hill',[[137.17,34.96],[137.39,34.85],[137.73,34.8],[138.01,34.83],[138.2,34.91]]],
 ['sunpu','edo',180,'mountain',[[138.5,35.13],[138.7,35.2],[138.86,35.15],[139.02,35.22],[139.15,35.3],[139.4,35.4],[139.58,35.55]]],
 ['osaka','hiroshima',350,'hill',[[135.3,34.85],[135.05,34.8],[134.69,34.85],[134.35,34.8],[133.93,34.7],[133.4,34.65],[133.05,34.5],[132.75,34.45]]],
 ['hakata','nagasaki',165,'hill',[[130.5,33.4],[130.4,33.28],[130.2,33.2],[129.98,33.08],[130.07,32.9],[130,32.82]]],
 ['kyoto','kanazawa',250,'mountain',[[135.8,35.2],[135.9,35.4],[136.1,35.65],[136.15,35.9],[136.22,36.06],[136.45,36.3]]],
 ['edo','sendai',370,'hill',[[139.75,36],[139.88,36.56],[140.2,37.13],[140.38,37.4],[140.47,37.75],[140.62,38]]],
];
export const JAPAN_ROADS=Object.fromEntries(roads.map(([a,b,km,terrain,via])=>[`${a}_${b}`,{
 a,b,km,terrain,via,nations:['japan'],region:'eastAsia',
 penalty:{hill:.8,mountain:.5}[terrain],safety:{hill:.95,mountain:.9}[terrain],
}]));
