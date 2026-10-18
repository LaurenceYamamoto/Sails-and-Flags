use crate::model::*;
use crate::trade::key;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Serialize, Deserialize)]
pub struct RouteReview {
    pub day: u32,
    pub since: u32,
    pub sales: f64,
    pub costs: f64,
    pub upkeep: f64,
    pub daily: Option<f64>,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct ClosedRoute {pub a: usize, pub b: usize, pub mode: String, pub until: u32}
#[derive(Clone, Default, Serialize, Deserialize)]
pub struct RivalState {
    pub routes: BTreeMap<u32, RouteReview>,
    pub posts: BTreeMap<usize, u32>,
    pub closed: Vec<ClosedRoute>,
    pub closed_posts: BTreeMap<usize, u32>,
    #[serde(default)]
    pub released_licenses: BTreeMap<usize,u32>,
}
impl RivalState {
    pub fn valid(&self, day: u32, cities: usize, nations: usize) -> bool {
        self.routes.len()<=50 && self.posts.len()<=cities && self.closed.len()<=100 && self.closed_posts.len()<=cities
        && self.routes.values().all(|r|r.day<=day&&r.since<=r.day&&[r.sales,r.costs,r.upkeep].iter().all(|&v|amount(v))&&r.daily.is_none_or(|v|v.is_finite()&&v.abs()<=1e14))
        && self.released_licenses.len()<=nations && self.released_licenses.iter().all(|(&n,&d)|n<nations&&d<=day.saturating_add(365))
        && self.posts.iter().all(|(&i,&d)|i<cities&&d<=day)
        && self.closed_posts.iter().all(|(&i,&d)|i<cities&&d<=day.saturating_add(365))
        && self.closed.iter().all(|r|r.a<cities&&r.b<cities&&r.a!=r.b&&["sea","land"].contains(&r.mode.as_str())&&r.until<=day.saturating_add(365))
    }
}
struct Candidate {a:usize,b:usize,kind:String,missing:Vec<usize>,post:Option<usize>,score:f64}
impl Engine {
    // National affinities are fixed to the company's original charter, even
    // after it relinquishes a license. Regions affect AI selection only.
    pub(crate) fn rival_city_weight(&self,c:usize,city:usize)->f64 {
        let co=&self.game.companies[c];
        let Some(start)=self.data.starts.iter().find(|s|s.id==co.id) else{return 1.0;};
        let dest=&self.data.cities[city];
        let nation=if self.rival_home(c)==Some(dest.nation){3.0}else if co.licenses.contains(&dest.nation){1.5}else{1.0};
        let mediterranean=start.preferred_regions.iter().any(|r|r=="mediterranean")
            && (-6.0..=37.0).contains(&dest.lon)&&(30.0..=46.0).contains(&dest.lat);
        nation*if start.preferred_regions.contains(&dest.region)||mediterranean{3.0}else{1.0}
    }
    fn rival_reset_review(&mut self,c:usize,id:u32) {
        let co=&mut self.game.companies[c];
        if let Some(r)=co.routes.iter().find(|r|r.id==id) {
            co.rival_state.as_mut().unwrap().routes.insert(id,RouteReview{day:self.game.day,since:r.transport.since,sales:r.transport.sales,costs:r.transport.costs,upkeep:r.transport.upkeep,daily:None});
        }
    }
    fn rival_shrink_route(&mut self,c:usize,id:u32)->bool {
        let fleet=self.game.companies[c].ships.iter().filter(|s|s.route==Some(id)).map(|s|(s.id,self.daily(c,&s.kind))).collect::<Vec<_>>();
        if fleet.len()<=1{return false;}
        let ship=fleet.into_iter().max_by(|a,b|a.1.total_cmp(&b.1)).unwrap().0;
        let s=self.game.companies[c].ships.iter_mut().find(|s|s.id==ship).unwrap();
        let cost=s.cargo.iter().map(|x|x.cost).sum::<f64>();
        s.cargo.clear();s.voyage=None;s.handling=None;s.route=None;s.next=0;s.ready=self.game.day;
        if cost>0.0{self.entry(c,"routeReorganization",cost,None,"Rival fleet reduction".into());}
        let _=self.sell_ship(c,ship);self.reschedule(c,id);self.rival_reset_review(c,id);
        true
    }
    fn rival_shrink_post(&mut self,c:usize,city:usize)->bool {
        if self.game.day-self.game.companies[c].rival_state.as_ref().unwrap().posts[&city]<90{return false;}
        let routes=self.game.companies[c].routes.iter().filter(|r|r.stops.contains(&city)).map(|r|r.id).collect::<Vec<_>>();
        for &id in &routes {if self.rival_shrink_route(c,id){self.game.companies[c].rival_state.as_mut().unwrap().posts.insert(city,self.game.day);return true;}}
        let p=&self.game.companies[c].posts[&city];
        let change=if p.warehouse>0{Some(("warehouse",p.warehouse-1))}else if p.handling>0{Some(("handling",p.handling-1))}else if p.level>1{Some(("post",p.level-1))}else{None};
        let Some((facility,target))=change else{return false;};
        if self.lower_post(c,city,facility,target).is_err(){return false;}
        for id in routes {self.rival_reset_review(c,id);}
        self.game.companies[c].rival_state.as_mut().unwrap().posts.insert(city,self.game.day);
        true
    }
    fn rival_close_route(&mut self,c:usize,id:u32) {
        if self.game.companies[c].routes.len()<=1{return;}
        let Some(r)=self.game.companies[c].routes.iter().find(|r|r.id==id).cloned() else{return;};
        let cost=self.game.companies[c].ships.iter().filter(|s|s.route==Some(id)).flat_map(|s|&s.cargo).map(|x|x.cost).sum::<f64>();
        // Same explicit in-transit settlement as closing a player's last post.
        if self.remove_route(c,id,true).is_err(){return;}
        if cost>0.0{self.entry(c,"routeReorganization",cost,None,"Rival withdrawal".into());}
        let state=self.game.companies[c].rival_state.as_mut().unwrap();
        state.routes.remove(&id);
        state.closed.push(ClosedRoute{a:r.stops[0],b:r.stops[1],mode:r.mode,until:self.game.day+180});
        if state.closed.len()>100{state.closed.remove(0);}
    }
    fn rival_sell_idle(&mut self,c:usize) {
        let ids=self.game.companies[c].ships.iter().filter(|s|s.can_sell()).map(|s|s.id).collect::<Vec<_>>();
        for id in ids{let _=self.sell_ship(c,id);}
    }
    fn rival_close_post(&mut self,c:usize,city:usize) {
        if self.game.companies[c].posts.len()<=1{return;}
        let co=&self.game.companies[c];let post=&co.posts[&city];
        if post.level>1||post.warehouse>0||post.handling>0||self.game.day-co.rival_state.as_ref().unwrap().posts[&city]<90{return;}
        let routes=self.game.companies[c].routes.iter().filter(|r|r.stops.contains(&city)
            &&!r.stops.iter().any(|i|*i!=city&&self.game.companies[c].posts.contains_key(i))).map(|r|r.id).collect::<Vec<_>>();
        // A post closure must not indirectly remove the last service either.
        if !routes.is_empty()&&routes.len()>=self.game.companies[c].routes.len(){return;}
        for id in routes{self.rival_close_route(c,id);}
        if self.lower_post(c,city,"post",0).is_ok(){
            let state=self.game.companies[c].rival_state.as_mut().unwrap();
            state.posts.remove(&city);state.closed_posts.insert(city,self.game.day+180);
        }
        self.rival_sell_idle(c);
    }
    // Run before daily bills: monthly-only intervention is too late when cash
    // is about to run out. Reviews use interval results, never lifetime margins.
    pub fn rival_retreat(&mut self,c:usize) {
        let day=self.game.day;
        let co=&mut self.game.companies[c];
        let state=co.rival_state.get_or_insert_with(Default::default);
        state.routes.retain(|id,_|co.routes.iter().any(|r|r.id==*id));
        state.posts.retain(|i,_|co.posts.contains_key(i));
        state.closed.retain(|r|r.until>day);state.closed_posts.retain(|_,d|*d>day);state.released_licenses.retain(|_,d|*d>day);
        for &city in co.posts.keys(){state.posts.entry(city).or_insert(day);}
        let routes=co.routes.clone();
        let mut retire=vec![];
        for r in routes {
            let cycle=self.schedule(c,&r).0;
            let window=(2.0*cycle).ceil().clamp(60.0,730.0) as u32;
            let state=self.game.companies[c].rival_state.as_mut().unwrap();
            // Existing saves begin a fresh observation interval: past profits must
            // not conceal new losses. New routes retain their first day's costs.
            let new_route=r.transport.since>=day.saturating_sub(1);
            let review=state.routes.entry(r.id).or_insert(RouteReview{day:if new_route{r.transport.since}else{day},since:r.transport.since,
                sales:if new_route{0.0}else{r.transport.sales},costs:if new_route{0.0}else{r.transport.costs},upkeep:if new_route{0.0}else{r.transport.upkeep},daily:None});
            if review.since!=r.transport.since||r.transport.sales<review.sales||r.transport.costs<review.costs||r.transport.upkeep<review.upkeep{
                *review=RouteReview{day,since:r.transport.since,sales:r.transport.sales,costs:r.transport.costs,upkeep:r.transport.upkeep,daily:None};
            }
            if day-review.day>=window {
                let income=(r.transport.sales-review.sales)-(r.transport.costs-review.costs)-(r.transport.upkeep-review.upkeep);
                let profit=income/(day-review.day) as f64-r.escorts as f64*4.0;
                review.day=day;review.sales=r.transport.sales;review.costs=r.transport.costs;review.upkeep=r.transport.upkeep;review.daily=Some(profit);
                if profit<=0.0 {retire.push((r.id,profit));}
            }
        }
        retire.sort_by(|a,b|a.1.total_cmp(&b.1));
        for (id,_) in retire{if !self.rival_shrink_route(c,id){self.rival_close_route(c,id);}}
        self.rival_sell_idle(c);
        let cities=self.game.companies[c].posts.keys().copied().collect::<Vec<_>>();
        for city in cities {
            let co=&self.game.companies[c];let state=co.rival_state.as_ref().unwrap();
            if day-state.posts[&city]<90 {continue;}
            let routes=co.routes.iter().filter(|r|r.stops.contains(&city)).collect::<Vec<_>>();
            if routes.iter().any(|r|state.routes.get(&r.id).and_then(|s|s.daily).is_none()){continue;}
            let profit=routes.iter().map(|r|state.routes[&r.id].daily.unwrap()/r.stops.iter().filter(|i|co.posts.contains_key(i)).count().max(1) as f64).sum::<f64>();
            // Closing one post also lowers administration at every remaining post.
            let count=co.posts.len();
            let saving=count as f64*self.post_base_upkeep(c)
                -(count-1) as f64*crate::posts::POST_BASE_UPKEEP*self.post_upkeep_multiplier(c).powi(count.saturating_sub(2) as i32)+co.posts[&city].fixed();
            if profit<saving && !self.rival_shrink_post(c,city){self.rival_close_post(c,city);}
        }
        let fixed=self.overhead(c)+self.game.companies[c].ships.iter().map(|s|self.daily(c,&s.kind)).sum::<f64>();
        if self.game.companies[c].cash<14.0*fixed {
            self.scale_investment(c,0.0);self.game.companies[c].diplomacy_budget.fill(0.0);
            // Liquidate the weakest services until there is time to recover.
            let mut routes=self.game.companies[c].routes.iter().filter_map(|r|self.game.companies[c].rival_state.as_ref().unwrap().routes.get(&r.id).and_then(|m|m.daily).map(|daily|(r.id,daily))).collect::<Vec<_>>();
            routes.sort_by(|a,b|a.1.total_cmp(&b.1));
            for (id,profit) in routes {
                let bill=self.overhead(c)+self.game.companies[c].ships.iter().map(|s|self.daily(c,&s.kind)).sum::<f64>();
                if self.game.companies[c].cash>=30.0*bill{break;}
                // A reduced service gets a full new observation interval.
                if !self.rival_shrink_route(c,id) && profit<0.0{self.rival_close_route(c,id);}
                self.rival_sell_idle(c);
            }
            let cities=self.game.companies[c].posts.keys().copied().collect::<Vec<_>>();
            for city in cities {
                if !self.game.companies[c].routes.iter().any(|r|r.stops.contains(&city)) && !self.rival_shrink_post(c,city){self.rival_close_post(c,city);}
            }
        }
        // Voluntary surrender is shared with the player. AI never surrenders
        // its original home charter, or a charter still supporting a service/post.
        let used=self.game.companies[c].routes.iter().flat_map(|r|self.nations_for(&r.auto_type,&r.stops)).chain(self.game.companies[c].posts.keys().map(|&i|self.data.cities[i].nation)).collect::<BTreeSet<_>>();
        let home=self.rival_home(c);
        let unused=self.game.companies[c].licenses.iter().copied().filter(|n|Some(*n)!=home&&!used.contains(n)).collect::<Vec<_>>();
        if day>=30||self.game.companies[c].cash<14.0*fixed {for n in unused {let _=self.return_license(c,n);}}
    }

