// Central/eastern Europe circa 1700. Markets and roads are gameplay approximations.
// Append-only additions preserve all published city, nation and road indices.
const nation=(name,nameEn,color,tradePort)=>({name,nameEn,color,tradePort,fee:300,daily:.6,tax:.025});
export const EUROPE_NATIONS={
 hamburg:nation('ハンブルク自由都市','Free City of Hamburg','#dc2626','hamburg'),
 frankfurt:nation('フランクフルト自由都市','Free City of Frankfurt','#f472b6','frankfurt'),
 cologne:nation('ケルン自由都市','Free City of Cologne','#a78bfa','cologne'),
 brandenburg:nation('ブランデンブルク＝プロイセン','Brandenburg–Prussia','#94a3b8','konigsberg'),
 saxony:nation('ザクセン選帝侯領','Electorate of Saxony','#84cc16','leipzig'),
 bavaria:nation('バイエルン選帝侯領','Electorate of Bavaria','#0ea5e9','munich'),
 habsburg:nation('ハプスブルク君主国','Habsburg Monarchy','#fbbf24','vienna'),
 poland:nation('ポーランド＝リトアニア共和国','Polish–Lithuanian Commonwealth','#e11d48','gdansk'),
};
const city=(mapName,nation,lon,lat,exports)=>({mapName,nation,lon,lat,exports:exports.split(' '),label:[5,-5]});
export const EUROPE_PORTS={
 hamburg:{...city('Hamburg','hamburg',9.99,53.55,'cloth tools'),gateway:[8.3,54.1]},
 gdansk:{...city('Gdańsk','poland',18.65,54.35,'food timber'),gateway:[18.9,54.8]},
 konigsberg:{...city('Königsberg','brandenburg',20.51,54.71,'food timber'),gateway:[19.65,54.75]},
};
export const EUROPE_INLAND={
 berlin:city('Berlin','brandenburg',13.40,52.52,'cloth tools'),
 leipzig:city('Leipzig','saxony',12.37,51.34,'cloth tools'),
 dresden:city('Dresden','saxony',13.74,51.05,'cloth weapons'),
 frankfurt:city('Frankfurt','frankfurt',8.68,50.11,'cloth tools'),
 cologne:city('Cologne','cologne',6.96,50.94,'cloth tools'),
 munich:city('Munich','bavaria',11.58,48.14,'food tools'),
 vienna:city('Vienna','habsburg',16.37,48.21,'cloth tools'),
 prague:city('Prague','habsburg',14.42,50.08,'cloth tools'),
 buda:city('Buda','habsburg',19.04,47.50,'food timber'),
 breslau:city('Breslau','habsburg',17.04,51.11,'cloth food'),
 warsaw:city('Warsaw','poland',21.01,52.23,'food tools'),
 krakow:city('Kraków','poland',19.94,50.06,'cloth food'),
 lviv:city('Lviv','poland',24.03,49.84,'cloth food'),
 kyiv:city('Kyiv','russia',30.52,50.45,'food timber'),
 belgrade:city('Belgrade','ottoman',20.46,44.82,'food timber'),
 bucharest:city('Bucharest','ottoman',26.10,44.43,'food cloth'),
};
// Navigable river/lagoon approaches are stylized; no modern Kiel canal.
export const EUROPE_APPROACHES={
 hamburg:[[9.7,53.56],[9.4,53.65],[9,53.88],[8.6,53.9],[8.3,54.1]],
 gdansk:[[18.7,54.45],[18.9,54.65],[18.9,54.8]],
 konigsberg:[[20.2,54.65],[19.9,54.55],[19.85,54.63],[19.65,54.75]],
};
export const EUROPE_CONNECTIONS={hamburg:[[7,55]],gdansk:[[19,55]],konigsberg:[[19,55]]};
const all={...EUROPE_PORTS,...EUROPE_INLAND};
const extraNations={amsterdam:'netherlands',paris:'france',venice:'venice',riga:'sweden',moscow:'russia',istanbul:'ottoman'};
// These represent trade corridors; intervening minor territories are abstracted.
const links=[
 ['amsterdam','cologne',270],['cologne','frankfurt',190],['paris','frankfurt',580],
 ['frankfurt','leipzig',390],['frankfurt','munich',400,'hill'],['frankfurt','hamburg',510],
 ['hamburg','berlin',290],['berlin','leipzig',190],['leipzig','dresden',120],
 ['dresden','prague',150,'hill'],['prague','vienna',330,'hill'],['prague','munich',350,'hill'],
 ['munich','vienna',440,'hill'],['munich','venice',560,'mountain',[[11.4,47.27],[11.5,46.9],[11.35,46.5]]],
 ['vienna','buda',250],['vienna','breslau',400,'hill'],['dresden','breslau',280],
 ['berlin','breslau',350],['berlin','gdansk',510],['gdansk','warsaw',340],
 ['gdansk','konigsberg',170],['konigsberg','riga',430],['breslau','krakow',280],
 ['warsaw','krakow',300],['warsaw','lviv',400],['krakow','lviv',330],
 ['krakow','buda',420,'mountain',[[19.7,49.1],[19.1,48.7]]],['lviv','kyiv',540],
 ['kyiv','moscow',860],['buda','belgrade',380],['belgrade','bucharest',600,'hill'],
 ['bucharest','istanbul',650,'hill',[[27.9,43.2],[27.3,42.1]]],
];
export const EUROPE_ROADS=Object.fromEntries(links.map(([a,b,km,terrain='plain',via])=>[a+'_'+b,{
 a,b,km,terrain,penalty:terrain==='mountain'?.5:terrain==='hill'?.8:1,safety:terrain==='mountain'?.88:.94,
 nations:[...new Set([all[a]?.nation??extraNations[a],all[b]?.nation??extraNations[b]])],...(via?{via}:{}),
}]));
