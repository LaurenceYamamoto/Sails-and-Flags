use crate::model::*;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeSet;

#[derive(Clone, Serialize, Deserialize)]
pub struct VehicleRule { pub min: f64, pub max: f64, pub kind: String }
#[derive(Clone, Serialize, Deserialize)]
pub struct RoutePolicy {
    pub enabled: bool,
    pub ships: Vec<String>,
    pub vehicles: Vec<VehicleRule>,
}
impl RoutePolicy {
    pub fn valid<'a>(&self, mode: impl Fn(&str)->Option<&'a str>) -> bool {
        self.ships.len()<=128 && self.vehicles.len()<=128
            && self.ships.iter().collect::<BTreeSet<_>>().len()==self.ships.len()
            && self.ships.iter().all(|s|mode(s)==Some("sea"))
            && self.vehicles.iter().all(|r|mode(&r.kind)==Some("land")
                && r.min.is_finite() && r.max.is_finite() && r.min>=0.0 && r.max<=1.0 && r.min<=r.max)
    }
}
impl Engine {
    pub fn set_route_policy(&mut self, value:&Value)->Result<()> {
        let p:RoutePolicy=serde_json::from_value(value.clone()).map_err(|_|"対象が不正です。")?;
        ensure(p.valid(|id|self.spec(id).ok().map(|s|s.mode.as_str()))
            && p.ships.iter().chain(p.vehicles.iter().map(|r|&r.kind)).all(|s|self.producible(0,s)),"対象が不正です。")?;
        self.game.companies[0].route_policy=Some(p);
        Ok(())
    }
    pub fn policy_kind(&self, mode:&str, stops:&[usize])->Option<String> {
        let p=self.game.companies[0].route_policy.as_ref()?;
        let eligible=|s:&str|self.producible(0,s)&&self.can_serve(s,stops);
        if mode=="sea" { return p.ships.iter().find(|s|eligible(s)).cloned(); }
        let paths=stops.iter().enumerate().map(|(i,&a)|self.land_connection(a,stops[(i+1)%stops.len()]))
            .collect::<Option<Vec<_>>>()?;
        let roads:Vec<_>=paths.iter().flat_map(|p|p.roads.iter().copied()).collect();
        let distance:f64=roads.iter().map(|&r|self.data.roads[r].km).sum();
        if distance<=0.0 {return None;}
        let pass=roads.iter().map(|&r|self.road_passability(r)*self.data.roads[r].km).sum::<f64>()/distance;
        p.vehicles.iter().find(|r|r.min<=pass && pass<=r.max && eligible(&r.kind)).map(|r|r.kind.clone())
    }
    pub(crate) fn cash_reserve(&self)->f64 { let c=&self.game.companies[0];c.investment_plan.as_ref().map_or(c.automation.reserve.max(c.road_auto.reserve),|p|p.reserve) }
    // Called also with a vessel temporarily removed by the movement loop.
    pub fn maintenance_target(&self, ship:&Ship)->Option<(String,Option<u32>,f64)> {
        let co=&self.game.companies[0];
        if !co.automation.enabled || !co.route_policy.as_ref()?.enabled
            || ship.voyage.is_some() || ship.handling.is_some() || !ship.cargo.is_empty() {return None;}
        let r=co.routes.iter().find(|r|Some(r.id)==ship.route && r.active && r.auto_manage)?;
        let kind=self.policy_kind(&r.mode,&r.stops)?;
        if kind==ship.kind {return None;}
        let idle=co.ships.iter().find(|s|s.id!=ship.id && s.kind==kind && s.route.is_none()
            && s.voyage.is_none() && s.handling.is_none() && s.cargo.is_empty()).map(|s|s.id);
        let purchase=if idle.is_some(){0.0}else{self.spec(&kind).ok()?.price};
        let net=purchase-self.spec(&ship.kind).ok()?.price;
        if co.cash-net<self.cash_reserve() {return None;}
        Some((kind,idle,purchase))
    }
    pub fn maintain_routes(&mut self) {
        if !self.game.companies[0].route_policy.as_ref().is_some_and(|p|p.enabled) {return;}
        // Configure future scaling and disaster replacements before any purchases.
        let updates:Vec<_>=self.game.companies[0].routes.iter().enumerate()
            .filter(|(_,r)|r.active && r.auto_manage)
            .filter_map(|(i,r)|self.policy_kind(&r.mode,&r.stops).map(|k|(i,k))).collect();
        for (i,kind) in updates {
            let r=&mut self.game.companies[0].routes[i];
            r.auto_type=kind.clone();
            r.replacements.fill(kind);
        }
        let ids:Vec<_>=self.game.companies[0].ships.iter().map(|s|s.id).collect();
        let mut changed=BTreeSet::new();
        for id in ids {
            let Some(i)=self.game.companies[0].ships.iter().position(|s|s.id==id) else {continue;};
            let old=self.game.companies[0].ships[i].clone();
            let Some((kind,idle,purchase))=self.maintenance_target(&old) else {continue;};
            let sale=self.spec(&old.kind).unwrap().price;
            // Settle the sale and optional purchase against the shared cash reserve.
            self.entry(0,"shipSale",sale,None,old.name.clone());
            if purchase>0.0 {self.entry(0,"shipPurchase",-purchase,None,kind.clone());}
            if let Some(idle)=idle {
                self.game.companies[0].ships.remove(i);
                let s=self.game.companies[0].ships.iter_mut().find(|s|s.id==idle).unwrap();
                s.route=old.route;s.next=old.next;s.ready=old.ready;
            } else {self.game.companies[0].ships[i].kind=kind;}
            changed.insert(old.route.unwrap());
        }
        for id in changed {self.reschedule(0,id);}
    }
    pub fn auto_create_routes(&mut self) {
        let co=&self.game.companies[0];
        if co.auto_route_cities.is_empty() || co.route_policy.is_none() || co.cash<self.cash_reserve() {return;}
        // Include existing circuit legs and paused routes; never duplicate their city pairs.
        let pair=|a:usize,b:usize|if a<b {(a,b)}else{(b,a)};
        let existing:BTreeSet<_>=co.routes.iter().flat_map(|r|r.stops.iter().enumerate()
            .map(|(i,&a)|pair(a,r.stops[(i+1)%r.stops.len()]))).collect();
        let mut seen=BTreeSet::new();let mut candidates=Vec::new();
        for &a in &co.auto_route_cities {
            if !co.licenses.contains(&self.data.cities[a].nation) {continue;}
            for b in 0..self.data.cities.len() {
                if a==b || existing.contains(&pair(a,b)) || !seen.insert(pair(a,b))
                    || !co.licenses.contains(&self.data.cities[b].nation) {continue;}
                if !self.has_post(0,&[a,b]){continue;}
                for mode in ["sea","land"] {
                    let Some(kind)=self.policy_kind(mode,&[a,b]) else {continue;};
                    if !self.nations_for(&kind,&[a,b]).iter().all(|n|co.licenses.contains(n)) {continue;}
                    // Sea distance is nautical miles; compare modes in kilometres.
                    let km=self.distance(&kind,a,b)*if mode=="sea"{1.852}else{1.0};
                    candidates.push((km,a,b,kind));break;
                }
            }
        }
        candidates.sort_by(|a,b|a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)).then(a.2.cmp(&b.2)));
        for (_,a,b,kind) in candidates {
            let Ok(q)=self.opening(0,&kind,&[a,b]) else {continue;};
            if self.game.companies[0].cash-q["cost"].as_f64().unwrap()<self.cash_reserve() {continue;}
            if let Ok(id)=self.open(0,&kind,vec![a,b],(0..self.data.goods.len()).collect(),10.0) {
                let counts=self.game.companies[0].route_escorts.unwrap_or([0,0]);
                let route=self.game.companies[0].routes.iter_mut().find(|r|r.id==id).unwrap();
                route.escorts=counts[if route.mode=="sea"{0}else{1}];
            }
        }
    }
}
