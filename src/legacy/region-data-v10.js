// P8 first expansion: commercial roles and quantities are gameplay aggregates.
// Genoa's textiles include silk; Livorno represents the Tuscan hinterland.
export const REGION_NATIONS = {
  genoa: {name:'ジェノヴァ共和国',nameEn:'Republic of Genoa',fee:280,daily:.55,tax:.025,color:'#e879f9',tradePort:'genoa'},
  tuscany: {name:'トスカーナ大公国',nameEn:'Grand Duchy of Tuscany',fee:280,daily:.55,tax:.02,color:'#22d3ee',tradePort:'livorno'},
};
export const REGION_PORTS = {
  genoa:{lon:8.934,lat:44.409,mapName:'Genoa',label:[-8,-14]},
  livorno:{lon:10.306,lat:43.548,mapName:'Livorno',label:[-10,23]},
};
export const REGION_CITIES = {
  genoa:{name:'Genoa',nation:'genoa',stocks:[65,60,350,100,120,65,120,70,160],supply:[.5,.5,3.8,1,1.3,.5,1.2,.6,1.5],demand:[2.8,2.3,1.2,2.8,2.6,2.4,2.7,2.2,1.7]},
  livorno:{name:'Livorno',nation:'tuscany',stocks:[70,65,110,90,340,70,180,65,140],supply:[.6,.5,1.1,.8,3.6,.6,1.9,.5,1.3],demand:[2.5,2.2,2.8,3,1.4,2.4,2.1,2.4,1.8]},
};
export const REGION_GOODS=[{id:'oliveOil',name:'オリーブ油',nameEn:'Olive oil',base:55}];
export function oilMarket(id,c){
  // Mediterranean supply, northern/Caribbean demand; no unmodelled imports.
  const producers={livorno:[350,3.8,1.2],genoa:[240,2.5,1.5],marseille:[260,2.8,1.6],barcelona:[300,3.2,1.4],cadiz:[240,2.6,1.6],lisbon:[210,2.3,1.7],porto:[200,2.2,1.6],madrid:[220,2.4,1.5]};
  const [stock,production,demand]=producers[id]??(c.lon<-20?[80,.6,1.4]:[85,.7,2.5]);
  return {stock,production,demand};
}
export const REGION_COMPANY={name:'Ligurian Company',stops:['genoa','livorno'],kind:'small',id:'company-3'};
export const COMPANY_STARTS=[
  {name:'Channel Company',stops:['nantes','amsterdam'],kind:'large',id:'company-1'},
  {name:'Antilles Company',stops:['santiago','sanjuan'],kind:'small',id:'company-2'},
  REGION_COMPANY,
];
export const COMPANY_IDS=COMPANY_STARTS.map(c=>c.id);
