// Preserve retired indices so existing vehicles, cargo and road investments can migrate.
export const ASIA_RETIRED_ROADS=[
 'patna_hughli','agra_patna','nanchang_fuzhou',
 'beijing_nanjing','beijing_xian','nanjing_suzhou',
];
// Coastal overland corridors; distances are gameplay estimates, not sea distances.
export const ASIA_ADDED_ROADS={
 goa_bombay:{a:'goa',b:'bombay',km:590,via:[[73.95,16.2],[73.65,17.1],[73.35,18.1],[73.15,18.7],[72.97,19.16]],terrain:'hill',penalty:.8,safety:.92,nations:['portugal','mughal','england'],region:'india'},
 surat_bombay:{a:'surat',b:'bombay',km:280,via:[[73.05,20.6],[73.05,19.8],[73.1,19.3]],terrain:'plain',penalty:1,safety:.95,nations:['mughal','england'],region:'india'},
};

// Second revision: these links remained valid through city_version 11.
export const ASIA_FURTHER_RETIRED_ROADS=['ahmedabad_agra','ajmer_delhi'];
