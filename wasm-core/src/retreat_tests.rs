//! Frozen 4.1.7 retreat implementation used only as a behavioral oracle.
use crate::model::*;
use crate::rival_strategy::*;
use std::collections::BTreeSet;
const C:usize=9;
fn fixture(land:bool)->Engine {
    let mut e=Engine::new_planner();
    if land {e.land_connections=crate::land_connections::connections(&e.data);}
    let city=|id:&str|e.data.cities.iter().position(|x|x.id==id).unwrap();
    let (a,b,kind)=if land {let r=e.data.roads.iter().find(|r|!r.retired&&e.can_serve("wagon",&[r.a,r.b])).unwrap();(r.a,r.b,"wagon")}
        else {(city("genoa"),city("livorno"),"sloop")};
    let co=&mut e.game.companies[C];
    co.cash=1e9;co.licenses=(0..e.data.nations.len()).collect();co.technology.fill(60.0);
    co.posts.clear();co.routes.clear();co.ships.clear();co.rival_state=Some(RivalState::default());
    co.posts.insert(a,crate::posts::TradingPost::new(e.data.goods.len()));
    e.open(C,kind,vec![a,b],vec![0],0.0).unwrap();
    e.game.day=1000;
    let co=&mut e.game.companies[C];let r=&mut co.routes[0];
    r.transport.since=1000;r.transport.sales=0.0;r.transport.costs=100.0;r.transport.upkeep=0.0;
    co.rival_state.as_mut().unwrap().routes.insert(r.id,RouteReview{day:1000,since:1000,sales:0.0,costs:0.0,upkeep:0.0,daily:None});
    co.rival_state.as_mut().unwrap().posts.insert(a,1000);
    e
}
fn compare(e:&mut Engine) {
    let initial=e.game.clone();
    e.rival_retreat_reference(C);
    let expected=serde_json::to_string(&e.game).unwrap();
    e.game=initial;e.rival_retreat(C);
    assert_eq!(serde_json::to_string(&e.game).unwrap(),expected,"day {}",e.game.day);
}
fn window(e:&Engine)->u32 {(2.0*e.schedule(C,&e.game.companies[C].routes[0]).0).ceil().clamp(60.0,730.0) as u32}
#[test]
fn retreat_matches_at_minimum_actual_and_maximum_windows() {
    for rate in [1e6,2.0,0.01] {
        let mut e=fixture(false);e.game.companies[C].routes[0].handling_rate=rate;
        let w=window(&e);
        if rate==1e6 {assert_eq!(w,60);} else if rate==0.01 {assert_eq!(w,730);} else {assert!(w>60&&w<730);}
        for day in [1059,1000+w-1,1000+w] {
            e.game.day=day;compare(&mut e);
            let co=&e.game.companies[C];let review=&co.rival_state.as_ref().unwrap().routes[&co.routes[0].id];
            assert_eq!(review.day,if day<1000+w {1000}else{day});
            assert_eq!(co.routes.len(),1);assert_eq!(co.posts.len(),1);
        }
    }
}
#[test]
fn retreat_initializes_and_resets_before_skipping_but_keeps_cash_and_license_actions() {
    for case in 0..7 {
        let mut e=fixture(false);e.game.day=1059;
        let co=&mut e.game.companies[C];let id=co.routes[0].id;
        match case {
            0=>{co.rival_state.as_mut().unwrap().routes.clear();},
            1=>{co.routes[0].transport.since=1058;co.rival_state.as_mut().unwrap().routes.clear();},
            2=>{co.routes[0].transport.since=1001;},
            3=>{co.rival_state.as_mut().unwrap().routes.get_mut(&id).unwrap().sales=10.0;},
            4=>{co.rival_state.as_mut().unwrap().routes.get_mut(&id).unwrap().costs=200.0;},
            5=>{co.rival_state.as_mut().unwrap().routes.get_mut(&id).unwrap().upkeep=10.0;},
            _=>{co.cash=0.01;co.tech_budget.fill(10.0);co.diplomacy_budget.fill(10.0);},
        }
        compare(&mut e);
        let co=&e.game.companies[C];let review=&co.rival_state.as_ref().unwrap().routes[&id];
        assert_eq!(review.day,if case==1{1058}else if case==6{1000}else{1059});
        assert!(review.daily.is_none());
        assert!(co.licenses.len()<e.data.nations.len(),"unused licenses must still be returned");
        if case==6 {assert!(co.tech_budget.iter().chain(&co.diplomacy_budget).all(|x|*x==0.0));}
    }
}
#[test]
fn retreat_recomputes_current_cycle_after_fleet_handling_and_road_changes() {
    for land in [false,true] {
        let mut e=fixture(land);
        e.game.companies[C].routes[0].handling_rate=0.01;
        for day in 1001..=1729 {
            e.game.day=day;
            if day==1061 {
                e.game.companies[C].routes[0].handling_rate=1000.0;
                // Research can reschedule handling; fleet and roads can also
                // change between observations, so no old cycle may be retained.
                e.game.companies[C].technology[if land{5}else{2}]=80.0;
                e.game.companies[C].ships[0].kind=if land{"caravan"}else{"brig"}.into();
                for road in &mut e.game.roads {road.quality=100.0;}
            }
            compare(&mut e);
        }
        let co=&e.game.companies[C];
        assert!(co.rival_state.as_ref().unwrap().routes[&co.routes[0].id].day>1000,"changed window must be observed before the old 730-day deadline");
    }
}
#[test]
fn retreat_shrinks_then_closes_on_identical_review_days() {
    let mut e=fixture(false);
    let a=*e.game.companies[C].posts.keys().next().unwrap();
    let b=e.data.cities.iter().position(|x|x.id=="marseille").unwrap();
    e.open(C,"sloop",vec![a,b],vec![0],0.0).unwrap();
    let id=e.game.companies[C].routes[0].id;
    let ship=e.buy_ship(C,"sloop").unwrap();e.assign(C,id,ship).unwrap();
    e.game.companies[C].routes[0].handling_rate=1e6;
    // The other service stays profitable and protects the first route from
    // being the final service; the first service loses money each day.
    let mut shrink=None;let mut closed=None;
    for day in 1001..=1730 {
        e.game.day=day;
        for r in &mut e.game.companies[C].routes {if r.id==id {r.transport.costs+=100.0;}else{r.transport.sales+=10000.0;}}
        let before=e.game.companies[C].ships.iter().filter(|s|s.route==Some(id)).count();
        compare(&mut e);
        let co=&e.game.companies[C];let count=co.ships.iter().filter(|s|s.route==Some(id)).count();
        if before==2&&count==1 {shrink=Some(day);}
        if !co.routes.iter().any(|r|r.id==id) {closed=Some(day);break;}
    }
    assert_eq!(shrink,Some(1060));assert!(closed.is_some_and(|d|d>=1120));
}
impl Engine {
    fn rival_retreat_reference(&mut self,c:usize) {
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

}
