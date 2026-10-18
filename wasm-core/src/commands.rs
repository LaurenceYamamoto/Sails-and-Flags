use crate::model::*;
use crate::trade::key;
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
            .find(|s| s.id == kind)
            .ok_or("船型が不正です。")?;
        ensure(
            budgets.len() == 5 && budgets.iter().all(|&x| amount(x)),
            "設計予算が不正です。",
        )?;
        let level = self.game.companies[c].technology[if base.mode == "land" { 3 } else { 0 }];
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
        s.guns = if base.mode == "sea" {
            base.guns + 30.0 * eff * p[2]
        } else {
            0.0
        };
        s.roughness = if base.mode == "land" {
            base.roughness + (1.0 - base.roughness) * eff / 1.5 * p[2]
        } else {
            0.0
        };
        let m = 0.35 * eff / 1.5 * p[4];
        let a = s.capacity as f64 / base.capacity as f64;
        let v = (s.speed / base.speed).powi(2);
        let r = s.range / base.range;
        let g = if base.mode == "land" {
            (1.0 + s.roughness) / (1.0 + base.roughness)
        } else {
            (s.guns + 10.0) / (base.guns + 10.0)
        };
        s.price =
            (base.price * (0.45 * a + 0.25 * v + 0.15 * r + 0.15 * g) * (1.0 + 0.25 * m)).ceil();
        s.daily = base.daily * (0.45 * a + 0.25 * v + 0.1 * r + 0.2 * g) * (1.0 - m);
        Ok((s, (base.price * 0.25).ceil() + budgets.iter().sum::<f64>()))
    }
    pub fn development_cost(&self,_city:usize)->f64 {self.post_open_cost(0)}
    pub fn buy_development(&mut self,c:usize,city:usize)->Result<()> {self.build_post(c,city)}
    pub fn road_cost(&self, i: usize) -> f64 {
        let d = &self.game.roads[i];
        ((500.0 + self.data.roads[i].km * 2.0)
            * (1.0 + d.quality * 0.1)
            * if d.owner == "state" { 1.0 } else { 1.5 })
        .ceil()
    }
    pub fn buy_road(&mut self, c: usize, i: usize) -> Result<()> {
        ensure(!self.data.roads[i].retired, "この陸路は廃止されました。")?;
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
            c > 0 && c < self.game.companies.len() && !self.game.companies[c].acquired && !self.game.companies[c].bankrupt,
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
        let post_capacity=target.posts.iter().all(|(&city,p)|{
            let own=player.posts.get(&city);
            let warehouse=p.warehouse+own.map_or(0,|p|p.warehouse);
            let stock=p.quantity()+own.map_or(0,|p|p.quantity());
            (warehouse==0||stock+self.reserved_stock(0,city)+self.reserved_stock(c,city)<=warehouse as usize*crate::posts::WAREHOUSE_UNITS)
                &&warehouse<=10000&&p.level+own.map_or(0,|p|p.level)<=10000&&p.handling+own.map_or(0,|p|p.handling)<=10000
        }) && player.posts.iter().filter(|(city,_)|!target.posts.contains_key(city)).all(|(&city,p)|p.warehouse==0||p.quantity()+self.reserved_stock(0,city)+self.reserved_stock(c,city)<=p.warehouse as usize*crate::posts::WAREHOUSE_UNITS);
        Ok(
            json!({"price":price,"licenseCost":fee,"required":required,"cash":target.cash,"missing":missing,"postCapacity":post_capacity,"eligible":missing.iter().all(|&n|player.friendship[n]>=30.0),"affordable":player.cash>=required}),
        )
    }
    pub fn acquire(&mut self, c: usize) -> Result<()> {
        let q = self.acquisition(c)?;
        ensure(q["postCapacity"]==true,"Capacity must cover inbound cargo.")?;
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
        for (city,post) in target.posts {
            if let Some(p)=self.game.companies[0].posts.get_mut(&city){p.level+=post.level;p.basis+=post.basis;p.warehouse+=post.warehouse;p.handling+=post.handling;p.handled+=post.handled;p.handling_demand+=post.handling_demand.max(post.handled);p.monitoring=std::array::from_fn(|_|crate::facility_management::FacilityMonitor{changed:Some(self.game.day),..Default::default()});
                for lot in post.stock {if let Some(s)=p.stock.iter_mut().find(|s|s.good==lot.good&&s.from==lot.from){s.quantity+=lot.quantity;s.cost+=lot.cost;}else{p.stock.push(lot);}}
            }else{self.game.companies[0].posts.insert(city,post);}
        }
        self.game.companies[c].posts.clear();
        for d in &mut self.game.roads {
            if d.owner == target.id {
                d.owner = "player".into();
                d.road_budget = 0.0;
                d.security_budget = 0.0;
            }
        }
        self.game.companies[0].designs.extend(target.designs);
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
    pub fn command(&mut self, v: &Value) -> Result<Value> {
        let action = string(v, "action")?;
        if action == "new" {
            // A localized default is input, just like a user-entered company name.
            let name = v["name"].as_str().unwrap_or("Your company").trim();
            ensure(!name.is_empty() && name.chars().count() <= 80, "会社名は1〜80文字で入力してください")?;
            self.game.fraction = 0.0;
            self.initialize(
                v["seed"].as_u64().unwrap_or(1700) as u32,
                v["events"].as_bool().unwrap_or(true),
            );
            self.game.companies[0].name = name.to_string();
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
        if self.game.companies[0].investment_plan.is_some() {
            ensure(!["cityInvestment","roadInvestment","technology","roadAuto"].contains(&action)
                && !(action=="bulkInvestment" && ["cityBudget","roadBudget"].contains(&v["mode"].as_str().unwrap_or(""))),
                "投資画面で設定してください。")?;
        }
        match action {
            "routePolicy" => { self.set_route_policy(&v["policy"])?; }
            "autoRoutes" => {
                let city=index(v,"city",self.data.cities.len())?;
                let enabled=v["enabled"].as_bool().ok_or("対象が不正です。")?;
                ensure(!enabled || self.game.companies[0].licenses.contains(&self.data.cities[city].nation),
                    "この都市の国の交易免許が必要です。")?;
                let cities=&mut self.game.companies[0].auto_route_cities;
                cities.retain(|&i|i!=city); if enabled {cities.push(city);cities.sort();}
            }
            "investmentPlan" => {
                self.set_investment_plan(&v["plan"])?;
                if let Some(a)=v.get("automation") {
                    let mut a=a.clone();
                    a["action"]=json!("automation");
                    a["reserve"]=json!(self.game.companies[0].investment_plan.as_ref().unwrap().reserve);
                    self.command(&a)?;
                }
            }
            "bulkInvestment" => { self.apply_bulk_investment(v)?; }
            "roadAuto" => {
                self.game.companies[0].road_auto = RoadAuto {
                    enabled: v["enabled"].as_bool().ok_or("対象が不正です。")?,
                    rivals: v["rivals"].as_bool().ok_or("対象が不正です。")?,
                    reserve: number(v, "reserve")?,
                };
            }
            "returnLicense" => {self.return_license(0,index(v,"nation",self.data.nations.len())?)?;}
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
            "sellShip" => { self.sell_ship(0,identifier(v,"ship")?)?; }
            "sellIdleShips" => {
                let kind=if v["all"]==true {None} else {Some(string(v,"kind")?)};
                if let Some(kind)=kind {self.spec(kind)?;}
                let ids=self.game.companies[0].ships.iter()
                    .filter(|s|s.can_sell() && kind.is_none_or(|k|s.kind==k))
                    .map(|s|s.id).collect::<Vec<_>>();
                let mut total=0.0;
                for &id in &ids {total+=self.sell_ship(0,id)?;}
                return Ok(json!({"count":ids.len(),"total":total}));
            }
            "openRoute" => {
                ensure(v["stops"].as_array().is_some_and(|s|s.len()==2), "経路は異なる2都市を指定してください。")?;
                let defaults=self.game.companies[0].route_prices.unwrap_or([0.0,0.0]);
                let buy=if v.get("buyBelow").is_some(){number(v,"buyBelow")?}else{defaults[0]};let sell=if v.get("sellAbove").is_some(){number(v,"sellAbove")?}else{defaults[1]};
                ensure(crate::posts::thresholds(buy,sell),"Invalid price thresholds")?;
                let id=self.open(0,string(v,"kind")?,list(v,"stops",self.data.cities.len())?,list(v,"allowed",self.data.goods.len())?,0.0)?;
                let r=self.game.companies[0].routes.iter_mut().find(|r|r.id==id).unwrap();
                if v.get("buyBelow").is_some(){r.buy_below=buy;}if v.get("sellAbove").is_some(){r.sell_above=sell;}
                return Ok(json!(id));
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
            "bulkEscorts" => {
                let mode = string(v, "mode")?;
                ensure(matches!(mode, "sea" | "land"), "対象が不正です。")?;
                let escorts = v["escorts"].as_u64().filter(|n| *n <= 3)
                    .ok_or("対象が不正です。")? as u32;
                let defaults=self.game.companies[0].route_escorts.get_or_insert([0,0]);
                defaults[if mode=="sea"{0}else{1}]=escorts;
                for route in &mut self.game.companies[0].routes {
                    if route.mode == mode {
                        route.escorts = escorts;
                    }
                }
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
                    r.min_margin = 0.0;
                }
                if v.get("buyBelow").is_some(){
                    let buy=number(v,"buyBelow")?;let sell=number(v,"sellAbove")?;ensure(crate::posts::thresholds(buy,sell),"Invalid price thresholds")?;r.buy_below=buy;r.sell_above=sell;
                }
            }
            "automation" => {
                let reserve = self.game.companies[0].investment_plan.as_ref().map(|p|p.reserve).unwrap_or(number(v, "reserve")?);
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
                let k = index(v, "kind", 8)?;
                self.game.companies[0].tech_budget[k] = number(v, "value")?;
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
                    self.game.companies[0].technology[if spec.mode == "land" { 3 } else { 0 }]
                        >= spec.level
                        && self.game.designs.len() < 100,
                    "設計に必要な技術と設計数を確認してください。",
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
            "buildPost" => {self.build_post(0,index(v,"city",self.data.cities.len())?)?;}
            "lowerPost" => {self.lower_post(0,index(v,"city",self.data.cities.len())?,string(v,"facility")?,identifier(v,"target")?)?;}
            "bulkPostLevel" => {self.bulk_post_level(identifier(v,"target")?,v["raise"]==true)?;}
            "facilityPolicy" => {let policy=serde_json::from_value(v["policy"].clone()).map_err(|_|"Invalid facility settings")?;self.set_facility_policy(policy)?;}
            "upgradePost" => {self.upgrade_post(0,index(v,"city",self.data.cities.len())?,string(v,"facility")?)?;}
            "postRules" => {
                let rules:Vec<crate::posts::PriceRule>=serde_json::from_value(v["rules"].clone()).map_err(|_|"Invalid price rules")?;
                ensure(rules.len()==self.data.goods.len()&&rules.iter().all(|r|r.valid()),"Invalid price rules")?;
                let targets=if v["all"]==true{self.game.companies[0].posts.keys().copied().collect::<Vec<_>>()}else{vec![index(v,"city",self.data.cities.len())?]};
                ensure(targets.iter().all(|i|self.game.companies[0].posts.contains_key(i)),"A trading post is required")?;
                for i in targets{self.game.companies[0].posts.get_mut(&i).unwrap().rules=rules.clone();}
            }
            "routePrices" => {
                let buy=number(v,"buyBelow")?;let sell=number(v,"sellAbove")?;
                ensure(crate::posts::thresholds(buy,sell),"Invalid price thresholds")?;
                let id=if v["all"]==true{None}else{Some(identifier(v,"route")?)};
                ensure(id.is_none_or(|id|self.game.companies[0].routes.iter().any(|r|r.id==id)),"Route not found")?;
                if id.is_none(){self.game.companies[0].route_prices=Some([buy,sell]);}
                for r in self.game.companies[0].routes.iter_mut().filter(|r|id.is_none_or(|id|r.id==id)){r.buy_below=buy;r.sell_above=sell;}
            }
            "cityInvestment" => {
                let city = index(v, "city", self.data.cities.len())?;
                ensure(
                    self.game.companies[0].posts.contains_key(&city),
                    "商館が必要です。 / A trading post is required.",
                )?;
                if v.get("size").is_some() {
                    self.game.companies[0].posts.get_mut(&city).unwrap().size_budget = number(v, "size")?;
                }
                if v.get("good").is_some() {
                    let g = index(v, "good", self.data.goods.len())?;
                    let value = number(v, "value")?;
                    ensure(
                        value == 0.0 || self.data.cities[city].supply[g] > 0.0,
                        "非産地の生産には投資できません。",
                    )?;
                    self.game.companies[0].posts.get_mut(&city).unwrap().production_budget[g] = value;
                }
            }
            "buyRoad" => {
                self.buy_road(0, index(v, "road", self.data.roads.len())?)?;
            }
            "roadInvestment" => {
                let i = index(v, "road", self.data.roads.len())?;
                ensure(!self.data.roads[i].retired, "この陸路は廃止されました。")?;
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
            "postLevel" => self.post_level_quote(identifier(v,"target")?,v["raise"]==true),
            "investmentPlan" => self.investment_report(v),
            "bulkInvestment" => self.bulk_investment_quote(v),
            "accounts" => Ok(self.account_report(v["annual"] == true)),
            "connection" => {
                let stops = self.ordered_stops(list(v, "stops", self.data.cities.len())?);
                ensure(stops.len()==2 && stops[0]!=stops[1], "経路は異なる2都市を指定してください。")?;
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
                Ok(json!({"routes":routes,"types":types,"stops":stops,"default":default,"waterway":self.has_waterway(&stops)}))
            }
            "opening" => {
                let stops=self.ordered_stops(list(v,"stops",self.data.cities.len())?);
                ensure(stops.len()==2 && stops[0]!=stops[1], "経路は異なる2都市を指定してください。")?;
                self.opening(0,string(v,"kind")?,&stops)
            },
            "design" => {
                let budgets = v["budgets"]
                    .as_array()
                    .ok_or("予算が不正です。")?
                    .iter()
                    .map(|n| n.as_f64().unwrap_or(-1.0))
                    .collect::<Vec<_>>();
                let (spec, cost) = self.design_quote(0, string(v, "kind")?, &budgets)?;
                Ok(
                    json!({"eligible":self.game.companies[0].technology[if spec.mode=="land"{3}else{0}]>=spec.level&&self.game.designs.len()<100,"spec":spec,"cost":cost,"remaining":self.game.companies[0].cash-cost,"affordable":self.game.companies[0].cash>=cost}),
                )
            }

            "returnLicense" => self.license_return_quote(0,index(v,"nation",self.data.nations.len())?),
            "acquisition" => self.acquisition(index(v, "company", self.game.companies.len())?),
            _ => Err("不明な照会です。".into()),
        }
    }
}
