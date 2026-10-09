import {NORTH_AMERICA_CITIES} from './north-america-data.js';
import {AMERICAN_INTERIOR_CITIES} from './american-interior-data.js';
import {CASPIAN_CITIES} from './caspian-data.js';
import {TRADE_HUB_CITIES} from './trade-hubs-data.js';
import {JAPAN_CITIES} from './japan-expansion-data.js';
import {MANCHURIA_KOREA_CITIES} from './manchuria-korea-data.js';
import {SILK_ROAD_CITIES} from './silk-road-data.js';
import {CENTRAL_ASIA_CITIES} from './central-asia-data.js';
import {INDOCHINA_CITIES} from './indochina-data.js';
import {ASIA_CITIES} from './asia-expansion-data.js';
import {FRENCH_CARIBBEAN_PORTS} from './french-caribbean-data.js';
import {TARANTO_PORTS} from './taranto-data.js';
import {KOREA_CITIES} from './korea-expansion-data.js';
import {SIBERIAN_CITIES} from './siberian-data.js';
import {ATLANTIC_CITIES} from './atlantic-expansion-data.js';
import {EUROPE_PORTS,EUROPE_INLAND} from './europe-expansion-data.js';
import {EXPANSION_PORTS} from './port-expansion-data.js';
import {CROSSING_PORTS} from './crossing-data.js';
import {WORLD_PORTS} from './world-data.js';
import {REGION_PORTS} from './region-data.js';
// Display geography is independent of gameplay distance and save data.
export function project(lon,lat) { return {x:(lon+180)*2.5,y:(90-lat)*2.5}; }
export const PORT_GEOGRAPHY = {
  porto:{lon:-8.611,lat:41.149,mapName:'Porto',label:[-17,-5]},
  barcelona:{lon:2.173,lat:41.385,mapName:'Barcelona',label:[18,18]},
  marseille:{lon:5.369,lat:43.296,mapName:'Marseille',label:[18,-4]},
  kingston: {lon:-76.793,lat:17.971,mapName:'Kingston',label:[-15,23]},
  havana: {lon:-82.366,lat:23.113,mapName:'Havana',label:[-13,-12]},
  london: {lon:-.128,lat:51.507,mapName:'London',label:[-17,4]},
  cadiz: {lon:-6.292,lat:36.529,mapName:'Cadiz',label:[15,20]},
  nantes: {lon:-1.553,lat:47.218,mapName:'Nantes',label:[-17,1]},
  amsterdam: {lon:4.904,lat:52.368,mapName:'Amsterdam',label:[-9,-16]},
  lisbon: {lon:-9.139,lat:38.722,mapName:'Lisbon',label:[-17,-4]},
  santiago: {lon:-75.821,lat:20.024,mapName:'Santiago',label:[15,-24]},
  santodomingo: {lon:-69.931,lat:18.486,mapName:'Santo Domingo',label:[-10,45]},
  sanjuan: {lon:-66.106,lat:18.466,mapName:'San Juan',label:[17,-9]},
  bridgetown: {lon:-59.616,lat:13.097,mapName:'Bridgetown',label:[17,0]},
  willemstad: {lon:-68.935,lat:12.109,mapName:'Willemstad',label:[12,29]},
};

Object.assign(PORT_GEOGRAPHY,REGION_PORTS);

Object.assign(PORT_GEOGRAPHY,WORLD_PORTS);

Object.assign(PORT_GEOGRAPHY,CROSSING_PORTS);

Object.assign(PORT_GEOGRAPHY,EXPANSION_PORTS);

Object.assign(PORT_GEOGRAPHY,EUROPE_PORTS,EUROPE_INLAND);

Object.assign(PORT_GEOGRAPHY,ATLANTIC_CITIES);

Object.assign(PORT_GEOGRAPHY,SIBERIAN_CITIES);

Object.assign(PORT_GEOGRAPHY,FRENCH_CARIBBEAN_PORTS);
Object.assign(PORT_GEOGRAPHY,TARANTO_PORTS);
Object.assign(PORT_GEOGRAPHY,KOREA_CITIES);

Object.assign(PORT_GEOGRAPHY,ASIA_CITIES);

Object.assign(PORT_GEOGRAPHY,INDOCHINA_CITIES);

Object.assign(PORT_GEOGRAPHY,CENTRAL_ASIA_CITIES,SILK_ROAD_CITIES);

Object.assign(PORT_GEOGRAPHY,MANCHURIA_KOREA_CITIES);

Object.assign(PORT_GEOGRAPHY,JAPAN_CITIES);

Object.assign(PORT_GEOGRAPHY,TRADE_HUB_CITIES);

Object.assign(PORT_GEOGRAPHY,CASPIAN_CITIES,AMERICAN_INTERIOR_CITIES,NORTH_AMERICA_CITIES);
