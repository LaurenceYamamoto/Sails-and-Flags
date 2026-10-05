use crate::model::*;
use std::collections::BTreeMap;

impl Engine {
    pub fn disaster_chance(&self, c: usize, kind: &str, a: usize, b: usize) -> f64 {
        let spec = self.spec(kind).unwrap();
        let land = spec.mode == "land";
        let level = self.game.companies[c].technology[if land { 4 } else { 1 }];
        let base = if land {
            let pass = self
                .road(a, b)
                .map(|i| self.road_passability(i))
                .unwrap_or(1.0);
            0.0002 + 0.0008 * (1.0 - pass) * (1.0 - spec.roughness)
        } else {
            0.0003
        };
        base / (1.0 + level / 50.0)
    }

    fn disaster_in_transit(
        &mut self,
        c: usize,
        ri: usize,
        ship: &mut Ship,
        v: &Voyage,
        elapsed: f64,
    ) -> bool {
        if !self.game.events_enabled {
            return false;
        }
        let chance = self.disaster_chance(c, &ship.kind, v.from, v.to);
        if self.random() >= 1.0 - (1.0 - chance).powf(elapsed) {
            return false;
        }
        let spec = self.spec(&ship.kind).unwrap();
        let land = spec.mode == "land";
        let hull = spec.price;
        let cargo = ship.cargo.iter().map(|x| x.cost).sum::<f64>();
        let r = &mut self.game.companies[c].routes[ri];
        r.ship_loss += hull;
        r.cargo_loss += cargo;
        r.transport.costs += hull + cargo;
        if r.replacements.len() < 200 {
            r.replacements.push(ship.kind.clone());
        }
        self.event(
            if land { "landDisaster" } else { "seaDisaster" },
            format!("{} · {}", self.game.companies[c].name, ship.name),
        );
        true
    }

    pub(crate) fn sail(&mut self, c: usize) {
        let revise: Vec<_> = self.game.companies[c]
            .routes
            .iter()
            .filter(|r| {
                self.game.day >= r.cooldown
                    && self.handling_rate(c, &r.mode) >= r.handling_rate * 1.1
            })
            .map(|r| r.id)
            .collect();
        for id in revise {
            self.reschedule(c, id);
        }
        let schedules: BTreeMap<_, _> = self.game.companies[c]
            .routes
            .iter()
            .map(|r| {
                let (cycle, offsets, fleet) = self.schedule(c, r);
                (
                    r.id,
                    (
                        cycle,
                        offsets,
                        fleet
                            .iter()
                            .map(|&i| self.game.companies[c].ships[i].id)
                            .collect::<Vec<_>>(),
                    ),
                )
            })
            .collect();
        let ids: Vec<_> = self.game.companies[c].ships.iter().map(|s| s.id).collect();
        for id in ids {
            if self.game.companies[c].bankrupt {
                break;
            }
            let i = self.game.companies[c]
                .ships
                .iter()
                .position(|s| s.id == id)
                .unwrap();
            let mut ship = self.game.companies[c].ships.remove(i);
            let Some(ri) = self.game.companies[c]
                .routes
                .iter()
                .position(|r| Some(r.id) == ship.route)
            else {
                self.game.companies[c].ships.push(ship);
                continue;
            };
            let route = self.game.companies[c].routes[ri].clone();
            let daily = self.daily(c, &ship.kind);
            let mut left: f64 = 1.0;
            let mut lost = false;
            // One day can contain the tail of one operation and the start of the next.
            // Travel is at least one day, so there cannot be an unbounded zero-time loop.
            while left > 1e-9 {
                if let Some(mut h) = ship.handling.take() {
                    let elapsed = left.min(h.remaining);
                    h.remaining = (h.remaining - elapsed).max(0.0);
                    h.trip.upkeep += daily * elapsed;
                    left -= elapsed;
                    let activity = &mut self.game.companies[c].routes[ri].activity;
                    if h.unloading {
                        activity.unloading += elapsed;
                    } else {
                        activity.loading += elapsed;
                    }
                    if h.remaining > 1e-9 {
                        ship.handling = Some(h);
                    } else if h.unloading {
                        self.finish_delivery(c, ri, &mut ship, h.trip);
                    } else {
                        ship.voyage = Some(h.trip);
                    }
                } else if let Some(mut v) = ship.voyage.take() {
                    let elapsed = left.min(v.remaining);
                    self.game.companies[c].routes[ri].activity.moving += elapsed;
                    left -= elapsed;
                    v.upkeep += daily * elapsed;
                    if self.disaster_in_transit(c, ri, &mut ship, &v, elapsed)
                        || self.raid_in_transit(c, ri, &route, &mut ship, &v, elapsed)
                    {
                        lost = true;
                        break;
                    }
                    v.remaining = (v.remaining - elapsed).max(0.0);
                    if v.remaining > 1e-9 {
                        ship.voyage = Some(v);
                    } else {
                        // Normalize fractional subtraction residue before saving the
                        // completed travel inside an unloading operation.
                        v.remaining = 0.0;
                        ship.next = (ship.next + 1) % route.stops.len();
                        let rate = self.handling_rate(c, &route.mode);
                        let duration =
                            ship.cargo.iter().map(|x| x.quantity).sum::<usize>() as f64 / rate;
                        if duration > 0.0 {
                            ship.handling = Some(Handling {
                                rate,
                                unloading: true,
                                total: duration,
                                remaining: duration,
                                trip: v,
                            });
                        } else {
                            self.finish_delivery(c, ri, &mut ship, v);
                        }
                    }
                } else {
                    let now = self.game.day as f64 - left;
                    if !route.active || ship.ready as f64 >= now + left {
                        self.game.companies[c].routes[ri].activity.waiting += left;
                        break;
                    }
                    let (cycle, offsets, fleet) = &schedules[&route.id];
                    let phase = fleet.iter().position(|&x| x == id).unwrap() as f64 * cycle
                        / fleet.len() as f64;
                    let first = route.epoch + phase + offsets[ship.next];
                    let earliest = now.max(ship.ready as f64);
                    let next = first + ((earliest - first - 1e-9) / cycle).ceil().max(0.0) * cycle;
                    let wait = (next - now).max(0.0).min(left);
                    self.game.companies[c].routes[ri].activity.waiting += wait;
                    left -= wait;
                    if left <= 1e-9 {
                        break;
                    }
                    if !self.start_loading(c, ri, &route, &mut ship) {
                        self.game.companies[c].routes[ri].activity.waiting += left;
                        break;
                    }
                }
            }
            if lost {
                self.reschedule(c, route.id);
            } else {
                self.game.companies[c].ships.push(ship);
            }
        }
    }

