use crate::model::*;
use crate::trade::ratio;

// Same initial slope as level / (5 + level), but no finite growth ceiling.
fn development_effect(level: f64) -> f64 {
    (level / 5.0).ln_1p()
}

impl Engine {
    pub fn city_demand_multiplier(&self, city: usize) -> f64 {
        let scale = if self.data.cities[city].lon < -20.0 {
            1.0
        } else {
            0.35
        };
        1.0 + scale * 1.5 * development_effect(self.game.development[city].size)
    }

    pub fn market_flow(&self, city: usize, g: usize) -> (f64, f64, f64, f64) {
        let c = &self.data.cities[city];
        let d = &self.game.development[city];
        let apt = c.supply[g] / c.supply.iter().copied().fold(1.0, f64::max);
        let production = c.supply[g] * (1.0 + 4.0 * apt * development_effect(d.production[g]));
        let stock = self.game.markets[city * self.data.goods.len() + g].stock + production;
        let war = if self.game.events_enabled
            && self.data.goods[g].id == "weapons"
            && self
                .game
                .pairs
                .iter()
                .any(|p| p.until.is_some() && (p.a == c.nation || p.b == c.nation))
        {
            1.8
        } else {
            1.0
        };
        let requested = c.demand[g]
            * self.city_demand_multiplier(city)
            * c.modifiers[g]
            * (1.0
                + c.seasons[g] * {
                    let (_, _, ordinal, length) = self.calendar();
                    (std::f64::consts::TAU * ordinal as f64 / length as f64).cos()
                })
            * war
            * (1.0 / ratio(stock)).clamp(0.25, 3.0);
        let consumed = stock.min(requested);
        (production, requested, consumed, stock - consumed)
    }
    pub fn tick(&mut self) {
        self.tick_day();
        self.capture_accounts();
    }
    fn tick_day(&mut self) {
        if self.game.companies[0].bankrupt {
            return;
        }
        self.game.day += 1;
        self.advance_world();
        for c in 0..self.game.companies.len() {
            if self.game.companies[c].acquired || self.game.companies[c].bankrupt {
                continue;
            }
            self.advance_diplomacy(c);
            self.advance_industry(c);
            if c == 0 {
                for city in 0..self.data.cities.len() {
                    for g in 0..self.data.goods.len() {
                        self.game.markets[city * self.data.goods.len() + g].stock =
                            self.market_flow(city, g).3;
                    }
                }
            }
            let licenses = self.game.companies[c].licenses.clone();
            for n in licenses {
                let daily = self.terms(c, n, 0).1;
                self.entry(
                    c,
                    "licenseDaily",
                    -daily,
                    None,
                    self.data.nations[n].id.clone(),
                );
                if self.game.companies[c].bankrupt {
                    break;
                }
            }
            if self.game.companies[c].bankrupt {
                if c == 0 { return } else { continue }
            }
            // Charge the whole fleet before trading, preserving the cash boundary.
            for i in 0..self.game.companies[c].ships.len() {
                let s = &self.game.companies[c].ships[i];
                let daily = self.daily(c, &s.kind);
                let route = s.route;
                self.entry(c, "upkeep", -daily, route, String::new());
                if let Some(r) = self.game.companies[c]
                    .routes
                    .iter_mut()
                    .find(|r| Some(r.id) == route)
                {
                    r.transport.upkeep += daily;
                }
                if self.game.companies[c].bankrupt {
                    break;
                }
            }
            if self.game.companies[c].bankrupt {
                if c == 0 { return } else { continue }
            }
            let routes = self.game.companies[c].routes.clone();
            for r in &routes {
                if r.escorts > 0 {
                    self.entry(
                        c,
                        "escort",
                        -(r.escorts as f64) * 4.0,
                        Some(r.id),
                        String::new(),
                    );
                }
            }
            if !self.game.companies[c].bankrupt {
                self.sail(c);
                self.automate(c);
                if c > 0 && self.calendar().1 == 1 {
                    self.rival(c);
                }
            }
            if self.game.companies[c].bankrupt && c == 0 {
                return;
            }
            let assets = self.assets(c);
            let co = &mut self.game.companies[c];
            co.history.push([self.game.day as f64, co.cash, assets]);
            if co.history.len() > 365 {
                co.history.remove(0);
            }
        }
        if self.game.first_rank.is_none()
            && !self.game.companies[0].bankrupt
            && (1..self.game.companies.len())
                .filter(|&c| !self.game.companies[c].acquired)
                .all(|c| self.assets(0) > self.assets(c))
        {
            self.game.first_rank = Some(self.game.day);
            self.event("firstRank", "初めて資産総額1位になりました。".into());
        }
    }
    fn advance_world(&mut self) {
        if !self.game.events_enabled {
            return;
        }
        for i in 0..self.game.pairs.len() {
            let p = self.game.pairs[i].clone();
            if p.until.is_some_and(|d| self.game.day >= d) {
                let pair = &mut self.game.pairs[i];
                pair.until = None;
                pair.cooldown = self.game.day + 365;
                pair.relation = 60.0;
                self.event(
                    "peace",
                    format!(
                        "{} / {} 終戦",
                        self.data.nations[p.a].id, self.data.nations[p.b].id
                    ),
                );
            } else if self.calendar().1 == 1 && p.until.is_none() {
                let relation =
                    (p.relation + (p.base - p.relation) * 0.05 + (self.random() - 0.5) * 8.0)
                        .clamp(0.0, 100.0);
                self.game.pairs[i].relation = relation;
                let ca = self
                    .data
                    .cities
                    .iter()
                    .position(|c| c.id == self.data.nations[p.a].trade_port)
                    .unwrap();
                let cb = self
                    .data
                    .cities
                    .iter()
                    .position(|c| c.id == self.data.nations[p.b].trade_port)
                    .unwrap();
                let proximity =
                    (1800.0 / self.data.distances[ca][cb].unwrap_or(f64::INFINITY)).min(1.0);
                if self.game.day >= p.cooldown
                    && relation < 30.0
                    && self.random() < 0.12 * proximity
                {
                    let duration = 730 + (self.random() * 2921.0) as u32;
                    self.game.pairs[i].until = Some(self.game.day + duration);
                    self.event(
                        "war",
                        format!(
                            "{} / {} 開戦",
                            self.data.nations[p.a].id, self.data.nations[p.b].id
                        ),
                    );
                }
            }
        }
    }
    fn advance_diplomacy(&mut self, c: usize) {
        let day = self.game.day;
        self.game.companies[c]
            .friendship_history
            .retain(|h| day.saturating_sub(h.day) < 30);
        if !self.game.events_enabled {
            return;
        }
        let trade = self.game.companies[c].trade.clone();
        for n in 0..self.data.nations.len() {
            let before = self.game.companies[c].friendship[n];
            let budget = self.game.companies[c].diplomacy_budget[n];
            let mut gain = 0.0;
            let mut spent = 0.0;
            if budget > 0.0 && self.game.companies[c].cash >= budget {
                self.entry(
                    c,
                    "diplomacyInvestment",
                    -budget,
                    None,
                    self.data.nations[n].id.clone(),
                );
                gain = budget.sqrt() / 50.0;
                spent = budget;
            }
            let enemy = self
                .game
                .pairs
                .iter()
                .filter(|p| p.until.is_some())
                .map(|p| {
                    if p.a == n {
                        trade[p.b]
                    } else if p.b == n {
                        trade[p.a]
                    } else {
                        0.0
                    }
                })
                .sum::<f64>();
            let f =
                (before + trade[n] / 100000.0 - enemy / 100000.0 * 1.5 + gain).clamp(0.0, 100.0);
            self.game.companies[c].friendship[n] = f;
            if c == 0 {
                let trade_gain = trade[n] / 100000.0;
                let enemy_loss = if enemy > 0.0 {
                    -enemy / 100000.0 * 1.5
                } else {
                    0.0
                };
                self.game.companies[c]
                    .friendship_history
                    .push(FriendshipChange {
                        day,
                        nation: n,
                        before,
                        after: f,
                        delta: f - before,
                        trade: trade_gain,
                        enemy_trade: enemy_loss,
                        investment: gain,
                        initial: 0.0,
                        limit: f - before - trade_gain - enemy_loss - gain,
                        spent,
                        unfunded: budget > 0.0 && spent == 0.0,
                    });
            }
            if self.game.companies[c].licenses.contains(&n) {
                if before > 35.0 && f <= 35.0 {
                    self.event(
                        "warning",
                        format!(
                            "{}: {}の友好度が低下しています",
                            self.game.companies[c].name, self.data.nations[n].id
                        ),
                    );
                }
                if f <= 20.0 {
                    self.revoke(c, n);
                }
            }
        }
        self.game.companies[c].trade.fill(0.0);
    }
    fn advance_industry(&mut self, c: usize) {
        let owner = self.game.companies[c].id.clone();
        if c > 0 {
            self.guard_rival_budget(c);
        }
        for t in 0..3 {
            let budget = self.game.companies[c].tech_budget[t];
            if budget > 0.0 && self.game.companies[c].cash >= budget {
                self.entry(c, "technologyInvestment", -budget, None, t.to_string());
                let level = &mut self.game.companies[c].technology[t];
                *level += budget.sqrt() / 100.0 / (1.0 + *level / 50.0);
            }
        }
        for city in 0..self.game.development.len() {
            if self.game.development[city].owner != owner {
                continue;
            }
            let d = &self.game.development[city];
            let income = 0.15 + 0.35 * d.size / (5.0 + d.size) + d.pool;
            self.game.development[city].pool = 0.0;
            self.entry(
                c,
                "developmentIncome",
                income,
                None,
                self.data.cities[city].id.clone(),
            );
            let size = self.game.development[city].size_budget;
            if size > 0.0 && self.game.companies[c].cash >= size {
                self.entry(
                    c,
                    "cityInvestment",
                    -size,
                    None,
                    self.data.cities[city].id.clone(),
                );
                let d = &mut self.game.development[city];
                d.size += size.sqrt() / 200.0 / (1.0 + d.size / 5.0);
            }
            for g in 0..self.data.goods.len() {
                let value = self.game.development[city].production_budget[g];
                if value > 0.0 && self.game.companies[c].cash >= value {
                    let apt = self.data.cities[city].supply[g]
                        / self.data.cities[city]
                            .supply
                            .iter()
                            .copied()
                            .fold(1.0, f64::max);
                    self.entry(
                        c,
                        "cityInvestment",
                        -value,
                        None,
                        format!("{} {}", self.data.cities[city].id, self.data.goods[g].id),
                    );
                    let level = &mut self.game.development[city].production[g];
                    *level += value.sqrt() * apt / 200.0 / (1.0 + *level / 5.0);
                }
            }
        }
        for i in 0..self.game.roads.len() {
            if self.game.roads[i].owner != owner {
                continue;
            }
            let income = self.game.roads[i].pool;
            self.game.roads[i].pool = 0.0;
            if income > 0.0 {
                self.entry(c, "roadIncome", income, None, self.data.roads[i].id.clone());
            }
            for security in [false, true] {
                let budget = if security {
                    self.game.roads[i].security_budget
                } else {
                    self.game.roads[i].road_budget
                };
                if budget > 0.0 && self.game.companies[c].cash >= budget {
                    self.entry(
                        c,
                        "roadInvestment",
                        -budget,
                        None,
                        self.data.roads[i].id.clone(),
                    );
                    let d = &mut self.game.roads[i];
                    let level = if security {
                        &mut d.security
                    } else {
                        &mut d.quality
                    };
                    *level += budget.sqrt() / 150.0 / (1.0 + *level / 5.0);
                }
            }
        }
    }
    pub fn risk(&self, c: usize, r: &Route, kind: &str, a: usize, b: usize) -> (f64, f64, f64) {
        if !self.game.events_enabled || self.game.day <= 60 {
            return (0.0, 0.0, 0.0);
        }
        let s = self.spec(kind).unwrap();
        let escort = 1.0 + r.escorts as f64 * 0.8;
        if s.mode == "land" {
            let i = self.road(a, b).unwrap();
            let road = &self.data.roads[i];
            let level = self.game.roads[i].security;
            let safety = road.safety + (1.0 - road.safety) * 0.9 * level / (5.0 + level);
            return ((1.0 - safety) * 0.015 / escort, 0.6 / escort, 0.02 / escort);
        }
        let hostile = self.data.cities.iter().enumerate().any(|(i, city)| {
            !city.inland
                && self.game.companies[c].friendship[city.nation] <= 10.0
                && [a, b]
                    .iter()
                    .any(|&p| i == p || self.data.distances[i][p].unwrap_or(f64::INFINITY) <= 400.0)
        });
        let caribbean = [a, b].iter().any(|&i| {
            let p = &self.data.cities[i];
            p.lon > -90.0 && p.lon < -55.0 && p.lat > 5.0 && p.lat < 25.0
        });
        let defense =
            1.0 + s.guns / 10.0 + (s.speed - 90.0).max(0.0) / 100.0 + r.escorts as f64 * 0.8;
        (
            (if caribbean { 0.002 } else { 0.0008 } + if hostile { 0.004 } else { 0.0 }) / escort,
            0.6 / defense,
            0.025 / defense,
        )
    }
    fn automate(&mut self, c: usize) {
        let month = self.calendar().0;
        if self.game.companies[c].automation.month != month {
            self.game.companies[c].automation.month = month;
            self.game.companies[c].automation.spent = 0.0;
        }
        if !self.game.companies[c].automation.enabled {
            return;
        }
        let ids: Vec<_> = self.game.companies[c].routes.iter().map(|r| r.id).collect();
        for id in ids {
            let ri = self.game.companies[c]
                .routes
                .iter()
                .position(|r| r.id == id)
                .unwrap();
            let r = self.game.companies[c].routes[ri].clone();
            if !r.active || !r.auto_manage {
                continue;
            }
            let a = self.game.companies[c].automation.clone();
            let replacement = if a.replace_lost {
                r.replacements.first().cloned()
            } else {
                None
            };
            let (cycle, _, fleet) = self.schedule(c, &r);
            let idle = r.activity.idle_ratio();
            let expand = replacement.is_some()
                || (self.game.day >= r.cooldown
                    && (self.game.day - r.activity.since) as f64 >= cycle
                    && r.activity.total() >= cycle
                    && idle.is_some_and(|p| p < a.expand));
            if expand {
                let kind = replacement.clone().unwrap_or(r.auto_type.clone());
                let idle = self.game.companies[c]
                    .ships
                    .iter()
                    .find(|s| {
                        s.route.is_none()
                            && s.voyage.is_none()
                            && s.handling.is_none()
                            && s.cargo.is_empty()
                            && s.kind == kind
                    })
                    .map(|s| s.id);
                let cost = if idle.is_some() {
                    0.0
                } else {
                    self.spec(&kind).unwrap().price
                };
                if a.spent + cost <= a.budget
                    && self.game.companies[c].cash - cost >= a.reserve
                    && self.producible(c, &kind)
                {
                    if let Ok(ship) = idle
                        .ok_or(String::new())
                        .or_else(|_| self.buy_ship(c, &kind))
                    {
                        if self.assign(c, id, ship).is_ok() {
                            self.game.companies[c].automation.spent += cost;
                            if replacement.is_some() {
                                self.game.companies[c].routes[ri].replacements.remove(0);
                            }
                            self.reset_observation(c, ri, cycle);
                        }
                    }
                }
            } else if self.game.day >= r.cooldown
                && (self.game.day - r.activity.since) as f64 >= cycle
                && fleet.len() > 1
                && idle.is_some_and(|p| p > a.shrink)
            {
                let mut candidates = fleet
                    .iter()
                    .map(|&i| &self.game.companies[c].ships[i])
                    .collect::<Vec<_>>();
                candidates.sort_by(|a, b| {
                    let ak = (a.kind != r.auto_type, self.spec(&a.kind).unwrap().capacity);
                    let bk = (b.kind != r.auto_type, self.spec(&b.kind).unwrap().capacity);
                    ak.cmp(&bk)
                });
                if let Some(s) = candidates.first() {
                    if s.voyage.is_none() && s.handling.is_none() && s.cargo.is_empty() {
                        let ship = s.id;
                        let _ = self.release(c, ship);
                        self.reset_observation(c, ri, cycle);
                    }
                }
            }
        }
    }
    fn reset_observation(&mut self, c: usize, r: usize, cycle: f64) {
        self.game.companies[c].routes[r].cooldown = self.game.day + cycle.ceil() as u32;
        self.game.companies[c].routes[r].activity = Activity {
            since: self.game.day,
            ..Default::default()
        };
        self.game.companies[c].routes[r].transport = Transport {
            since: self.game.day,
            ..Default::default()
        };
    }
}
