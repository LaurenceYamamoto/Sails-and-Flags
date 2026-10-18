use crate::commands::{number, string};
use crate::model::*;
use serde_json::{json, Value};
use std::collections::BTreeSet;

fn flag(v: &Value, k: &str) -> Result<bool> {
    v[k].as_bool().ok_or("対象が不正です。".into())
}

// JavaScript serializes 0.0 as 0. Compare JSON numbers numerically, allowing
// only floating-point round-trip noise; preserve exact structure and indices.
fn same_quote(a: &Value, b: &Value) -> bool {
    match (a,b) {
        (Value::Number(x),Value::Number(y)) => {
            let (x,y)=(x.as_f64().unwrap(),y.as_f64().unwrap());
            (x-y).abs() <= f64::EPSILON * 2.0 * x.abs().max(y.abs()).max(1.0)
        }
        (Value::Array(x),Value::Array(y)) => x.len()==y.len() && x.iter().zip(y).all(|(a,b)|same_quote(a,b)),
        (Value::Object(x),Value::Object(y)) => x.len()==y.len() && x.iter().all(|(k,a)|y.get(k).is_some_and(|b|same_quote(a,b))),
        _ => a==b,
    }
}

impl Engine {
    // Registered routes count even while paused. Shared and repeated legs count once.
    fn used_roads(&self) -> BTreeSet<usize> {
        self.game.companies[0].routes.iter().filter(|r| r.mode == "land")
            .flat_map(|r| r.stops.iter().enumerate().flat_map(|(i,&a)|
                self.land_legs(a,r.stops[(i+1)%r.stops.len()]).into_iter().map(|(_,_,j)|j)))
            .collect()
    }

    pub(crate) fn road_candidates(&self, rivals: bool) -> Vec<usize> {
        let co = &self.game.companies[0];
        self.used_roads().into_iter().filter(|&i| {
            let d = &self.game.roads[i];
            d.owner != co.id && (rivals || d.owner == "state" || d.owner == "private")
                && self.data.roads[i].nations.iter().all(|n| co.licenses.contains(n))
        }).collect()
    }

    pub fn auto_buy_roads(&mut self) {
        let co = &self.game.companies[0];
        if !co.road_auto.enabled || co.bankrupt || co.acquired { return; }
        let reserve = co.road_auto.reserve;
        let mut targets = self.road_candidates(co.road_auto.rivals);
        // Affordable inexpensive rights first; ties follow stable catalog order.
        targets.sort_by(|&a, &b| self.road_cost(a).total_cmp(&self.road_cost(b)).then(a.cmp(&b)));
        for i in targets {
            if self.game.companies[0].cash - self.road_cost(i) >= reserve {
                let _ = self.buy_road(0, i);
            }
        }
    }

    pub fn bulk_investment_quote(&self, v: &Value) -> Result<Value> {
        let mode = string(v, "mode")?;
        let co = &self.game.companies[0];
        let mut rows = Vec::new();
        let mut cost = 0.0;
        let mut before = 0.0;
        let mut after = 0.0;
        let mut cells = 0;
        match mode {
            "roadPurchase" => {
                for i in self.road_candidates(flag(v, "rivals")?) {
                    let price = self.road_cost(i);
                    cost += price;
                    rows.push(json!({"road":i,"price":price,"owner":self.game.roads[i].owner}));
                }
            }
            "cityPurchase" => {
                let rivals = flag(v, "rivals")?;
                let route_only = flag(v, "routeOnly")?;
                let stops: BTreeSet<_> = co.routes.iter().flat_map(|r|r.stops.iter().copied()).collect();
                for (i, d) in self.game.development.iter().enumerate() {
                    if d.owner == co.id || (!rivals && d.owner != "state" && d.owner != "private")
                        || (route_only && !stops.contains(&i)) || !co.licenses.contains(&self.data.cities[i].nation) { continue; }
                    let price = self.development_cost(i);
                    cost += price;
                    rows.push(json!({"city":i,"price":price,"owner":d.owner}));
                }
            }
            "roadBudget" => {
                let road = number(v, "roadBudget")?;
                let security = number(v, "securityBudget")?;
                for (i, d) in self.game.roads.iter().enumerate() {
                    if d.owner != co.id || self.data.roads[i].retired { continue; }
                    before += d.road_budget + d.security_budget;
                    after += road + security;
                    rows.push(json!({"road":i}));
                }
            }
            "cityBudget" => {
                let size = if v.get("size").is_some() { Some(number(v,"size")?) } else { None };
                let production = if v.get("production").is_some() { Some(number(v,"production")?) } else { None };
                ensure(size.is_some() || production.is_some(), "対象が不正です。")?;
                let (min,max) = if production.is_some() {
                    let min=number(v,"min")?;
                    let max=number(v,"max")?;
                    ensure(min<=max,"対象が不正です。")?;
                    (min,max)
                } else { (0.0,0.0) };
                for (i,d) in self.game.development.iter().enumerate() {
                    if d.owner != co.id { continue; }
                    let goods: Vec<_> = (0..self.data.goods.len()).filter(|&g| {
                        let base=self.data.cities[i].supply[g];
                        production.is_some() && base>=min && base<=max && (base>0.0 || production==Some(0.0))
                    }).collect();
                    if size.is_none() && goods.is_empty() { continue; }
                    before += d.size_budget + d.production_budget.iter().sum::<f64>();
                    after += size.unwrap_or(d.size_budget) + d.production_budget.iter().enumerate()
                        .map(|(g,&n)| if goods.contains(&g) { production.unwrap() } else { n }).sum::<f64>();
                    cells += goods.len();
                    rows.push(json!({"city":i,"goods":goods}));
                }
            }
            _ => return Err("対象が不正です。".into()),
        }
        ensure(cost.is_finite() && before.is_finite() && after.is_finite(), "金額が不正です。")?;
        Ok(json!({"mode":mode,"rows":rows,"count":rows.len(),"cells":cells,"cost":cost,
            "before":before,"after":after,"remaining":co.cash-cost,"affordable":co.cash>=cost}))
    }

    pub fn apply_bulk_investment(&mut self, v: &Value) -> Result<()> {
        let q = self.bulk_investment_quote(v)?;
        // Confirm the exact quote shown to the player, including changed rights/prices.
        ensure(v.get("quote").is_some_and(|prior|same_quote(prior,&q)), "一括処理の見積もりが変わりました。再確認してください。")?;
        ensure(q["count"].as_u64().unwrap() > 0, "対象が不正です。")?;
        self.affordable(0, q["cost"].as_f64().unwrap())?;
        for row in q["rows"].as_array().unwrap() {
            match string(v,"mode")? {
                "roadPurchase" => self.buy_road(0,row["road"].as_u64().unwrap() as usize)?,
                "cityPurchase" => self.buy_development(0,row["city"].as_u64().unwrap() as usize)?,
                "roadBudget" => {
                    let i=row["road"].as_u64().unwrap() as usize;
                    self.game.roads[i].road_budget=number(v,"roadBudget")?;
                    self.game.roads[i].security_budget=number(v,"securityBudget")?;
                }
                "cityBudget" => {
                    let i=row["city"].as_u64().unwrap() as usize;
                    if v.get("size").is_some() { self.game.development[i].size_budget=number(v,"size")?; }
                    for g in row["goods"].as_array().unwrap() {
                        self.game.development[i].production_budget[g.as_u64().unwrap() as usize]=number(v,"production")?;
                    }
                }
                _ => unreachable!(),
            }
        }
        Ok(())
    }
}
