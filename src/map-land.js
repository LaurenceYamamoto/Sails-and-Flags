import {LAND as BASE_LAND} from '../assets/maps/world-land.js';
// Small Banda Neira is omitted by the simplified base map. Original approximate
// game outline in geographic coordinates, not a change to city locations.
export const SMALL_ISLANDS=[[[[129.88,-4.54],[129.875,-4.515],[129.89,-4.5],[129.905,-4.512],[129.91,-4.535],[129.895,-4.545],[129.88,-4.54]]]];
export const LAND=[...BASE_LAND,...SMALL_ISLANDS];
