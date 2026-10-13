use crate::model::Data;
use std::collections::BTreeMap;

pub struct WaterConnection {
    pub nm: f64,
    pub cities: Vec<usize>,
    pub nations: Vec<usize>,
}

// Build once per engine. Connect river-only chains through one existing ocean
// leg; never invent a waterway, open an isolated lake, or shorten an old sea leg.
pub fn connections(data: &Data) -> BTreeMap<(usize, usize), WaterConnection> {
    let count = data.cities.len();
    let access: BTreeMap<_,_> = data.water_access.iter()
        .map(|w| ((w.a.min(w.b),w.a.max(w.b)),w.nm)).collect();
    let river: Vec<_> = (0..count).map(|start| {
        let mut paths = BTreeMap::from([(start, (0.0, vec![start]))]);
        for _ in 0..data.waterways.len() {
            let mut changed = false;
            for w in &data.waterways {
                for (a, b) in [(w.a, w.b), (w.b, w.a)] {
                    if let Some((nm, path)) = paths.get(&a) {
                        let distance = nm + w.nm;
                        if paths.get(&b).is_none_or(|(old, _)| distance < *old) {
                            let mut path = path.clone();
                            path.push(b);
                            paths.insert(b, (distance, path));
                            changed = true;
                        }
                    }
                }
            }
            if !changed { break; }
        }
        paths
    }).collect();
    let is_river = |a, b| data.waterways.iter().any(|w|
        (w.a == a && w.b == b) || (w.a == b && w.b == a));
    let mut result = BTreeMap::new();
    for a in 0..count {
        for b in (a + 1)..count {
            if data.distances[a][b].is_some() || is_river(a, b) { continue; }
            let mut best = river[a].get(&b).cloned();
            for (&entrance, (first, incoming)) in &river[a] {
                for (&exit, (last, outgoing)) in &river[b] {
                    if entrance == exit || is_river(entrance, exit) { continue; }
                    let Some(sea) = data.distances[entrance][exit]
                        .or_else(|| access.get(&(entrance.min(exit),entrance.max(exit))).copied()) else { continue; };
                    let nm = first + sea + last;
                    if best.as_ref().is_none_or(|(old, _)| nm < *old) {
                        let mut path = incoming.clone();
                        path.extend(outgoing.iter().rev());
                        best = Some((nm, path));
                    }
                }
            }
            if let Some((nm, cities)) = best {
                let mut nations: Vec<_> = cities.iter().map(|&i| data.cities[i].nation).collect();
                for pair in cities.windows(2) {
                    if let Some(w) = data.waterways.iter().chain(data.water_access.iter()).find(|w|
                        (w.a == pair[0] && w.b == pair[1]) || (w.a == pair[1] && w.b == pair[0])) {
                        nations.extend(&w.nations);
                    }
                }
                nations.sort();
                nations.dedup();
                result.insert((a, b), WaterConnection { nm, cities, nations });
            }
        }
    }
    result
}
