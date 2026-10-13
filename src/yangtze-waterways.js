// Schematic geographic river centerlines, not modern navigation charts.
// Jiujiang is upstream of the Poyang outlet at Hukou; Yueyang uses Chenglingji.
const nanjingToHukou=[[118.47,31.92],[118.47,31.65],[118.35,31.35],[118.12,31.2],[117.75,30.97],[117.46,30.75],[117.10,30.53],[116.8,30.15],[116.55,29.9],[116.23,29.74]];
const hukouToNanchang=[[116.20,29.6],[116.10,29.45],[116.06,29.16],[115.96,29.0],[115.93,28.8]];
const shanghaiToWusong=[[121.52,31.28],[121.55,31.36],[121.5,31.4]];
export const YANGTZE_WATERWAYS={
 yangzhou_nanjing:{since:27,river:'Yangtze',via:[[119.43,32.22],[119.18,32.23],[118.91,32.12]]},
 shanghai_yangzhou:{a:'shanghai',b:'yangzhou',nations:['qing'],river:'Huangpu / Yangtze',via:[...shanghaiToWusong,[121.5,31.7],[121.15,31.7],[120.9,31.8],[120.55,31.95],[120.2,32.02],[119.8,32.25],[119.43,32.22]]},
 nanjing_jiujiang:{a:'nanjing',b:'jiujiang',nations:['qing'],river:'Yangtze',via:nanjingToHukou},
 jiujiang_hankou:{a:'jiujiang',b:'hankou',nations:['qing'],river:'Yangtze',via:[[115.77,29.86],[115.56,29.91],[115.27,30.05],[115.10,30.22],[114.93,30.35],[114.72,30.46],[114.52,30.65]]},
 hankou_yueyang:{a:'hankou',b:'yueyang',nations:['qing'],river:'Yangtze / Dongting',via:[[114.3,30.4],[114.1,30.2],[113.97,29.87],[113.65,29.73],[113.23,29.42],[113.13,29.43]]},
 yueyang_yichang:{a:'yueyang',b:'yichang',nations:['qing'],river:'Dongting / Yangtze',via:[[113.13,29.43],[113.23,29.42],[113.1,29.45],[112.65,29.72],[112.24,29.88],[112.35,30.15],[112.25,30.3],[111.9,30.4],[111.7,30.4],[111.5,30.47]]},
 jiujiang_nanchang:{a:'jiujiang',b:'nanchang',nations:['qing'],river:'Yangtze / Poyang / Gan',via:[[116.23,29.74],...hukouToNanchang]},
 yueyang_changsha:{a:'yueyang',b:'changsha',nations:['qing'],river:'Dongting / Xiang',since:30,via:[[112.96,29.25],[112.9,29.05],[112.86,28.85],[112.88,28.65],[112.94,28.45]]},
};
// Display paths join at city markers; geographic vias still determine distance.
YANGTZE_WATERWAYS.yangzhou_nanjing.displayVia=[[119.18,32.23],[118.91,32.12]];
YANGTZE_WATERWAYS.shanghai_yangzhou.displayVia=[...shanghaiToWusong,[121.5,31.7],[121.15,31.7],[120.9,31.8],[120.55,31.95],[120.2,32.02]];
YANGTZE_WATERWAYS.jiujiang_nanchang.displayVia=hukouToNanchang.slice(1);
// Ocean access remains a geometry-only point, with no extra market or cargo handling.
export const RIVER_MOUTHS={
 yangtze:{city:'shanghai',allShips:true,nations:['qing'],river:'Huangpu / Yangtze',gateway:[123,31],
  via:[...shanghaiToWusong,[121.9,31.6],[122.4,31.5]]},
};
