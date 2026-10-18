use crate::model::*;
use crate::trade::{key, ratio};
use std::collections::{BTreeMap, BTreeSet};
impl Engine {
    // Also repair still-solvent preview saves that seeded posts at every endpoint.
    // Retire only free, unused facilities; never discard paid assets or inventory.
    pub fn consolidate_rival_posts(&mut self,c:usize) {
        let cities=self.game.companies[c].posts.keys().copied().collect::<Vec<_>>();
        for city in cities {
            let co=&self.game.companies[c];
            let p=&co.posts[&city];
            if p.basis!=0.0 || p.level!=1 || p.warehouse!=0 || p.handling!=0
                || !p.stock.is_empty() || p.size_budget!=0.0 || p.production_budget.iter().any(|v|*v!=0.0) {continue;}
            if co.routes.iter().all(|r|r.stops.iter().any(|&i|i!=city&&co.posts.contains_key(&i))) {
                self.game.companies[c].posts.remove(&city);
            }
        }
    }
    fn base_reserve(&self, c: usize) -> f64 {
        match self.game.companies[c].kind.as_str() {
            "large" => 6000.0,
            "medium" => 3000.0,
            _ => 1000.0,
        }
    }
    fn overhead(&self, c: usize) -> f64 {
        let co = &self.game.companies[c];
        self.post_fixed(c) + co.licenses
            .iter()
            .map(|&n| self.terms(c, n, 0).1)
            .sum::<f64>()
            + co.routes
                .iter()
                .map(|r| r.escorts as f64 * 4.0)
                .sum::<f64>()
            + co.diplomacy_budget.iter().sum::<f64>()
    }
    fn investment_budget(&self, c: usize) -> (f64, f64) {
        let co = &self.game.companies[c];
        let fixed = self.overhead(c);
        let upkeep = co.ships.iter().map(|s| self.daily(c, &s.kind)).sum::<f64>();
        let reserve = self.base_reserve(c)
            + 90.0 * (upkeep + fixed)
            + co.ships
                .iter()
                .map(|s| self.spec(&s.kind).unwrap().capacity as f64 * 50.0)
                .sum::<f64>();
        let earned = co
            .routes
            .iter()
            .filter(|r| self.game.day - r.transport.since >= 30 && r.transport.deliveries > 0)
            .map(|r| {
                (r.transport.sales - r.transport.costs - r.transport.upkeep)
                    / (self.game.day - r.transport.since).max(30) as f64
            })
            .sum::<f64>()
            - fixed
            - co.ships
                .iter()
                .filter(|s| s.route.is_none())
                .map(|s| self.daily(c, &s.kind))
                .sum::<f64>();
        (
            reserve,
            ((earned * 0.15)
                .min((co.cash - reserve) / 180.0)
                .min(match co.kind.as_str() {
                    "large" => 18.0,
                    "medium" => 12.0,
                    _ => 6.0,
                })
                .max(0.0)
                * 100.0)
                .floor()
                / 100.0,
        )
    }
    fn scale_investment(&mut self, c: usize, ratio: f64) {
        let scale = |v: &mut f64| {
            *v = (*v * ratio * 100.0).floor() / 100.0;
        };
        for v in &mut self.game.companies[c].tech_budget {
            scale(v);
        }
        for d in self.game.companies[c].posts.values_mut(){scale(&mut d.size_budget);for v in &mut d.production_budget{scale(v);}}
        let owner=&self.game.companies[c].id;
        for d in &mut self.game.roads {
            if &d.owner == owner {
                scale(&mut d.road_budget);
                scale(&mut d.security_budget);
            }
        }
    }
    pub fn guard_rival_budget(&mut self, c: usize) {
        let owner = &self.game.companies[c].id;
        let current = self.game.companies[c].tech_budget.iter().sum::<f64>()
            + self.game.companies[c].posts.values().map(|d|d.size_budget+d.production_budget.iter().sum::<f64>()).sum::<f64>()
            + self
                .game
                .roads
                .iter()
                .filter(|d| &d.owner == owner)
                .map(|d| d.road_budget + d.security_budget)
                .sum::<f64>();
        if current > 0.0 {
            let (_, daily) = self.investment_budget(c);
            if current > daily + 1e-9 {
                self.scale_investment(c, daily / current);
            }
        }
    }
    fn plan_investment(&mut self, c: usize) {
        self.scale_investment(c, 0.0);
        let (reserve, daily) = self.investment_budget(c);
        if daily <= 0.0 {
            return;
        }
        let co = &self.game.companies[c];
        let large = co.kind == "large";
        let owner = co.id.clone();
        let mut cities = BTreeMap::<usize, f64>::new();
        let mut roads = BTreeMap::<usize, f64>::new();
        for r in &co.routes {
            let fleet = co
                .ships
                .iter()
                .filter(|s| s.route == Some(r.id))
                .collect::<Vec<_>>();
            if !r.active
                || fleet.is_empty()
                || r.transport.deliveries == 0
                || r.transport.sales <= r.transport.costs + r.transport.upkeep
            {
                continue;
            }
            let traffic = fleet
                .iter()
                .map(|s| self.spec(&s.kind).unwrap().capacity as f64)
                .sum::<f64>();
            for &city in &r.stops.iter().copied().collect::<BTreeSet<_>>() {
                *cities.entry(city).or_default() += traffic;
            }
            if r.mode == "land" {
                let ids = r
                    .stops
                    .iter()
                    .enumerate()
                    .flat_map(|(i,&a)|self.land_legs(a,r.stops[(i+1)%r.stops.len()]).into_iter().map(|(_,_,j)|j))
                    .collect::<BTreeSet<_>>();
                for road in ids {
                    *roads.entry(road).or_default() += traffic;
                }
            }
        }
        let max = if large { 3 } else { 1 };
        let mut candidates = vec![];
        if daily >= 1.0 {
            // Extra posts must be justified by a new route's marginal profit below.
            // Traffic alone cannot justify the network-wide administration increase.
            if self.game.roads.iter().filter(|d| d.owner == owner).count() < max {
                for (&i, &traffic) in &roads {
                    let d = &self.game.roads[i];
                    if ["state", "private"].contains(&d.owner.as_str())
                        && self.data.roads[i]
                            .nations
                            .iter()
                            .all(|n| co.licenses.contains(n))
                    {
                        let cost = self.road_cost(i);
                        candidates.push((true, i, cost, traffic / cost));
                    }
                }
            }
        }
        candidates.retain(|q| {
            q.2 <= (co.cash - reserve).max(0.0) * if large { 0.15 } else { 0.1 }
                && co.cash - q.2 >= reserve + 180.0 * daily
        });
        candidates.sort_by(|a, b| b.3.total_cmp(&a.3));
        if let Some(&(road, i, _, _)) = candidates.first() {
            if road {
                let _ = self.buy_road(c, i);
            } else {
                let _ = self.buy_development(c, i);
            }
        }
        let co = &self.game.companies[c];
        let sea = co
            .routes
            .iter()
            .any(|r| r.active && r.mode == "sea" && co.ships.iter().any(|s| s.route == Some(r.id)));
        let land = co.routes.iter().any(|r| {
            r.active && r.mode == "land" && co.ships.iter().any(|s| s.route == Some(r.id))
        });
        let cities = cities
            .keys()
            .filter(|&&i| co.posts.contains_key(&i))
            .copied()
            .collect::<Vec<_>>();
        let roads = roads
            .keys()
            .filter(|&&i| self.game.roads[i].owner == owner)
            .copied()
            .collect::<Vec<_>>();
        let post_research=!cities.is_empty();
        let count = sea as usize + land as usize + cities.len() + roads.len() + post_research as usize;
        if count == 0 {
            return;
        }
        let share = (daily / count as f64 * 100.0).floor() / 100.0;
        self.game.companies[c].tech_budget = vec![
            0.0,
            if sea { share } else { 0.0 },
            0.0,
            0.0,
            if land { share } else { 0.0 },
            0.0,
            if post_research {share/2.0} else {0.0},
            if post_research {share/2.0} else {0.0},
        ];
        for i in cities {
            let good = self.data.cities[i]
                .supply
                .iter()
                .enumerate()
                .max_by(|a, b| a.1.total_cmp(b.1))
                .unwrap()
                .0;
            self.game.companies[c].posts.get_mut(&i).unwrap().size_budget = share / 3.0;
            self.game.companies[c].posts.get_mut(&i).unwrap().production_budget[good] = share * 2.0 / 3.0;
        }
        for i in roads {
            self.game.roads[i].road_budget = share * 2.0 / 3.0;
            self.game.roads[i].security_budget = share / 3.0;
        }
    }
    pub fn rival(&mut self, c: usize) {
        // Facility spending must leave operating capital, not just construction cash.
        let (reserve, daily) = self.investment_budget(c);
        if daily > 0.0 {
            let candidates:Vec<_>=self.game.companies[c].posts.keys().copied().collect();
            for city in candidates {
                let p=&self.game.companies[c].posts[&city];
                let traffic=self.game.companies[c].routes.iter().filter(|r|r.stops.contains(&city))
                    .map(|r| (r.activity.loading+r.activity.unloading)*self.handling_rate(c,&r.mode)
                        / (2.0*(self.game.day-r.activity.since).max(1) as f64)).sum::<f64>();
                // Do not add speculative warehouses: changing a destination into a
                // warehouse also removes immediate cash receipts from its deliveries.
                let cost=500.0;
                if p.handling==0 && traffic.min(crate::posts::HANDLING_UNITS)*crate::posts::HANDLING_FEE>4.0+cost/365.0
                    && self.game.companies[c].cash-cost>=reserve+180.0*daily+90.0*4.0 {
                    let _=self.upgrade_post(c,city,"handling");break;
                }
                // Use actual recent taxes, not fleet count, to justify scale upgrades.
                // The bounded ledger can undercount busy companies, conservatively.
                let prefix=format!("{} · ",self.data.cities[city].id);
                let tax_daily=self.game.companies[c].ledger.iter()
                    .filter(|e|e.category=="tax" && e.day>self.game.day.saturating_sub(30) && e.detail.starts_with(&prefix))
                    .map(|e|-e.amount).sum::<f64>()/30.0;
                let cost=crate::posts::POST_COST*p.level as f64;
                let savings=tax_daily*0.15/(1.0+0.15*(p.level+1) as f64);
                if p.level<3 && savings>0.5+cost/365.0
                    && self.game.companies[c].cash-cost>=reserve+180.0*daily+90.0*0.5 {
                    let _=self.upgrade_post(c,city,"post");break;
                }
            }
        }

        if self.game.companies[c].routes.len() > 1 {
            let remove = self.game.companies[c]
                .routes
                .iter()
                .find(|r| {
                    self.game.day - r.transport.since > 90
                        && r.transport.margin().is_some_and(|m| m < 0.0)
                        && self.game.companies[c]
                            .ships
                            .iter()
                            .filter(|s| s.route == Some(r.id))
                            .all(|s| {
                                s.voyage.is_none() && s.handling.is_none() && s.cargo.is_empty()
                            })
                })
                .map(|r| r.id);
            if let Some(id) = remove {
                let _ = self.remove_route(c, id, false);
            }
        }
        self.plan_investment(c);
        let n = self.data.cities.len();
        let pairs = (0..n)
            .flat_map(|a| (a + 1..n).map(move |b| (a, b)))
            .collect::<Vec<_>>();
        let offset = ((1700 * 12 + 1 + self.calendar().0) as usize * 120 + c * 37) % pairs.len();
        let mut sample = self.game.companies[c]
            .routes
            .iter()
            .filter(|r| r.stops.len() == 2)
            .map(|r| (r.stops[0].min(r.stops[1]), r.stops[0].max(r.stops[1])))
            .collect::<BTreeSet<_>>();
        for i in 0..120.min(pairs.len()) {
            sample.insert(pairs[(offset + i) % pairs.len()]);
        }
        let co = &self.game.companies[c];
        let current_reserve=self.investment_budget(c).0;
        let mut candidates = vec![];
        for (a, b) in sample {
            for kind in ["sloop", "brig", "fluyt", "wagon", "caravan"] {
                if co.kind == "small" && ["brig", "fluyt"].contains(&kind)
                    || !self.can_serve(kind, &[a, b])
                {
                    continue;
                }
                let spec = self.spec(kind).unwrap();
                let old = co
                    .routes
                    .iter()
                    .find(|r| r.mode == spec.mode && key(&r.stops) == key(&[a, b]));
                if old
                    .is_some_and(|r| co.ships.iter().filter(|s| s.route == Some(r.id)).count() >= 3)
                    || old.is_none() && co.routes.len() >= 50
                {
                    continue;
                }
                let missing = self
                    .nations_for(kind, &[a, b])
                    .into_iter()
                    .filter(|n| !co.licenses.contains(n))
                    .collect::<Vec<_>>();
                if missing.iter().any(|&n| co.friendship[n] < 30.0) {
                    continue;
                }
                let idle = co.ships.iter().any(|s| s.route.is_none() && s.kind == kind);
                if !idle && co.ships.len() >= 150 {
                    continue;
                }
                let cost = if idle { 0.0 } else { spec.price }
                    + if self.has_post(c,&[a,b]){0.0}else{self.post_open_cost(c)}
                    + missing
                        .iter()
                        .enumerate()
                        .map(|(i, &n)| self.terms(c, n, co.licenses.len() + i).0)
                        .sum::<f64>();
                let post_delta = if self.has_post(c,&[a,b]) {0.0} else {
                    let count=co.posts.len() as f64;
                    (count+1.0)*crate::posts::POST_BASE_UPKEEP*self.post_upkeep_multiplier(c).powf(count)
                        - count*self.post_base_upkeep(c) + 0.5
                };
                let license_daily=missing.iter().map(|&n|self.terms(c,n,0).1).sum::<f64>();
                let operating_reserve=current_reserve
                    + 90.0*(post_delta+license_daily+if idle {0.0}else{self.daily(c,kind)})
                    + spec.capacity as f64*50.0;
                if co.cash - cost < operating_reserve {
                    continue;
                }
                let cycle = 2.0
                    * (self.days(kind, a, b) as f64
                        + 2.0 * spec.capacity as f64 / self.handling_rate(c, &spec.mode));
                let toll = if spec.mode == "land" {
                    2.0 * self.toll(c, a, b)
                } else {
                    0.0
                };
                let estimate = [(a, b), (b, a)]
                    .iter()
                    .map(|&(a, b)| {
                        self.data
                            .goods
                            .iter()
                            .enumerate()
                            .map(|(g, good)| {
                                let stock = self.game.markets[a * self.data.goods.len() + g].stock;
                                let dest = self.game.markets[b * self.data.goods.len() + g].stock;
                                good.base
                                    * (ratio(dest)
                                        * (1.0 - self.terms(c, self.data.cities[b].nation, 0).2)
                                        - ratio(stock)
                                            * (1.0
                                                + self.terms(c, self.data.cities[a].nation, 0).2))
                                    * (spec.capacity as f64).min(stock)
                            })
                            .fold(0.0, f64::max)
                    })
                    .sum::<f64>()
                    / cycle
                    - self.daily(c, kind)
                    - toll / cycle;
                candidates.push((a, b, kind, cost, cycle, toll, missing, estimate-post_delta,post_delta,operating_reserve));
            }
        }
        candidates.sort_by(|a, b| b.7.total_cmp(&a.7));
        let mut best = None;
        for (a, b, kind, cost, cycle, toll, missing, _,post_delta,operating_reserve) in candidates.into_iter().take(4) {
            let capacity = self.spec(kind).unwrap().capacity;
            let budget = (co.cash - cost - operating_reserve).max(0.0);
            let goods = (0..self.data.goods.len()).collect::<Vec<_>>();
            let profit = [(a, b), (b, a)]
                .iter()
                .map(|&(from, to)| {
                    let (_, cost, sales) =
                        self.load_plan(c, from, to, capacity, budget, &goods, 10.0);
                    sales - cost - 2.0*capacity as f64*crate::posts::HANDLING_FEE
                })
                .sum::<f64>();
            let score = (profit - toll) / cycle
                - self.daily(c, kind)
                - missing.iter().map(|&n| self.terms(c, n, 0).1).sum::<f64>()
                - post_delta;
            if score > 2.0 && best.as_ref().is_none_or(|(_, _, _, _, v)| score > *v) {
                best = Some((a, b, kind, missing, score));
            }
        }
        if let Some((a, b, kind, missing, _)) = best {
            for nation in missing {
                if self.buy_license(c, nation).is_err() {
                    return;
                }
            }
            if !self.has_post(c,&[a,b]) && self.build_post(c,a).is_err(){return;}
            let _ = self.open(
                c,
                kind,
                vec![a, b],
                (0..self.data.goods.len()).collect(),
                10.0,
            );
        }
    }
}
