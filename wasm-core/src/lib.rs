mod accounts;
mod commands;
mod loading;
mod model;
mod movement;
mod rivals;
mod simulation;
mod trade;
mod view;
pub use model::Engine;
use model::{Game, Result};
use serde_json::{Value, json};
use std::cell::RefCell;

impl Engine {
    // Retired roads retain save indices, but no longer support transport or investment.
    // Validate the original save first; refund only assets still present in that save.
    fn retire_roads(&self, g: &mut Game) -> Result<Vec<(usize, f64, usize)>> {
        let mut refunds = Vec::new();
        for (ci, c) in g.companies.iter_mut().enumerate() {
            let removed: Vec<_> = c.routes.iter().filter(|r| r.mode == "land" &&
                r.stops.iter().enumerate().any(|(i, &a)| {
                    let b = r.stops[(i + 1) % r.stops.len()];
                    self.data.roads.iter().any(|d| d.retired &&
                        ((d.a == a && d.b == b) || (d.a == b && d.b == a)))
                })).map(|r| r.id).collect();
            let mut refund = 0.0;
            for s in &mut c.ships {
                if s.route.is_some_and(|id| removed.contains(&id)) {
                    refund += s.cargo.iter().map(|item| item.cost).sum::<f64>();
                    s.route = None;
                    s.voyage = None;
                    s.handling = None;
                    s.cargo.clear();
                    s.next = 0;
                    s.ready = g.day;
                }
            }
            c.routes.retain(|r| !removed.contains(&r.id));
            for (i, r) in g.roads.iter().enumerate() {
                if self.data.roads[i].retired && r.owner == c.id {
                    refund += r.basis + r.pool;
                }
            }
            model::ensure(model::amount(refund) && model::amount(c.cash.max(0.0) + refund + c.yard_value),
                "廃止陸路の返金額が不正です。")?;
            refunds.push((ci, refund, removed.len()));
        }
        for (i, r) in g.roads.iter_mut().enumerate() {
            if self.data.roads[i].retired {
                *r = model::RoadState { owner: "state".into(), basis: 0.0, quality: 0.0,
                    security: 0.0, road_budget: 0.0, security_budget: 0.0, pool: 0.0 };
            }
        }
        Ok(refunds)
    }
    pub fn dispatch(&mut self, v: Value) -> Result<Value> {
        match v["op"].as_str().unwrap_or("") {
            "advance" => {
                let ms = v["ms"].as_f64().unwrap_or(0.0);
                let speed = v["speed"].as_u64().unwrap_or(1);
                model::ensure(
                    ms.is_finite() && ms >= 0.0 && [1, 4, 16].contains(&speed),
                    "Invalid clock input",
                )?;
                // Ignore long background-tab gaps instead of unbounded catch-up.
                if v["running"] == true && !self.game.companies[0].bankrupt {
                    self.game.fraction += ms.min(500.0) * speed as f64 / 1000.0;
                    while self.game.fraction >= 1.0 {
                        self.tick();
                        self.game.fraction -= 1.0;
                    }
                }
                Ok(json!(true))
            }
            "catalog" => Ok(self.catalog()),
            "view" => Ok(self.view(v["city"].as_u64().unwrap_or(0) as usize)),
            "command" => {
                if v["command"]["action"] == "tick" {
                    self.command(&v["command"])
                } else {
                    self.transact(&v["command"])
                }
            }
            "query" => self.query(&v["request"]),
            "save" => {
                self.validate(&self.game, false)?;
                serde_json::to_string(&self.game)
                    .map(Value::String)
                    .map_err(|e| e.to_string())
            }
            "load" => {
                let text = v["text"].as_str().ok_or("保存データがありません。")?;
                let mut g: Game = serde_json::from_str(text).map_err(
                    |_| "この保存形式は読み込めません。旧版セーブには対応していません。",
                )?;
                if g.transport_version == 0 {
                    for c in &mut g.companies {
                        model::ensure(
                            c.technology.len() == 3 && c.tech_budget.len() == 3,
                            "旧技術データが不正です。",
                        )?;
                        c.technology = vec![
                            c.technology[0],
                            c.technology[1],
                            0.0,
                            0.0,
                            c.technology[2],
                            0.0,
                        ];
                        c.tech_budget = vec![
                            c.tech_budget[0],
                            c.tech_budget[1],
                            0.0,
                            0.0,
                            c.tech_budget[2],
                            0.0,
                        ];
                        let convert = |s: &mut String| {
                            if ["camel", "mule"].contains(&s.as_str()) {
                                *s = "caravan".into();
                            }
                        };
                        convert(&mut c.default_vehicle);
                        for s in &mut c.ships {
                            convert(&mut s.kind);
                        }
                        for r in &mut c.routes {
                            convert(&mut r.auto_type);
                            for k in &mut r.replacements {
                                convert(k);
                            }
                            // Both new handling technologies start at zero.
                            r.handling_rate = 5.0;
                            r.activity = model::Activity {
                                since: g.day,
                                ..Default::default()
                            };
                            r.epoch = g.day as f64;
                        }
                    }
                }
                self.validate(&g, true)?;
                // Rename only the known regional rivals, preserving custom and legacy names.
                if g.roster_version >= 1 {
                    for c in &mut g.companies {
                        match (c.id.as_str(), c.name.as_str()) {
                            ("company-5", "オスマン会社" | "Ottoman Company") => {
                                c.name = "オスマン商人".into();
                            }
                            ("company-7", "中国商人" | "Chinese Merchants") => {
                                c.name = "清国商人".into();
                            }
                            _ => {}
                        }
                    }
                }
                if g.city_version < 8 {
                    let old_nation_count = g.companies[0].friendship.len();
                    // Append the new market without consuming the campaign's RNG or
                    // touching existing stocks, ownership, routes, or company balances.
                    let initial = Game::new(&self.data, g.seed, g.events_enabled);
                    g.markets
                        .extend_from_slice(&initial.markets[g.markets.len()..]);
                    g.development
                        .extend_from_slice(&initial.development[g.development.len()..]);
                    g.roads.extend_from_slice(&initial.roads[g.roads.len()..]);
                    for c in &mut g.companies {
                        c.friendship.resize(self.data.nations.len(), 60.0);
                        c.diplomacy_budget.resize(self.data.nations.len(), 0.0);
                        c.trade.resize(self.data.nations.len(), 0.0);
                    }
                    // Preserve existing pair order, wars and relations; append only new pairs.
                    g.pairs.extend(initial.pairs.into_iter().filter(|p| p.b >= old_nation_count));
                    g.city_version = 8;
                }
                Self::normalize_account_history(&mut g);
                if g.cargo_time_version == 0 {
                    for c in &mut g.companies {
                        c.automation.expand = 10.0;
                        c.automation.shrink = 30.0;
                        for r in &mut c.routes {
                            r.activity = model::Activity {
                                since: g.day,
                                ..Default::default()
                            };
                            r.epoch = g.day as f64;
                        }
                    }
                    g.cargo_time_version = 1;
                }
                let refunds: Vec<_> = g
                    .companies
                    .iter()
                    .map(|c| if c.acquired { 0.0 } else { c.yard_value })
                    .collect();
                for c in &mut g.companies {
                    model::ensure(
                        model::amount(c.cash.max(0.0) + c.yard_value),
                        "旧造船所の資産が不正です。",
                    )?;
                    c.yard_value = 0.0;
                }
                g.transport_version = 1;
                let road_refunds = self.retire_roads(&mut g)?;
                self.validate(&g, false)?;
                self.game = g;
                for (c, refund, removed) in road_refunds {
                    if refund > 0.0 {
                        self.entry(c, "retiredRoadRefund", refund, None, "Retired roads".into());
                    }
                    if c == 0 && (removed > 0 || refund > 0.0) {
                        self.event("retiredRoad", format!("廃止陸路を含むルート{}件を解除し、車両を未使用に戻しました。返金 £{:.2} / Retired roads: {} route(s) removed; vehicles returned; refund £{:.2}", removed, refund, removed, refund));
                    }
                }
                for (c, refund) in refunds.into_iter().enumerate() {
                    if refund > 0.0 {
                        self.entry(c, "shipyardRefund", refund, None, String::new());
                    }
                }
                self.capture_accounts();

                Ok(json!(true))
            }
            _ => Err("Unknown operation".into()),
        }
    }
}
thread_local! {static ENGINE:RefCell<Option<Engine>>=const{RefCell::new(None)};static OUTPUT:RefCell<Vec<u8>>=const{RefCell::new(Vec::new())};}
#[unsafe(no_mangle)]
pub extern "C" fn allocate(len: usize) -> *mut u8 {
    let mut v = vec![0u8; len];
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}
/// # Safety
/// `ptr` must be a live allocation returned by allocate(len), exactly once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn execute(ptr: *mut u8, len: usize) -> *const u8 {
    let bytes = unsafe { Vec::from_raw_parts(ptr, len, len) };
    let result = serde_json::from_slice::<Value>(&bytes)
        .map_err(|e| e.to_string())
        .and_then(|v| {
            ENGINE.with(|slot| {
                let mut slot = slot.borrow_mut();
                let engine = slot.get_or_insert_with(|| {
                    let mut e = Engine::new();
                    e.initialize(1700, true);
                    e
                });
                engine.dispatch(v)
            })
        });
    let response = match result {
        Ok(value) => json!({"ok":true,"value":value}),
        Err(error) => json!({"ok":false,"error":error}),
    };
    OUTPUT.with(|o| {
        let mut out = o.borrow_mut();
        *out = serde_json::to_vec(&response).unwrap();
        out.as_ptr()
    })
}
#[unsafe(no_mangle)]
pub extern "C" fn output_len() -> usize {
    OUTPUT.with(|o| o.borrow().len())
}
