use crate::model::*;
use crate::trade::ratio;
use serde_json::{Value, json};
use std::collections::BTreeSet;
impl Engine {
    pub fn investments(&self, ci: usize) -> Value {
        let owner = &self.game.companies[ci].id;
        let cities=self.game.development.iter().enumerate().filter(|(_,d)|&d.owner==owner).map(|(i,d)|json!({"city":i,"size":d.size,"sizeBudget":d.size_budget,"production":d.production,"productionBudget":d.production_budget})).collect::<Vec<_>>();
        let roads=self.game.roads.iter().enumerate().filter(|(_,d)|&d.owner==owner).map(|(i,d)|json!({"road":i,"quality":d.quality,"security":d.security,"roadBudget":d.road_budget,"securityBudget":d.security_budget})).collect::<Vec<_>>();
        json!({"cities":cities,"roads":roads})
    }
    pub fn demand_details(&self, city: usize, g: usize) -> Value {
        let c = &self.data.cities[city];
        let d = &self.game.development[city];
        let (production, _, _, _) = self.market_flow(city, g);
        let (_, _, ordinal, length) = self.calendar();
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
        json!({"base":c.demand[g],"location":c.modifiers[g],"season":1.0+c.seasons[g]*(std::f64::consts::TAU*ordinal as f64/length as f64).cos(),"city":1.0+if c.lon< -20.0{1.0}else{0.35}*1.5*d.size/(5.0+d.size),"war":war,"price":(1.0/ratio(self.game.markets[city*self.data.goods.len()+g].stock+production)).clamp(0.25,3.0)})
    }
    pub fn catalog(&self) -> Value {
        let mut v = self.graphics.clone();
        let o = v.as_object_mut().unwrap();
        o.remove("distances");
        o.remove("paths");
        o.remove("starts");
        o.remove("shipNames");
        for c in o["cities"].as_array_mut().unwrap() {
            for k in ["stocks", "supply", "demand", "modifiers", "seasons"] {
                c.as_object_mut().unwrap().remove(k);
            }
        }
        v
    }
    pub fn paths(&self) -> Value {
        let mut paths = serde_json::Map::new();
        for co in &self.game.companies {
            for r in &co.routes {
                for (i, &a) in r.stops.iter().enumerate() {
                    let b = r.stops[(i + 1) % r.stops.len()];
                    let k = format!("{}:{}:{}", r.mode, a, b);
                    if paths.contains_key(&k) {
                        continue;
                    }
                    let points = if r.mode == "land" {
                        let idx = self.road(a, b).unwrap();
                        let mut p = self.graphics["roads"][idx]["points"]
                            .as_array()
                            .unwrap()
                            .clone();
                        if self.data.roads[idx].a != a {
                            p.reverse();
                        }
                        json!([p])
                    } else {
                        let mut lines = self.graphics["paths"]
                            [format!("{}:{}", a.min(b), a.max(b))]
                        .as_array()
                        .cloned()
                        .unwrap_or_default();
                        if a > b {
                            lines.reverse();
                            for line in &mut lines {
                                line.as_array_mut().unwrap().reverse();
                            }
                        }
                        json!(lines)
                    };
                    paths.insert(k, points);
                }
            }
        }
        Value::Object(paths)
    }
    pub fn view(&self, city: usize) -> Value {
        let city = city.min(self.data.cities.len() - 1);
        let co = &self.game.companies[0];
        let mut catalog = self
            .data
            .specs
            .iter()
            .filter(|s| s.id != "corvette")
            .chain(co.designs.iter().filter_map(|id| self.game.designs.get(id)))
            .collect::<Vec<_>>();
        catalog.sort_by(|a, b| a.price.total_cmp(&b.price));
        let companies=self.game.companies.iter().enumerate().filter(|(_,c)|!c.acquired).map(|(ci,c)|{let routes=c.routes.iter().map(|r|{let(cycle,offsets,fleet)=self.schedule(ci,r);let mut v=serde_json::to_value(r).unwrap();v["cycle"]=json!(cycle);v["interval"]=json!(cycle as f64/fleet.len().max(1) as f64);v["fleet"]=json!(fleet.iter().map(|&i|c.ships[i].id).collect::<Vec<_>>());v["offsets"]=json!(offsets);v["margin"]=json!(r.transport.margin());v["available"]=json!(c.ships.iter().filter(|s|s.route.is_none()&&self.spec(&s.kind).unwrap().mode==r.mode&&self.can_serve(&s.kind,&r.stops)).map(|s|s.id).collect::<Vec<_>>());v["types"]=json!(catalog.iter().filter(|s|s.mode==r.mode&&self.can_serve(&s.id,&r.stops)).map(|s|s.id.clone()).collect::<Vec<_>>());v});json!({"index":ci,"id":c.id,"name":c.name,"cash":c.cash,"assets":self.assets(ci),"bankrupt":c.bankrupt,"ships":c.ships,"routes":routes.collect::<Vec<_>>(),"fixed":c.ships.iter().map(|s|self.daily(ci,&s.kind)).sum::<f64>()+c.licenses.iter().map(|&n|self.terms(ci,n,0).1).sum::<f64>()+c.routes.iter().map(|r|r.escorts as f64*4.0).sum::<f64>(),"technology":c.technology,"techBudget":c.tech_budget,"licenses":c.licenses,"investments":self.investments(ci),"history":c.history})}).collect::<Vec<_>>();
        let licenses=self.data.nations.iter().enumerate().map(|(n,_)|{let(fee,daily,tax)=self.terms(0,n,co.licenses.len());json!({"nation":n,"friendship":co.friendship[n],"fee":fee,"daily":daily,"tax":tax*100.0,"owned":co.licenses.contains(&n),"eligible":co.friendship[n]>=30.0&&co.cash>=fee,"budget":co.diplomacy_budget[n]})}).collect::<Vec<_>>();
        let market=self.data.goods.iter().enumerate().map(|(g,good)|{let(production,demand,consumption,_)=self.market_flow(city,g);let stock=self.game.markets[city*self.data.goods.len()+g].stock;json!({"good":g,"stock":stock,"price":good.base*ratio(stock),"production":production,"demand":demand,"consumption":consumption,"unmet":(demand-consumption).max(0.0),"details":self.demand_details(city,g),"baseProduction":self.data.cities[city].supply[g],"budget":self.game.development[city].production_budget[g],"level":self.game.development[city].production[g]})}).collect::<Vec<_>>();
        let roads = self
            .game
            .roads
            .iter()
            .enumerate()
            .map(|(i, d)| {
                let mut v = serde_json::to_value(d).unwrap();
                v["index"] = json!(i);
                v["price"] = json!(self.road_cost(i));
                v["eligible"] = json!(
                    d.owner != co.id
                        && co.cash >= self.road_cost(i)
                        && self.data.roads[i]
                            .nations
                            .iter()
                            .all(|n| co.licenses.contains(n))
                );
                v
            })
            .collect::<Vec<_>>();
        let pairs = self
            .game
            .pairs
            .iter()
            .filter(|p| p.until.is_some())
            .map(|p| json!({"a":p.a,"b":p.b}))
            .collect::<Vec<_>>();
        json!({"fraction":self.game.fraction,"day":self.game.day,"companies":companies,"licenses":licenses,"market":market,"city":city,"development":self.game.development[city],"developmentCost":self.development_cost(city),"roads":roads,"catalog":catalog,"automation":co.automation,"shipyard":co.shipyard,"canBuyShipyard":!co.shipyard&&co.technology[0]>=5.0&&co.cash>=4000.0,"technology":co.technology,"techBudget":co.tech_budget,"firstRank":self.game.first_rank,"events":self.game.events.iter().rev().take(15).collect::<Vec<_>>(),"ledger":co.ledger.iter().rev().take(40).collect::<Vec<_>>(),"wars":pairs,"paths":self.paths(),"operating":co.totals.iter().filter(|(k,_)|["purchase","sale","tax","upkeep","licenseDaily","escort","roadToll","roadIncome","developmentIncome"].contains(&k.as_str())).map(|(_,v)|v).sum::<f64>()})
    }
    pub fn validate(&self, g: &Game) -> Result<()> {
        ensure(
            g.format == "sails-flags-wasm" && g.version == 1,
            "このセーブ形式は対応していません。3.0.0以降のセーブを指定してください。",
        )?;
        let d = &self.data;
        ensure(
            g.day <= 3650000
                && g.fraction.is_finite()
                && (0.0..1.0).contains(&g.fraction)
                && g.companies.len() == d.starts.len() + 1
                && g.companies[0].id == "player"
                && g.markets.len() == d.cities.len() * d.goods.len()
                && g.development.len() == d.cities.len()
                && g.roads.len() == d.roads.len()
                && g.pairs.len() == d.nations.len() * (d.nations.len() - 1) / 2,
            "保存データの構成が不正です。",
        )?;
        ensure(
            g.events.len() <= 100
                && g.designs.len() <= 100
                && g.markets.iter().all(|m| amount(m.stock)),
            "保存データの市場が不正です。",
        )?;
        let spec = |kind: &str| {
            d.specs
                .iter()
                .find(|s| s.id == kind)
                .or_else(|| g.designs.get(kind))
        };
        let mut ids = BTreeSet::new();
        for (ci, c) in g.companies.iter().enumerate() {
            ensure(
                c.id == if ci == 0 {
                    "player"
                } else {
                    &d.starts[ci - 1].id
                } && !c.name.trim().is_empty()
                    && c.name.chars().count() <= 80
                    && c.trade.iter().all(|&x| amount(x))
                    && c.designs.iter().all(|id| g.designs.contains_key(id))
                    && c.designs.iter().collect::<BTreeSet<_>>().len() == c.designs.len()
                    && amount(c.yard_value)
                    && [
                        c.automation.budget,
                        c.automation.reserve,
                        c.automation.spent,
                    ]
                    .iter()
                    .all(|&x| amount(x))
                    && c.automation.spent <= c.automation.budget
                    && c.automation.shrink >= -100.0
                    && c.automation.expand <= 10000.0
                    && c.automation.shrink <= c.automation.expand,
                "保存データの会社設定が不正です。",
            )?;
            ensure(
                c.friendship.len() == d.nations.len()
                    && c.diplomacy_budget.len() == d.nations.len()
                    && c.trade.len() == d.nations.len()
                    && c.friendship
                        .iter()
                        .all(|f| f.is_finite() && (0.0..=100.0).contains(f))
                    && c.diplomacy_budget.iter().all(|&n| amount(n))
                    && c.technology
                        .iter()
                        .chain(c.tech_budget.iter())
                        .all(|&x| amount(x))
                    && c.cash.is_finite()
                    && c.initial_cash.is_finite(),
                "保存データの会社が不正です。",
            )?;
            ensure(
                c.licenses.iter().all(|&n| n < d.nations.len())
                    && c.licenses.iter().collect::<BTreeSet<_>>().len() == c.licenses.len()
                    && c.ledger.len() <= 600
                    && c.history.len() <= 365
                    && (ci == 0 || c.routes.len() <= 50),
                "保存データの免許・履歴が不正です。",
            )?;
            let total = c.initial_cash + c.totals.values().sum::<f64>();
            ensure(
                c.totals.values().all(|n| n.is_finite())
                    && (total - c.cash).abs() < 0.0001_f64.max(c.cash.abs() * 1e-9),
                "保存データの会計が一致しません。",
            )?;
            for r in &c.routes {
                ensure(
                    ids.insert(r.id)
                        && r.id < g.next_id
                        && (2..=12).contains(&r.stops.len())
                        && r.stops.iter().all(|&n| n < d.cities.len())
                        && r.allowed.iter().all(|&n| n < d.goods.len())
                        && !r.allowed.is_empty()
                        && spec(&r.auto_type).is_some()
                        && r.escorts <= 3,
                    "保存データの航路が不正です。",
                )?;
                ensure(
                    ["sea", "land"].contains(&r.mode.as_str())
                        && spec(&r.auto_type).unwrap().mode == r.mode
                        && r.stops.iter().enumerate().all(|(i, &a)| {
                            let b = r.stops[(i + 1) % r.stops.len()];
                            a != b
                                && c.licenses.contains(&d.cities[a].nation)
                                && if r.mode == "land" {
                                    self.road(a, b).is_some_and(|j| {
                                        d.roads[j].nations.iter().all(|n| c.licenses.contains(n))
                                    })
                                } else {
                                    d.distances[a][b].is_some()
                                }
                        })
                        && r.transport.since <= g.day
                        && r.started <= g.day
                        && r.replacements.len() <= 200
                        && r.replacements.iter().all(|k| spec(k).is_some())
                        && r.min_margin.is_finite()
                        && (0.0..=10000.0).contains(&r.min_margin)
                        && [r.profit, r.revenue, r.expenses, r.forecast]
                            .iter()
                            .all(|v| v.is_finite())
                        && [
                            r.transport.sales,
                            r.transport.costs,
                            r.transport.upkeep,
                            r.cargo_loss,
                            r.ship_loss,
                        ]
                        .iter()
                        .all(|&x| amount(x)),
                    "保存データの経路・収支が不正です。",
                )?;
            }
            for s in &c.ships {
                ensure(
                    ids.insert(s.id)
                        && s.id < g.next_id
                        && spec(&s.kind).is_some()
                        && s.name.chars().count() <= 80,
                    "保存データの船が不正です。",
                )?;
                if let Some(id) = s.route {
                    let r = c
                        .routes
                        .iter()
                        .find(|r| r.id == id)
                        .ok_or("船のルートが不正です。")?;
                    ensure(s.next < r.stops.len(), "船の寄港順が不正です。")?;
                    let spec = spec(&s.kind).unwrap();
                    ensure(
                        spec.mode == r.mode
                            && r.stops.iter().enumerate().all(|(i, &a)| {
                                let b = r.stops[(i + 1) % r.stops.len()];
                                let distance = if r.mode == "land" {
                                    d.roads[self.road(a, b).unwrap()].km
                                } else {
                                    d.distances[a][b].unwrap()
                                };
                                distance <= spec.range
                            }),
                        "船の航続距離が不正です。",
                    )?;
                    if let Some(v) = &s.voyage {
                        ensure(
                            v.from == r.stops[s.next]
                                && v.to == r.stops[(s.next + 1) % r.stops.len()],
                            "船の航行区間が不正です。",
                        )?;
                    }
                } else {
                    ensure(
                        s.cargo.is_empty() && s.voyage.is_none(),
                        "未配置の船の状態が不正です。",
                    )?;
                }
                if let Some(v) = &s.voyage {
                    ensure(
                        s.route.is_some()
                            && v.from < d.cities.len()
                            && v.to < d.cities.len()
                            && v.total > 0
                            && v.remaining > 0
                            && v.remaining <= v.total
                            && amount(v.original_cost)
                            && amount(v.upkeep),
                        "保存データの航海が不正です。",
                    )?;
                }
                ensure(
                    s.cargo
                        .iter()
                        .all(|x| x.good < d.goods.len() && amount(x.cost) && x.quantity <= 10000),
                    "保存データの貨物が不正です。",
                )?;
            }
        }
        for (id, v) in &g.designs {
            ensure(
                v.id == *id
                    && id.starts_with("design-")
                    && v.mode == "sea"
                    && v.capacity > 0
                    && v.capacity < 10000
                    && [v.price, v.speed, v.range, v.daily, v.guns]
                        .iter()
                        .all(|&x| amount(x))
                    && v.speed > 0.0,
                "保存データの設計が不正です。",
            )?;
        }
        for v in &g.development {
            ensure(
                (["state", "private"].contains(&v.owner.as_str())
                    || g.companies.iter().any(|c| c.id == v.owner && !c.acquired))
                    && v.production.len() == d.goods.len()
                    && v.production_budget.len() == d.goods.len()
                    && v.production
                        .iter()
                        .chain(v.production_budget.iter())
                        .all(|&x| amount(x))
                    && [v.basis, v.size, v.size_budget, v.pool]
                        .iter()
                        .all(|&x| amount(x)),
                "保存データの都市が不正です。",
            )?;
        }
        for r in &g.roads {
            ensure(
                ["state", "private"].contains(&r.owner.as_str())
                    || g.companies.iter().any(|c| c.id == r.owner && !c.acquired),
                "道路の所有者が不正です。",
            )?;
            ensure(
                [
                    r.basis,
                    r.quality,
                    r.security,
                    r.road_budget,
                    r.security_budget,
                    r.pool,
                ]
                .iter()
                .all(|&x| amount(x)),
                "保存データの道路が不正です。",
            )?;
        }
        let mut pairs = BTreeSet::new();
        for p in &g.pairs {
            ensure(
                p.a < p.b
                    && p.b < d.nations.len()
                    && pairs.insert((p.a, p.b))
                    && p.relation.is_finite()
                    && (0.0..=100.0).contains(&p.relation),
                "保存データの外交が不正です。",
            )?;
        }
        Ok(())
    }
}
