// Local production including the surrounding hinterland, not port re-exports.
// Game-scale suitability; quantities are not reconstructed historical statistics.
const lists={
 spices:new Set(['goa','colombo','batavia','malacca','aceh']),
 coffee:new Set(['mocha','sanaa']),
 silver:new Set(['veracruz','acapulco','mexicocity','guadalajara','callao','potosi','nagasaki']),
 gold:new Set(['elmina','kumasi','mozambique','cartagena','bogota','rio']),
};
export function localProduction(id,c,good,previous){
 const {lon,lat}=c,american=lon<-30,tropicalAmerica=american&&lat<26&&lat>-25;
 const eastAsia=lon>100&&lat>20,india=lon>=65&&lon<95&&lat>=5&&lat<36;
 const specialty=c.exports?.includes(good)||previous>=2.2;
 const strong=Math.max(3.2,previous),minor=.03;
 switch(good){
  case 'spices':return lists.spices.has(id)?strong:0;
  case 'coffee':return lists.coffee.has(id)?Math.max(4,previous):id==='batavia'?.03:0;
  case 'tea':return eastAsia?(specialty?strong:(c.nation==='qing'||c.nation==='japan'?.18:.03)):0;
  case 'cocoa':return tropicalAmerica?(id==='willemstad'?.03:(specialty?strong:.12)):0;
  case 'sugar':return tropicalAmerica||lon>=65&&lat<30&&lat>-20?(specialty?strong:.12):['cadiz','barcelona','malaga'].includes(id)?.03:0;
  case 'rum':return american&&lat<33&&lat>-25?(specialty?strong:.08):0;
  case 'tobacco':return american&&lat<40&&lat>-30?(specialty?strong:.15):lat>-10&&lat<45?.03:0;
  case 'oliveOil':return lon>-10&&lon<45&&lat>28&&lat<46?(specialty?strong:.15):0;
  case 'cotton':return india||lon>95&&lat>0&&lat<38||tropicalAmerica||lon>=-10&&lon<65&&lat>-20&&lat<40?(specialty?strong:.12):0;
  case 'indigo':return india||tropicalAmerica||id==='charleston'?(specialty?strong:.08):0;
  case 'silk':return eastAsia||india||lon>25&&lon<65&&lat>25&&lat<43||['genoa','livorno','venice','marseille','barcelona'].includes(id)?(specialty?strong:.15):0;
  case 'porcelain':return ['qing','japan'].includes(c.nation)?(specialty?strong:.12):0;
  case 'silver':return lists.silver.has(id)?strong:minor;
  case 'gold':return lists.gold.has(id)?strong:0;
  case 'fur':return lat>=43?(specialty?strong:.3):0;
  case 'food':return Math.max(.4,previous);
  case 'timber':return ['muscat','mocha','sanaa','cairo','suez','alexandria','basra','baghdad'].includes(id)?.03:Math.max(.15,previous);
  // Crafts remain possible outside export centres, at a much smaller scale.
  default:return specialty?previous:Math.min(.15,previous*.1);
 }
}
