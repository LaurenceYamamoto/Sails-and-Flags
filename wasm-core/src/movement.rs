use crate::model::*;

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

    pub(crate) fn disaster_in_transit(
        &mut self,
        c: usize,
        ri: usize,
        ship: &mut Ship,
        _v: &Voyage,
        probability: f64,
    ) -> bool {
        if !self.game.events_enabled {
            return false;
        }
        if self.random() >= probability {
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

    pub(crate) fn prepare_sail(&mut self, c: usize) {
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
    }

    pub(crate) fn raid_in_transit(
        &mut self,
        c: usize,
        ri: usize,
        _route: &Route,
        ship: &mut Ship,
        _v: &Voyage,
        chance: f64, fraction:f64, sink:f64,
    ) -> bool {
        if chance <= 0.0 || self.random() >= chance {
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

}
