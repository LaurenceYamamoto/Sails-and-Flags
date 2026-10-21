//! Disjoint simulation kernels. Workers calculate; the coordinator commits in
//! stable company/vessel order. No worker owns authoritative money or RNG.
use crate::load_batch::LoadRequest;
use crate::loading::{LoadInput, LoadPlan};
use crate::model::*;
use crate::parallel::{Stage, Work};
use crate::trade::integrated;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[cfg(test)]
mod warehouse_tests {
    use super::*;
    fn fixture() -> (Engine,Vec<VesselDay>,usize,usize) {
        let mut e=Engine::new_planner();
        let a=e.data.cities.iter().position(|c|c.id=="london").unwrap();
        let b=e.data.cities.iter().position(|c|c.id=="nantes").unwrap();
        e.game.companies[0].cash=1e8;
        e.game.companies[0].licenses=(0..e.data.nations.len()).collect();
        for city in [a,b] {
            let mut p=crate::posts::TradingPost::new(e.data.goods.len());p.warehouse=2;
            p.stock.push(crate::posts::StoredCargo{good:0,quantity:if city==a{70}else{120},cost:500.0,from:None});
            e.game.companies[0].posts.insert(city,p);
        }
        e.open(0,"sloop",vec![a,b],vec![0],0.0).unwrap();
        let template=e.game.companies[0].ships[0].clone();
        e.game.companies[0].ships.clear();
        // Voyage, loading, unloading, direct sale, no reservation and zero cap.
        for (i,(to,units,cap,mode,direct)) in [(a,40,None,0,false),(a,30,Some(10),1,false),
            (b,60,None,2,false),(b,40,None,0,true),(a,14,None,3,false),(a,15,Some(0),0,false)].into_iter().enumerate() {
            let mut s=template.clone();s.id=i as u32+10;
            s.cargo=vec![Cargo{good:0,quantity:units,cost:units as f64*10.0}];
            let trip=Voyage{from:if to==a{b}else{a},to,total:10.0,remaining:5.0,original_cost:100.0,upkeep:0.0,direct_sale:direct,warehouse_units:cap};
            match mode {
                0=>s.voyage=Some(trip),
                1|2=>s.handling=Some(Handling{trip,unloading:mode==2,rate:5.0,total:6.0,remaining:3.0}),
                _=>{}
            }
            e.game.companies[0].ships.push(s);
        }
        let policy=&mut e.game.companies[0].facility_policy;
        policy.warehouse_up.enabled=true;policy.warehouse_up.days=1;policy.warehouse_up.percent=95.0;
        policy.warehouse_down.enabled=true;policy.warehouse_down.days=1;policy.warehouse_down.percent=90.0;
        let vessels=(0..6).map(|i|VesselDay{c:0,i,ri:0,left:1.0,cycle:20.0,schedule:0,phase:0.0,daily:1.0,lost:i==5}).collect();
        (e,vessels,a,b)
    }
    #[test]
    fn warehouse_batch_matches_repeated_checks_and_preserves_first_visit_order() {
        let (mut e,ships,a,b)=fixture();
        let totals=e.reserved_stocks(0);
        assert_eq!((totals[a],totals[b]),(50,60));
        for city in 0..e.data.cities.len(){assert_eq!(totals[city],e.reserved_stock(0,city));}
        // Exercise both visitation orders, including stock liquidation and
        // capping in-flight reservations. Compare every game field and ledger.
        for stops in [vec![a,b],vec![b,a]] {
            e.game.companies[0].routes[0].stops=stops;
            let before=e.game.clone();
            for v in &ships {for city in e.game.companies[v.c].routes[v.ri].stops.clone(){e.facility_immediate(v.c,city,0);}}
            let expected=serde_json::to_string(&e.game).unwrap();
            e.game=before.clone();e.fleet_warehouse_checks(ships.iter());
            assert_eq!(serde_json::to_string(&e.game).unwrap(),expected);
            assert_eq!(e.game.companies[0].posts[&a].warehouse,1);
            assert_eq!(e.game.companies[0].posts[&b].quantity(),100);
            assert_eq!((e.reserved_stock(0,a),e.reserved_stock(0,b)),(30,0));
            let once=serde_json::to_string(&e.game).unwrap();e.fleet_warehouse_checks(ships.iter());
            assert_eq!(serde_json::to_string(&e.game).unwrap(),once);
            e.game=before;
        }
    }
    #[test]
    fn warehouse_snapshot_is_rebuilt_after_reservations_change_between_phases() {
        let (mut e,ships,a,_)=fixture();
        e.game.companies[0].facility_policy.warehouse_down.enabled=false;
        e.fleet_warehouse_checks(ships.iter());
        assert!(!e.game.companies[0].posts[&a].monitoring[0].expansion_pending);
        e.game.companies[0].ships[0].cargo[0].quantity=120;
        e.fleet_warehouse_checks(ships.iter());
        assert!(e.game.companies[0].posts[&a].monitoring[0].expansion_pending);
        // A removed trip releases its reservation immediately, as does loss
        // of cargo. Neither survives into a later read-only batch.
        e.game.companies[0].ships[0].voyage=None;
        e.game.companies[0].ships[1].cargo.clear();
        assert_eq!(e.reserved_stocks(0)[a],0);
    }
}

