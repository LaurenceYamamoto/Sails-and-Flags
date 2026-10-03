// Modest gameplay adjustments to existing city demand, not historical statistics.
// Region follows the city's location, independently of its ruling nation.
export const DEMAND_REGIONS={
 northEurope:{label:['北欧・北西欧','Northern Europe'],goods:{tea:1.2,coffee:1.15,spices:1.2,porcelain:1.15}},
 mediterranean:{label:['地中海','Mediterranean'],goods:{oliveOil:1.2,coffee:1.15,silk:1.15}},
 westAsia:{label:['西アジア','Western Asia'],goods:{coffee:1.3,cloth:1.15,spices:1.15}},
 southAsia:{label:['南アジア','Southern Asia'],goods:{cotton:1.2,indigo:1.2,spices:1.2}},
 eastAsia:{label:['東アジア','Eastern Asia'],goods:{tea:1.3,silk:1.2,porcelain:1.2}},
 southeastAsia:{label:['東南アジア','Southeastern Asia'],goods:{cloth:1.2,porcelain:1.2,spices:1.15}},
 africa:{label:['アフリカ市場圏','African markets'],goods:{cloth:1.2,tools:1.2}},
 americas:{label:['南北アメリカ市場圏','American markets'],goods:{tools:1.25,cloth:1.2}},
};
export const DEMAND_CLIMATES={
 cold:{label:['寒冷','Cold'],goods:{fur:1.35,timber:1.2},winter:{fur:.25,timber:.15,food:.08}},
 temperate:{label:['温帯','Temperate'],goods:{fur:1.1},winter:{fur:.2,timber:.12,food:.05}},
 tropical:{label:['熱帯','Tropical'],goods:{fur:.65,cotton:1.1},winter:{}},
 arid:{label:['乾燥','Arid'],goods:{fur:.8,cloth:1.1},winter:{fur:.08}},
};
const dry=new Set(['cairo','suez','alexandria','baghdad','basra','aleppo','damascus','muscat','mocha','sanaa','bandarabbas','isfahan','shiraz','marrakesh']);
const highland=new Set(['mexicocity','puebla','bogota','quito','cusco','potosi']);
export function demandProfile(id,{lon,lat}){
 const region=lon<-30?'americas':lon>=100&&lat>=22?'eastAsia':lon>=95?'southeastAsia':lon>=65?'southAsia':lon>=26&&lat>=12&&lat<45?'westAsia':lat<35?'africa':lat<46?'mediterranean':'northEurope';
 const climate=dry.has(id)?'arid':highland.has(id)?'temperate':Math.abs(lat)>=55?'cold':Math.abs(lat)<24?'tropical':'temperate';
 return {region,climate,south:lat<0};
}
