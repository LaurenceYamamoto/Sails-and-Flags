// Representative authorities around 1700 and playable caravan corridors.
// No scripted historical decline, conquest or date-based sovereignty changes.
const nation=(name,nameEn,color,tradePort)=>({name,nameEn,color,tradePort,fee:300,daily:.6,tax:.025});
export const CENTRAL_ASIA_NATIONS={
 bukhara:nation('ブハラ・ハン国','Khanate of Bukhara','#f97316','bukhara'),
 khiva:nation('ヒヴァ・ハン国','Khanate of Khiva','#a855f7','khiva'),
 kazakh:nation('カザフ・ハン国','Kazakh Khanate','#22d3ee','tashkent'),
 dzungar:nation('ジュンガル・ハン国','Dzungar Khanate','#84cc16','kashgar'),
};
const rows=[
 ['bukhara','Bukhara','bukhara',64.43,39.77,'cloth silk'],
 ['khiva','Khiva','khiva',60.36,41.38,'cotton cloth'],
 ['balkh','Balkh','bukhara',66.90,36.76,'food cotton'],
 ['mashhad','Mashhad','safavid',59.61,36.30,'cloth tools'],
 ['herat','Herat','safavid',62.20,34.35,'silk food'],
 ['kabul','Kabul','mughal',69.17,34.53,'food cloth'],
 ['samarkand','Samarkand','bukhara',66.98,39.65,'cotton food'],
 ['tashkent','Tashkent','kazakh',69.24,41.30,'food cloth'],
 ['kashgar','Kashgar','dzungar',75.99,39.47,'cotton cloth'],
];
export const CENTRAL_ASIA_CITIES=Object.fromEntries(rows.map(([id,mapName,nation,lon,lat,goods])=>[id,{
 mapName,nation,lon,lat,exports:goods.split(' '),label:[5,-5],inland:true,
 marketRegion:'centralAsia',productionZone:'centralAsianOasis',climate:id==='kabul'?'temperate':'arid',
}]));
// Distances are corridor estimates, not straight-line distances or precise historical roads.
const roads=[
 ['isfahan','mashhad',1250,'hill','safavid',[[53.7,35.5],[55,36.2],[57,36.2]],'arid'],
 ['mashhad','herat',370,'hill','safavid',[[60.6,35.3]],'arid'],
 ['herat','balkh',750,'hill','safavid bukhara',[[63.3,35.3],[64.8,35.9],[65.7,36.7]],'arid'],
 ['balkh','kabul',500,'mountain','bukhara mughal',[[67.7,36.3],[68.5,35.6],[69.1,35.3]]],
 ['kabul','lahore',700,'mountain','mughal',[[70.45,34.43],[71.55,34.02],[72.8,33.4]]],
 ['balkh','samarkand',500,'mountain','bukhara',[[67.27,37.22],[67.2,38.2],[66.85,39.05]]],
 ['samarkand','bukhara',280,'plain','bukhara',[[65.6,40.1]],'arid'],
 ['bukhara','khiva',450,'hill','bukhara khiva',[[63.2,40.25],[61.5,41]],'arid'],
 ['bukhara','mashhad',1100,'hill','bukhara safavid',[[63.6,39.1],[62.2,37.6],[61.2,36.5]],'arid'],
 ['samarkand','tashkent',320,'plain','bukhara kazakh',[[68.3,40.2]]],
 ['tashkent','kashgar',1000,'mountain','kazakh bukhara dzungar',[[70.7,40.6],[72.8,40.5],[73.6,39.7],[74.3,39.7]]],
 // Western steppe corridor avoids the Aral and Caspian seas; no extra modern city.
 ['khiva','kazan',2450,'hill','khiva kazakh russia',[[58.2,42.5],[56.7,44.5],[56.4,47],[55.1,50.3],[55.1,51.8],[52.4,53.1],[50.2,54.3]],'arid'],
];
export const CENTRAL_ASIA_ROADS=Object.fromEntries(roads.map(([a,b,km,terrain,nations,via,climate])=>[`${a}_${b}`,{
 a,b,km,terrain,nations:nations.split(' '),region:'centralAsia',...(via?{via}:{}),...(climate?{climate}:{}),
 penalty:{plain:1,hill:.65,mountain:.5}[terrain],safety:{plain:.95,hill:.9,mountain:.86}[terrain],
}]));
