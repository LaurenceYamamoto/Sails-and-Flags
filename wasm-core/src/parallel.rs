//! Read-only planning jobs. Only the coordinator owns/changes the real game.
//! Pausing occurs at explicit phase boundaries; no company may trade while a
//! batch is outstanding. Worker completion order cannot affect RNG or money.
use crate::model::*;
use crate::phase_jobs::*;
use crate::rival_strategy::Candidate;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::collections::BTreeMap;

pub(crate) enum Stage {
    Begin, Start(usize), Bills(usize), After(usize), History(usize),
    Motion(FleetDay),
    Sales(FleetDay,Vec<CityJob>,Vec<Delivery>),
    Purchases(FleetDay,Vec<CityJob>,Vec<BuyContext>),
    Rival(usize,usize,bool), End(bool), Done,
}
pub(crate) enum Work {
    Schedules {c:usize},
    Movement {day:FleetDay,requests:Vec<Motion>},
    Sales {day:FleetDay,jobs:Vec<CityJob>,deliveries:Vec<Delivery>},
    Purchases {day:FleetDay,jobs:Vec<CityJob>,context:Vec<BuyContext>},
    Investments {jobs:Vec<InvestmentJob>},
    PostMarkets {jobs:Vec<CityJob>},
    Rival {c:usize,phase:usize,early:bool,pairs:Vec<(usize,usize)>},
}
pub(crate) struct Run {
    stage:Stage, days:u64, fraction:bool, pending:Option<Work>,
    minimum:Value, local:Option<Value>,
}
#[derive(Serialize,Deserialize)]
struct Context {
    company:Company, day:u32, roads:Vec<RoadState>,
    markets:Vec<Market>, designs:BTreeMap<String,Spec>,
}
pub(crate) type Schedule = (u32,f64,Vec<f64>);

#[derive(Serialize,Deserialize)]
struct Topology {
    land:Vec<(usize,usize,crate::land_connections::LandConnection)>,
    water:Vec<(usize,usize,crate::water_connections::WaterConnection)>,
}
impl Engine {
    pub(crate) fn planning_topology(&self)->Value {
        json!(serde_json::to_string(&json!({
            "land":self.land_connections.iter().map(|(&(a,b),v)|(a,b,v)).collect::<Vec<_>>(),
            "water":self.water_connections.iter().map(|(&(a,b),v)|(a,b,v)).collect::<Vec<_>>()
        })).unwrap())
    }

