// Append-only ports: existing city indices and ocean-mesh edges remain stable.
// Port position: https://port.py.gov.in/geographical-location (11°56 N, 79°50 E).
// Markets and offshore approaches are gameplay approximations.
export const EXPANSION_PORTS={
 pondicherry:{mapName:'Pondicherry',nation:'france',lon:79.8333,lat:11.9333,label:[5,9],exports:['cloth','cotton'],gateway:[80.15,11.9333]},
 edo:{mapName:'江戸',nameEn:'Edo',nation:'japan',lon:139.76,lat:35.68,label:[5,-5],exports:['cloth','food'],gateway:[139.8,34.7]},
};
export const EXPANSION_APPROACHES=Object.fromEntries(Object.entries(EXPANSION_PORTS).map(([id,c])=>[id,[c.gateway]]));
// A single attachment cannot introduce shortcuts between existing ports.
export const EXPANSION_CONNECTIONS={pondicherry:[[81,13]],edo:[[140,34]]};
// Tokyo Bay approach bends around the peninsulas; only the first segment joins land.
EXPANSION_APPROACHES.edo=[[139.85,35.5],[139.77,35.3],[139.8,35.2],[139.77,35.08],[139.7,34.9],[139.8,34.7]];
