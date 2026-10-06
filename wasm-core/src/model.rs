use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

pub type Result<T> = std::result::Result<T, String>;
pub fn ensure(ok: bool, msg: &str) -> Result<()> {
    if ok { Ok(()) } else { Err(msg.into()) }
}
pub fn amount(v: f64) -> bool {
    v.is_finite() && v >= 0.0 && v <= 1e14
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Spec {
    pub id: String,
    pub name: String,
    pub name_en: Option<String>,
    pub mode: String,
    pub price: f64,
    pub capacity: usize,
    pub speed: f64,
    pub range: f64,
    pub daily: f64,
    pub guns: f64,
    #[serde(default)]
    pub roughness: f64,
    pub level: f64,
}
#[derive(Clone, Deserialize)]
pub struct City {
    pub id: String,
    pub nation: usize,
    pub inland: bool,
    pub lon: f64,
    pub lat: f64,
    pub stocks: Vec<f64>,
    pub supply: Vec<f64>,
    pub demand: Vec<f64>,
    pub modifiers: Vec<f64>,
    pub seasons: Vec<f64>,
}
#[derive(Clone, Deserialize)]
pub struct Nation {
    pub id: String,
    pub fee: f64,
    pub daily: f64,
    #[serde(rename = "tradePort")]
    pub trade_port: String,
}
#[derive(Clone, Deserialize)]
pub struct Good {
    pub id: String,
    pub base: f64,
}
#[derive(Clone, Deserialize)]
pub struct Road {
    pub id: String,
    #[serde(default)]
    pub retired: bool,
    #[serde(default)]
    pub retired_since: u32,
    pub a: usize,
    pub b: usize,
    pub km: f64,
    pub penalty: f64,
    pub terrain: String,
    pub climate: Option<String>,
    pub safety: f64,
    pub nations: Vec<usize>,
}
#[derive(Clone, Deserialize)]
pub struct Start {
    pub name: String,
    pub kind: String,
    pub id: String,
    pub capital: f64,
    pub licenses: Vec<usize>,
    pub routes: Vec<StartRoute>,
}
#[derive(Clone, Deserialize)]
pub struct StartRoute {
    pub kind: String,
    pub stops: Vec<usize>,
    pub fleet: usize,
}
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Data {
    pub cities: Vec<City>,
    pub nations: Vec<Nation>,
    pub goods: Vec<Good>,
    pub roads: Vec<Road>,
    pub specs: Vec<Spec>,
    pub starts: Vec<Start>,
    pub ship_names: Vec<String>,
    pub distances: Vec<Vec<Option<f64>>>,
}
pub struct Engine {
    pub data: Data,
    pub graphics: Value,
    pub game: Game,
}

#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Market {
    pub stock: f64,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Development {
    pub owner: String,
    pub basis: f64,
    pub size: f64,
    pub production: Vec<f64>,
    pub size_budget: f64,
    pub production_budget: Vec<f64>,
    pub pool: f64,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct RoadState {
    pub owner: String,
    pub basis: f64,
    pub quality: f64,
    pub security: f64,
    pub road_budget: f64,
    pub security_budget: f64,
    pub pool: f64,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Pair {
    pub a: usize,
    pub b: usize,
    pub base: f64,
    pub relation: f64,
    pub until: Option<u32>,
    pub cooldown: u32,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Event {
    pub day: u32,
    pub kind: String,
    pub message: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Ledger {
    pub day: u32,
    pub category: String,
    pub amount: f64,
    pub route: Option<u32>,
    pub detail: String,
}
pub fn default_ship() -> String {
    "sloop".into()
}
pub fn default_vehicle() -> String {
    "wagon".into()
}
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct AccountPeriod {
    pub income: BTreeMap<String, f64>,
    pub expense: BTreeMap<String, f64>,
    pub assets: f64,
    pub as_of: u32,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Accounts {
    pub since: u32,
    pub months: BTreeMap<u32, AccountPeriod>,
    // Missing in older saves: build years from their complete monthly history once.
    #[serde(default)]
    pub years: Option<BTreeMap<u32, AccountPeriod>>,
}
pub const MONTHS_RETAINED: u32 = 120;
pub const YEARS_RETAINED: u32 = 300;
pub const LEDGER_RETAINED: usize = 200;
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Transport {
    pub since: u32,
    pub sales: f64,
    pub costs: f64,
    pub upkeep: f64,
    pub deliveries: u32,
}
impl Transport {
    pub fn margin(&self) -> Option<f64> {
        let e = self.costs + self.upkeep;
        if e > 0.0 {
            Some((self.sales - e) / e * 100.0)
        } else {
            None
        }
    }
}
#[derive(Clone, Serialize, Deserialize, Default)]
pub struct Activity {
    pub since: u32,
    pub moving: f64,
    pub loading: f64,
    pub unloading: f64,
    pub waiting: f64,
}
impl Activity {
    pub fn total(&self) -> f64 {
        self.moving + self.loading + self.unloading + self.waiting
    }
    pub fn idle_ratio(&self) -> Option<f64> {
        (self.total() > 0.0).then(|| self.waiting / self.total() * 100.0)
    }
}
pub const HANDLING_PER_DAY: f64 = 5.0;
pub fn legacy_handling_rate() -> f64 {
    10.0
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Route {
    pub id: u32,
    pub stops: Vec<usize>,
    pub mode: String,
    pub allowed: Vec<usize>,
    pub min_margin: f64,
    pub active: bool,
    pub epoch: f64,
    #[serde(default = "legacy_handling_rate")]
    pub handling_rate: f64,
    pub auto_manage: bool,
    pub auto_type: String,
    pub cooldown: u32,
    pub escorts: u32,
    pub profit: f64,
    pub revenue: f64,
    pub expenses: f64,
    pub started: u32,
    pub deliveries: u32,
    pub transport: Transport,
    #[serde(default)]
    pub activity: Activity,
    pub forecast: f64,
    pub actual: Option<f64>,
    pub replacements: Vec<String>,
    pub cargo_loss: f64,
    pub ship_loss: f64,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Cargo {
    pub good: usize,
    pub quantity: usize,
    pub cost: f64,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Voyage {
    pub from: usize,
    pub to: usize,
    pub total: f64,
    pub remaining: f64,
    pub original_cost: f64,
    pub upkeep: f64,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Handling {
    #[serde(default = "legacy_handling_rate")]
    pub rate: f64,
    pub unloading: bool,
    pub total: f64,
    pub remaining: f64,
    pub trip: Voyage,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Ship {
    pub id: u32,
    pub name: String,
    pub kind: String,
    pub route: Option<u32>,
    pub next: usize,
    pub ready: u32,
    pub voyage: Option<Voyage>,
    #[serde(default)]
    pub handling: Option<Handling>,
    pub cargo: Vec<Cargo>,
    pub voyages: u32,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Automation {
    pub enabled: bool,
    pub replace_lost: bool,
    pub budget: f64,
    pub reserve: f64,
    pub expand: f64,
    pub shrink: f64,
    pub spent: f64,
    pub month: u32,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct FriendshipChange {
    pub day: u32,
    pub nation: usize,
    pub before: f64,
    pub after: f64,
    pub delta: f64,
    pub trade: f64,
    pub enemy_trade: f64,
    pub investment: f64,
    pub initial: f64,
    pub limit: f64,
    pub spent: f64,
    pub unfunded: bool,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Company {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub cash: f64,
    pub initial_cash: f64,
    pub licenses: Vec<usize>,
    pub friendship: Vec<f64>,
    #[serde(default)]
    pub friendship_history: Vec<FriendshipChange>,
    pub diplomacy_budget: Vec<f64>,
    pub trade: Vec<f64>,
    pub first_license: bool,
    pub ships: Vec<Ship>,
    #[serde(default = "default_ship")]
    pub default_ship: String,
    #[serde(default = "default_vehicle")]
    pub default_vehicle: String,
    #[serde(default)]
    pub accounts: Option<Accounts>,
    pub routes: Vec<Route>,
    pub technology: Vec<f64>,
    pub tech_budget: Vec<f64>,
    #[serde(default, skip_serializing)]
    pub yard_value: f64,
    pub designs: Vec<String>,
    pub automation: Automation,
    pub ledger: Vec<Ledger>,
    pub totals: BTreeMap<String, f64>,
    pub history: Vec<[f64; 3]>,
    pub bankrupt: bool,
    pub acquired: bool,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Game {
    pub format: String,
    pub version: u32,
    #[serde(default)]
    pub cargo_time_version: u32,
    #[serde(default)]
    pub transport_version: u32,
    #[serde(default)]
    pub roster_version: u32,
    #[serde(default)]
    pub city_version: u32,
    pub seed: u32,
    pub rng: u32,
    pub day: u32,
    #[serde(default)]
    pub fraction: f64,
    pub next_id: u32,
    pub events_enabled: bool,
    pub markets: Vec<Market>,
    pub development: Vec<Development>,
    pub roads: Vec<RoadState>,
    pub pairs: Vec<Pair>,
    pub designs: BTreeMap<String, Spec>,
    pub companies: Vec<Company>,
    pub events: Vec<Event>,
    pub first_rank: Option<u32>,
}

impl Engine {
    pub fn calendar(&self) -> (u32, u32, u32, u32) {
        Self::calendar_at(self.game.day)
    }
    pub fn calendar_at(day: u32) -> (u32, u32, u32, u32) {
        fn before(y: u32) -> u32 {
            let n = y - 1;
            365 * n + n / 4 - n / 100 + n / 400
        }
        let absolute = before(1700) + day;
        let mut year = 1700 + (day as f64 / 365.2425) as u32;
        while before(year + 1) <= absolute {
            year += 1;
        }
        while before(year) > absolute {
            year -= 1;
        }
        let ordinal = absolute - before(year);
        let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
        let months = [
            31,
            if leap { 29 } else { 28 },
            31,
            30,
            31,
            30,
            31,
            31,
            30,
            31,
            30,
            31,
        ];
        let mut date = ordinal;
        let mut month = 0;
        while date >= months[month] {
            date -= months[month];
            month += 1;
        }
        (
            (year - 1700) * 12 + month as u32,
            date + 1,
            ordinal,
            if leap { 366 } else { 365 },
        )
    }
    pub fn new() -> Self {
        let raw: Value = serde_json::from_str(include_str!("../data/world.json")).unwrap();
        let data: Data = serde_json::from_value(raw.clone()).unwrap();
        let game = Game::new(&data, 1700, true);
        Self {
            data,
            graphics: raw,
            game,
        }
    }
    pub fn spec(&self, kind: &str) -> Result<&Spec> {
        self.data
            .specs
            .iter()
            .find(|s| s.id == kind)
            .or_else(|| self.game.designs.get(kind))
            .ok_or("船種が不正です。".into())
    }
    pub fn road(&self, a: usize, b: usize) -> Option<usize> {
        self.data
            .roads
            .iter()
            .position(|r| !r.retired && ((r.a == a && r.b == b) || (r.a == b && r.b == a)))
    }
    pub fn distance(&self, kind: &str, a: usize, b: usize) -> f64 {
        if self.spec(kind).is_ok_and(|s| s.mode == "land") {
            self.road(a, b)
                .map(|i| self.data.roads[i].km)
                .unwrap_or(f64::INFINITY)
        } else {
            self.data
                .distances
                .get(a)
                .and_then(|x| x.get(b))
                .copied()
                .flatten()
                .unwrap_or(f64::INFINITY)
        }
    }
    pub fn terms(&self, c: usize, n: usize, count: usize) -> (f64, f64, f64) {
        let f = self.game.companies[c].friendship[n];
        let factor = 1.0 + (60.0 - f) / 100.0;
        let base = &self.data.nations[n];
        (
            base.fee * 3_f64.powi(count as i32) * factor,
            base.daily * 10.0 * factor,
            (15.0 - f * 0.1) / 100.0,
        )
    }
    pub fn daily(&self, c: usize, kind: &str) -> f64 {
        let s = self.spec(kind).unwrap();
        let level = self.game.companies[c].technology[if s.mode == "land" { 4 } else { 1 }];
        s.daily * (1.0 - if s.mode == "land" { 0.35 } else { 0.25 } * level / (50.0 + level))
    }
    pub fn handling_rate(&self, c: usize, mode: &str) -> f64 {
        let level = self.game.companies[c].technology[if mode == "land" { 5 } else { 2 }];
        HANDLING_PER_DAY * (1.0 + (level / 25.0).ln_1p())
    }
    pub fn road_passability(&self, i: usize) -> f64 {
        let base = self.data.roads[i].penalty.clamp(0.1, 1.0);
        let quality = self.game.roads[i].quality;
        base + (1.0 - base) * quality / (5.0 + quality)
    }
    pub fn days(&self, kind: &str, a: usize, b: usize) -> u32 {
        let s = self.spec(kind).unwrap();
        let mut speed = s.speed;
        if s.mode == "land" {
            let Some(i) = self.road(a, b) else {
                return u32::MAX;
            };
            speed *= self.road_passability(i) + (1.0 - self.road_passability(i)) * s.roughness;
        }
        (self.distance(kind, a, b) / speed).ceil().max(1.0) as u32
    }
    pub fn can_serve(&self, kind: &str, stops: &[usize]) -> bool {
        self.spec(kind).is_ok_and(|s| {
            stops.len() >= 2
                && stops.iter().enumerate().all(|(i, &a)| {
                    a < self.data.cities.len()
                        && self.distance(kind, a, stops[(i + 1) % stops.len()]) <= s.range
                })
        })
    }
    pub fn nations_for(&self, kind: &str, stops: &[usize]) -> Vec<usize> {
        let mut n: Vec<usize> = stops.iter().map(|&a| self.data.cities[a].nation).collect();
        if self.spec(kind).unwrap().mode == "land" {
            for (i, &a) in stops.iter().enumerate() {
                if let Some(j) = self.road(a, stops[(i + 1) % stops.len()]) {
                    n.extend(&self.data.roads[j].nations);
                }
            }
        }
        n.sort();
        n.dedup();
        n
    }
    pub fn entry(
        &mut self,
        c: usize,
        category: &str,
        value: f64,
        route: Option<u32>,
        detail: String,
    ) {
        if c == 0 {
            self.record_account(category, value);
        }
        let co = &mut self.game.companies[c];
        co.cash += value;
        *co.totals.entry(category.into()).or_default() += value;
        co.ledger.push(Ledger {
            day: self.game.day,
            category: category.into(),
            amount: value,
            route,
            detail,
        });
        if co.ledger.len() > LEDGER_RETAINED {
            co.ledger.remove(0);
        }
        if let Some(r) = co.routes.iter_mut().find(|r| Some(r.id) == route) {
            r.profit += value;
            if value >= 0.0 {
                r.revenue += value
            } else {
                r.expenses -= value
            }
        }
        co.bankrupt = co.cash < -1e-7;
        if co.cash < 0.0 && co.cash > -1e-7 {
            co.cash = 0.0;
        }
    }
    pub fn event(&mut self, kind: &str, message: String) {
        self.game.events.push(Event {
            day: self.game.day,
            kind: kind.into(),
            message,
        });
        if self.game.events.len() > 100 {
            self.game.events.remove(0);
        }
    }
    pub fn next_id(&mut self) -> u32 {
        let id = self.game.next_id;
        self.game.next_id += 1;
        id
    }
    pub fn random(&mut self) -> f64 {
        self.game.rng = self.game.rng.wrapping_mul(1664525).wrapping_add(1013904223);
        self.game.rng as f64 / 4294967296.0
    }
    pub fn assets(&self, c: usize) -> f64 {
        let co = &self.game.companies[c];
        co.cash
            + co.yard_value
            + co.ships
                .iter()
                .map(|s| {
                    self.spec(&s.kind).unwrap().price + s.cargo.iter().map(|x| x.cost).sum::<f64>()
                })
                .sum::<f64>()
            + self
                .game
                .development
                .iter()
                .filter(|x| x.owner == co.id)
                .map(|x| x.basis)
                .sum::<f64>()
            + self
                .game
                .roads
                .iter()
                .filter(|x| x.owner == co.id)
                .map(|x| x.basis + x.pool)
                .sum::<f64>()
    }
    pub fn playable(&self, c: usize) -> Result<()> {
        ensure(
            !self.game.companies[c].bankrupt && !self.game.companies[c].acquired,
            "破産または買収済みの会社は操作できません。",
        )
    }
    pub fn affordable(&self, c: usize, cost: f64) -> Result<()> {
        ensure(
            cost.is_finite() && self.game.companies[c].cash >= cost,
            "資金が不足しています。",
        )
    }
}
impl Game {
    pub fn new(d: &Data, seed: u32, events_enabled: bool) -> Self {
        let mut rng = seed;
        let markets = d
            .cities
            .iter()
            .flat_map(|c| {
                c.stocks
                    .iter()
                    .map(|&stock| {
                        rng = rng.wrapping_mul(1664525).wrapping_add(1013904223);
                        Market {
                            stock: stock * (0.98 + rng as f64 / 4294967296.0 * 0.04),
                        }
                    })
                    .collect::<Vec<_>>()
            })
            .collect();
        let mut companies = vec![Company::new(
            "player",
            "あなたの会社",
            "player",
            5000.0,
            d.nations.len(),
            true,
        )];
        for c in &d.starts {
            let mut co = Company::new(&c.id, &c.name, &c.kind, c.capital, d.nations.len(), false);
            co.licenses = c.licenses.clone();
            // Starting licenses are granted; only the home country starts at 100.
            if let Some(&n) = co.licenses.first() {
                co.friendship[n] = 100.0;
            }
            companies.push(co);
        }
        let mut pairs = vec![];
        for a in 0..d.nations.len() {
            for b in a + 1..d.nations.len() {
                let x = d.nations[a].id.as_str();
                let y = d.nations[b].id.as_str();
                let rival = [
                    ("england", "france"),
                    ("england", "spain"),
                    ("netherlands", "france"),
                    ("netherlands", "spain"),
                ]
                .iter()
                .any(|&(u, v)| (x == u && y == v) || (x == v && y == u));
                let base = if rival { 25.0 } else { 65.0 };
                pairs.push(Pair {
                    a,
                    b,
                    base,
                    relation: base,
                    until: None,
                    cooldown: 365,
                });
            }
        }
        Self {
            format: "sails-flags-wasm".into(),
            version: 1,
            cargo_time_version: 1,
            transport_version: 1,
            roster_version: 5,
            city_version: 12,
            seed,
            rng,
            day: 0,
            fraction: 0.0,
            next_id: 1,
            events_enabled,
            markets,
            development: d
                .cities
                .iter()
                .map(|c| Development {
                    owner: if ["havana", "nantes"].contains(&c.id.as_str()) {
                        "private"
                    } else {
                        "state"
                    }
                    .into(),
                    basis: 0.0,
                    size: 0.0,
                    production: vec![0.0; d.goods.len()],
                    size_budget: 0.0,
                    production_budget: vec![0.0; d.goods.len()],
                    pool: 0.0,
                })
                .collect(),
            roads: d
                .roads
                .iter()
                .map(|r| RoadState {
                    owner: if r.id == "nantes_paris" {
                        "private"
                    } else {
                        "state"
                    }
                    .into(),
                    basis: 0.0,
                    quality: 0.0,
                    security: 0.0,
                    road_budget: 0.0,
                    security_budget: 0.0,
                    pool: 0.0,
                })
                .collect(),
            pairs,
            designs: BTreeMap::new(),
            companies,
            events: vec![],
            first_rank: None,
        }
    }
}
impl Company {
    fn new(id: &str, name: &str, kind: &str, cash: f64, n: usize, first_license: bool) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            kind: kind.into(),
            cash,
            initial_cash: cash,
            licenses: vec![],
            friendship: vec![60.0; n],
            friendship_history: vec![],
            diplomacy_budget: vec![0.0; n],
            trade: vec![0.0; n],
            first_license,
            ships: vec![],
            default_ship: default_ship(),
            default_vehicle: default_vehicle(),
            accounts: None,
            routes: vec![],
            technology: vec![0.0; 6],
            tech_budget: vec![0.0; 6],
            yard_value: 0.0,
            designs: vec![],
            automation: Automation {
                enabled: false,
                replace_lost: false,
                budget: 0.0,
                reserve: 1000.0,
                expand: 10.0,
                shrink: 30.0,
                spent: 0.0,
                month: 0,
            },
            ledger: vec![],
            totals: BTreeMap::new(),
            history: vec![],
            bankrupt: false,
            acquired: false,
        }
    }
}
