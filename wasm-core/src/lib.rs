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
                if g.city_version < 2 {
                    // Append the new market without consuming the campaign's RNG or
                    // touching existing stocks, ownership, routes, or company balances.
                    let initial = Game::new(&self.data, g.seed, g.events_enabled);
                    g.markets
                        .extend_from_slice(&initial.markets[g.markets.len()..]);
                    g.development
                        .extend_from_slice(&initial.development[g.development.len()..]);
                    g.city_version = 2;
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
                self.validate(&g, false)?;
                self.game = g;
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
