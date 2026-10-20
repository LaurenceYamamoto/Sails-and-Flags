use crate::model::{amount, ensure, City, Engine, Game, Result, Waterway};
use serde::Deserialize;
use serde_json::Value;

#[derive(Deserialize)]
struct RoadRevision {
    #[serde(default)]
    retired: bool,
    #[serde(default)]
    retired_since: u32,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RetiredCatalog {
    cities: Vec<City>,
    distance_rows: Vec<Vec<Option<f64>>>,
    roads: Vec<RoadRevision>,
    waterways24: Vec<Waterway>,
    waterways25: Vec<Waterway>,
}

impl Engine {
    // The withdrawn prototypes used revisions 24/25. Validate against their
    // original transport rules BEFORE discarding routes or city records.
    // This archive is migration-only; none of its waterways appear in play.
    pub(crate) fn rollback_waterways(&self, g: &mut Game) -> Result<Vec<(usize, f64, usize)>> {
        if ![24, 25].contains(&g.city_version) { return Ok(vec![]); }
        let old: RetiredCatalog = serde_json::from_str(include_str!("../data/retired-waterway-catalog.json"))
            .map_err(|e| e.to_string())?;
        let mut data = self.data.clone();
        data.cities.truncate(320);
        data.roads.truncate(353);
        data.distances.truncate(320);
        for row in &mut data.distances { row.truncate(320); }
        if g.city_version == 25 {
            for (i, row) in data.distances.iter_mut().enumerate() {
                row.extend(old.distance_rows.iter().map(|r| r[i]));
            }
            data.distances.extend(old.distance_rows);
            data.cities.extend(old.cities);
        }
        for (r, prior) in data.roads.iter_mut().zip(old.roads) {
            r.retired = prior.retired;
            r.retired_since = prior.retired_since;
            // Belgrade–Bucharest was still a road in revision 24.
            if g.city_version == 24 && r.retired_since == 25 {
                r.retired = false;
                r.retired_since = 0;
            }
        }
        data.waterways = if g.city_version == 24 { old.waterways24 } else { old.waterways25 };
        let waterway_index = data.waterways.iter().enumerate()
            .map(|(i, w)| ((w.a.min(w.b), w.a.max(w.b)), i)).collect();
        data.water_access.clear();
        let checker = Engine { runtime_paths: None, land_connections: crate::land_connections::connections(&data), data, graphics: Value::Null, waterway_index, water_access_index: Default::default(),
            water_connections: Default::default(), game: g.clone() };
        let mut prior = g.clone();
        prior.city_version = 30; // Validate as a complete save in its own catalog.
        checker.validate(&prior, true)?;

        let mut refunds = vec![];
        for (ci, c) in g.companies.iter_mut().enumerate() {
            let removed: Vec<_> = c.routes.iter().filter(|r| {
                if r.stops.iter().any(|&i| i >= 320) { return true; }
                if r.mode != "sea" { return false; }
                // Restored land corridors cannot be sailed. Retain compatible
                // coastal voyages and the two explicitly allowed rivers.
                let compatible = |kind: &str| self.data.specs.iter().find(|s| s.id == kind)
                    .or_else(|| g.designs.get(kind)).is_some_and(|s|
                        r.stops.iter().enumerate().all(|(i, &a)|
                            self.water_distance(s, a, r.stops[(i + 1) % r.stops.len()]) <= s.range));
                !compatible(&r.auto_type) || r.replacements.iter().any(|k| !compatible(k))
                    || c.ships.iter().filter(|s| s.route == Some(r.id)).any(|s| !compatible(&s.kind))
            }).map(|r| r.id).collect();
            let mut refund = 0.0;
            for s in &mut c.ships {
                if s.route.is_some_and(|id| removed.contains(&id)) {
                    refund += s.cargo.iter().map(|x| x.cost).sum::<f64>();
                    s.route = None;
                    s.voyage = None;
                    s.handling = None;
                    s.cargo.clear();
                    s.next = 0;
                    s.ready = g.day;
                }
            }
            c.routes.retain(|r| !removed.contains(&r.id));
            refund += g.development.iter().skip(320)
                .filter(|d| d.owner == c.id).map(|d| d.basis + d.pool).sum::<f64>();
            ensure(amount(refund) && amount(c.cash.max(0.0) + refund), "廃止陸路の返金額が不正です。")?;
            refunds.push((ci, refund, removed.len()));
        }
        g.markets.truncate(320 * self.data.goods.len());
        g.development.truncate(320);
        g.city_version = 26;
        Ok(refunds)
    }
}

impl Engine {
    // Revision 27 used a different river geometry. Validate that save in its
    // original catalog before any route is retired for the new range limits.
    pub(crate) fn validate_yangtze27(&self, g: &Game) -> Result<()> {
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct Prior { waterways: Vec<Waterway>, water_access: Vec<Waterway> }
        let old: Prior = serde_json::from_str(include_str!("../data/yangtze-revision-27.json")).map_err(|e|e.to_string())?;
        let mut data = self.data.clone();
        data.cities.truncate(320); data.roads.truncate(353); data.distances.truncate(320);
        for row in &mut data.distances { row.truncate(320); }
        for r in &mut data.roads { if r.retired_since == 28 { r.retired = false; r.retired_since = 0; } }
        data.waterways = old.waterways; data.water_access = old.water_access;
        let waterway_index = data.waterways.iter().enumerate().map(|(i,w)|((w.a.min(w.b),w.a.max(w.b)),i)).collect();
        let water_connections = crate::water_connections::connections(&data);
        let checker = Engine { runtime_paths: None,land_connections: crate::land_connections::connections(&data),data,graphics:Value::Null,waterway_index,water_access_index:Default::default(),water_connections,game:g.clone()};
        let mut prior = g.clone(); prior.city_version = 30;
        checker.validate(&prior,true)
    }
}
