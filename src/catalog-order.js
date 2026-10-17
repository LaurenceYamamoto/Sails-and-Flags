import {localizedCityName} from './city-names.js';
// Stable display taxonomy. Never use these regions as economic demand profiles.
export const DISPLAY_REGIONS=[
 ['northEurope','北西欧','Northwestern Europe'],['westEurope','西ヨーロッパ','Western Europe'],
 ['centralEurope','中央・東ヨーロッパ','Central and Eastern Europe'],['mediterranean','地中海','Mediterranean'],
 ['balkans','バルカン半島','Balkans'],['scandinavia','スカンジナビア','Scandinavia'],
 ['africa','アフリカ','Africa'],['westAsia','西アジア','Western Asia'],['southAsia','南アジア','Southern Asia'],
 ['eastAsia','東アジア','Eastern Asia'],['southeastAsia','東南アジア','Southeastern Asia'],
 ['centralAsia','中央アジア','Central Asia'],['siberia','シベリア','Siberia'],
 ['caribbean','カリブ海','Caribbean'],['northAmerica','北アメリカ','North America'],
 ['centralAmerica','中央アメリカ','Central America'],['southAmerica','南アメリカ','South America'],['other','その他','Other'],
].map(([id,name,nameEn])=>({id,name,nameEn}));
// Capital location, not colonies, trading ports, or national territorial extent.
export const CAPITAL_REGIONS={
 northEurope:'england scotland',westEurope:'spain france portugal netherlands',
 centralEurope:'russia hamburg frankfurt cologne brandenburg saxony bavaria habsburg poland',
 mediterranean:'genoa tuscany venice savoy papal',balkans:'ottoman ragusa',scandinavia:'sweden denmark',
 africa:'morocco asante benin kongo arma ethiopia air kano funj',westAsia:'oman safavid yemen',
 southAsia:'mughal calicut madurai',eastAsia:'qing japan joseon',southeastAsia:'siam aceh trinh nguyen cambodia burma',
 centralAsia:'bukhara khiva kazakh dzungar',
};
const cityGroups={
 northEurope:'london bristol plymouth liverpool edinburgh glasgow york dublin cork',
 westEurope:'amsterdam cadiz porto barcelona marseille nantes lisbon madrid paris seville valencia bilbao zaragoza salamanca coimbra bordeaux lyon toulouse rouen lille brest strasbourg',
 centralEurope:'moscow kazan arkhangelsk riga astrakhan tsaritsyn',
 mediterranean:'genoa livorno venice milan turin florence rome naples palermo cagliari taranto',
 balkans:'istanbul belgrade bucharest sarajevo sofia thessaloniki athens ragusa',
 scandinavia:'stockholm copenhagen bergen christiania gothenburg trondheim turku',
 africa:'cairo suez alexandria',westAsia:'mashhad',
 caribbean:'kingston havana santiago santodomingo sanjuan bridgetown willemstad portauprince saintpierre',
 centralAmerica:'portobelo panama guatemala',
};
const overrides=new Map(Object.entries(cityGroups).flatMap(([r,ids])=>ids.split(' ').map(id=>[id,r])));
export function displayRegion(c){
 if(overrides.has(c.id))return overrides.get(c.id);
 if(c.region==='americas')return c.lat<13?'southAmerica':'northAmerica';
 return DISPLAY_REGIONS.some(r=>r.id===c.region)?c.region:'other';
}
export function applyCatalogOrder(cities,nations){
 const rank=new Map(DISPLAY_REGIONS.map((r,i)=>[r.id,i]));
 const capitals=new Map(Object.entries(CAPITAL_REGIONS).flatMap(([r,ids])=>ids.split(' ').map(id=>[id,r])));
 const cmp=new Intl.Collator('en',{numeric:true,sensitivity:'base'}).compare;
 const nationNames={england:'England',spain:'Spain',france:'France',netherlands:'Netherlands',portugal:'Portugal'};
 for(const c of cities){c.demandRegion=c.region;c.region=displayRegion(c);}
 for(const n of nations){if(!capitals.has(n.id))throw Error('Specify capital region for nation: '+n.id);n.capitalRegion=capitals.get(n.id);n.cityCount=cities.filter(c=>nations[c.nation]===n).length;}
 [...nations].sort((a,b)=>rank.get(a.capitalRegion)-rank.get(b.capitalRegion)||b.cityCount-a.cityCount||cmp(a.nameEn??nationNames[a.id]??a.id,b.nameEn??nationNames[b.id]??b.id)).forEach((n,i)=>n.order=i);
 for(const c of cities)c.nationOrder=nations[c.nation].order;
 [...cities].sort((a,b)=>rank.get(a.region)-rank.get(b.region)||a.nationOrder-b.nationOrder||cmp(localizedCityName(a,'en'),localizedCityName(b,'en'))||cmp(a.id,b.id)).forEach((c,i)=>c.order=i);
}