    fn finish_delivery(&mut self, c: usize, ri: usize, ship: &mut Ship, v: Voyage) {
        let cost = ship.cargo.iter().map(|x| x.cost).sum::<f64>();
        let mut revenue = 0.0;
        for cargo in &ship.cargo {
            revenue += self
                .trade(c, v.to, cargo.good, cargo.quantity, false, ship.route)
                .1;
        }
        ship.cargo.clear();
        ship.voyages += 1;
        let tax = revenue / (1.0 - self.terms(c, self.data.cities[v.to].nation, 0).2) - revenue;
        let r = &mut self.game.companies[c].routes[ri];
        r.deliveries += 1;
        r.transport.deliveries += 1;
        r.transport.sales += revenue + tax;
        r.transport.costs += cost + tax;
        r.actual = Some(revenue - v.original_cost - v.upkeep);
    }

    fn raid_in_transit(
        &mut self,
        c: usize,
        ri: usize,
        route: &Route,
        ship: &mut Ship,
        v: &Voyage,
        elapsed: f64,
    ) -> bool {
        let (chance, fraction, sink) = self.risk(c, route, &ship.kind, v.from, v.to);
        if chance <= 0.0 || self.random() >= 1.0 - (1.0 - chance).powf(elapsed) {
            return false;
        }
        let severity = self.random();
        let lost = self.random() < sink;
        let mut cost = 0.0;
        for item in &mut ship.cargo {
            let q = if lost {
                item.quantity
            } else {
                ((item.quantity as f64 * fraction * (0.5 + severity / 2.0)).ceil() as usize)
                    .min(item.quantity)
            };
            let value = if item.quantity > 0 {
                item.cost * q as f64 / item.quantity as f64
            } else {
                0.0
            };
            item.quantity -= q;
            item.cost -= value;
            cost += value;
        }
        ship.cargo.retain(|x| x.quantity > 0);
        self.game.companies[c].routes[ri].transport.costs += cost;
        self.game.companies[c].routes[ri].cargo_loss += cost;
        self.event(
            "raided",
            format!(
                "{}: {} が襲撃を受けました",
                self.game.companies[c].name, ship.name
            ),
        );
        if lost {
            let value = self.spec(&ship.kind).unwrap().price;
            let r = &mut self.game.companies[c].routes[ri];
            r.ship_loss += value;
            r.transport.costs += value;
            if r.replacements.len() < 200 {
                r.replacements.push(ship.kind.clone());
            }
        }
        lost
    }

