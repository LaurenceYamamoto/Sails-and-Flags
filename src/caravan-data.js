// One unit is a transport company-sized caravan, not an individual animal.
// Gameplay values, not reconstructed historic speeds or costs.
export const CARAVANS={
 camel:{name:'ラクダのキャラバン',nameEn:'Camel caravan',mode:'land',price:900,capacity:22,speed:30,range:2500,daily:1.6,guns:0},
 mule:{name:'ラバのキャラバン',nameEn:'Mule caravan',mode:'land',price:700,capacity:12,speed:32,range:2000,daily:1,guns:0},
};
export const LAND_PROFILES={
 camel:{terrain:{plain:.8,hill:.65,mountain:.4,arid:1.8},roadBenefit:.25},
 mule:{terrain:{plain:.95,hill:1,mountain:1,arid:.65},roadBenefit:.35},
};
// Dry corridors are a separate climate classification; old wagon times stay intact.
export const ARID_ROADS=['cairo_suez','aleppo_baghdad'];
