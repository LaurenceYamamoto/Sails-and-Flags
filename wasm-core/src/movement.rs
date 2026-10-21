use crate::model::*;

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture()->Engine {
        let mut e=Engine::new_planner();
        let a=e.data.cities.iter().position(|c|c.id=="london").unwrap();
        let b=e.data.cities.iter().position(|c|c.id=="nantes").unwrap();
        e.game.companies[0].cash=1e9;
        e.game.companies[0].licenses=(0..e.data.nations.len()).collect();
        e.game.companies[0].posts.insert(a,crate::posts::TradingPost::new(e.data.goods.len()));
        e.open(0,"sloop",vec![a,b],vec![0],0.0).unwrap();
        e.game.companies[0].ships[0].cargo=vec![Cargo{good:0,quantity:11,cost:23.5}];
        e.game.events_enabled=true;e
    }
    #[test]
    fn in_place_disaster_and_raid_preserve_draw_order_and_cargo_basis() {
        let mut e=fixture();let mut expected=e.game.rng;
        for sink in [0.0,1.0] {
            e.game.companies[0].ships[0].cargo=vec![Cargo{good:0,quantity:11,cost:23.5}];
            let mut draws=vec![];
            for _ in 0..3 {expected=expected.wrapping_mul(1664525).wrapping_add(1013904223);draws.push(expected as f64/4294967296.0);}
            let q=if sink==1.0 {11} else {(11.0*0.5*(0.5+draws[1]/2.0)).ceil() as usize};
            let lost=e.raid_in_transit(0,0,0,1.0,0.5,sink);
            assert_eq!(lost,sink==1.0);assert_eq!(e.game.rng,expected);
            let cargo=&e.game.companies[0].ships[0].cargo;
            assert_eq!(cargo.iter().map(|x|x.quantity).sum::<usize>(),11-q);
            if q==11 {assert!(cargo.is_empty());}
            else {assert_eq!(cargo[0].cost.to_bits(),(23.5-cargo_basis(23.5,11,q)).to_bits());}
        }
        expected=expected.wrapping_mul(1664525).wrapping_add(1013904223);
        assert!(e.disaster_in_transit(0,0,0,1.0));assert_eq!(e.game.rng,expected);
        assert_eq!(e.game.companies[0].routes[0].replacements,vec!["sloop","sloop"]);
        e.game.events_enabled=false;
        assert!(!e.disaster_in_transit(0,0,0,1.0));assert_eq!(e.game.rng,expected);
    }
}

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
        si: usize,
        probability: f64,
    ) -> bool {
        if !self.game.events_enabled {
            return false;
        }
        if self.random() >= probability {
            return false;
        }
        let ship = &self.game.companies[c].ships[si];
        let spec = self.spec(&ship.kind).unwrap();
        let land = spec.mode == "land";
        let hull = spec.price;
        let cargo = ship.cargo.iter().map(|x| x.cost).sum::<f64>();
        let co = &mut self.game.companies[c];
        let ship = &co.ships[si];
        let r = &mut co.routes[ri];
        r.ship_loss += hull;
        r.cargo_loss += cargo;
        r.transport.costs += hull + cargo;
        if r.replacements.len() < 200 {
            r.replacements.push(ship.kind.clone());
        }
        self.event(
            if land { "landDisaster" } else { "seaDisaster" },
            format!("{} · {}", self.game.companies[c].name, self.game.companies[c].ships[si].name),
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
        si: usize,
        chance: f64, fraction:f64, sink:f64,
    ) -> bool {
        if chance <= 0.0 || self.random() >= chance {
            return false;
        }
        let severity = self.random();
        let lost = self.random() < sink;
        let mut cost = 0.0;
        let ship = &mut self.game.companies[c].ships[si];
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
                self.game.companies[c].name, self.game.companies[c].ships[si].name
            ),
        );
        if lost {
            let value = self.spec(&self.game.companies[c].ships[si].kind).unwrap().price;
            let co = &mut self.game.companies[c];
            let ship = &co.ships[si];
            let r = &mut co.routes[ri];
            r.ship_loss += value;
            r.transport.costs += value;
            if r.replacements.len() < 200 {
                r.replacements.push(ship.kind.clone());
            }
        }
        lost
    }

}
