use crate::model::*;
use crate::posts::{POST_COST,WAREHOUSE_UNITS,HANDLING_UNITS};
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};

#[derive(Clone,Serialize,Deserialize)]
pub struct FacilityRule {pub enabled:bool,pub percent:f64,pub days:u32}
impl FacilityRule {
 fn new(percent:f64,days:u32)->Self{Self{enabled:false,percent,days}}
 fn valid(&self)->bool{self.percent.is_finite()&&(0.0..=100.0).contains(&self.percent)&&(1..=30).contains(&self.days)}
}
#[derive(Clone,Serialize,Deserialize)]
pub struct FacilityPolicy {pub warehouse_up:FacilityRule,pub warehouse_down:FacilityRule,pub handling_up:FacilityRule,pub handling_down:FacilityRule}
impl Default for FacilityPolicy {fn default()->Self{Self{warehouse_up:FacilityRule::new(90.0,10),warehouse_down:FacilityRule::new(50.0,30),handling_up:FacilityRule::new(100.0,3),handling_down:FacilityRule::new(50.0,20)}}}
impl FacilityPolicy {
 pub fn valid(&self)->bool{[&self.warehouse_up,&self.warehouse_down,&self.handling_up,&self.handling_down].iter().all(|r|r.valid())&&self.warehouse_up.percent>self.warehouse_down.percent&&self.handling_up.percent>self.handling_down.percent}
}
#[derive(Clone,Default,Serialize,Deserialize)]
pub struct FacilityMonitor {#[serde(default)] pub expansion_pending:bool,pub up:u32,pub down:u32,pub sampled:Option<u32>,pub changed:Option<u32>}
impl FacilityMonitor {pub fn valid(&self,day:u32)->bool{self.up<=30&&self.down<=30&&self.sampled.is_none_or(|d|d<=day)&&self.changed.is_none_or(|d|d<=day)}}

pub fn reserved_units(s:&Ship)->usize{
 let units=s.cargo.iter().map(|x|x.quantity).sum::<usize>();
 s.voyage.as_ref().or(s.handling.as_ref().map(|h|&h.trip)).map_or(0,|v|if v.direct_sale{0}else{units.min(v.warehouse_units.unwrap_or(usize::MAX))})
}

impl Engine {
 pub fn post_level_quote(&self,target:u32,raise:bool)->Result<Value>{
  ensure(target<=10000&&(!raise||target>0),"Invalid facility settings")?;
  let rows=self.game.companies[0].posts.iter().filter(|(_,p)|if raise{p.level<target}else{p.level>target}).map(|(&city,p)|json!({"city":city,"from":p.level,"to":target})).collect::<Vec<_>>();
  let cost=if raise{rows.iter().map(|r|{let old=r["from"].as_u64().unwrap() as f64;POST_COST*((target as f64)*(target as f64-1.0)-old*(old-1.0))/2.0}).sum()}else{0.0};
  Ok(json!({"rows":rows,"count":rows.len(),"cost":cost}))
 }
 pub fn bulk_post_level(&mut self,target:u32,raise:bool)->Result<()> {
  self.playable(0)?;let q=self.post_level_quote(target,raise)?;self.affordable(0,q["cost"].as_f64().unwrap())?;
  let cities=q["rows"].as_array().unwrap().iter().map(|r|r["city"].as_u64().unwrap() as usize).collect::<Vec<_>>();
  for city in cities {
   if raise{
    let old=self.game.companies[0].posts[&city].level;
    let cost=POST_COST*((target as f64)*(target as f64-1.0)-(old as f64)*(old as f64-1.0))/2.0;
    let p=self.game.companies[0].posts.get_mut(&city).unwrap();p.level=target;p.basis+=cost;
    self.entry(0,"postConstruction",-cost,None,self.data.cities[city].id.clone());
   }else{self.lower_post(0,city,"post",target)?;}
  }Ok(())
 }
 pub fn lower_post(&mut self,c:usize,city:usize,facility:&str,target:u32)->Result<()> {
  self.playable(c)?;
  let p=self.game.companies[c].posts.get(&city).ok_or("A trading post is required")?;
  let old=match facility{"post"=>p.level,"warehouse"=>p.warehouse,"handling"=>p.handling,_=>return Err("Unknown facility".into())};
  ensure(target<old,"Invalid facility settings")?;
  if facility=="post"&&target==0 {
   // Settle only routes which lose their last endpoint post; ships remain owned.
   let routes=self.game.companies[c].routes.iter().filter(|r|r.stops.contains(&city)&&!r.stops.iter().any(|i|*i!=city&&self.game.companies[c].posts.contains_key(i))).map(|r|r.id).collect::<Vec<_>>();
   for id in routes {
    let cost=self.game.companies[c].ships.iter().filter(|s|s.route==Some(id)).flat_map(|s|&s.cargo).map(|x|x.cost).sum::<f64>();
    self.remove_route(c,id,true)?;
    if cost>0.0{self.entry(c,"routeReorganization",cost,None,self.data.cities[city].id.clone());}
   }
   self.trim_warehouse(c,city,0);
   self.game.companies[c].posts.remove(&city);
   self.game.companies[c].auto_route_cities.retain(|i|*i!=city);
   return Ok(());
  }
  if facility=="warehouse"{self.trim_warehouse(c,city,target as usize*WAREHOUSE_UNITS);}
  let p=self.game.companies[c].posts.get_mut(&city).unwrap();
  let writeoff=if facility=="post"{POST_COST*((old as f64)*(old as f64-1.0)-(target as f64)*(target as f64-1.0))/2.0}else{500.0*(old-target) as f64};
  p.basis=(p.basis-writeoff).max(0.0);
  match facility {
   "post"=>p.level=target,
   "warehouse"=>{p.warehouse=target;p.monitoring[0]=FacilityMonitor{changed:Some(self.game.day),..Default::default()};},
   _=>{p.handling=target;p.monitoring[1]=FacilityMonitor{changed:Some(self.game.day),..Default::default()};}
  }Ok(())
 }
 fn trim_warehouse(&mut self,c:usize,city:usize,capacity:usize){
  let mut excess=self.game.companies[c].posts[&city].quantity().saturating_sub(capacity);
  // Sell physical excess now. Cargo still in transit is sold only upon arrival.
  for good in 0..self.data.goods.len(){
   if excess==0{break;}
   let cargo=self.take_stock(c,city,good,excess,None);excess-=cargo.quantity;
   if cargo.quantity>0{self.trade(c,city,good,cargo.quantity,false,None);}
  }
  let mut room=capacity.saturating_sub(self.game.companies[c].posts[&city].quantity());
  for s in &mut self.game.companies[c].ships {
   let reserved=reserved_units(s);
   if let Some(v)=s.voyage.as_mut().or(s.handling.as_mut().map(|h|&mut h.trip)){
    if v.to==city&&!v.direct_sale{let keep=room.min(reserved);room-=keep;v.warehouse_units=Some(keep);if keep==0{v.direct_sale=true;}}
   }
  }
 }
 pub fn set_facility_policy(&mut self,policy:FacilityPolicy)->Result<()> {
  ensure(policy.valid(),"Invalid facility settings")?;
  self.game.companies[0].facility_policy=policy;
  for p in self.game.companies[0].posts.values_mut(){for m in &mut p.monitoring{m.up=0;m.down=0;m.sampled=None;m.expansion_pending=false;}}
  let cities=self.game.companies[0].posts.keys().copied().collect::<Vec<_>>();
  for city in cities{self.facility_immediate(0,city,0);self.facility_immediate(0,city,1);}
  Ok(())
 }
 fn facility_usage(&self,c:usize,city:usize,kind:usize)->Option<(u32,f64)>{
  let p=self.game.companies[c].posts.get(&city)?;
  let level=if kind==0{p.warehouse}else{p.handling};
  if level==0{return None;}
  Some((level,if kind==0{100.0*(p.quantity()+self.reserved_stock(c,city)) as f64/(level as f64*WAREHOUSE_UNITS as f64)}else{100.0*p.handling_demand/(level as f64*HANDLING_UNITS)}))
 }
 fn adjust_facility(&mut self,city:usize,kind:usize,up:bool){
  let Some((level,_))=self.facility_usage(0,city,kind) else{return;};
  let facility=if kind==0{"warehouse"}else{"handling"};
  let result=if up {
   if level>=10000||self.game.companies[0].cash-500.0<self.cash_reserve(){return;}
   self.upgrade_post(0,city,facility)
  }else{if level<=1{return;}self.lower_post(0,city,facility,level-1)};
  if result.is_ok(){self.game.companies[0].posts.get_mut(&city).unwrap().monitoring[kind]=FacilityMonitor{changed:Some(self.game.day),..Default::default()};}
 }
 pub fn facility_immediate(&mut self,c:usize,city:usize,kind:usize){
  if c!=0||self.game.companies[c].bankrupt{return;}
  let policy=&self.game.companies[c].facility_policy;
  let (up,down)=if kind==0{(&policy.warehouse_up,&policy.warehouse_down)}else{(&policy.handling_up,&policy.handling_down)};
  if !(up.enabled&&up.days==1||kind==0&&down.enabled&&down.days==1){return;}
  let Some((_,usage))=self.facility_usage(c,city,kind) else{return;};
  if self.game.companies[c].posts[&city].monitoring[kind].changed==Some(self.game.day){return;}
  let policy=&self.game.companies[c].facility_policy;
  let (up,down)=if kind==0{(&policy.warehouse_up,&policy.warehouse_down)}else{(&policy.handling_up,&policy.handling_down)};
  if up.enabled&&up.days==1&&usage>=up.percent{
   // Observe immediately, but spend only in the ordered daily investment phase.
   self.game.companies[c].posts.get_mut(&city).unwrap().monitoring[kind].expansion_pending=true;
  }
  // Handling demand is cumulative over a day; only the completed day can be low.
  else if !self.game.companies[c].posts[&city].monitoring[kind].expansion_pending&&kind==0&&down.enabled&&down.days==1&&usage<=down.percent{self.adjust_facility(city,kind,false);}
 }
 pub fn advance_facilities(&mut self){
  if self.game.companies[0].bankrupt{return;}
  let policy=self.game.companies[0].facility_policy.clone();
  if ![&policy.warehouse_up,&policy.warehouse_down,&policy.handling_up,&policy.handling_down].iter().any(|r|r.enabled){return;}
  let cities=self.game.companies[0].posts.keys().copied().collect::<Vec<_>>();
  for city in cities{for kind in 0..2{
   let Some((_,usage))=self.facility_usage(0,city,kind) else{continue;};
   let (up,down)=if kind==0{(&policy.warehouse_up,&policy.warehouse_down)}else{(&policy.handling_up,&policy.handling_down)};
   let m=&mut self.game.companies[0].posts.get_mut(&city).unwrap().monitoring[kind];
   if m.changed==Some(self.game.day)||m.sampled==Some(self.game.day){continue;}
   if m.sampled.is_some_and(|d|d+1!=self.game.day){m.up=0;m.down=0;}
   m.sampled=Some(self.game.day);
   m.up=if up.enabled&&(usage>=up.percent||(up.days==1&&m.expansion_pending)){(m.up+1).min(up.days)}else{0};
   m.expansion_pending=false;
   m.down=if down.enabled&&usage<=down.percent{(m.down+1).min(down.days)}else{0};
   if up.enabled&&m.up>=up.days{self.adjust_facility(city,kind,true);}
   else if down.enabled&&m.down>=down.days{self.adjust_facility(city,kind,false);}
  }}
 }
}
