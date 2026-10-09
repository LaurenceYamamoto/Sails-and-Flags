// Representative markets around 1700. River corridors use land transport for now.
// Trinh and Nguyen are separate licensing authorities, not a unified modern state.
const nation=(name,nameEn,color,tradePort)=>({name,nameEn,color,tradePort,fee:300,daily:.6,tax:.025});
export const INDOCHINA_NATIONS={
 trinh:nation('鄭氏政権','Trinh Lords (Tonkin)','#e11d48','thanglong'),
 nguyen:nation('阮氏政権','Nguyen Lords (Cochinchina)','#fbbf24','hoian'),
 cambodia:nation('カンボジア王国','Kingdom of Cambodia','#2563eb','phnompenh'),
};
const rows=[
 ['hoian','Hoi An','nguyen',108.33,15.88,'silk cloth sugar'],
 ['thanglong','Thang Long','trinh',105.85,21.03,'silk cloth'],
 ['phohien','Pho Hien','trinh',106.05,20.65,'food silk'],
 ['phnompenh','Phnom Penh','cambodia',104.92,11.56,'food timber'],
];
export const INDOCHINA_APPROACHES={hoian:[[108.39,15.87],[108.55,15.86],[109,16]]};
export const INDOCHINA_CITIES=Object.fromEntries(rows.map(([id,mapName,nation,lon,lat,goods])=>[id,{
 mapName,nation,lon,lat,exports:goods.split(' '),label:[5,-5],marketRegion:'southeastAsia',
 inland:!INDOCHINA_APPROACHES[id],...(INDOCHINA_APPROACHES[id]?{gateway:INDOCHINA_APPROACHES[id].at(-1)}:{}),
}]));
export const INDOCHINA_PORTS={hoian:INDOCHINA_CITIES.hoian};
// A single water-only attachment cannot introduce shortcuts between existing ports.
export const INDOCHINA_CONNECTIONS={hoian:[[109,15]]};
// Simplified overland connections, not a reconstruction of individual historic roads.
const roads=[
 ['thanglong','phohien',65,'plain','trinh'],
 ['thanglong','kunming',850,'mountain','trinh qing',[[104.3,22.5],[103.4,23.5]]],
 ['phohien','hoian',850,'hill','trinh nguyen',[[105.4,19.2],[105.3,18.8],[105.8,18.1],[106.7,17.3],[107.4,16.5],[107.9,16]]],
 ['hoian','phnompenh',1050,'mountain','nguyen cambodia',[[107.7,15.4],[107.7,14.3],[106.7,13.3],[106,12.5]]],
 ['phnompenh','ayutthaya',720,'plain','cambodia siam',[[104.3,12.1],[103.1,13.1],[102.5,13.65],[101.5,13.8]]],
];
export const INDOCHINA_ROADS=Object.fromEntries(roads.map(([a,b,km,terrain,nations,via])=>[`${a}_${b}`,{
 a,b,km,terrain,nations:nations.split(' '),...(via?{via}:{}),region:'southeastAsia',
 penalty:{plain:1,hill:.8,mountain:.5}[terrain],safety:{plain:.95,hill:.92,mountain:.88}[terrain],
}]));
