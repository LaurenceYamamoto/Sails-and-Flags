// Screen-space picking only; never modifies game coordinates or route distances.
export const CITY_HIT_RADIUS = 22;
export function nearestCity(cities, point, matrix, radius = CITY_HIT_RADIUS) {
 if (!matrix) return null;
 let selected = null, distance = radius * radius;
 cities.forEach((c, i) => {
  const x = matrix.a * c.x + matrix.c * c.y + matrix.e;
  const y = matrix.b * c.x + matrix.d * c.y + matrix.f;
  const d = (x - point.x) ** 2 + (y - point.y) ** 2;
  if (d <= distance && (selected === null || d < distance - 1e-9)) { selected = i; distance = d; }
 });
 return selected;
}
