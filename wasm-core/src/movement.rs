use crate::model::*;
use std::collections::BTreeMap;

impl Engine {
    pub fn disaster_chance(&self, c: usize, kind: &str, a: usize, b: usize) -> f64 {
        let spec = self.spec(kind).unwrap();
        let land = spec.mode == "land";
        let level = self.game.companies[c].technology[if land { 4 } else { 1 }];
        let base = if land {
            let pass = self.land_average(a,b,|i|self.road_passability(i));
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
        let mut fleets: BTreeMap<u32, Vec<usize>> = BTreeMap::new();
        for (i,s) in self.game.companies[c].ships.iter().enumerate() {
            if let Some(id)=s.route {fleets.entry(id).or_default().push(i);}
        }
        let schedules: BTreeMap<_, _> = self.game.companies[c]
            .routes
            .iter()
            .map(|r| {
                let (cycle, offsets, fleet) = self.schedule_fleet(c, r, fleets.remove(&r.id).unwrap_or_default());
                (
                    r.id,
                    (
                        cycle,
                        offsets,
                        fleet
                            .iter()
                            .enumerate()
                            .map(|(phase,&i)| (self.game.companies[c].ships[i].id,phase as f64 * cycle / fleet.len() as f64))
                            .collect::<BTreeMap<_,_>>(),
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
                    let city=if h.unloading{h.trip.to}else{h.trip.from};
                    let fee=self.charge_handling(c,city,elapsed*h.rate,ship.route);
                    h.trip.original_cost+=fee;
                    self.game.companies[c].routes[ri].transport.costs+=fee;
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
                    // Finish unloading before exchanging a hull; never strand cargo in a smaller hold.
                    if c == 0 && self.maintenance_target(&ship).is_some() {
                        self.game.companies[c].routes[ri].activity.waiting += left;
                        break;
                    }
                    let now = self.game.day as f64 - left;
                    if !route.active || ship.ready as f64 >= now + left {
                        self.game.companies[c].routes[ri].activity.waiting += left;
                        break;
                    }
                    let (cycle, offsets, fleet) = &schedules[&route.id];
                    let phase = fleet[&id];
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
            self.facility_immediate(c,route.stops[0],0);
            self.facility_immediate(c,route.stops[1],0);
        }
    }

    fn finish_delivery(&mut self, c: usize, ri: usize, ship: &mut Ship, v: Voyage) {
        let mut revenue = 0.0;
        let deposit=!v.direct_sale&&self.warehouse(c,v.to);
        let mut room=if deposit{v.warehouse_units.unwrap_or(usize::MAX).min(self.warehouse_room(c,v.to))}else{0};
        let mut stored_cost=0.0;
        let mut sold_cost=0.0;
        for cargo in &ship.cargo {
            let q=room.min(cargo.quantity);room-=q;
            let value=cargo_basis(cargo.cost,cargo.quantity,q);stored_cost+=value;
            // Sum each lot's nonnegative sold basis instead of subtracting two
            // independently rounded totals after a warehouse-only delivery.
            sold_cost+=cargo.cost-value;
            if q>0{self.put_stock(c,v.to,Cargo{good:cargo.good,quantity:q,cost:value},Some(v.from));}
            if cargo.quantity>q{revenue+=self.trade(c,v.to,cargo.good,cargo.quantity-q,false,ship.route).1;}
        }
        ship.cargo.clear();
        ship.voyages += 1;
        let tax = revenue / (1.0 - self.post_tax(c,v.to)) - revenue;
        let r = &mut self.game.companies[c].routes[ri];
        r.deliveries += 1;
        r.transport.deliveries += 1;
        r.transport.sales += revenue + tax;
        r.transport.costs += sold_cost+tax;
        r.actual = Some((stored_cost+revenue) - v.original_cost - v.upkeep);
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
            let value = cargo_basis(item.cost,item.quantity,q);
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
            + self.post_fixed(c)
            + co.posts.values().map(|p|p.size_budget+p.production_budget.iter().sum::<f64>()).sum::<f64>()
            + self
                .game
                .roads
                .iter()
                .filter(|d| d.owner == co.id)
                .map(|d| d.road_budget + d.security_budget)
                .sum::<f64>();
        let max_handling = 2.0 * spec.capacity as f64 / rate;
        let reserve = mandatory * (days + max_handling + 1.0) + 2.0 * spec.capacity as f64 * crate::posts::HANDLING_FEE;
        let (plan, cost, sale) = self.price_plan(
            c,
            a,
            b,
            spec.capacity,
            (co.cash - reserve - toll).max(0.0),
            &route.allowed,
            route.buy_below, route.sell_above,
        );
        let quantity = plan.iter().map(|x| x.1).sum::<usize>();
        let handling = [a,b].iter().map(|i| {let own=self.game.companies[c].posts.get(i).map_or(0.0,|p|p.handling as f64*crate::posts::HANDLING_UNITS);quantity as f64*(1.0-own/rate).max(0.0)*crate::posts::HANDLING_FEE}).sum::<f64>();
        let forecast = (if self.warehouse(c,b){0.0}else{sale-cost}) - (days + 2.0 * quantity as f64 / rate) * daily - toll - handling;
        self.game.companies[c].routes[ri].forecast = forecast;
        let reposition = plan.is_empty() && self.game.companies[c].cash>=toll && {
            let (next,_,_)=self.price_plan(c,b,a,spec.capacity,(self.game.companies[c].cash-reserve-toll).max(0.0),&route.allowed,route.buy_below,route.sell_above);
            !next.is_empty()
        };
        if plan.is_empty()&&!reposition{return false;}
        if reposition {
            self.game.companies[c].routes[ri].forecast = -daily * days - toll;
        }
        if toll > 0.0 {
            self.entry(c, "roadToll", -toll, ship.route, String::new());
            self.game.companies[c].routes[ri].transport.costs += toll;
            let fees:Vec<_>=self.land_connection(a,b).unwrap().roads.iter()
                .map(|&j|(j,self.road_toll(c,j))).collect();
            for (j,fee) in fees {
                if !["state", "private"].contains(&self.game.roads[j].owner.as_str()) {
                    self.game.roads[j].pool += fee * 0.2;
                }
            }
        }
        let mut original_cost = toll;
        // Reserve stock and pay at loading start. Cargo remains unavailable to the
        // destination market until unloading has completed.
        for (g, q) in plan {
            let (quantity,cost)=if self.warehouse(c,a){let cargo=self.take_stock(c,a,g,q,Some(b));(cargo.quantity,cargo.cost)}else{self.trade(c,a,g,q,true,ship.route)};
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
            direct_sale: !self.warehouse(c,b),
            warehouse_units: None,
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