    pub fn clear_bankrupt_rivals(&mut self) {
        for c in 1..self.game.companies.len() {
            if !self.game.companies[c].bankrupt || self.game.companies[c].acquired {continue;}
            let co=&mut self.game.companies[c];
            co.bankrupt_since.get_or_insert(self.game.day);
            co.routes.clear();co.ships.clear();co.posts.clear();co.licenses.clear();co.designs.clear();
            co.tech_budget.fill(0.0);co.diplomacy_budget.fill(0.0);co.technology.fill(0.0);
            co.auto_route_cities.clear();co.route_policy=None;co.rival_state=None;co.investment_plan=None;
            co.road_auto.enabled=false;co.automation.enabled=false;co.facility_policy=Default::default();co.yard_value=0.0;
            let owner=co.id.clone();
            // Shared infrastructure/production remains; private ownership and
            // all company investment balances are extinguished without refunds.
            for r in &mut self.game.roads {if r.owner==owner {
                r.owner="state".into();r.basis=0.0;r.pool=0.0;r.road_budget=0.0;r.security_budget=0.0;
            }}
            for d in &mut self.game.development {if d.owner==owner {
                d.owner="state".into();d.basis=0.0;d.pool=0.0;d.size_budget=0.0;d.production_budget.fill(0.0);
            }}
        }
    }
    fn rival_candidate(&self,c:usize,a:usize,b:usize,kind:&str)->Option<Candidate> {
        let co=&self.game.companies[c];let spec=self.spec(kind).ok()?;
        if !self.can_serve(kind,&[a,b]) || (co.kind=="small"&&["brig","fluyt"].contains(&kind)){return None;}
        let state=co.rival_state.as_ref()?;
        if state.closed.iter().any(|r|r.mode==spec.mode&&key(&[r.a,r.b])==key(&[a,b])){return None;}
        let old=co.routes.iter().find(|r|r.mode==spec.mode&&key(&r.stops)==key(&[a,b]));
        if let Some(r)=old {
            if co.ships.iter().filter(|s|s.route==Some(r.id)).count()>=3 || state.routes.get(&r.id).and_then(|r|r.daily).is_none_or(|p|p<=2.0)
                || r.activity.idle_ratio().is_none_or(|v|v>10.0){return None;}
        } else if co.routes.len()>=50 {return None;}
        let post=if self.has_post(c,&[a,b]){None}else{
            let mut choices=[a,b].into_iter().filter(|i|!state.closed_posts.contains_key(i)).collect::<Vec<_>>();
            choices.sort_by(|&a,&b|self.rival_city_weight(c,b).total_cmp(&self.rival_city_weight(c,a)).then(a.cmp(&b)));
            Some(*choices.first()?)
        };
        let missing=self.nations_for(kind,&[a,b]).into_iter().filter(|n|!co.licenses.contains(n)).collect::<Vec<_>>();
        if missing.iter().any(|&n|co.friendship[n]<30.0||state.released_licenses.contains_key(&n)){return None;}
        let idle=co.ships.iter().any(|s|s.can_sell()&&s.kind==kind);
        if !idle&&co.ships.len()>=150{return None;}
        let cost=if idle{0.0}else{spec.price}+if post.is_some(){self.post_open_cost(c)}else{0.0}
            +missing.iter().enumerate().map(|(i,&n)|self.terms(c,n,co.licenses.len()+i).0).sum::<f64>();
        let post_delta=if post.is_some(){let n=co.posts.len();(n+1) as f64*crate::posts::POST_BASE_UPKEEP*self.post_upkeep_multiplier(c).powi(n as i32)-n as f64*self.post_base_upkeep(c)+0.5}else{0.0};
        let license_daily=missing.iter().map(|&n|self.terms(c,n,0).1).sum::<f64>();
        let fixed=self.overhead(c)+co.ships.iter().map(|s|self.daily(c,&s.kind)).sum::<f64>()+post_delta+license_daily+if idle{0.0}else{self.daily(c,kind)};
        let reserve=if co.kind=="small"{300.0}else if co.kind=="medium"{1000.0}else{2500.0};
        let budget=co.cash-cost-reserve-30.0*fixed;
        if budget<=0.0{return None;}
        let goods=(0..self.data.goods.len()).collect::<Vec<_>>();
        let mut profit=0.0;let mut handling=0.0;let mut working:f64=0.0;let mut units=0;
        for (from,to) in [(a,b),(b,a)] {
            let (cargo,paid,sales)=self.load_plan(c,from,to,spec.capacity,budget,&goods,0.0);
            let quantity=cargo.iter().map(|x|x.1).sum::<usize>();
            units+=quantity;working=working.max(paid);
            profit+=sales-paid-2.0*quantity as f64*crate::posts::HANDLING_FEE;
            handling+=2.0*quantity as f64/self.handling_rate(c,&spec.mode);
        }
        if units==0||working>budget{return None;}
        let cycle=2.0*self.days(kind,a,b) as f64+handling;
        let toll=if spec.mode=="land"{2.0*self.toll(c,a,b)}else{0.0};
        let gross=(profit-toll)/cycle-self.daily(c,kind);
        // A first route must support its existing hub and licenses too. A new
        // hub must earn back its network-wide marginal overhead, with a buffer.
        let required=license_daily+post_delta+if co.routes.is_empty(){self.overhead(c)}else{0.0};
        let net=gross*0.75-required-cost/730.0;
        if net<=1.0{return None;}
        let affinity=if post.is_none(){
            if co.posts.contains_key(&a){self.rival_city_weight(c,b)}else{self.rival_city_weight(c,a)}
        }else{(self.rival_city_weight(c,a)*self.rival_city_weight(c,b)).sqrt()};
        Some(Candidate{a,b,kind:kind.into(),missing,post,score:net*affinity})
    }
    pub fn rival_expand(&mut self,c:usize) {
        let n=self.data.cities.len();
        let hubs=self.game.companies[c].posts.keys().copied().collect::<Vec<_>>();
        let mut pairs=BTreeSet::new();
        for &a in &hubs {for b in 0..n {if a!=b{pairs.insert((a.min(b),a.max(b)));}}}
        // Evaluate existing hubs first; opening another post is a fallback only.
        for phase in 0..2 {
            if phase==1 {
                if self.game.companies[c].routes.len()>=50{return;}
                let mut cities=(0..n).collect::<Vec<_>>();
                cities.sort_by(|&a,&b|self.rival_city_weight(c,b).total_cmp(&self.rival_city_weight(c,a)).then(a.cmp(&b)));
                let offset=(self.game.day as usize/30*17+c*7)%cities.len();
                let anchors=cities.iter().take(16).chain(cities.iter().cycle().skip(offset).take(8)).copied().collect::<BTreeSet<_>>();
                pairs.clear();
                for a in anchors {
                    let mut targets=(0..n).filter(|&b|b!=a).collect::<Vec<_>>();
                    let score=|b:usize|{let x=&self.data.cities[a];let y=&self.data.cities[b];self.rival_city_weight(c,b)/(1.0+(x.lon-y.lon).hypot(x.lat-y.lat))};
                    targets.sort_by(|&a,&b|score(b).total_cmp(&score(a)).then(a.cmp(&b)));
                    for b in targets.into_iter().take(16){if !self.has_post(c,&[a,b]){pairs.insert((a.min(b),a.max(b)));}}
                }
            }
            let mut best:Option<Candidate>=None;
            for &(a,b) in &pairs {
                for kind in ["sloop","brig","fluyt","wagon","caravan"] {
                    if let Some(candidate)=self.rival_candidate(c,a,b,kind) {
                        if best.as_ref().is_none_or(|old|candidate.score>old.score){best=Some(candidate);}
                    }
                }
            }
            if let Some(best)=best {
                // Avoid a partially bought charter/post if opening is rejected.
                let before=self.game.clone();
                let result=(||->Result<()>{
                    for nation in best.missing{self.buy_license(c,nation)?;}
                    if let Some(city)=best.post{self.build_post(c,city)?;}
                    self.open(c,&best.kind,vec![best.a,best.b],(0..self.data.goods.len()).collect(),0.0)?;
                    Ok(())
                })();
                if result.is_err(){self.game=before;}
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn city(e:&Engine,id:&str)->usize {e.data.cities.iter().position(|c|c.id==id).unwrap()}
    fn fixture()->Engine {
        let mut e=Engine::new();e.initialize(1700,false);
        e.game.companies[9].rival_state=Some(RivalState::default());
        e.game.companies[9].cash=60000.0;
        let a=city(&e,"genoa");let b=city(&e,"livorno");let n=e.data.goods.len();
        for good in 0..n {e.game.markets[a*n+good].stock=2000.0;e.game.markets[b*n+good].stock=0.0;}
        e
    }
    #[test]
    fn regional_preference_affects_feasible_trade_scores_and_original_charter_survives_license_release() {
        let mut e=fixture();let a=city(&e,"genoa");let b=city(&e,"livorno");
        let weighted=e.rival_candidate(9,a,b,"sloop").unwrap().score;
        e.data.starts[8].preferred_regions.clear();
        let neutral=e.rival_candidate(9,a,b,"sloop").unwrap().score;
        assert!((weighted-neutral*3.0).abs()<1e-8);
        let home=e.rival_city_weight(9,a);
        e.game.companies[9].licenses.clear();
        assert_eq!(e.rival_city_weight(9,a),home);
        assert!(e.rival_city_weight(9,a)>e.rival_city_weight(9,b));
    }
    #[test]
    fn rivals_share_license_settlement_but_cannot_surrender_their_home_charter() {
        let mut e=fixture();let home=e.data.starts[8].licenses[0];let foreign=e.data.starts[8].licenses[1];
        let before=serde_json::to_string(&e.game).unwrap();
        assert!(e.return_license(9,home).is_err());assert_eq!(serde_json::to_string(&e.game).unwrap(),before);
        let a=city(&e,"genoa");let b=city(&e,"livorno");
        e.open(9,"sloop",vec![a,b],vec![0],0.0).unwrap();
        e.return_license(9,foreign).unwrap();
        assert!(e.game.companies[9].licenses.contains(&home));assert!(!e.game.companies[9].licenses.contains(&foreign));
        assert!(e.game.companies[9].routes.is_empty());assert!(e.game.companies[9].ships.iter().all(|s|s.can_sell()));
        assert!(e.game.companies[9].rival_state.as_ref().unwrap().released_licenses.contains_key(&foreign));
    }
    #[test]
    fn existing_hub_is_used_first_and_the_last_post_and_route_are_protected() {
        let mut e=fixture();let a=city(&e,"genoa");
        e.rival_expand(9);
        assert_eq!(e.game.companies[9].posts.keys().copied().collect::<Vec<_>>(),vec![a]);
        assert_eq!(e.game.companies[9].routes.len(),1);
        assert!(e.game.companies[9].routes[0].stops.contains(&a));
        let id=e.game.companies[9].routes[0].id;
        e.rival_close_route(9,id);e.rival_close_post(9,a);
        assert_eq!(e.game.companies[9].routes.len(),1);
        assert_eq!(e.game.companies[9].posts.len(),1);
    }
}