    fn start_loading(&mut self, c: usize, ri: usize, route: &Route, ship: &mut Ship) -> bool {
        let a = route.stops[ship.next];
        let b = route.stops[(ship.next + 1) % route.stops.len()];
        let rate = self.handling_rate(c, &route.mode);
        let days = self.days(&ship.kind, a, b) as f64;
        let spec = self.spec(&ship.kind).unwrap().clone();
        let daily = self.daily(c, &ship.kind);
        let toll = if route.mode == "land" {
            self.toll(c, a, b)
        } else {
            0.0
        };
        let co = &self.game.companies[c];
        let mandatory = daily
            + co.ships.iter().map(|s| self.daily(c, &s.kind)).sum::<f64>()
            + co.licenses
                .iter()
                .map(|&n| self.terms(c, n, 0).1)
                .sum::<f64>()
            + co.routes
                .iter()
                .map(|r| r.escorts as f64 * 4.0)
                .sum::<f64>()
            + co.diplomacy_budget.iter().sum::<f64>()
            + co.tech_budget.iter().sum::<f64>()
            + self
                .game
                .development
                .iter()
                .filter(|d| d.owner == co.id)
                .map(|d| d.size_budget + d.production_budget.iter().sum::<f64>())
                .sum::<f64>()
            + self
                .game
                .roads
                .iter()
                .filter(|d| d.owner == co.id)
                .map(|d| d.road_budget + d.security_budget)
                .sum::<f64>();
        let max_handling = 2.0 * spec.capacity as f64 / rate;
        let reserve = mandatory * (days + max_handling + 1.0);
        let (mut plan, cost, sale) = self.load_plan(
            c,
            a,
            b,
            spec.capacity,
            (co.cash - reserve - toll).max(0.0),
            &route.allowed,
            route.min_margin,
        );
        let quantity = plan.iter().map(|x| x.1).sum::<usize>();
        let forecast = sale - cost - (days + 2.0 * quantity as f64 / rate) * daily - toll;
        self.game.companies[c].routes[ri].forecast = forecast;
        let profitable = !plan.is_empty() && forecast > 0.0;
        let reposition = !profitable
            && self.game.companies[c].cash >= toll
            && route.stops.iter().enumerate().any(|(j, &from)| {
                if j == ship.next {
                    return false;
                }
                let to = route.stops[(j + 1) % route.stops.len()];
                let (next_plan, cost, sales) = self.load_plan(
                    c,
                    from,
                    to,
                    spec.capacity,
                    (self.game.companies[c].cash - reserve * 2.0).max(0.0),
                    &route.allowed,
                    route.min_margin,
                );
                let handling = 2.0 * next_plan.iter().map(|x| x.1).sum::<usize>() as f64 / rate;
                let next_toll = if route.mode == "land" {
                    self.toll(c, from, to)
                } else {
                    0.0
                };
                sales - cost
                    > daily * (days + self.days(&ship.kind, from, to) as f64 + handling)
                        + toll
                        + next_toll
            });
        if !profitable {
            plan.clear();
        }
        if !profitable && !reposition {
            return false;
        }
        if reposition {
            self.game.companies[c].routes[ri].forecast = -daily * days - toll;
        }
        if toll > 0.0 {
            self.entry(c, "roadToll", -toll, ship.route, String::new());
            self.game.companies[c].routes[ri].transport.costs += toll;
            let j = self.road(a, b).unwrap();
            if !["state", "private"].contains(&self.game.roads[j].owner.as_str()) {
                self.game.roads[j].pool += toll * 0.2;
            }
        }
        let mut original_cost = toll;
        // Reserve stock and pay at loading start. Cargo remains unavailable to the
        // destination market until unloading has completed.
        for (g, q) in plan {
            let (quantity, cost) = self.trade(c, a, g, q, true, ship.route);
            if quantity > 0 {
                ship.cargo.push(Cargo {
                    good: g,
                    quantity,
                    cost,
                });
            }
            original_cost += cost;
        }
        let trip = Voyage {
            from: a,
            to: b,
            total: days,
            remaining: days,
            original_cost,
            upkeep: 0.0,
        };
        let duration = ship.cargo.iter().map(|x| x.quantity).sum::<usize>() as f64 / rate;
        if duration > 0.0 {
            ship.handling = Some(Handling {
                rate,
                unloading: false,
                total: duration,
                remaining: duration,
                trip,
            });
        } else {
            ship.voyage = Some(trip);
        }
        true
    }
}
