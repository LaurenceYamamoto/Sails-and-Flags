// Build-time catalog only. Runtime consumption and investment remain in Wasm.
// Relative catchment-market sizes, not census populations; see Architecture.md.
export const MARKET_SIZE_GROUPS = {
  6: 'london paris istanbul beijing edo',
  4: 'amsterdam naples cairo isfahan delhi agra dhaka nanjing suzhou hangzhou guangzhou osaka kyoto',
  2: 'mexicocity lima salvador moscow madrid lisbon barcelona marseille genoa venice milan rome palermo vienna prague hamburg lyon rouen bordeaux seville dublin stockholm copenhagen warsaw gdansk aleppo damascus baghdad tabriz shiraz fez marrakesh tunis algiers kano benin gondar lahore ahmedabad patna surat benares murshidabad hyderabad aurangabad burhanpur madurai thanglong ayutthaya ava manila batavia xian hankou changsha hanseong tianjin jinan kaifeng yangzhou nanchang fuzhou foshan chongqing chengdu kunming jingdezhen shenyang nagoya kanazawa bukhara mashhad',
  0.5: 'santiago sanjuan bridgetown willemstad albany cordoba quebec charleston portobelo acapulco callao valparaiso annapolis portroyal pensacola staugustine cayenne paramaribo guayaquil trujillo asuncion belem concepcion neworleans portauprince saintpierre durango chihuahua santafe porto bilbao coimbra brest plymouth liverpool glasgow cork cagliari taranto ragusa christiania gothenburg turku arkhangelsk tsaritsyn ankara mocha bandarabbas suez derbent baku sale elmina luanda capetown mozambique mombasa zanzibar goree saintlouis accra benguela sofala quelimane mbanzakongo massawa kilwa suakin sennar lahoribandar pondicherry cochin busan jiuquan zhangye wuwei shanhaiguan jinzhou fenghuangcheng uiju phohien phnompenh ambon syriam kungur tyumen tobolsk tomsk irkutsk samarkand aksu kucha turpan hami',
  0.25: 'detroit vincennes kaskaskia louisbourg stjohns elpasodelnorte bandaneira tara krasnoyarsk verkhneudinsk kyakhta yeniseysk kirensk yakutsk ningguta karashahr',
};

// Import markets typically pay about twice base price, which halves consumption.
// A 2x neutral-price budget allows that price response without the previous
// 10–100x structural global deficits in rare goods. This is NOT actual consumption.
export const GLOBAL_DEMAND_TO_SUPPLY = 2;

export function applyMarketSizes(cities, goods) {
  const weights = new Map();
  const ids = new Set(cities.map(c => c.id));
  for (const [size, names] of Object.entries(MARKET_SIZE_GROUPS)) {
    for (const id of names.split(/\s+/)) {
      if (!ids.has(id) || weights.has(id)) throw Error('Invalid/duplicate market-size city: ' + id);
      weights.set(id, Number(size));
    }
  }
  // Unlisted cities are ordinary regional markets (1x).
  for (const city of cities) city.marketSize = weights.get(city.id) ?? 1;
  const balance = goods.map((good, g) => {
    const supply = cities.reduce((n,c) => n + c.supply[g], 0);
    const previousDemand = cities.reduce((n,c) => n + c.demand[g] * c.modifiers[g], 0);
    const weightedDemand = cities.reduce((n,c) => n + c.demand[g] * c.modifiers[g] * c.marketSize, 0);
    if (!(supply > 0 && weightedDemand > 0)) throw Error('No supply/demand for ' + good.id);
    const target = supply * GLOBAL_DEMAND_TO_SUPPLY;
    const factor = target / weightedDemand;
    // Replace arrays, never mutate the reference catalog or production arrays.
    return {good: good.id, supply, previousDemand, target, factor};
  });
  for (const city of cities) city.demand = city.demand.map((d,g) => d * balance[g].factor);
  return balance;
}
