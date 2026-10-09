// Representative trading centres around 1700. Quantities and road lengths are
// gameplay approximations, not historical statistics. Small stations are via points.
const nation=(name,nameEn,color,tradePort)=>({name,nameEn,color,tradePort,fee:300,daily:.6,tax:.025});
export const TRADE_HUB_NATIONS={
 burma:nation('タウングー朝ビルマ','Toungoo Burma','#be123c','syriam'),
 air:nation('アイル・スルタン国','Sultanate of Air','#c2410c','agadez'),
 kano:nation('カノ王国','Kingdom of Kano','#15803d','kano'),
 funj:nation('フンジ・スルタン国','Funj Sultanate','#a21caf','sennar'),
};
const rows=[
 ['ambon','Ambon','netherlands',128.18,-3.7,'spices timber','southeastAsia','tropical'],
 ['bandaneira','Banda Neira','netherlands',129.9,-4.53,'spices','southeastAsia','tropical'],
 ['syriam','Syriam','burma',96.25,16.77,'food timber','southeastAsia','tropical'],
 ['ava','Ava','burma',95.98,21.86,'cotton cloth','southeastAsia','tropical'],
 ['thatta','Thatta','mughal',67.92,24.75,'cloth indigo','southAsia','arid'],
 // The historical delta port's precise site is disputed; use an approximate delta location.
 ['lahoribandar','Lahori Bandar','mughal',67.42,24.52,'food','southAsia','arid'],
 // Kartli's vassal status is represented by the Safavid trading licence.
 ['tiflis','Tiflis','safavid',44.8,41.72,'silk tools','westAsia','temperate'],
 ['yerevan','Yerevan','safavid',44.51,40.18,'cotton food','westAsia','temperate'],
 ['jeddah','Jeddah','ottoman',39.17,21.49,'','westAsia','arid'],
 ['agadez','Agadez','air',7.99,16.97,'tools','africa','arid'],
 ['kano','Kano','kano',8.52,12,'cloth cotton','africa','arid'],
 ['suakin','Suakin','ottoman',37.33,19.1,'','africa','arid'],
 ['sennar','Sennar','funj',33.57,13.55,'food cotton','africa','tropical'],
 ['mecca','Mecca','ottoman',39.83,21.42,'','westAsia','arid'],
 ['medina','Medina','ottoman',39.61,24.47,'food','westAsia','arid'],
];
export const TRADE_HUB_APPROACHES={
 ambon:[[128.1,-3.8],[128,-4]],
 bandaneira:[[129.85,-4.6],[130,-5]],
 syriam:[[96.3,16.35],[96.5,15.5],[96,14]],
 lahoribandar:[[67.15,24.2],[67,24],[66,23]],
 jeddah:[[39,21.4],[38.8,21],[38,20]],
 suakin:[[37.5,19.1],[38,19]],
};
export const TRADE_HUB_CITIES=Object.fromEntries(rows.map(([id,mapName,nation,lon,lat,goods,marketRegion,climate])=>[id,{
 mapName,nation,lon,lat,exports:goods?goods.split(' '):[],marketRegion,climate,label:[5,-5],
 inland:!TRADE_HUB_APPROACHES[id],...(TRADE_HUB_APPROACHES[id]?{gateway:TRADE_HUB_APPROACHES[id].at(-1)}:{}),
 ...(['mecca','jeddah','suakin','agadez','medina'].includes(id)?{productionZone:'aridTradeHub'}:{}),
 ...(id==='mecca'?{mapLabelOffset:[5,12],demandMultiplier:{food:1.8,cloth:1.5}}:{}),
}]));
export const TRADE_HUB_PORTS=Object.fromEntries(Object.entries(TRADE_HUB_CITIES).filter(([,c])=>!c.inland));
export const TRADE_HUB_CONNECTIONS={ambon:[[129,-5]],bandaneira:[[129,-5]],syriam:[[95,15]],lahoribandar:[[65,23]],jeddah:[[38,20]],suakin:[[39,19]]};
const roads=[
 ['syriam','ava',690,'plain','burma',[[96.4,17.1],[96.47,18.94],[96.2,20.2],[96,21.3]],'southeastAsia','tropical'],
 ['multan','thatta',900,'plain','mughal',[[70.65,28.42],[68.85,27.7],[68.5,26.2],[68.35,25.4]],'southAsia','arid'],
 ['thatta','lahoribandar',70,'plain','mughal',[[67.7,25.05],[67.2,25.08],[66.95,24.95]],'southAsia','arid'],
 ['tabriz','yerevan',330,'mountain','safavid',[[45.77,38.43],[45.6,38.95],[44.8,39.5]],'westAsia','temperate'],
 ['yerevan','tiflis',280,'mountain','safavid',[[44.3,40.82],[44.62,41.15]],'westAsia','temperate'],
 ['timbuktu','agadez',1450,'hill','arma air',[[0,16.9],[1.3,16.5],[3.5,17.1],[5.4,17.1]],'africa','arid'],
 ['agadez','kano',750,'plain','air kano',[[8.3,15],[8.99,13.81]],'africa','arid'],
 ['sennar','suakin',850,'hill','funj ottoman',[[35.4,14.03],[36.4,15.45],[36.8,17],[37.2,18.2]],'africa','arid'],
 ['jeddah','mecca',85,'hill','ottoman',[[39.4,21.45]],'westAsia','arid'],
 ['mecca','medina',450,'hill','ottoman',[[39.35,22.1],[39.1,23.1],[39.3,24]],'westAsia','arid'],
 ['medina','damascus',1450,'hill','ottoman',[[38.1,26.6],[37.6,28.4],[35.75,30.2],[36.1,31.6],[36.1,32.6]],'westAsia','arid'],
];
export const TRADE_HUB_ROADS=Object.fromEntries(roads.map(([a,b,km,terrain,nations,via,region,climate])=>[`${a}_${b}`,{
 a,b,km,terrain,nations:nations.split(' '),via,region,climate,
 penalty:{plain:1,hill:.8,mountain:.5}[terrain],safety:{plain:.95,hill:.9,mountain:.86}[terrain],
}]));