pub(crate) struct FleetDay {
    pub ships: Vec<VesselDay>,
    pub buyers: Vec<usize>,
    // One offset array per route, instead of one heap allocation per vessel.
    pub schedules: Vec<Vec<f64>>,
}
pub(crate) struct VesselDay {
    c: usize,
    i: usize,
    ri: usize,
    left: f64,
    cycle: f64,
    schedule: usize,
    phase: f64,
    daily: f64,
    lost: bool,
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Motion {
    pub key: usize,
    mode: u8,
    left: f64,
    remaining: f64,
    now: f64,
    ready: f64,
    first: f64,
    cycle: f64,
    blocked: bool,
    risks: [f64; 4],
}
#[derive(Clone, Serialize, Deserialize, PartialEq)]
pub(crate) struct Moved {
    key: usize,
    mode: u8,
    elapsed: f64,
    remaining: f64,
    left: f64,
    risks: [f64; 4],
}
impl Motion {
    pub fn evaluate(&self) -> Moved {
        let elapsed = if self.mode == 0 {
            if self.blocked {
                self.left
            } else {
                let earliest = self.now.max(self.ready);
                let next = self.first
                    + ((earliest - self.first - 1e-9) / self.cycle)
                        .ceil()
                        .max(0.0)
                        * self.cycle;
                (next - self.now).max(0.0).min(self.left)
            }
        } else {
            self.left.min(self.remaining)
        };
        Moved {
            key: self.key,
            mode: self.mode,
            elapsed,
            remaining: (self.remaining - elapsed).max(0.0),
            left: (self.left - elapsed).max(0.0),
            risks: [
                1.0 - (1.0 - self.risks[0]).powf(elapsed),
                1.0 - (1.0 - self.risks[1]).powf(elapsed),
                self.risks[2],
                self.risks[3],
            ],
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Fill {
    pub good: usize,
    pub quantity: usize,
    pub gross: f64,
    pub fee: f64,
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Sale {
    key: usize,
    tax: f64,
    lots: Vec<(usize, usize)>,
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Purchase {
    key: usize,
    company: usize,
    to: usize,
    input: LoadInput,
    reverse: LoadInput,
}
#[derive(Clone, Serialize, Deserialize)]
struct PostOrder {
    company: usize,
    tax: f64,
    budget: f64,
    room: usize,
    limit: usize,
    rules: Vec<crate::posts::PriceRule>,
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct CityJob {
    city: usize,
    stock: Vec<f64>,
    bases: Vec<f64>,
    sales: Vec<Sale>,
    buys: Vec<Purchase>,
    warehouses: BTreeMap<usize, Vec<crate::posts::StoredCargo>>,
    posts: Vec<PostOrder>,
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct CityResult {
    city: usize,
    sales: Vec<(usize, Vec<Fill>)>,
    buys: Vec<(usize, LoadPlan, bool, Vec<Fill>)>,
    posts: Vec<(usize, Vec<(bool, Fill)>, Vec<crate::posts::StoredCargo>)>,
}
impl CityJob {
    pub fn weight(&self) -> usize {
        self.sales.iter().map(|s| s.lots.len()).sum::<usize>()
            + self
                .buys
                .iter()
                .map(|b| b.input.goods.len() + b.reverse.goods.len())
                .sum::<usize>()
            + self.posts.iter().map(|p| p.rules.len()).sum::<usize>()
    }
    pub fn evaluate(&self) -> CityResult {
        let mut stock = self.stock.clone();
        let mut warehouses = self.warehouses.clone();
        let mut sales = vec![];
        let mut buys = vec![];
        let mut posts = vec![];
        for order in &self.posts {
            let lots = warehouses.get_mut(&order.company).unwrap();
            let mut cash = order.budget;
            let mut room = order.room;
            let mut fills = vec![];
            for (g, rule) in order.rules.iter().enumerate() {
                if rule.sell {
                    let available = lots
                        .iter()
                        .filter(|s| s.good == g)
                        .map(|s| s.quantity)
                        .sum();
                    let q = crate::posts::price_quantity(available, |q| {
                        crate::trade::ratio(stock[g] + q as f64) >= 1.0 + rule.sell_above / 100.0
                    });
                    if q > 0 {
                        let gross = integrated(self.bases[g], stock[g], stock[g] + q as f64);
                        let fee = gross * order.tax;
                        stock[g] += q as f64;
                        cash += gross - fee;
                        let mut left = q;
                        for lot in lots.iter_mut().filter(|s| s.good == g) {
                            let n = left.min(lot.quantity);
                            let value = cargo_basis(lot.cost, lot.quantity, n);
                            lot.cost -= value;
                            lot.quantity -= n;
                            left -= n;
                            if left == 0 {
                                break;
                            }
                        }
                        room = order.limit.saturating_sub(lots.iter().map(|s|s.quantity).sum());
                        fills.push((
                            false,
                            Fill {
                                good: g,
                                quantity: q,
                                gross,
                                fee,
                            },
                        ));
                    }
                }
                if rule.buy {
                    let q =
                        crate::posts::price_quantity(room.min(stock[g].floor() as usize), |q| {
                            crate::trade::ratio(stock[g] - q as f64) <= 1.0 - rule.buy_below / 100.0
                                && integrated(self.bases[g], stock[g] - q as f64, stock[g])
                                    * (1.0 + order.tax)
                                    <= cash
                        });
                    if q > 0 {
                        let gross = integrated(self.bases[g], stock[g] - q as f64, stock[g]);
                        let fee = gross * order.tax;
                        stock[g] -= q as f64;
                        cash -= gross + fee;
                        room -= q;
                        if let Some(lot) = lots.iter_mut().find(|s| s.good == g && s.from.is_none())
                        {
                            lot.quantity += q;
                            lot.cost += gross + fee;
                        } else {
                            lots.push(crate::posts::StoredCargo {
                                good: g,
                                quantity: q,
                                cost: gross + fee,
                                from: None,
                            });
                        }
                        fills.push((
                            true,
                            Fill {
                                good: g,
                                quantity: q,
                                gross,
                                fee,
                            },
                        ));
                    }
                }
            }
            lots.retain(|s| s.quantity > 0);
            posts.push((order.company, fills, lots.clone()));
        }
        for order in &self.sales {
            let mut fills = vec![];
            for &(good, quantity) in &order.lots {
                let gross =
                    integrated(self.bases[good], stock[good], stock[good] + quantity as f64);
                stock[good] += quantity as f64;
                fills.push(Fill {
                    good,
                    quantity,
                    gross,
                    fee: gross * order.tax,
                });
            }
            sales.push((order.key, fills));
        }
        for order in &self.buys {
            let mut input = order.input.clone();
            for g in &mut input.goods {
                g.source = stock[g.good];
                if input.stored {
                    let lots = &warehouses[&order.company];
                    g.basis = lots
                        .iter()
                        .filter(|l| l.good == g.good && l.from != Some(order.to))
                        .map(|l| (l.quantity, l.cost))
                        .collect();
                    g.available = g.basis.iter().map(|l| l.0).sum();
                } else {
                    g.available = stock[g.good].floor() as usize;
                }
            }
            // Refresh priorities after earlier orders consumed this city's stock.
            input
                .goods
                .sort_by(|a, b| b.source.total_cmp(&a.source).then(a.good.cmp(&b.good)));
            let plan = input.evaluate();
            let reposition = plan.lots.is_empty() && !order.reverse.evaluate().lots.is_empty();
            let mut fills = vec![];
            for &(good, quantity) in &plan.lots {
                if input.stored {
                    let mut left = quantity;
                    for lot in warehouses.get_mut(&order.company).unwrap() {
                        if lot.good != good || lot.from == Some(order.to) {
                            continue;
                        }
                        let n = left.min(lot.quantity);
                        let cost = cargo_basis(lot.cost, lot.quantity, n);
                        lot.quantity -= n;
                        lot.cost -= cost;
                        left -= n;
                        if left == 0 {
                            break;
                        }
                    }
                } else {
                    let gross =
                        integrated(self.bases[good], stock[good] - quantity as f64, stock[good]);
                    stock[good] -= quantity as f64;
                    fills.push(Fill {
                        good,
                        quantity,
                        gross,
                        fee: gross * input.source_tax,
                    });
                }
            }
            buys.push((order.key, plan, reposition, fills));
        }
        CityResult {
            city: self.city,
            sales,
            buys,
            posts,
        }
    }
    fn accepts(&self, r: &CityResult) -> bool {
        // Untrusted/missing worker output cannot partially mutate the simulation.
        r.city == self.city
            && r.sales.len() == self.sales.len()
            && r.buys.len() == self.buys.len()
            && r.posts.len() == self.posts.len()
            && r.posts
                .iter()
                .zip(&self.posts)
                .all(|((c, fills, lots), p)| {
                    *c == p.company
                        && fills.iter().all(|(_, f)| {
                            f.good < self.stock.len() && amount(f.gross) && amount(f.fee)
                        })
                        && lots
                            .iter()
                            .all(|s| s.good < self.stock.len() && amount(s.cost) && s.quantity > 0)
                })
            && r.sales.iter().zip(&self.sales).all(|((key, fills), s)| {
                *key == s.key
                    && fills.len() == s.lots.len()
                    && fills.iter().zip(&s.lots).all(|(f, &(g, q))| {
                        f.good == g && f.quantity == q && amount(f.gross) && amount(f.fee)
                    })
            })
            && r.buys
                .iter()
                .zip(&self.buys)
                .all(|((key, p, reposition, fills), b)| {
                    *key == b.key
                        && amount(p.cost)
                        && amount(p.sale)
                        && (b.input.stored || p.cost <= b.input.budget + 1e-7)
                        && p.lots.iter().map(|l| l.1 as u128).sum::<u128>() <= b.input.room as u128
                        && p.lots.iter().enumerate().all(|(i, &(g, q))| {
                            q > 0
                                && b.input.goods.iter().any(|v| v.good == g)
                                && !p.lots[..i].iter().any(|v| v.0 == g)
                        })
                        && (!*reposition || p.lots.is_empty())
                        && if b.input.stored {
                            fills.is_empty()
                        } else {
                            fills.len() == p.lots.len()
                                && fills.iter().zip(&p.lots).all(|(f, &(g, q))| {
                                    f.good == g
                                        && f.quantity == q
                                        && amount(f.gross)
                                        && amount(f.fee)
                                })
                        }
                })
    }
}
pub(crate) struct Delivery {
    key: usize,
    trip: Voyage,
    stored: f64,
    sold: f64,
}
pub(crate) struct BuyContext {
    key: usize,
    request: LoadRequest,
}

impl Engine {
    pub(crate) fn start_fleet_day(&mut self) -> Stage {
        let fleets = std::mem::take(&mut self.day_fleets);
        let mut ships = vec![];
        let mut route_offsets = vec![];
        for (c, schedules) in fleets {
            let mut schedules: BTreeMap<_, _> = schedules
                .into_iter()
                .map(|(id, cycle, offsets)| (id, (cycle, offsets)))
                .collect();
            let co = &self.game.companies[c];
            if co.bankrupt {
                continue;
            }
            let mut members: BTreeMap<u32, Vec<usize>> = BTreeMap::new();
            for (i, s) in co.ships.iter().enumerate() {
                if let Some(id) = s.route {
                    members.entry(id).or_default().push(i);
                }
            }
            for (ri, r) in co.routes.iter().enumerate() {
                let Some(fleet) = members.get(&r.id) else {
                    continue;
                };
                let (cycle, offsets) = schedules.remove(&r.id).unwrap();
                let schedule = route_offsets.len();
                route_offsets.push(offsets);
                for (phase, &i) in fleet.iter().enumerate() {
                    ships.push(VesselDay {
                        c,
                        i,
                        ri,
                        left: 1.0,
                        cycle,
                        schedule,
                        phase: phase as f64 * cycle / fleet.len() as f64,
                        daily: self.daily(c, &co.ships[i].kind),
                        lost: false,
                    });
                }
            }
        }
        // Company/vessel keys are unique, so unstable sorting preserves the
        // same canonical order without allocating a merge buffer.
        ships.sort_unstable_by_key(|s| (s.c, s.i));
        Stage::Motion(FleetDay {
            ships,
            buyers: vec![],
            schedules: route_offsets,
        })
    }
    pub(crate) fn motion_work(&self, day: FleetDay) -> Work {
        let mut hazards = BTreeMap::new();
        let requests = day
            .ships
            .iter()
            .enumerate()
            .filter_map(|(key, v)| {
                let co = &self.game.companies[v.c];
                if v.left <= 1e-9 || v.lost || co.bankrupt {
                    return None;
                }
                let s = &co.ships[v.i];
                let r = &co.routes[v.ri];
                let (mode, remaining) = if let Some(h) = &s.handling {
                    (1, h.remaining)
                } else if let Some(t) = &s.voyage {
                    (2, t.remaining)
                } else {
                    (0, 0.0)
                };
                let risks = if let Some(t) = &s.voyage {
                    *hazards
                        .entry((v.c, r.id, s.kind.as_str(), t.from, t.to))
                        .or_insert_with(|| {
                            let (chance, fraction, sink) = self.risk(v.c, r, &s.kind, t.from, t.to);
                            [
                                if self.game.events_enabled {
                                    self.disaster_chance(v.c, &s.kind, t.from, t.to)
                                } else {
                                    0.0
                                },
                                chance,
                                fraction,
                                sink,
                            ]
                        })
                } else {
                    [0.0; 4]
                };
                Some(Motion {
                    key,
                    mode,
                    remaining,
                    risks,
                    left: v.left,
                    now: self.game.day as f64 - v.left,
                    ready: s.ready as f64,
                    first: r.epoch + v.phase + day.schedules[v.schedule][s.next],
                    cycle: v.cycle,
                    blocked: !r.active
                        || s.ready >= self.game.day
                        || (v.c == 0 && mode == 0 && self.maintenance_target(s).is_some()),
                })
            })
            .collect();
        Work::Movement { day, requests }
    }
    pub(crate) fn finish_motion(
        &mut self,
        mut day: FleetDay,
        requests: Vec<Motion>,
        result: Option<Value>,
    ) -> Stage {
        let rows = result
            .and_then(|r| serde_json::from_value::<Vec<Moved>>(r).ok())
            .filter(|rows| {
                rows.len() == requests.len()
                    && rows.iter().zip(&requests).all(|(r, q)| {
                        r.key == q.key
                            && r.mode == q.mode
                            && amount(r.elapsed)
                            && r.elapsed <= q.left
                            && amount(r.left)
                            && amount(r.remaining)
                            && (r.left + r.elapsed - q.left).abs() < 1e-8
                            && r.risks
                                .iter()
                                .all(|v| v.is_finite() && (0.0..=1.0).contains(v))
                    })
            });
        let rows = rows.unwrap_or_else(|| crate::thread_pool::map(crate::thread_pool::Kind::Movement, &requests, requests.len(), Motion::evaluate));
        day.buyers.clear();
        let mut deliveries = vec![];
        let mut jobs: BTreeMap<usize, CityJob> = BTreeMap::new();
        for row in rows {
            let v = &mut day.ships[row.key];
            if self.game.companies[v.c].bankrupt {
                v.left = 0.0;
                continue;
            }
            let (c, ri) = (v.c, v.ri);
            v.left = row.left;
            let mut delivery = None;
            match row.mode {
                1 => {
                    let mut h = self.game.companies[c].ships[v.i].handling.take().unwrap();
                    h.remaining = row.remaining;
                    let city = if h.unloading { h.trip.to } else { h.trip.from };
                    let fee = self.charge_handling(c, city, row.elapsed * h.rate, self.game.companies[c].ships[v.i].route);
                    h.trip.original_cost += fee;
                    h.trip.upkeep += v.daily * row.elapsed;
                    let r = &mut self.game.companies[c].routes[ri];
                    r.transport.costs += fee;
                    if h.unloading {
                        r.activity.unloading += row.elapsed;
                    } else {
                        r.activity.loading += row.elapsed;
                    }
                    if h.remaining > 1e-9 {
                        self.game.companies[c].ships[v.i].handling = Some(h);
                    } else if h.unloading {
                        delivery = Some(h.trip);
                    } else {
                        self.game.companies[c].ships[v.i].voyage = Some(h.trip);
                    }
                }
                2 => {
                    let mut trip = self.game.companies[c].ships[v.i].voyage.take().unwrap();
                    trip.upkeep += v.daily * row.elapsed;
                    self.game.companies[c].routes[ri].activity.moving += row.elapsed;
                    v.lost = self.disaster_in_transit(c, ri, v.i, row.risks[0])
                        || self.raid_in_transit(
                            c,
                            ri,
                            v.i,
                            row.risks[1],
                            row.risks[2],
                            row.risks[3],
                        );
                    trip.remaining = row.remaining;
                    if v.lost {
                        v.left = 0.0;
                        self.game.companies[c].ships[v.i].cargo.clear();
                    } else if trip.remaining > 1e-9 {
                        self.game.companies[c].ships[v.i].voyage = Some(trip);
                    } else {
                        let route = &self.game.companies[c].routes[ri];
                        let stop_count = route.stops.len();
                        let rate = self.handling_rate(c, &route.mode);
                        let ship = &mut self.game.companies[c].ships[v.i];
                        ship.next = (ship.next + 1) % stop_count;
                        let duration =
                            ship.cargo.iter().map(|x| x.quantity).sum::<usize>() as f64 / rate;
                        if duration > 0.0 {
                            ship.handling = Some(Handling {
                                rate,
                                unloading: true,
                                total: duration,
                                remaining: duration,
                                trip,
                            });
                        } else {
                            delivery = Some(trip);
                        }
                    }
                }
                _ => {
                    self.game.companies[c].routes[ri].activity.waiting += row.elapsed;
                    if v.left > 1e-9 {
                        day.buyers.push(row.key);
                    }
                }
            }
            // Completed trips are already removed from the live vessel, so its
            // reservation is excluded. Cargo stays in place until finish_sales.
            if let Some(trip) = delivery {
                let deposit = !trip.direct_sale && self.warehouse(c, trip.to);
                let mut room = if deposit {
                    trip.warehouse_units
                        .unwrap_or(usize::MAX)
                        .min(self.warehouse_room(c, trip.to))
                } else {
                    0
                };
                let (mut stored, mut sold) = (0.0, 0.0);
                let mut lots = vec![];
                for i in 0..self.game.companies[c].ships[v.i].cargo.len() {
                    let cargo = &self.game.companies[c].ships[v.i].cargo[i];
                    let (good, quantity, cost) = (cargo.good, cargo.quantity, cargo.cost);
                    let q = room.min(quantity);
                    room -= q;
                    let value = cargo_basis(cost, quantity, q);
                    stored += value;
                    sold += cost - value;
                    if q > 0 {
                        self.put_stock(
                            c,
                            trip.to,
                            Cargo {
                                good,
                                quantity: q,
                                cost: value,
                            },
                            Some(trip.from),
                        );
                    }
                    if quantity > q {
                        lots.push((good, quantity - q));
                    }
                }
                let city = trip.to;
                jobs.entry(city)
                    .or_insert_with(|| self.city_job(city))
                    .sales
                    .push(Sale {
                        key: row.key,
                        tax: self.post_tax(c, city),
                        lots,
                    });
                deliveries.push(Delivery {
                    key: row.key,
                    trip,
                    stored,
                    sold,
                });
            }
        }
        Stage::Sales(day, jobs.into_values().collect(), deliveries)
    }
    fn city_job(&self, city: usize) -> CityJob {
        let n = self.data.goods.len();
        CityJob {
            city,
            stock: self.game.markets[city * n..(city + 1) * n]
                .iter()
                .map(|m| m.stock)
                .collect(),
            bases: self.data.goods.iter().map(|g| g.base).collect(),
            sales: vec![],
            buys: vec![],
            posts: vec![],
            warehouses: BTreeMap::new(),
        }
    }
    fn city_results(jobs: &[CityJob], result: Option<Value>) -> Vec<CityResult> {
        result
            .and_then(|r| serde_json::from_value::<Vec<CityResult>>(r).ok())
            .filter(|rows| {
                rows.len() == jobs.len() && rows.iter().zip(jobs).all(|(r, j)| j.accepts(r))
            })
            .unwrap_or_else(|| crate::thread_pool::map(crate::thread_pool::Kind::Cities, jobs, jobs.iter().map(CityJob::weight).sum(), CityJob::evaluate))
    }
    fn apply_fill(&mut self, c: usize, city: usize, route: Option<u32>, buy: bool, f: &Fill) {
        self.game.markets[city * self.data.goods.len() + f.good].stock += if buy {
            -(f.quantity as f64)
        } else {
            f.quantity as f64
        };
        if f.quantity == 0 {
            return;
        }
        let detail = format!(
            "{} · {} · {}",
            self.data.cities[city].id, self.data.goods[f.good].id, f.quantity
        );
        self.entry(
            c,
            if buy { "purchase" } else { "sale" },
            if buy { -f.gross } else { f.gross },
            route,
            detail.clone(),
        );
        self.entry(c, "tax", -f.fee, route, detail);
        let n = self.data.cities[city].nation;
        self.game.companies[c].trade[n] = (self.game.companies[c].trade[n] + f.gross).min(5000.0);
    }
    pub(crate) fn post_market_jobs(&self) -> Vec<CityJob> {
        let mut jobs: BTreeMap<usize, CityJob> = BTreeMap::new();
        for (c, co) in self.game.companies.iter().enumerate() {
            if co.bankrupt || co.acquired {
                continue;
            }
            let count = co.posts.values().filter(|p| p.warehouse > 0).count();
            if count == 0 {
                continue;
            }
            let reserved = self.reserved_stocks(c);
            let budget = (co.cash - co.automation.reserve).max(0.0) / count as f64;
            for (&city, p) in &co.posts {
                if p.warehouse == 0 {
                    continue;
                }
                let job = jobs.entry(city).or_insert_with(|| self.city_job(city));
                job.warehouses.insert(c, p.stock.clone());
                job.posts.push(PostOrder {
                    company: c,
                    tax: self.post_tax(c, city),
                    budget,
                    room: (p.warehouse as usize * crate::posts::WAREHOUSE_UNITS).saturating_sub(p.quantity()+reserved[city]),
                    limit: (p.warehouse as usize * crate::posts::WAREHOUSE_UNITS).saturating_sub(reserved[city]),
                    rules: p.rules.clone(),
                });
            }
        }
        jobs.into_values().collect()
    }
    pub(crate) fn finish_post_markets(
        &mut self,
        jobs: Vec<CityJob>,
        result: Option<Value>,
    ) -> Stage {
        for row in Self::city_results(&jobs, result) {
            for (c, fills, stock) in row.posts {
                for (buy, fill) in fills {
                    self.apply_fill(c, row.city, None, buy, &fill);
                }
                self.game.companies[c]
                    .posts
                    .get_mut(&row.city)
                    .unwrap()
                    .stock = stock;
                self.facility_immediate(c, row.city, 0);
            }
        }
        self.start_fleet_day()
    }
    pub(crate) fn finish_sales(
        &mut self,
        day: FleetDay,
        jobs: Vec<CityJob>,
        deliveries: Vec<Delivery>,
        result: Option<Value>,
    ) -> Stage {
        let results = Self::city_results(&jobs, result);
        let fills: BTreeMap<_, _> = results.into_iter().flat_map(|r| r.sales).collect();
        for d in deliveries {
            let v = &day.ships[d.key];
            let s = &self.game.companies[v.c].ships[v.i];
            let route = s.route;
            let mut revenue = 0.0;
            let mut tax = 0.0;
            for f in &fills[&d.key] {
                self.apply_fill(v.c, d.trip.to, route, false, f);
                revenue += f.gross - f.fee;
                tax += f.fee;
            }
            let s = &mut self.game.companies[v.c].ships[v.i];
            s.cargo.clear();
            s.voyages += 1;
            let r = &mut self.game.companies[v.c].routes[v.ri];
            r.deliveries += 1;
            r.transport.deliveries += 1;
            r.transport.sales += revenue + tax;
            r.transport.costs += d.sold + tax;
            r.actual = Some(d.stored + revenue - d.trip.original_cost - d.trip.upkeep);
        }
        self.fleet_warehouse_checks(day.ships.iter());
        self.purchase_work(day)
    }
    // All fills have been committed. Keep the first-visit order, including
    // destinations of inactive/lost vessels as before. Warehouse reduction
    // only changes that city's inventory and inbound reservations; no city is
    // revisited with the snapshot. The next phase always builds fresh totals.
    fn fleet_warehouse_checks<'a>(&mut self, ships: impl Iterator<Item=&'a VesselDay>) {
        if !self.immediate_warehouses_enabled() { return; }
        let mut seen=vec![false;self.data.cities.len()];
        let mut cities=Vec::new();
        for d in ships.filter(|d|d.c==0) {
            for &city in &self.game.companies[0].routes[d.ri].stops {
                if !seen[city] {seen[city]=true;cities.push(city);}
            }
        }
        // Avoid scanning the fleet if no eligible warehouse can change.
        cities.retain(|city| self.game.companies[0].posts.get(city).is_some_and(|p|
            p.warehouse>0&&p.monitoring[0].changed!=Some(self.game.day)));
        if cities.is_empty() { return; }
        let reserved=self.reserved_stocks(0);
        for city in cities {self.facility_immediate_reserved(0,city,0,Some(reserved[city]));}
    }
    fn purchase_work(&self, mut day: FleetDay) -> Stage {
        let mut budgets: BTreeMap<usize, (f64, usize)> = BTreeMap::new();
        let mut requests = vec![];
        let mut mandatory = BTreeMap::new();
        for &key in &day.buyers {
            let v = &day.ships[key];
            let co = &self.game.companies[v.c];
            let s = &co.ships[v.i];
            let r = &co.routes[v.ri];
            if co.bankrupt {
                day.ships[key].left = 0.0;
                continue;
            }
            let (a, b) = (r.stops[s.next], r.stops[(s.next + 1) % r.stops.len()]);
            let spec = self.spec(&s.kind).unwrap();
            let rate = self.handling_rate(v.c, &r.mode);
            let days = self.days(&s.kind, a, b) as f64;
            let toll = if r.mode == "land" {
                self.land_connection(a, b).map_or(0.0, |p| {
                    p.roads.iter().map(|&i| self.road_toll(v.c, i)).sum()
                })
            } else {
                0.0
            };
            let daily = *mandatory
                .entry(v.c)
                .or_insert_with(|| self.mandatory_daily(v.c));
            let reserve = daily * (days + 2.0 * spec.capacity as f64 / rate + 1.0)
                + 2.0 * spec.capacity as f64 * crate::posts::HANDLING_FEE;
            let budget = (co.cash - reserve).max(0.0);
            let entry = budgets.entry(v.c).or_insert((budget, 0));
            entry.0 = entry.0.min(budget);
            entry.1 += 1;
            requests.push((key, a, b, spec.capacity, rate, days, toll, reserve));
        }
        // Reserve all tolls plus a fair share of available cash for each order.
        for &(key, _, _, _, _, _, toll, _) in &requests {
            budgets.get_mut(&day.ships[key].c).unwrap().0 -= toll;
        }
        let mut rooms: BTreeMap<(usize, usize), usize> = BTreeMap::new();
        let mut reservations: BTreeMap<usize, Vec<usize>> = BTreeMap::new();
        let mut jobs: BTreeMap<usize, CityJob> = BTreeMap::new();
        let mut context = vec![];
        for (key, a, b, capacity, rate, days, toll, reserve) in requests {
            let v = &day.ships[key];
            let co = &self.game.companies[v.c];
            let s = &co.ships[v.i];
            let r = &co.routes[v.ri];
            let (budget, count) = budgets[&v.c];
            let budget = budget.max(0.0) / count as f64;
            let warehouse_room = |city:usize, reservations:&mut BTreeMap<usize, Vec<usize>>| {
                let reserved=reservations.entry(v.c).or_insert_with(||self.reserved_stocks(v.c));
                let p=&co.posts[&city];
                (p.warehouse as usize*crate::posts::WAREHOUSE_UNITS).saturating_sub(p.quantity()+reserved[city])
            };
            let room = rooms.entry((v.c, b)).or_insert_with(|| {
                if self.warehouse(v.c, b) {
                    warehouse_room(b,&mut reservations)
                } else {
                    usize::MAX
                }
            });
            let reserved = capacity.min(*room);
            *room = room.saturating_sub(reserved);
            let forward = self.load_input(
                v.c,
                a,
                b,
                reserved,
                budget,
                &r.allowed,
                r.buy_below,
                r.sell_above,
                Some(reserved),
            );
            let reverse = self.load_input(
                v.c,
                b,
                a,
                capacity,
                budget,
                &r.allowed,
                r.buy_below,
                r.sell_above,
                // Reverse quotes use the actual snapshot, not forward orders'
                // provisional reservations in rooms. Preserve reposition logic.
                if self.warehouse(v.c,a) {Some(warehouse_room(a,&mut reservations))} else {None},
            );
            let job = jobs.entry(a).or_insert_with(|| self.city_job(a));
            if forward.stored {
                job.warehouses
                    .entry(v.c)
                    .or_insert_with(|| co.posts[&a].stock.clone());
            }
            job.buys.push(Purchase {
                key,
                company: v.c,
                to: b,
                input: forward.clone(),
                reverse: reverse.clone(),
            });
            context.push(BuyContext {
                key,
                request: LoadRequest {
                    ship: s.id,
                    from: a,
                    to: b,
                    reserve,
                    toll,
                    days,
                    daily: v.daily,
                    rate,
                    forward,
                    reverse,
                },
            });
        }
        Stage::Purchases(day, jobs.into_values().collect(), context)
    }
    pub(crate) fn finish_purchases(
        &mut self,
        mut day: FleetDay,
        jobs: Vec<CityJob>,
        context: Vec<BuyContext>,
        result: Option<Value>,
    ) -> Stage {
        let rows = Self::city_results(&jobs, result);
        let mut plans: BTreeMap<_, _> = rows
            .into_iter()
            .flat_map(|r| r.buys)
            .map(|(k, p, r, f)| (k, (p, r, f)))
            .collect();
        for ctx in context {
            let v = &mut day.ships[ctx.key];
            let q = ctx.request;
            let (plan, reposition, fills) = plans.remove(&ctx.key).unwrap();
            let c = v.c;
            let quantity = plan.lots.iter().map(|l| l.1).sum::<usize>();
            let handling = [q.from, q.to]
                .iter()
                .map(|city| {
                    let own = self.game.companies[c]
                        .posts
                        .get(city)
                        .map_or(0.0, |p| p.handling as f64 * crate::posts::HANDLING_UNITS);
                    quantity as f64 * (1.0 - own / q.rate).max(0.0) * crate::posts::HANDLING_FEE
                })
                .sum::<f64>();
            let r = &mut self.game.companies[c].routes[v.ri];
            r.forecast = if quantity == 0 {
                -q.daily * q.days - q.toll
            } else {
                (if q.forward.deposit {
                    0.0
                } else {
                    plan.sale - plan.cost
                }) - (q.days + 2.0 * quantity as f64 / q.rate) * q.daily
                    - q.toll
                    - handling
            };
            if self.game.companies[c].bankrupt
                || self.game.companies[c].cash < q.toll
                || quantity == 0
                    && (!reposition || self.game.companies[c].cash < q.reserve + q.toll)
            {
                self.game.companies[c].routes[v.ri].activity.waiting += v.left;
                v.left = 0.0;
                continue;
            }
            let route = self.game.companies[c].ships[v.i].route;
            if q.toll > 0.0 {
                self.entry(c, "roadToll", -q.toll, route, String::new());
                let fees: Vec<_> = self
                    .land_connection(q.from, q.to)
                    .unwrap()
                    .roads
                    .iter()
                    .map(|&i| (i, self.road_toll(c, i)))
                    .collect();
                for (i, fee) in fees {
                    if !["state", "private"].contains(&self.game.roads[i].owner.as_str()) {
                        self.game.roads[i].pool += fee * 0.2;
                    }
                }
            }
            let mut cargo = vec![];
            let mut cost = q.toll;
            self.game.companies[c].routes[v.ri].transport.costs += q.toll;
            if q.forward.stored {
                for (g, n) in plan.lots {
                    let item = self.take_stock(c, q.from, g, n, Some(q.to));
                    cost += item.cost;
                    cargo.push(item);
                }
            } else {
                for f in fills {
                    self.apply_fill(c, q.from, route, true, &f);
                    cost += f.gross + f.fee;
                    cargo.push(Cargo {
                        good: f.good,
                        quantity: f.quantity,
                        cost: f.gross + f.fee,
                    });
                }
            }
            let trip = Voyage {
                direct_sale: !q.forward.deposit,
                warehouse_units: None,
                from: q.from,
                to: q.to,
                total: q.days,
                remaining: q.days,
                original_cost: cost,
                upkeep: 0.0,
            };
            let s = &mut self.game.companies[c].ships[v.i];
            s.cargo = cargo;
            let duration = quantity as f64 / q.rate;
            if duration > 0.0 {
                s.handling = Some(Handling {
                    rate: q.rate,
                    unloading: false,
                    total: duration,
                    remaining: duration,
                    trip,
                });
            } else {
                s.voyage = Some(trip);
            }
        }
        self.fleet_warehouse_checks(day.buyers.iter().map(|&i|&day.ships[i]));
        if day
            .ships
            .iter()
            .any(|s| s.left > 1e-9 && !s.lost && !self.game.companies[s.c].bankrupt)
        {
            return Stage::Motion(day);
        }
        let mut lost: BTreeMap<usize, Vec<(u32, u32)>> = BTreeMap::new();
        for v in &day.ships {
            if v.lost {
                let s = &self.game.companies[v.c].ships[v.i];
                lost.entry(v.c).or_default().push((s.id, s.route.unwrap()));
            }
        }
        for (c, ids) in lost {
            self.game.companies[c]
                .ships
                .retain(|s| !ids.iter().any(|v| v.0 == s.id));
            for (_, route) in ids {
                self.reschedule(c, route);
            }
        }
        Stage::After(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::loading::Offer;
    fn city() -> CityJob {
        CityJob {
            city: 0,
            stock: vec![1000.0],
            bases: vec![100.0],
            sales: vec![],
            buys: vec![],
            posts: vec![],
            warehouses: BTreeMap::new(),
        }
    }
    fn input() -> LoadInput {
        LoadInput {
            stored: false,
            deposit: false,
            room: 650,
            budget: 1e9,
            buy: 0.0,
            sell: 0.0,
            source_tax: 0.1,
            target_tax: 0.1,
            goods: vec![Offer {
                good: 0,
                source: 1000.0,
                target: 0.0,
                base: 100.0,
                available: 1000,
                basis: vec![],
            }],
        }
    }
    #[test]
    fn city_orders_compete_for_one_stock_and_pay_integrated_prices() {
        let mut j = city();
        // Deposit avoids the target price limit; source price remains binding.
        let mut i = input();
        i.deposit = true;
        for key in 0..2 {
            j.buys.push(Purchase {
                key,
                company: key,
                to: 1,
                input: i.clone(),
                reverse: i.clone(),
            });
        }
        let r = j.evaluate();
        assert!(j.accepts(&r));
        let q = r
            .buys
            .iter()
            .flat_map(|b| &b.1.lots)
            .map(|l| l.1)
            .sum::<usize>();
        assert_eq!(q, 783);
        assert_eq!(r.buys[0].1.lots, vec![(0, 650)]);
        assert_eq!(r.buys[1].1.lots, vec![(0, 133)]);
        let paid = r.buys.iter().map(|b| b.1.cost).sum::<f64>();
        assert!((paid - integrated(100.0, 217.0, 1000.0) * 1.1).abs() < 1e-8);
    }
    #[test]
    fn city_sales_change_price_for_later_sellers() {
        let mut j = city();
        j.stock[0] = 20.0;
        for key in 0..2 {
            j.sales.push(Sale {
                key,
                tax: 0.1,
                lots: vec![(0, 50)],
            });
        }
        let r = j.evaluate();
        assert!(j.accepts(&r));
        assert!(r.sales[0].1[0].gross > r.sales[1].1[0].gross);
        assert!(
            (r.sales.iter().map(|s| s.1[0].gross).sum::<f64>() - integrated(100.0, 20.0, 120.0))
                .abs()
                < 1e-8
        );
    }
    #[test]
    fn city_warehouse_transfers_conserve_basis_and_exclude_return_cargo() {
        let mut j = city();
        let mut i = input();
        i.stored = true;
        i.deposit = true;
        i.room = 70;
        i.budget = 0.0;
        j.warehouses.insert(
            0,
            vec![
                crate::posts::StoredCargo {
                    good: 0,
                    quantity: 100,
                    cost: 123.4,
                    from: None,
                },
                crate::posts::StoredCargo {
                    good: 0,
                    quantity: 50,
                    cost: 999.0,
                    from: Some(1),
                },
            ],
        );
        for key in 0..2 {
            j.buys.push(Purchase {
                key,
                company: 0,
                to: 1,
                input: i.clone(),
                reverse: i.clone(),
            });
        }
        let r = j.evaluate();
        assert!(j.accepts(&r));
        assert_eq!(r.buys[0].1.lots, vec![(0, 70)]);
        assert_eq!(r.buys[1].1.lots, vec![(0, 30)]);
        assert!((r.buys.iter().map(|b| b.1.cost).sum::<f64>() - 123.4).abs() < 1e-10);
        assert!(r.buys.iter().all(|b| b.3.is_empty()));
    }
    #[test]
    fn warehouse_market_orders_use_only_reserved_cash_and_local_sale_proceeds() {
        let mut j = city();
        j.warehouses.insert(0, vec![]);
        j.posts.push(PostOrder {
            company: 0,
            tax: 0.1,
            budget: 1000.0,
            room: 100,
            limit: 100,
            rules: vec![crate::posts::PriceRule {
                buy_below: 0.0,
                sell_above: 0.0,
                buy: true,
                sell: false,
            }],
        });
        let r = j.evaluate();
        assert!(j.accepts(&r));
        let fills = &r.posts[0].1;
        let spent = fills.iter().map(|(_, f)| f.gross + f.fee).sum::<f64>();
        assert!(spent <= 1000.0 && spent > 900.0);
        assert!((r.posts[0].2.iter().map(|l| l.cost).sum::<f64>() - spent).abs() < 1e-9);
    }
    #[test]
    fn investment_budget_and_research_effects_are_company_local() {
        let mut j = InvestmentJob {
            company: 1,
            cash: 100.0,
            technology: vec![0.0; 8],
            tech_budget: vec![0.0; 8],
            cities: vec![(0, 0.0, 30.0, vec![], vec![], vec![])],
            roads: vec![(0, 20.0, 0.0, 0.0, 25.0, 0.0)],
        };
        j.tech_budget[0] = 60.0;
        j.tech_budget[1] = 60.0;
        let r = j.evaluate();
        assert_eq!(
            r.changes.iter().map(|v| v.0).collect::<Vec<_>>(),
            vec![0, 1, 3, 4]
        );
        assert!((100.0 - r.changes.iter().map(|v| v.3).sum::<f64>() - 5.0).abs() < 1e-9);
        assert!((r.changes[1].4 - 0.5 * 30.0_f64.sqrt() / 200.0).abs() < 1e-12);
    }
    #[test]
    fn fractional_motion_stops_at_each_boundary_without_losing_the_rest_of_the_day() {
        let m = Motion {
            key: 0,
            mode: 2,
            left: 1.0,
            remaining: 0.3,
            now: 10.0,
            ready: 0.0,
            first: 0.0,
            cycle: 10.0,
            blocked: false,
            risks: [0.001, 0.002, 0.6, 0.02],
        };
        let a = m.evaluate();
        assert_eq!(a.remaining, 0.0);
        assert_eq!(a.left, 0.7);
        let b = Motion {
            mode: 1,
            left: a.left,
            remaining: 0.2,
            ..m
        }
        .evaluate();
        assert!((b.left - 0.5).abs() < 1e-12);
        assert_eq!(b.remaining, 0.0);
        assert!(a.risks[0] > 0.0 && a.risks[0] < 0.001);
    }
}

// Company-owned budgets/technology are independent. Shared city development
// receives additive deltas calculated from one end-of-day snapshot.
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct InvestmentJob {
    company: usize,
    cash: f64,
    technology: Vec<f64>,
    tech_budget: Vec<f64>,
    cities: Vec<(usize, f64, f64, Vec<f64>, Vec<f64>, Vec<f64>)>,
    roads: Vec<(usize, f64, f64, f64, f64, f64)>,
}
#[derive(Clone, Serialize, Deserialize)]
pub(crate) struct Invested {
    company: usize,
    changes: Vec<(u8, usize, usize, f64, f64)>,
}
impl InvestmentJob {
    pub fn weight(&self) -> usize {
        8 + self.cities.iter().map(|c| 1 + c.3.len()).sum::<usize>() + self.roads.len() * 2
    }
    pub fn evaluate(&self) -> Invested {
        let mut cash = self.cash;
        let mut changes = vec![];
        let mut tech = self.technology.clone();
        for t in 0..8 {
            let b = self.tech_budget[t];
            if b > 0.0 && cash >= b {
                cash -= b;
                let delta = b.sqrt() / 100.0 / (1.0 + tech[t] / 50.0);
                tech[t] += delta;
                changes.push((0, t, 0, b, delta));
            }
        }
        let effect = 0.5 * (1.0 + crate::posts::POST_RESEARCH_EFFECT * tech[7]);
        for (city, level, budget, levels, budgets, aptitudes) in &self.cities {
            if *budget > 0.0 && cash >= *budget {
                cash -= budget;
                changes.push((
                    1,
                    *city,
                    0,
                    *budget,
                    effect * budget.sqrt() / 200.0 / (1.0 + level / 5.0),
                ));
            }
            for g in 0..levels.len() {
                let b = budgets[g];
                if b > 0.0 && cash >= b {
                    cash -= b;
                    changes.push((
                        2,
                        *city,
                        g,
                        b,
                        effect * b.sqrt() * aptitudes[g] / 200.0 / (1.0 + levels[g] / 5.0),
                    ));
                }
            }
        }
        for &(i, income, quality, security, road_budget, security_budget) in &self.roads {
            if income > 0.0 {
                cash += income;
                changes.push((3, i, 0, -income, 0.0));
            }
            for (kind, b, level) in [(4, road_budget, quality), (5, security_budget, security)] {
                if b > 0.0 && cash >= b {
                    cash -= b;
                    changes.push((kind, i, 0, b, b.sqrt() / 150.0 / (1.0 + level / 5.0)));
                }
            }
        }
        Invested {
            company: self.company,
            changes,
        }
    }
}
impl Engine {
    pub(crate) fn investment_jobs(&mut self) -> Vec<InvestmentJob> {
        let mut jobs = vec![];
        for c in 0..self.game.companies.len() {
            if self.game.companies[c].bankrupt || self.game.companies[c].acquired {
                continue;
            }
            if c > 0 {
                self.guard_rival_budget(c);
            }
            let co = &self.game.companies[c];
            jobs.push(InvestmentJob {
                company: c,
                cash: co.cash,
                technology: co.technology.clone(),
                tech_budget: co.tech_budget.clone(),
                cities: co
                    .posts
                    .iter()
                    .map(|(&city, p)| {
                        let d = &self.game.development[city];
                        let supplies = &self.data.cities[city].supply;
                        let max = supplies.iter().copied().fold(1.0, f64::max);
                        (
                            city,
                            d.size,
                            p.size_budget,
                            d.production.clone(),
                            p.production_budget.clone(),
                            supplies.iter().map(|s| s / max).collect(),
                        )
                    })
                    .collect(),
                roads: self
                    .game
                    .roads
                    .iter()
                    .enumerate()
                    .filter(|(_, r)| r.owner == co.id)
                    .map(|(i, r)| {
                        (
                            i,
                            r.pool,
                            r.quality,
                            r.security,
                            r.road_budget,
                            r.security_budget,
                        )
                    })
                    .collect(),
            });
        }
        jobs
    }
    pub(crate) fn finish_investments(
        &mut self,
        jobs: Vec<InvestmentJob>,
        result: Option<Value>,
    ) -> Stage {
        let rows = result
            .and_then(|r| serde_json::from_value::<Vec<Invested>>(r).ok())
            .filter(|rows| {
                rows.len() == jobs.len()
                    && rows.iter().zip(&jobs).all(|(r, j)| {
                        r.company == j.company
                            && r.changes.iter().all(|&(k, i, g, cost, delta)| {
                                cost.is_finite()
                                    && amount(delta)
                                    && match k {
                                        0 => i < 8 && cost > 0.0,
                                        1 | 2 => {
                                            j.cities
                                                .iter()
                                                .any(|v| v.0 == i && (k == 1 || g < v.3.len()))
                                                && cost > 0.0
                                        }
                                        3..=5 => {
                                            j.roads.iter().any(|v| v.0 == i)
                                                && if k == 3 { cost < 0.0 } else { cost > 0.0 }
                                        }
                                        _ => false,
                                    }
                            })
                    })
            });
        for row in rows.unwrap_or_else(|| crate::thread_pool::map(crate::thread_pool::Kind::Investments, &jobs, jobs.iter().map(InvestmentJob::weight).sum(), InvestmentJob::evaluate)) {
            let c = row.company;
            for (kind, i, g, cost, delta) in row.changes {
                let (category, detail) = match kind {
                    0 => {
                        self.game.companies[c].technology[i] += delta;
                        ("technologyInvestment", i.to_string())
                    }
                    1 => {
                        self.game.development[i].size += delta;
                        ("cityInvestment", self.data.cities[i].id.clone())
                    }
                    2 => {
                        self.game.development[i].production[g] += delta;
                        (
                            "cityInvestment",
                            format!("{} {}", self.data.cities[i].id, self.data.goods[g].id),
                        )
                    }
                    3 => {
                        self.game.roads[i].pool = 0.0;
                        ("roadIncome", self.data.roads[i].id.clone())
                    }
                    4 => {
                        self.game.roads[i].quality += delta;
                        ("roadInvestment", self.data.roads[i].id.clone())
                    }
                    _ => {
                        self.game.roads[i].security += delta;
                        ("roadInvestment", self.data.roads[i].id.clone())
                    }
                };
                self.entry(c, category, -cost, None, detail);
            }
        }
        Stage::End(true)
    }
}
