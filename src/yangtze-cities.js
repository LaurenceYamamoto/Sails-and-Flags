// Scenario markets around 1700; economic values are game estimates, not census populations.
export const YANGTZE_CITIES={
 shanghai:{mapName:'上海',nation:'qing',lon:121.49,lat:31.23,exports:['cloth','cotton'],inland:true,riverPort:true,marketRegion:'eastAsia',label:[5,-5]},
 jiujiang:{mapName:'九江',nation:'qing',lon:115.99,lat:29.73,exports:['food','tea'],inland:true,riverPort:true,marketRegion:'eastAsia',label:[5,-5]},
 yueyang:{mapName:'岳陽',nation:'qing',lon:113.09,lat:29.37,exports:['food'],inland:true,riverPort:true,marketRegion:'eastAsia',label:[5,-5]},
};
export const YANGTZE_RETIRED_ROADS=['nanjing_suzhou','jingdezhen_hankou','hankou_changsha'];
export const YANGTZE_ROADS={
 jiujiang_jingdezhen:{a:'jiujiang',b:'jingdezhen',km:170,terrain:'hill',penalty:.8,safety:.92,nations:['qing'],region:'eastAsia',via:[[116.3,29.4],[116.7,29.3]]},
 yueyang_changsha:{a:'yueyang',b:'changsha',km:170,terrain:'plain',penalty:1,safety:.95,nations:['qing'],region:'eastAsia',via:[[113.15,29.05],[113.12,28.65]]},
 shanghai_suzhou:{a:'shanghai',b:'suzhou',km:100,terrain:'plain',penalty:1,safety:.95,nations:['qing'],region:'eastAsia'},
};
