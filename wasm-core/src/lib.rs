mod commands;
mod loading;
mod model;
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
                self.validate(&self.game)?;
                serde_json::to_string(&self.game)
                    .map(Value::String)
                    .map_err(|e| e.to_string())
            }
            "load" => {
                let text = v["text"].as_str().ok_or("保存データがありません。")?;
                let g: Game = serde_json::from_str(text).map_err(
                    |_| "この保存形式は読み込めません。旧版セーブには対応していません。",
                )?;
                self.validate(&g)?;
                self.game = g;

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
