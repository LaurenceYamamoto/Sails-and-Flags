use crate::model::*;
use serde_json::{Value, json};

pub fn ratio(stock: f64) -> f64 {
    0.35 + 180.0 / (stock + 60.0)
}
pub fn integrated(base: f64, low: f64, high: f64) -> f64 {
    base * (0.35 * (high - low) + 180.0 * ((high + 60.0) / (low + 60.0)).ln())
}
pub fn normalize(mut stops: Vec<usize>) -> Vec<usize> {
    if stops.len() > 1 && stops.first() == stops.last() {
        stops.pop();
    }
    stops
}
pub fn key(stops: &[usize]) -> Vec<usize> {
    if stops.len() == 2 {
        let mut v = stops.to_vec();
        v.sort();
        return v;
    }
    (0..stops.len())
        .map(|i| {
            stops[i..]
                .iter()
                .chain(stops[..i].iter())
                .copied()
                .collect::<Vec<_>>()
        })
        .min()
        .unwrap_or_default()
}
impl Engine {
    pub fn initialize(&mut self, seed: u32, events: bool) {
        self.game = Game::new(&self.data, seed, events);
        for (i, start) in self.data.starts.clone().iter().enumerate() {
            for route in &start.routes {
                for _ in 0..route.fleet {
                    self.open(
                        i + 1,
                        &route.kind,
                        route.stops.clone(),
                        (0..self.data.goods.len()).collect(),
                        10.0,
                    )
                    .expect("validated starting route must be affordable and serviceable");
                }
            }
        }
        self.capture_accounts();
    }
    pub fn buy_license(&mut self, c: usize, n: usize) -> Result<()> {
        self.playable(c)?;
        ensure(
            n < self.data.nations.len() && !self.game.companies[c].licenses.contains(&n),
            "免許が不正または取得済みです。",
        )?;
        ensure(
            self.game.companies[c].friendship[n] >= 30.0,
            "友好度30以上が必要です。",
        )?;
        let fee = self.terms(c, n, self.game.companies[c].licenses.len()).0;
        self.affordable(c, fee)?;
        self.entry(
            c,
            "licensePurchase",
            -fee,
            None,
            self.data.nations[n].id.clone(),
        );
        let co = &mut self.game.companies[c];
        co.licenses.push(n);
        if co.first_license {
            if c == 0 {
                co.friendship_history.push(FriendshipChange {
                    day: self.game.day,
                    nation: n,
                    before: co.friendship[n],
                    after: 100.0,
                    delta: 100.0 - co.friendship[n],
                    initial: 100.0 - co.friendship[n],
                    trade: 0.0,
                    enemy_trade: 0.0,
                    investment: 0.0,
                    limit: 0.0,
                    spent: 0.0,
                    unfunded: false,
                });
            }
            co.friendship[n] = 100.0;
            co.first_license = false;
        }
        Ok(())
    }
    pub fn producible(&self, c: usize, kind: &str) -> bool {
        self.spec(kind).is_ok()
            && (self
                .data
                .specs
                .iter()
                .any(|s| s.id == kind && kind != "corvette")
                || (kind == "corvette"
                    && self.game.companies[c].technology[0] >= self.spec(kind).unwrap().level)
                || self.game.companies[c].designs.iter().any(|s| s == kind))
    }
    pub fn buy_ship(&mut self, c: usize, kind: &str) -> Result<u32> {
        self.playable(c)?;
        ensure(self.producible(c, kind), "購入可能な船種ではありません。")?;
        let cost = self.spec(kind)?.price;
        self.affordable(c, cost)?;
        let id = self.next_id();
        let name = self.data.ship_names
            [((self.game.seed as u64 + id as u64) % self.data.ship_names.len() as u64) as usize]
            .clone();
        self.game.companies[c].ships.push(Ship {
            id,
            name,
            kind: kind.into(),
            route: None,
            next: 0,
            ready: self.game.day,
            voyage: None,
            handling: None,
            cargo: vec![],
            voyages: 0,
        });
        self.entry(c, "shipPurchase", -cost, None, kind.into());
        Ok(id)
    }
    pub fn check_stops(&self, kind: &str, stops: &[usize]) -> Result<()> {
        ensure(
            (2..=12).contains(&stops.len()) && stops.iter().all(|&a| a < self.data.cities.len()),
            "寄港地は2～12か所で指定してください。",
        )?;
        ensure(
            stops
                .iter()
                .enumerate()
                .all(|(i, &a)| a != stops[(i + 1) % stops.len()]),
            "同じ都市を連続して指定できません。",
        )?;
        ensure(
            self.can_serve(kind, stops),
            "海陸の経路または航続距離を確認してください。",
        )
    }
    pub fn opening(&self, c: usize, kind: &str, stops: &[usize]) -> Result<Value> {
        self.check_stops(kind, stops)?;
        ensure(self.producible(c, kind), "購入可能な船種ではありません。")?;
        let missing: Vec<_> = self
            .nations_for(kind, stops)
            .into_iter()
            .filter(|n| !self.game.companies[c].licenses.contains(n))
            .collect();
        let idle = self.game.companies[c].ships.iter().find(|s| {
            s.route.is_none()
                && s.voyage.is_none()
                && s.handling.is_none()
                && s.cargo.is_empty()
                && s.kind == kind
        });
        let cost = if idle.is_some() {
            0.0
        } else {
            self.spec(kind)?.price
        };
        Ok(
            json!({"travelDays":stops.iter().enumerate().map(|(i,&a)|self.days(kind,a,stops[(i+1)%stops.len()])).collect::<Vec<_>>(),"daily":self.daily(c,kind),"handlingRate":self.handling_rate(c,&self.spec(kind)?.mode),"disasterRates":stops.iter().enumerate().map(|(i,&a)|self.disaster_chance(c,kind,a,stops[(i+1)%stops.len()])*100.0).collect::<Vec<_>>(),"cost":cost,"reuse":idle.map(|s|s.id),"missing":missing,"affordable":self.game.companies[c].cash>=cost,"remaining":self.game.companies[c].cash-cost,"range":self.spec(kind)?.range,"longest":stops.iter().enumerate().map(|(i,&a)|self.distance(kind,a,stops[(i+1)%stops.len()])).fold(0.0,f64::max)}),
        )
    }
    pub fn open(
        &mut self,
        c: usize,
        kind: &str,
        stops: Vec<usize>,
        allowed: Vec<usize>,
        margin: f64,
    ) -> Result<u32> {
        self.playable(c)?;
        let stops = normalize(stops);
        let q = self.opening(c, kind, &stops)?;
        ensure(
            q["missing"].as_array().unwrap().is_empty(),
            "全寄港地・通過国の免許が必要です。",
        )?;
        ensure(
            !allowed.is_empty()
                && allowed.iter().all(|&g| g < self.data.goods.len())
                && margin.is_finite()
                && (-100.0..=10000.0).contains(&margin),
            "積載条件が不正です。",
        )?;
        self.affordable(c, q["cost"].as_f64().unwrap())?;
        let mode = self.spec(kind)?.mode.clone();
        let old = self.game.companies[c]
            .routes
            .iter()
            .find(|r| r.mode == mode && key(&r.stops) == key(&stops))
            .map(|r| r.id);
        ensure(
            c == 0 || old.is_some() || self.game.companies[c].routes.len() < 50,
            "競合の航路上限は50です。",
        )?;
        let handling_rate = self.handling_rate(c, &mode);
        let id = if let Some(id) = old {
            id
        } else {
            let id = self.next_id();
            self.game.companies[c].routes.push(Route {
                id,
                stops,
                mode,
                allowed,
                min_margin: margin,
                active: true,
                epoch: self.game.day as f64,
                handling_rate,
                auto_manage: true,
                auto_type: kind.into(),
                cooldown: self.game.day,
                escorts: 0,
                profit: 0.0,
                revenue: 0.0,
                expenses: 0.0,
                started: self.game.day,
                deliveries: 0,
                transport: Transport {
                    since: self.game.day,
                    ..Default::default()
                },
                activity: Activity {
                    since: self.game.day,
                    ..Default::default()
                },
                forecast: 0.0,
                actual: None,
                replacements: vec![],
                cargo_loss: 0.0,
                ship_loss: 0.0,
            });
            id
        };
        let ship = if let Some(id) = q["reuse"].as_u64() {
            id as u32
        } else {
            self.buy_ship(c, kind)?
        };
        self.assign(c, id, ship)?;
        Ok(id)
    }
    pub fn schedule(&self, c: usize, r: &Route) -> (f64, Vec<f64>, Vec<usize>) {
        let fleet: Vec<usize> = self.game.companies[c]
            .ships
            .iter()
            .enumerate()
            .filter(|(_, s)| s.route == Some(r.id))
            .map(|(i, _)| i)
            .collect();
        let mut cycle = 0.0;
        let mut offsets = vec![];
        for (i, &a) in r.stops.iter().enumerate() {
            offsets.push(cycle);
            let b = r.stops[(i + 1) % r.stops.len()];
            let leg = |kind: &str| {
                self.days(kind, a, b) as f64
                    + 2.0 * self.spec(kind).unwrap().capacity as f64 / r.handling_rate
            };
            let days = fleet
                .iter()
                .map(|&j| leg(&self.game.companies[c].ships[j].kind))
                .reduce(f64::max)
                .unwrap_or_else(|| leg(&r.auto_type));
            cycle += days;
        }
        (cycle.max(1.0), offsets, fleet)
    }
    pub fn reschedule(&mut self, c: usize, id: u32) {
        let Some(i) = self.game.companies[c]
            .routes
            .iter()
            .position(|r| r.id == id)
        else {
            return;
        };
        let rate = self.handling_rate(c, &self.game.companies[c].routes[i].mode);
        self.game.companies[c].routes[i].handling_rate = rate;
        let (cycle, offsets, fleet) = self.schedule(c, &self.game.companies[c].routes[i]);
        let offset = fleet
            .first()
            .map(|&j| offsets[self.game.companies[c].ships[j].next])
            .unwrap_or(0.0);
        let r = &mut self.game.companies[c].routes[i];
        r.epoch = self.game.day as f64 - offset;
        r.activity = Activity {
            since: self.game.day,
            ..Default::default()
        };
        r.cooldown = self.game.day + cycle.ceil() as u32;
    }
    pub fn assign(&mut self, c: usize, id: u32, ship: u32) -> Result<()> {
        self.playable(c)?;
        let r = self.game.companies[c]
            .routes
            .iter()
            .find(|r| r.id == id)
            .ok_or("ルートがありません。")?;
        let i = self.game.companies[c]
            .ships
            .iter()
            .position(|s| s.id == ship)
            .ok_or("船がありません。")?;
        let s = &self.game.companies[c].ships[i];
        ensure(
            s.route.is_none()
                && s.voyage.is_none()
                && s.handling.is_none()
                && s.cargo.is_empty()
                && self.spec(&s.kind)?.mode == r.mode
                && self.can_serve(&s.kind, &r.stops),
            "対応する未使用船を選択してください。",
        )?;
        let s = &mut self.game.companies[c].ships[i];
        s.route = Some(id);
        s.next = 0;
        s.ready = self.game.day;
        self.reschedule(c, id);
        Ok(())
    }
    pub fn release(&mut self, c: usize, ship: u32) -> Result<()> {
        let i = self.game.companies[c]
            .ships
            .iter()
            .position(|s| s.id == ship)
            .ok_or("船がありません。")?;
        let s = &mut self.game.companies[c].ships[i];
        ensure(
            s.voyage.is_none() && s.handling.is_none() && s.cargo.is_empty(),
            "移動・荷役中の船は解除できません。",
        )?;
        let old = s.route;
        s.route = None;
        s.cargo.clear();
        if let Some(id) = old {
            self.reschedule(c, id);
        }
        Ok(())
    }
    pub fn remove_route(&mut self, c: usize, id: u32, force: bool) -> Result<()> {
        ensure(
            self.game.companies[c].routes.iter().any(|r| r.id == id),
            "ルートがありません。",
        )?;
        ensure(
            force
                || self.game.companies[c]
                    .ships
                    .iter()
                    .filter(|s| s.route == Some(id))
                    .all(|s| s.voyage.is_none() && s.handling.is_none() && s.cargo.is_empty()),
            "移動・荷役中の船があります。",
        )?;
        for s in &mut self.game.companies[c].ships {
            if s.route == Some(id) {
                s.route = None;
                s.voyage = None;
                s.handling = None;
                s.cargo.clear();
            }
        }
        self.game.companies[c].routes.retain(|r| r.id != id);
        Ok(())
    }
    pub fn toll(&self, c: usize, a: usize, b: usize) -> f64 {
        let Some(i) = self.road(a, b) else { return 0.0 };
        if self.game.roads[i].owner == self.game.companies[c].id {
            return 0.0;
        }
        let r = &self.data.roads[i];
        r.km * 0.02
            * r.nations
                .iter()
                .map(|&n| 1.0 + (60.0 - self.game.companies[c].friendship[n]) / 100.0)
                .sum::<f64>()
            / r.nations.len() as f64
    }
    pub fn trade(
        &mut self,
        c: usize,
        city: usize,
        g: usize,
        q: usize,
        buy: bool,
        route: Option<u32>,
    ) -> (usize, f64) {
        let ix = city * self.data.goods.len() + g;
        let stock = self.game.markets[ix].stock;
        let nation = self.data.cities[city].nation;
        let tax = self
            .terms(c, nation, self.game.companies[c].licenses.len())
            .2;
        let base = self.data.goods[g].base;
        let mut qty = if buy {
            q.min(stock.floor() as usize)
        } else {
            q
        };
        let value = |n: usize| {
            if buy {
                integrated(base, stock - n as f64, stock)
            } else {
                integrated(base, stock, stock + n as f64)
            }
        };
        if buy {
            let mut low = 0;
            let mut high = qty;
            while low < high {
                let mid = (low + high).div_ceil(2);
                if value(mid) * (1.0 + tax) <= self.game.companies[c].cash {
                    low = mid
                } else {
                    high = mid - 1
                }
            }
            qty = low;
        }
        let gross = value(qty);
        let fee = gross * tax;
        self.game.markets[ix].stock = stock + if buy { -(qty as f64) } else { qty as f64 };
        let detail = format!(
            "{} · {} · {}",
            self.data.cities[city].id, self.data.goods[g].id, qty
        );
        if qty > 0 {
            self.entry(
                c,
                if buy { "purchase" } else { "sale" },
                if buy { -gross } else { gross },
                route,
                detail.clone(),
            );
            self.entry(c, "tax", -fee, route, detail);
            self.game.companies[c].trade[nation] =
                (self.game.companies[c].trade[nation] + gross).min(5000.0);
            if !["state", "private"].contains(&self.game.development[city].owner.as_str()) {
                self.game.development[city].pool += fee * 0.15;
            }
        }
        (qty, if buy { gross + fee } else { gross - fee })
    }
    // Concave marginal loading: O(capacity * goods), bounded by vessel capacity.
    // All decisions and numerical arrays stay in native Wasm memory.
    pub fn revoke(&mut self, c: usize, n: usize) {
        let ids: Vec<u32> = self.game.companies[c]
            .routes
            .iter()
            .filter(|r| self.nations_for(&r.auto_type, &r.stops).contains(&n))
            .map(|r| r.id)
            .collect();
        for id in ids {
            let _ = self.remove_route(c, id, true);
        }
        let owner = self.game.companies[c].id.clone();
        for (i, d) in self.game.development.iter_mut().enumerate() {
            if d.owner == owner && self.data.cities[i].nation == n {
                d.owner = "state".into();
                d.basis = 0.0;
                d.size_budget = 0.0;
                d.size = 0.0;
                d.production.fill(0.0);
                d.production_budget.fill(0.0);
                d.pool = 0.0;
            }
        }
        for (i, d) in self.game.roads.iter_mut().enumerate() {
            if d.owner == owner && self.data.roads[i].nations.contains(&n) {
                d.owner = "state".into();
                d.basis = 0.0;
                d.road_budget = 0.0;
                d.quality = 0.0;
                d.security = 0.0;
                d.security_budget = 0.0;
                d.pool = 0.0;
            }
        }
        self.game.companies[c].licenses.retain(|&x| x != n);
        self.event(
            "revoked",
            format!(
                "{}: {}の交易免許が取り消されました",
                self.game.companies[c].name, self.data.nations[n].id
            ),
        );
    }
}
