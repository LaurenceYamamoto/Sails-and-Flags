// Representative trading centres around 1700. Sovereignty and markets are
// deliberately simplified game data; approaches include navigable estuaries.
const nation=(name,nameEn,color,tradePort)=>({name,nameEn,color,tradePort,fee:300,daily:.6,tax:.025});
export const WORLD_NATIONS={
  venice:nation('ヴェネツィア共和国','Republic of Venice','#fb7185','venice'),
  ottoman:nation('オスマン帝国','Ottoman Empire','#a3e635','istanbul'),
  sweden:nation('スウェーデン','Sweden','#38bdf8','stockholm'),
  denmark:nation('デンマーク＝ノルウェー','Denmark–Norway','#fda4af','copenhagen'),
  russia:nation('ロシア・ツァーリ国','Tsardom of Russia','#c4b5fd','arkhangelsk'),
  morocco:nation('モロッコ','Morocco','#f97316','sale'),
  oman:nation('オマーン','Oman','#f5d0fe','muscat'),
  safavid:nation('サファヴィー朝ペルシア','Safavid Persia','#2dd4bf','bandarabbas'),
  mughal:nation('ムガル帝国','Mughal Empire','#fde68a','surat'),
  siam:nation('アユタヤ王国','Ayutthaya Kingdom','#c084fc','ayutthaya'),
  aceh:nation('アチェ王国','Aceh Sultanate','#bef264','aceh'),
  qing:nation('清','Qing Empire','#ffb86c','guangzhou'),
  japan:nation('日本','Japan','#f8fafc','nagasaki'),
  joseon:nation('朝鮮','Joseon','#67e8f9','busan'),
  yemen:nation('イエメン','Yemen','#d6b98c','mocha'),
};
export const WORLD_GOODS=[
  ['tea','茶','Tea',65],['silk','絹','Silk',115],['porcelain','陶磁器','Porcelain',100],
  ['spices','香辛料','Spices',110],['coffee','コーヒー','Coffee',78],
  ['cotton','綿花','Cotton',40],['indigo','藍','Indigo',82],['silver','銀','Silver',140],['fur','毛皮','Fur',80],['gold','金','Gold',170],
].map(([id,name,nameEn,base])=>({id,name,nameEn,base}));
// id, map name, political authority, longitude, latitude, exports, sea gateway.
const ports=[
  ['stockholm','Stockholm','sweden',18.07,59.33,'timber tools',[19.4,59.3]],
  ['copenhagen','Copenhagen','denmark',12.59,55.68,'food timber',[12.75,55.7]],
  ['riga','Riga','sweden',24.1,56.95,'timber food',[23.8,57.5]],
  ['arkhangelsk','Arkhangelsk','russia',40.54,64.54,'fur timber',[39.5,65]],
  ['venice','Venice','venice',12.34,45.44,'cloth tools',[12.6,45.3]],
  ['istanbul','Istanbul','ottoman',28.98,41.01,'cloth food',[28.8,40.9]],
  ['izmir','Izmir','ottoman',27.14,38.42,'cotton silk',[26.6,38.65]],
  ['alexandria','Alexandria','ottoman',29.89,31.2,'food cotton',[29.8,31.4]],
  ['sale','Salé','morocco',-6.82,34.04,'food cloth',[-7,34.3]],
  ['elmina','Elmina','netherlands',-1.35,5.08,'gold timber',[-1.4,4.8]],
  ['luanda','Luanda','portugal',13.23,-8.82,'cotton timber',[13,-8.8]],
  ['capetown','Cape Town','netherlands',18.42,-33.92,'food', [18,-33.9]],
  ['mozambique','Ilha de Moçambique','portugal',40.74,-15.03,'gold food',[41,-15]],
  ['mombasa','Mombasa','oman',39.67,-4.06,'timber food',[39.9,-4.2]],
  ['zanzibar','Zanzibar','oman',39.19,-6.16,'timber food',[38.9,-6.2]],
  ['boston','Boston','england',-71.06,42.36,'timber food',[-70.6,42.5]],
  ['newyork','New York','england',-74.01,40.71,'fur timber',[-73.7,40.4]],
  ['quebec','Québec','france',-71.21,46.81,'fur timber',[-64,49]],
  ['charleston','Charleston','england',-79.93,32.78,'food indigo',[-79.6,32.6]],
  ['veracruz','Veracruz','spain',-96.13,19.2,'silver indigo',[-95.8,19.3]],
  ['cartagena','Cartagena','spain',-75.51,10.4,'gold tobacco',[-75.8,10.6]],
  ['portobelo','Portobelo','spain',-79.65,9.55,'silver cocoa',[-79.7,9.8]],
  ['acapulco','Acapulco','spain',-99.91,16.85,'silver indigo',[-100,16.5]],
  ['callao','Callao','spain',-77.15,-12.05,'silver food',[-77.5,-12]],
  ['valparaiso','Valparaíso','spain',-71.62,-33.04,'food timber',[-71.9,-33]],
  ['buenosaires','Buenos Aires','spain',-58.38,-34.6,'food silver',[-55.8,-35.5]],
  ['salvador','Salvador','portugal',-38.51,-12.97,'sugar tobacco',[-38.5,-13.3]],
  ['rio','Rio de Janeiro','portugal',-43.17,-22.91,'sugar gold',[-43.1,-23.2]],
  ['muscat','Muscat','oman',58.59,23.61,'food spices',[58.8,23.9]],
  ['basra','Basra','ottoman',47.78,30.51,'cloth food',[48.6,29.7]],
  ['bandarabbas','Bandar Abbas','safavid',56.27,27.18,'silk cloth',[56.4,27]],
  ['mocha','Mocha','yemen',43.25,13.32,'coffee',[43,13.3]],
  ['surat','Surat','mughal',72.83,21.17,'cotton cloth indigo',[72.5,21]],
  ['bombay','Bombay','england',72.83,18.94,'cotton cloth',[72.6,18.8]],
  ['goa','Goa','portugal',73.91,15.5,'spices cloth',[73.6,15.5]],
  ['madras','Madras','england',80.28,13.08,'cloth indigo',[80.6,13]],
  ['hughli','Hughli','mughal',88.39,22.9,'silk cloth indigo',[88,21]],
  ['colombo','Colombo','netherlands',79.85,6.93,'spices',[79.6,6.9]],
  ['batavia','Batavia','netherlands',106.81,-6.13,'spices sugar',[106.8,-5.7]],
  ['malacca','Melaka','netherlands',102.25,2.19,'spices timber',[102.1,2]],
  ['manila','Manila','spain',120.98,14.6,'silk sugar',[120.5,14.3]],
  ['aceh','Banda Aceh','aceh',95.32,5.55,'spices',[95.2,5.8]],
  ['ayutthaya','Ayutthaya','siam',100.57,14.35,'food timber',[100.6,12.5]],
  ['guangzhou','広州','qing',113.26,23.13,'tea silk porcelain',[113.8,21.8]],
  ['xiamen','厦門','qing',118.08,24.48,'tea porcelain',[118.3,24.3]],
  ['ningbo','寧波','qing',121.55,29.87,'silk porcelain',[122.2,29.8]],
  ['nagasaki','長崎','japan',129.88,32.75,'silver porcelain',[129.6,32.6]],
  ['osaka','大阪','japan',135.5,34.69,'food cloth',[135.1,34.4]],
  ['busan','釜山','joseon',129.07,35.18,'food cloth',[129.3,35]],
];
export const WORLD_PORTS=Object.fromEntries(ports.map(([id,mapName,nation,lon,lat,exports,gateway])=>[id,{mapName,nation,lon,lat,label:[5,-5],exports:exports.split(' '),gateway}]));
// Established river access is explicit and is not a transcontinental shortcut.
export const WORLD_APPROACHES=Object.fromEntries(ports.map(([id,,,,,,gateway])=>[id,[gateway]]));
WORLD_APPROACHES.quebec=[[-70.5,47],[-69,48.2],[-67,49],[-64,49]];
WORLD_APPROACHES.ayutthaya=[[100.55,13.1],[100.6,12.5]];
WORLD_APPROACHES.hughli=[[88.1,22],[88,21]];
WORLD_APPROACHES.guangzhou=[[113.6,22.6],[113.8,21.8]];
WORLD_APPROACHES.basra=[[48.4,29.9],[48.6,29.7]];
WORLD_APPROACHES.osaka=[[135.1,34.4],[134.9,34.1],[135,33.7],[135.4,33.3]];
export function worldMarket(id,city,good){
  const exports=city.exports??(city.lon<-20?['sugar','tobacco']:['cloth','tools']);
  const producer=exports.includes(good.id);
  // Independent deterministic variation makes neighbouring markets distinct.
  const variation=[...id+good.id].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,0)%30;
  return {stock:producer?300+variation:65+variation,production:producer?3.2+variation/50:.35+variation/100,demand:(producer?1.2+variation/100:2.2+variation/50)*(city.demandMultiplier?.[good.id]??1)};
}
