use crate::model::*;
use crate::trade::{key, normalize};
use serde_json::{Value, json};
pub fn string<'a>(v: &'a Value, k: &str) -> Result<&'a str> {
    v[k].as_str().ok_or(format!("{}を指定してください。", k))
}
pub fn number(v: &Value, k: &str) -> Result<f64> {
    let n = v[k].as_f64().ok_or(format!("{}を指定してください。", k))?;
    ensure(amount(n), "金額が不正です。")?;
    Ok(n)
}
pub fn identifier(v: &Value, k: &str) -> Result<u32> {
    u32::try_from(v[k].as_u64().ok_or("識別子が不正です。")?)
        .map_err(|_| "識別子が不正です。".into())
}
pub fn index(v: &Value, k: &str, max: usize) -> Result<usize> {
    let n = v[k].as_u64().ok_or("対象が不正です。")? as usize;
    ensure(n < max, "対象が不正です。")?;
    Ok(n)
}
pub fn list(v: &Value, k: &str, max: usize) -> Result<Vec<usize>> {
    v[k].as_array()
        .ok_or("一覧が不正です。")?
        .iter()
        .map(|x| {
            let n = x.as_u64().ok_or("一覧が不正です。")? as usize;
            ensure(n < max, "一覧が不正です。")?;
            Ok(n)
        })
        .collect()
}
pub fn name(value: &str) -> Result<String> {
    let s = value.trim();
    ensure(
        !s.is_empty() && s.chars().count() <= 80 && !s.chars().any(char::is_control),
        "名前は1～80文字で入力してください。",
    )?;
    Ok(s.into())
}
impl Engine {
    pub fn design_quote(&self, c: usize, kind: &str, budgets: &[f64]) -> Result<(Spec, f64)> {
        let base = self
            .data
            .specs
            .iter()
            .find(|s| s.id == kind && s.mode == "sea")
            .ok_or("船型が不正です。")?;
        ensure(
            budgets.len() == 5 && budgets.iter().all(|&x| amount(x)),
            "設計予算が不正です。",
        )?;
        let level = self.game.companies[c].technology[0];
        let eff = 0.5 + level / (level + 50.0);
        let p = budgets
            .iter()
            .map(|x| x / (base.price + x))
            .collect::<Vec<_>>();
        let mut s = base.clone();
        s.capacity = (base.capacity as f64 * (1.0 + 0.9 * eff * p[0])
            / (1.0 + 0.6 * p[1] + 0.45 * p[2])
            + 1e-9)
            .floor()
            .max(1.0) as usize;
        s.speed = base.speed * (1.0 + 0.5 * eff * p[1]) / (1.0 + 0.4 * p[0] + 0.2 * p[2]);
        s.range = base.range * (1.0 + 1.2 * eff * p[3]);
        s.guns = base.guns + 30.0 * eff * p[2];
        let m = 0.35 * eff / 1.5 * p[4];
        let a = s.capacity as f64 / base.capacity as f64;
        let v = (s.speed / base.speed).powi(2);
        let r = s.range / base.range;
        let g = (s.guns + 10.0) / (base.guns + 10.0);
        s.price =
            (base.price * (0.45 * a + 0.25 * v + 0.15 * r + 0.15 * g) * (1.0 + 0.25 * m)).ceil();
        s.daily = base.daily * (0.45 * a + 0.25 * v + 0.1 * r + 0.2 * g) * (1.0 - m);
        Ok((s, (base.price * 0.25).ceil() + budgets.iter().sum::<f64>()))
    }
    pub fn development_cost(&self, city: usize) -> f64 {
        let d = &self.game.development[city];
        let level = d.production.iter().sum::<f64>() / d.production.len() as f64;
        ((if self.data.cities[city].lon < -20.0 {
            2000.0
        } else {
            6000.0
        }) * (1.0 + 0.15 * (d.size + level))
            * if d.owner == "state" { 1.0 } else { 1.5 })
        .ceil()
    }
    pub fn buy_development(&mut self, c: usize, city: usize) -> Result<()> {
        let n = self.data.cities[city].nation;
        let owner = self.game.development[city].owner.clone();
        ensure(
            self.game.companies[c].licenses.contains(&n) && owner != self.game.companies[c].id,
            "免許と未取得の都市権利が必要です。",
        )?;
        let cost = self.development_cost(city);
        self.affordable(c, cost)?;
        self.entry(
            c,
            "developmentPurchase",
            -cost,
            None,
            self.data.cities[city].id.clone(),
        );
        if let Some(seller) = self.game.companies.iter().position(|co| co.id == owner) {
            self.entry(
                seller,
                "developmentSale",
                cost,
                None,
                self.data.cities[city].id.clone(),
            );
        }
        let d = &mut self.game.development[city];
        d.owner = self.game.companies[c].id.clone();
        d.basis = cost;
        d.size_budget = 0.0;
        d.production_budget.fill(0.0);
        Ok(())
    }
    pub fn road_cost(&self, i: usize) -> f64 {
        let d = &self.game.roads[i];
        ((500.0 + self.data.roads[i].km * 2.0)
            * (1.0 + d.quality * 0.1)
            * if d.owner == "state" { 1.0 } else { 1.5 })
        .ceil()
    }
    pub fn buy_road(&mut self, c: usize, i: usize) -> Result<()> {
        let d = &self.game.roads[i];
        ensure(
            d.owner != self.game.companies[c].id
                && self.data.roads[i]
                    .nations
                    .iter()
                    .all(|n| self.game.companies[c].licenses.contains(n)),
            "全通過国の免許と未取得の道路権が必要です。",
        )?;
        let owner = d.owner.clone();
        let pool = d.pool;
        let cost = self.road_cost(i);
        self.affordable(c, cost)?;
        self.entry(
            c,
            "roadPurchase",
            -cost,
            None,
            self.data.roads[i].id.clone(),
        );
        if let Some(seller) = self.game.companies.iter().position(|co| co.id == owner) {
            self.entry(
                seller,
                "roadSale",
                cost + pool,
                None,
                self.data.roads[i].id.clone(),
            );
        }
        let d = &mut self.game.roads[i];
        d.owner = self.game.companies[c].id.clone();
        d.basis = cost;
        d.road_budget = 0.0;
        d.security_budget = 0.0;
        d.pool = 0.0;
        Ok(())
    }
    pub fn acquisition(&self, c: usize) -> Result<Value> {
        ensure(
            c > 0 && c < self.game.companies.len() && !self.game.companies[c].acquired,
            "買収対象がありません。",
        )?;
        let target = &self.game.companies[c];
        let player = &self.game.companies[0];
        let missing: Vec<_> = target
            .licenses
            .iter()
            .copied()
            .filter(|n| !player.licenses.contains(n))
            .collect();
        let fee = missing
            .iter()
            .enumerate()
            .map(|(i, &n)| self.terms(0, n, player.licenses.len() + i).0)
            .sum::<f64>();
        let price = (self.assets(c).max(0.0) * 1.15).ceil();
        let required = price + fee + (-target.cash).max(0.0);
        Ok(
            json!({"price":price,"licenseCost":fee,"required":required,"cash":target.cash,"missing":missing,"eligible":missing.iter().all(|&n|player.friendship[n]>=30.0),"affordable":player.cash>=required}),
        )
    }
    pub fn acquire(&mut self, c: usize) -> Result<()> {
        let q = self.acquisition(c)?;
        ensure(
            q["eligible"] == true,
            "買収に必要な免許の友好度が不足しています。",
        )?;
        self.affordable(0, q["required"].as_f64().unwrap())?;
        for n in list(&q, "missing", self.data.nations.len())? {
            self.buy_license(0, n)?;
        }
        self.entry(
            0,
            "acquisition",
            -q["price"].as_f64().unwrap(),
            None,
            self.game.companies[c].name.clone(),
        );
        let mut target = self.game.companies[c].clone();
        self.entry(0, "acquiredCash", target.cash, None, target.name.clone());
        for r in &target.routes {
            let existing = self.game.companies[0]
                .routes
                .iter()
                .find(|x| x.mode == r.mode && key(&x.stops) == key(&r.stops))
                .map(|x| (x.id, x.stops.clone()));
            if let Some((id, stops)) = existing {
                let offset = (0..stops.len())
                    .find(|&offset| {
                        r.stops
                            .iter()
                            .enumerate()
                            .all(|(i, &city)| stops[(i + offset) % stops.len()] == city)
                    })
                    .unwrap_or(0);
                for ship in &mut target.ships {
                    if ship.route == Some(r.id) {
                        ship.route = Some(id);
                        ship.next = (ship.next + offset) % stops.len();
                    }
                }
                let merged = self.game.companies[0]
                    .routes
                    .iter_mut()
                    .find(|x| x.id == id)
                    .unwrap();
                merged.replacements.extend(r.replacements.clone());
            } else {
                self.game.companies[0].routes.push(r.clone());
            }
        }
        self.game.companies[0].ships.extend(target.ships);
        for d in &mut self.game.development {
            if d.owner == target.id {
                d.owner = "player".into();
                d.size_budget = 0.0;
                d.production_budget.fill(0.0);
            }
        }
        for d in &mut self.game.roads {
            if d.owner == target.id {
                d.owner = "player".into();
                d.road_budget = 0.0;
                d.security_budget = 0.0;
            }
        }
        self.game.companies[0].designs.extend(target.designs);
        self.game.companies[0].shipyard |= target.shipyard;
        self.game.companies[0].yard_value += target.yard_value;
        self.game.companies[c].acquired = true;
        self.game.companies[c].ships.clear();
        self.game.companies[c].routes.clear();
        let ids = self.game.companies[0]
            .routes
            .iter()
            .map(|r| r.id)
            .collect::<Vec<_>>();
        for id in ids {
            self.reschedule(0, id);
        }
        Ok(())
    }
    pub fn replacement_quote(&self, v: &Value) -> Result<Value> {
        let target = string(v, "target")?;
        ensure(
            self.producible(0, target),
            "購入可能な置換先を指定してください。",
        )?;
        let mode = string(v, "mode")?;
        ensure(
            ["type", "route", "automation"].contains(&mode),
            "置換方法が不正です。",
        )?;
        let source = v["source"].as_str().unwrap_or("");
        let id = if mode == "route" {
            identifier(v, "route")?
        } else {
            0
        };
        let co = &self.game.companies[0];
        if mode == "automation" {
            let routes = co
                .routes
                .iter()
                .filter(|r| r.auto_type == source)
                .collect::<Vec<_>>();
            ensure(
                !routes.is_empty()
                    && routes.iter().all(|r| {
                        self.spec(target).unwrap().mode == r.mode
                            && self.can_serve(target, &r.stops)
                    }),
                "置換対象または航続距離を確認してください。",
            )?;
            return Ok(
                json!({"cost":0,"sale":0,"purchase":0,"count":routes.len(),"ships":[],"affordable":true}),
            );
        }
        let ships = co
            .ships
            .iter()
            .filter(|s| {
                if mode == "route" {
                    s.route == Some(id)
                } else {
                    s.kind == source
                }
            })
            .collect::<Vec<_>>();
        ensure(!ships.is_empty(), "置換する船がありません。")?;
        ensure(
            ships.iter().all(|s| {
                self.spec(&s.kind).unwrap().mode == self.spec(target).unwrap().mode
                    && s.route.is_none_or(|id| {
                        self.can_serve(
                            target,
                            &co.routes.iter().find(|r| r.id == id).unwrap().stops,
                        )
                    })
            }),
            "置換先の輸送方法・航続距離を確認してください。",
        )?;
        let sale = ships
            .iter()
            .map(|s| self.spec(&s.kind).unwrap().price)
            .sum::<f64>();
        let purchase = ships.len() as f64 * self.spec(target)?.price;
        Ok(
            json!({"cost":purchase-sale,"sale":sale,"purchase":purchase,"count":ships.len(),"ships":ships.iter().map(|s|s.id).collect::<Vec<_>>(),"affordable":co.cash>=purchase-sale}),
        )
    }
    pub fn command(&mut self, v: &Value) -> Result<Value> {
        let action = string(v, "action")?;
        if action == "new" {
            self.game.fraction = 0.0;
            self.initialize(
                v["seed"].as_u64().unwrap_or(1700) as u32,
                v["events"].as_bool().unwrap_or(true),
            );
            return Ok(json!(true));
        }
        if action == "tick" {
            let count = v["days"].as_u64().unwrap_or(1).min(31);
            for _ in 0..count {
                self.tick();
            }
            return Ok(json!(true));
        }
        self.playable(0)?;
        match action {
            "license" => {
                self.buy_license(0, index(v, "nation", self.data.nations.len())?)?;
            }
            "buyShip" => {
                return Ok(json!(self.buy_ship(0, string(v, "kind")?)?));
            }
            "defaults" => {
                let sea = string(v, "ship")?;
                let land = string(v, "vehicle")?;
                ensure(
                    self.producible(0, sea)
                        && self.spec(sea)?.mode == "sea"
                        && self.producible(0, land)
                        && self.spec(land)?.mode == "land",
                    "船と車両の種別を確認してください。",
                )?;
                self.game.companies[0].default_ship = sea.into();
                self.game.companies[0].default_vehicle = land.into();
            }
            "sellShip" => {
                let id = identifier(v, "ship")?;
                let i = self.game.companies[0]
                    .ships
                    .iter()
                    .position(|s| s.id == id)
                    .ok_or("船・車両がありません。")?;
                let ship = &self.game.companies[0].ships[i];
                ensure(
                    ship.route.is_none()
                        && ship.voyage.is_none()
                        && ship.handling.is_none()
                        && ship.cargo.is_empty(),
                    "未使用の船・車両のみ売却できます。",
                )?;
                let price = self.spec(&ship.kind)?.price;
                let detail = ship.name.clone();
                self.game.companies[0].ships.remove(i);
                self.entry(0, "shipSale", price, None, detail);
            }
            "openRoute" => {
                return Ok(json!(self.open(
                    0,
                    string(v, "kind")?,
                    list(v, "stops", self.data.cities.len())?,
                    list(v, "allowed", self.data.goods.len())?,
                    number(v, "margin")?
                )?));
            }
            "assign" => {
                self.assign(0, identifier(v, "route")?, identifier(v, "ship")?)?;
            }
            "release" => {
                self.release(0, identifier(v, "ship")?)?;
            }
            "removeRoute" => {
                self.remove_route(0, identifier(v, "route")?, false)?;
            }
            "route" => {
                let id = identifier(v, "route")?;
                let ri = self.game.companies[0]
                    .routes
                    .iter()
                    .position(|r| r.id == id)
                    .ok_or("ルートがありません。")?;
                if let Some(kind) = v["kind"].as_str() {
                    ensure(
                        self.producible(0, kind)
                            && self.spec(kind)?.mode == self.game.companies[0].routes[ri].mode
                            && self.can_serve(kind, &self.game.companies[0].routes[ri].stops),
                        "船種・航続距離を確認してください。",
                    )?;
                    self.game.companies[0].routes[ri].auto_type = kind.into();
                }
                if let Some(active) = v["active"].as_bool() {
                    self.game.companies[0].routes[ri].active = active;
                    self.reschedule(0, id);
                }
                let r = &mut self.game.companies[0].routes[ri];
                if let Some(auto) = v["auto"].as_bool() {
                    r.auto_manage = auto;
                }
                if v.get("escorts").is_some() {
                    r.escorts = index(v, "escorts", 4)? as u32;
                }
                if v.get("allowed").is_some() {
                    let a = list(v, "allowed", self.data.goods.len())?;
                    ensure(!a.is_empty(), "交易品を選んでください。")?;
                    r.allowed = a;
                    r.min_margin = number(v, "margin")?;
                }
            }
            "automation" => {
                let budget = number(v, "budget")?;
                let reserve = number(v, "reserve")?;
                let expand = v["expand"]
                    .as_f64()
                    .ok_or("待機時間割合を指定してください。")?;
                let shrink = v["shrink"]
                    .as_f64()
                    .ok_or("待機時間割合を指定してください。")?;
                ensure(
                    expand.is_finite()
                        && shrink.is_finite()
                        && expand >= 0.0
                        && shrink <= 100.0
                        && expand <= shrink,
                    "待機時間割合は0～100%で、拡大の基準を縮小の基準以下にしてください。",
                )?;
                let a = &mut self.game.companies[0].automation;
                ensure(budget >= a.spent, "使用済み予算より小さくできません。")?;
                a.budget = budget;
                a.reserve = reserve;
                a.expand = expand;
                a.shrink = shrink;
                a.enabled = v["enabled"].as_bool().ok_or("自動化設定が不正です。")?;
                a.replace_lost = v["replaceLost"].as_bool().unwrap_or(false);
            }
            "diplomacy" => {
                ensure(
                    v.get("donate").is_none_or(|value| value == false),
                    "外交の臨時投資は廃止されました。日額投資を設定してください。",
                )?;
                let n = index(v, "nation", self.data.nations.len())?;
                let value = number(v, "value")?;
                self.game.companies[0].diplomacy_budget[n] = value;
            }
            "technology" => {
                let k = index(v, "kind", 3)?;
                self.game.companies[0].tech_budget[k] = number(v, "value")?;
            }
            "shipyard" => {
                ensure(
                    !self.game.companies[0].shipyard && self.game.companies[0].technology[0] >= 5.0,
                    "造船技術5が必要です。",
                )?;
                self.affordable(0, 4000.0)?;
                self.entry(0, "shipyardPurchase", -4000.0, None, String::new());
                self.game.companies[0].shipyard = true;
                self.game.companies[0].yard_value = 4000.0;
            }
            "research" => {
                let budgets = v["budgets"]
                    .as_array()
                    .ok_or("予算が不正です。")?
                    .iter()
                    .map(|n| n.as_f64().unwrap_or(-1.0))
                    .collect::<Vec<_>>();
                let (mut spec, cost) = self.design_quote(0, string(v, "kind")?, &budgets)?;
                ensure(
                    self.game.companies[0].shipyard
                        && self.game.companies[0].technology[0] >= spec.level
                        && self.game.designs.len() < 100,
                    "造船設備と船型の必要技術を確認してください。",
                )?;
                self.affordable(0, cost)?;
                let id = format!("design-{}", self.next_id());
                spec.id = id.clone();
                spec.name = format!("{} 設計 #{}", spec.name, self.game.next_id - 1);
                spec.name_en = Some(format!(
                    "{} design #{}",
                    spec.name_en.unwrap_or_default(),
                    self.game.next_id - 1
                ));
                self.game.designs.insert(id.clone(), spec);
                self.game.companies[0].designs.push(id.clone());
                self.entry(0, "designResearch", -cost, None, id);
            }
            "buyDevelopment" => {
                self.buy_development(0, index(v, "city", self.data.cities.len())?)?;
            }
            "cityInvestment" => {
                let city = index(v, "city", self.data.cities.len())?;
                ensure(
                    self.game.development[city].owner == "player",
                    "都市開発権が必要です。",
                )?;
                if v.get("size").is_some() {
                    self.game.development[city].size_budget = number(v, "size")?;
                }
                if v.get("good").is_some() {
                    let g = index(v, "good", self.data.goods.len())?;
                    let value = number(v, "value")?;
                    ensure(
                        value == 0.0 || self.data.cities[city].supply[g] > 0.0,
                        "非産地の生産には投資できません。",
                    )?;
                    self.game.development[city].production_budget[g] = value;
                }
            }
            "buyRoad" => {
                self.buy_road(0, index(v, "road", self.data.roads.len())?)?;
            }
            "roadInvestment" => {
                let i = index(v, "road", self.data.roads.len())?;
                ensure(
                    self.game.roads[i].owner == "player",
                    "道路開発権が必要です。",
                )?;
                self.game.roads[i].road_budget = number(v, "roadBudget")?;
                self.game.roads[i].security_budget = number(v, "securityBudget")?;
            }
            "acquire" => {
                self.acquire(index(v, "company", self.game.companies.len())?)?;
            }
            "rename" => {
                let text = name(string(v, "name")?)?;
                match string(v, "kind")? {
                    "company" => self.game.companies[0].name = text,
                    "design" => {
                        let id = string(v, "id")?;
                        ensure(
                            self.game.companies[0].designs.contains(&id.to_string()),
                            "設計がありません。",
                        )?;
                        let spec = self.game.designs.get_mut(id).unwrap();
                        spec.name = text.clone();
                        spec.name_en = Some(text);
                    }
                    _ => return Err("名前の対象が不正です。".into()),
                }
            }
            "replace" => {
                let q = self.replacement_quote(v)?;
                let cost = q["cost"].as_f64().unwrap();
                self.affordable(0, cost)?;
                let target = string(v, "target")?;
                if v["mode"] == "automation" {
                    let source = string(v, "source")?;
                    for r in &mut self.game.companies[0].routes {
                        if r.auto_type == source {
                            r.auto_type = target.into();
                        }
                    }
                } else {
                    let ids = q["ships"].as_array().unwrap();
                    self.entry(
                        0,
                        "shipSale",
                        q["sale"].as_f64().unwrap(),
                        None,
                        String::new(),
                    );
                    self.entry(
                        0,
                        "shipPurchase",
                        -q["purchase"].as_f64().unwrap(),
                        None,
                        String::new(),
                    );
                    for s in &mut self.game.companies[0].ships {
                        if ids.iter().any(|id| id.as_u64() == Some(s.id as u64)) {
                            s.kind = target.into();
                        }
                    }
                    let routes = self.game.companies[0]
                        .routes
                        .iter()
                        .map(|r| r.id)
                        .collect::<Vec<_>>();
                    for id in routes {
                        self.reschedule(0, id);
                    }
                }
            }
            _ => return Err("不明な操作です。".into()),
        }
        Ok(json!(true))
    }
    pub fn transact(&mut self, v: &Value) -> Result<Value> {
        let old = self.game.clone();
        match self.command(v) {
            Ok(r) => {
                self.capture_accounts();
                Ok(r)
            }
            Err(e) => {
                self.game = old;
                Err(e)
            }
        }
    }
    pub fn query(&self, v: &Value) -> Result<Value> {
        match string(v, "query")? {
            "accounts" => Ok(self.account_report(v["annual"] == true)),
            "connection" => {
                let stops = normalize(list(v, "stops", self.data.cities.len())?);
                let routes = self.game.companies[0]
                    .routes
                    .iter()
                    .filter(|r| key(&r.stops) == key(&stops))
                    .map(|r| r.id)
                    .collect::<Vec<_>>();
                let types = self
                    .data
                    .specs
                    .iter()
                    .chain(self.game.designs.values())
                    .filter(|s| {
                        self.producible(0, &s.id) && self.check_stops(&s.id, &stops).is_ok()
                    })
                    .map(|s| s.id.clone())
                    .collect::<Vec<_>>();
                let co = &self.game.companies[0];
                // Prefer the sea mode whenever it has an eligible type, then the
                // configured type within that mode, otherwise the cheapest hull.
                let preferred_mode = if types.iter().any(|id| self.spec(id).unwrap().mode == "sea")
                {
                    "sea"
                } else {
                    "land"
                };
                let configured = if preferred_mode == "sea" {
                    &co.default_ship
                } else {
                    &co.default_vehicle
                };
                let default = if types.contains(configured) {
                    Some(configured.clone())
                } else {
                    types
                        .iter()
                        .filter(|id| self.spec(id).unwrap().mode == preferred_mode)
                        .min_by(|a, b| {
                            self.spec(a)
                                .unwrap()
                                .price
                                .total_cmp(&self.spec(b).unwrap().price)
                                .then_with(|| a.cmp(b))
                        })
                        .cloned()
                };
                Ok(json!({"routes":routes,"types":types,"stops":stops,"default":default}))
            }
            "opening" => self.opening(
                0,
                string(v, "kind")?,
                &normalize(list(v, "stops", self.data.cities.len())?),
            ),
            "design" => {
                let budgets = v["budgets"]
                    .as_array()
                    .ok_or("予算が不正です。")?
                    .iter()
                    .map(|n| n.as_f64().unwrap_or(-1.0))
                    .collect::<Vec<_>>();
                let (spec, cost) = self.design_quote(0, string(v, "kind")?, &budgets)?;
                Ok(
                    json!({"eligible":self.game.companies[0].shipyard&&self.game.companies[0].technology[0]>=spec.level,"spec":spec,"cost":cost,"remaining":self.game.companies[0].cash-cost,"affordable":self.game.companies[0].cash>=cost}),
                )
            }
            "replacement" => self.replacement_quote(v),
            "acquisition" => self.acquisition(index(v, "company", self.game.companies.len())?),
            _ => Err("不明な照会です。".into()),
        }
    }
}