    fn schedule_items(&self,c:usize)->Vec<(usize,Vec<usize>)> {
        let mut fleets:BTreeMap<u32,Vec<usize>>=BTreeMap::new();
        for (i,s) in self.game.companies[c].ships.iter().enumerate() {
            if let Some(id)=s.route{fleets.entry(id).or_default().push(i);}
        }
        self.game.companies[c].routes.iter().enumerate()
            .map(|(i,r)|(i,fleets.remove(&r.id).unwrap_or_default())).collect()
    }
    fn planning_context(&self,c:usize,rival:bool)->String {
        let mut company=self.game.companies[c].clone();
        // Historical accounts are never read by these kernels.
        company.accounts=None;company.history.clear();company.ledger.clear();
        company.friendship_history.clear();company.totals.clear();
        if !rival {
            company.posts.clear();
            for s in &mut company.ships{s.name.clear();s.cargo.clear();s.handling=None;s.voyage=None;}
        }
        serde_json::to_string(&Context{company,day:self.game.day,
            roads:self.game.roads.clone(),markets:if rival{self.game.markets.clone()}else{vec![]},
            designs:self.game.designs.clone()}).unwrap()
    }
    fn work_packet(&self,work:&Work,minimum:&Value)->Option<Value> {
        let min=|kind:&str|minimum[kind].as_u64().unwrap_or(0) as usize;
        // Small work remains synchronous: message/serialization cost exceeds
        // arithmetic cost. The coordinator's Rust code sets eligibility.
        let (c,kind,weight,items)=match work {
            Work::Movement{requests,..}=>{
                let weight=requests.len();
                if weight<64.max(min("movement")){return None;}
                return Some(json!({"kind":"movement","weight":weight,"context":"","items":requests}));
            }
            Work::Sales{jobs,..}|Work::Purchases{jobs,..}|Work::PostMarkets{jobs}=>{
                let weight=jobs.iter().map(CityJob::weight).sum::<usize>();
                if jobs.len()<2||weight<min("cities"){return None;}
                return Some(json!({"kind":"cities","weight":weight,"context":"","items":jobs}));
            }
            Work::Investments{jobs}=>{
                let weight=jobs.iter().map(InvestmentJob::weight).sum::<usize>();
                if jobs.len()<2||weight<min("investments"){return None;}
                return Some(json!({"kind":"investments","weight":weight,"context":"","items":jobs}));
            }
            Work::Schedules{c}=>{
                let weight=self.game.companies[*c].ships.len();
                if weight<256.max(min("schedules")) || self.game.companies[*c].routes.len()<8{return None;}
                (*c,"schedules",weight,json!(self.schedule_items(*c)))
            }
            Work::Rival{c,pairs,..}=>{
                let weight=pairs.len()*(1+self.game.companies[*c].ships.len()/10);
                if pairs.len()<64 || weight<min("rival"){return None;}
                (*c,"rival",weight,json!(pairs))
            }
        };
        Some(json!({"kind":kind,"weight":weight,"context":self.planning_context(c,kind=="rival"),"items":items}))
    }
    pub(crate) fn parallel_probe(&mut self,v:&Value)->Result<Value> {
        let run=self.parallel_run.as_ref().ok_or("No simulation in progress")?;
        ensure(v["token"].as_u64()==Some(self.parallel_token),"Stale simulation result")?;
        let result=match run.pending.as_ref().ok_or("No pending planning job")? {
            Work::Movement{requests,..}=>json!(requests.iter().map(Motion::evaluate).collect::<Vec<_>>()),
            Work::Sales{jobs,..}|Work::Purchases{jobs,..}|Work::PostMarkets{jobs}=>json!(jobs.iter().map(CityJob::evaluate).collect::<Vec<_>>()),
            Work::Investments{jobs}=>json!(jobs.iter().map(InvestmentJob::evaluate).collect::<Vec<_>>()),
            Work::Schedules{c}=>json!(self.schedule_items(*c).into_iter().map(|(i,fleet)|{
                let r=&self.game.companies[*c].routes[i];
                let (cycle,offsets,_)=self.schedule_fleet(*c,r,fleet);(r.id,cycle,offsets)
            }).collect::<Vec<_>>()),
            Work::Rival{c,pairs,..}=>json!(pairs.iter().map(|&(a,b)|self.rival_pair_best(*c,a,b)).collect::<Vec<_>>()),
        };
        // Retain only the current batch. Reusing this result on fallback does
        // not repeat simulation mutations, RNG draws or market transactions.
        self.parallel_run.as_mut().unwrap().local=Some(result);
        Ok(json!(true))
    }
    pub(crate) fn finish_work(&mut self,work:Work,result:Option<Value>)->Result<Stage> {
        match work {
            Work::Movement{day,requests}=>Ok(self.finish_motion(day,requests,result)),
            Work::Sales{day,jobs,deliveries}=>Ok(self.finish_sales(day,jobs,deliveries,result)),
            Work::Purchases{day,jobs,context}=>Ok(self.finish_purchases(day,jobs,context,result)),
            Work::Investments{jobs}=>Ok(self.finish_investments(jobs,result)),
            Work::PostMarkets{jobs}=>Ok(self.finish_post_markets(jobs,result)),
            Work::Schedules{c}=>{
                let items=self.schedule_items(c);
                let parsed=result.and_then(|v|serde_json::from_value::<Vec<Schedule>>(v).ok())
                    .filter(|rows|rows.len()==items.len() && rows.iter().zip(&items).all(|((id,cycle,offsets),(i,_))|{
                        let r=&self.game.companies[c].routes[*i];
                        *id==r.id && cycle.is_finite() && *cycle>=1.0
                            && offsets.len()==r.stops.len() && offsets.first()==Some(&0.0)
                            && offsets.iter().all(|v|v.is_finite()&&*v>=0.0&&*v<*cycle)
                            && offsets.windows(2).all(|v|v[0]<v[1])
                    }));
                let rows=parsed.unwrap_or_else(||items.into_iter().map(|(i,fleet)|{
                    let r=&self.game.companies[c].routes[i];
                    let (cycle,offsets,_)=self.schedule_fleet(c,r,fleet);(r.id,cycle,offsets)
                }).collect());
                self.day_fleets.push((c,rows));
                Ok(Stage::Start(c+1))
            }
            Work::Rival{c,phase,early,pairs}=>{
                let parsed=result.and_then(|v|serde_json::from_value::<Vec<Option<Candidate>>>(v).ok())
                    .filter(|rows|rows.len()==pairs.len() && rows.iter().zip(&pairs).all(|(candidate,&(a,b))|
                        candidate.as_ref().is_none_or(|v|v.matches(a,b))));
                let candidates=parsed.unwrap_or_else(||pairs.into_iter().map(|(a,b)|self.rival_pair_best(c,a,b)).collect());
                if let Some(best)=Self::rival_best(candidates) {
                    // All spending still uses the original transactional path.
                    self.apply_rival_candidate(c,best);
                } else if phase==0 {return Ok(Stage::Rival(c,1,early));}
                self.plan_investment(c);
                Ok(if early{Stage::Bills(c)}else{Stage::History(c)})
            }
        }
    }
    pub(crate) fn parallel_begin(&mut self,v:&Value)->Result<Value> {
        ensure(self.parallel_run.is_none(),"Simulation already in progress")?;
        let request=&v["request"];
        let fraction=request["op"]=="advance";
        let days=if fraction {
            let ms=request["ms"].as_f64().unwrap_or(0.0);
            let speed=request["speed"].as_u64().unwrap_or(1);
            ensure(ms.is_finite()&&ms>=0.0&&[1,4,16].contains(&speed),"Invalid clock input")?;
            if request["running"]==true&&!self.game.companies[0].bankrupt {
                self.game.fraction+=ms.min(500.0)*speed as f64/1000.0;
            }
            self.game.fraction.floor() as u64
        } else {
            ensure(request["op"]=="command"&&request["command"]["action"]=="tick","Invalid parallel request")?;
            request["command"]["days"].as_u64().unwrap_or(1).min(31)
        };
        self.parallel_run=Some(Run{stage:Stage::Begin,days,fraction,pending:None,local:None,
            minimum:v["minimum"].clone()});
        self.parallel_pump(None)
    }
    pub(crate) fn parallel_resume(&mut self,v:&Value)->Result<Value> {
        ensure(self.parallel_run.as_ref().is_some_and(|r|r.pending.is_some())
            && v["token"].as_u64()==Some(self.parallel_token),"Stale simulation result")?;
        let run=self.parallel_run.as_mut().unwrap();
        run.minimum=v["minimum"].clone();
        self.parallel_pump(Some(v["results"].clone()))
    }
    fn parallel_pump(&mut self,result:Option<Value>)->Result<Value> {
        let mut run=self.parallel_run.take().ok_or("No simulation in progress")?;
        if let Some(work)=run.pending.take(){
            let result=result.filter(|v|!v.is_null()).or_else(||run.local.take());
            run.local=None;
            run.stage=self.finish_work(work,result)?;
        }
        while run.days>0 {
            let (next,work)=self.day_step(run.stage);run.stage=next;
            if let Some(work)=work {
                if let Some(mut packet)=self.work_packet(&work,&run.minimum) {
                    self.parallel_token+=1;
                    packet["token"]=json!(self.parallel_token);
                    run.pending=Some(work);self.parallel_run=Some(run);
                    return Ok(json!({"done":false,"batch":packet}));
                }
                run.stage=self.finish_work(work,None)?;
            }
            if matches!(run.stage,Stage::Done) {
                if run.fraction {self.game.fraction-=1.0;}
                run.days-=1;run.stage=Stage::Begin;
            }
        }
        Ok(json!({"done":true}))
    }
    // Called only in disposable compute-worker instances, never through the
    // coordinator's dispatch. Scratch state is overwritten for every batch.
    pub(crate) fn compute_planning(&mut self,v:&Value)->Result<Value> {
        match v["kind"].as_str() {
            Some("movement")=>{let jobs:Vec<Motion>=serde_json::from_value(v["items"].clone()).map_err(|e|e.to_string())?;return Ok(json!(jobs.iter().map(Motion::evaluate).collect::<Vec<_>>()));}
            Some("cities")=>{let jobs:Vec<CityJob>=serde_json::from_value(v["items"].clone()).map_err(|e|e.to_string())?;return Ok(json!(jobs.iter().map(CityJob::evaluate).collect::<Vec<_>>()));}
            Some("investments")=>{let jobs:Vec<InvestmentJob>=serde_json::from_value(v["items"].clone()).map_err(|e|e.to_string())?;return Ok(json!(jobs.iter().map(InvestmentJob::evaluate).collect::<Vec<_>>()));}
            _=>{}
        }
        if v["op"]=="initPlanning" {
            let topology:Topology=serde_json::from_str(v["topology"].as_str().ok_or("Missing planning topology")?).map_err(|e|e.to_string())?;
            self.land_connections=topology.land.into_iter().map(|(a,b,p)|((a,b),p)).collect();
            self.water_connections=topology.water.into_iter().map(|(a,b,p)|((a,b),p)).collect();
            return Ok(json!(true));
        }
        let context:Context=serde_json::from_str(v["context"].as_str().ok_or("Missing planning context")?)
            .map_err(|e|e.to_string())?;
        self.game.companies=vec![context.company];self.game.day=context.day;
        self.game.roads=context.roads;self.game.designs=context.designs;self.game.markets=context.markets;
        match v["kind"].as_str() {
            Some("schedules")=>{
                let items:Vec<(usize,Vec<usize>)>=serde_json::from_value(v["items"].clone()).map_err(|e|e.to_string())?;
                let mut rows=vec![];
                for (i,fleet) in items {
                    let r=self.game.companies[0].routes.get(i).ok_or("Unknown planning route")?;
                    ensure(fleet.iter().all(|&j|j<self.game.companies[0].ships.len()),"Invalid planning fleet")?;
                    let (cycle,offsets,_)=self.schedule_fleet(0,r,fleet);rows.push((r.id,cycle,offsets));
                }
                Ok(json!(rows))
            }
            Some("rival")=>{
                let pairs:Vec<(usize,usize)>=serde_json::from_value(v["items"].clone()).map_err(|e|e.to_string())?;
                ensure(pairs.iter().all(|&(a,b)|a<self.data.cities.len()&&b<self.data.cities.len()),"Invalid planning cities")?;
                Ok(json!(pairs.into_iter().map(|(a,b)|self.rival_pair_best(0,a,b)).collect::<Vec<_>>()))
            }
            _=>Err("Unknown planning job".into())
        }
    }
}
