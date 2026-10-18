use crate::model::*;
use crate::trade::{integrated,ratio};
use serde::{Deserialize,Serialize};
use serde_json::{json,Value};

pub const POST_COST:f64=500.0;
pub const POST_BASE_UPKEEP:f64=10.0;
pub const POST_COUNT_MULTIPLIER:f64=1.5;
pub const POST_UPKEEP_MULTIPLIER:f64=2.0;
pub const POST_RESEARCH_EFFECT:f64=0.1;
pub const WAREHOUSE_UNITS:usize=100;
pub const HANDLING_UNITS:f64=10.0;
pub const HANDLING_FEE:f64=1.0;

#[derive(Clone,Serialize,Deserialize)]
pub struct PriceRule { pub buy_below:f64,pub sell_above:f64,pub buy:bool,pub sell:bool }
impl Default for PriceRule {fn default()->Self{Self{buy_below:10.0,sell_above:10.0,buy:true,sell:true}}}
impl PriceRule {pub fn valid(&self)->bool{thresholds(self.buy_below,self.sell_above)}}
pub fn thresholds(buy:f64,sell:f64)->bool {buy.is_finite()&&(0.0..=95.0).contains(&buy)&&sell.is_finite()&&(0.0..=1000.0).contains(&sell)}
#[derive(Clone,Serialize,Deserialize)]
pub struct StoredCargo {pub good:usize,pub quantity:usize,pub cost:f64,pub from:Option<usize>}
#[derive(Clone,Serialize,Deserialize)]
pub struct TradingPost {
 #[serde(default)]
 pub monitoring:[crate::facility_management::FacilityMonitor;2],
 #[serde(default)]
 pub handling_demand:f64,
 pub level:u32,pub basis:f64,pub warehouse:u32,pub handling:u32,pub handled:f64,
 pub stock:Vec<StoredCargo>,pub rules:Vec<PriceRule>,pub size_budget:f64,pub production_budget:Vec<f64>,
}
impl TradingPost {
 pub fn new(goods:usize)->Self {Self{monitoring:Default::default(),handling_demand:0.0,level:1,basis:0.0,warehouse:0,handling:0,handled:0.0,stock:vec![],rules:vec![PriceRule::default();goods],size_budget:0.0,production_budget:vec![0.0;goods]}}
 pub fn quantity(&self)->usize{self.stock.iter().map(|s|s.quantity).sum()}
 pub fn fixed(&self)->f64{self.level as f64*0.5+self.warehouse as f64*1.0+self.handling as f64*4.0}
 pub fn value(&self)->f64{self.basis+self.stock.iter().map(|s|s.cost).sum::<f64>()}
}

impl Engine {
 pub fn has_post(&self,c:usize,stops:&[usize])->bool{stops.iter().any(|i|self.game.companies[c].posts.contains_key(i))}
 pub fn warehouse(&self,c:usize,city:usize)->bool{self.game.companies[c].posts.get(&city).is_some_and(|p|p.warehouse>0)}
 pub fn post_tax(&self,c:usize,city:usize)->f64{
  let level=self.game.companies[c].posts.get(&city).map_or(0.0,|p|p.level as f64);
  self.terms(c,self.data.cities[city].nation,0).2/(1.0+level*0.15)
 }
 pub fn post_count_multiplier(&self,c:usize)->f64{1.0+(POST_COUNT_MULTIPLIER-1.0)/(1.0+POST_RESEARCH_EFFECT*self.game.companies[c].technology[6])}
 pub fn post_upkeep_multiplier(&self,c:usize)->f64{1.0+(POST_UPKEEP_MULTIPLIER-1.0)/(1.0+POST_RESEARCH_EFFECT*self.game.companies[c].technology[6])}
 pub fn post_open_cost_at(&self,c:usize,count:usize)->f64{POST_COST*self.post_count_multiplier(c).powi(count as i32)}
 pub fn post_open_cost(&self,c:usize)->f64{self.post_open_cost_at(c,self.game.companies[c].posts.len())}
 pub fn post_base_upkeep(&self,c:usize)->f64{POST_BASE_UPKEEP*self.post_upkeep_multiplier(c).powi(self.game.companies[c].posts.len().saturating_sub(1) as i32)}
 pub fn post_investment_multiplier(&self,c:usize)->f64{1.0+POST_RESEARCH_EFFECT*self.game.companies[c].technology[7]}
 pub fn post_investment_effect(&self,c:usize)->f64{0.5*self.post_investment_multiplier(c)}
 pub fn post_fixed(&self,c:usize)->f64{let co=&self.game.companies[c];co.posts.len() as f64*self.post_base_upkeep(c)+co.posts.values().map(|p|p.fixed()).sum::<f64>()}
 pub fn build_post(&mut self,c:usize,city:usize)->Result<()> {
  self.playable(c)?;
  ensure(self.game.companies[c].licenses.contains(&self.data.cities[city].nation),"交易免許が必要です。")?;
  ensure(!self.game.companies[c].posts.contains_key(&city),"A trading post already exists.")?;
  let cost=self.post_open_cost(c);self.affordable(c,cost)?;let mut post=TradingPost::new(self.data.goods.len());post.basis=cost;
  self.game.companies[c].posts.insert(city,post);self.entry(c,"postConstruction",-cost,None,self.data.cities[city].id.clone());Ok(())
 }
 pub fn upgrade_post(&mut self,c:usize,city:usize,facility:&str)->Result<()> {
  self.playable(c)?;let p=self.game.companies[c].posts.get(&city).ok_or("A trading post is required")?;
  let (level,cost)=match facility {"post"=>(p.level,POST_COST*p.level as f64),"warehouse"=>(p.warehouse,500.0),"handling"=>(p.handling,500.0),_=>return Err("Unknown facility".into())};
  ensure(level<10000,"Facility limit reached.")?;self.affordable(c,cost)?;
  if facility=="warehouse" && level==0 {
   // Includes old saves whose trips predate the direct_sale field. Do this
   // only after validation/payment checks so failed builds remain atomic.
   for ship in &mut self.game.companies[c].ships {
    if let Some(v)=ship.voyage.as_mut().or(ship.handling.as_mut().map(|h|&mut h.trip)) {
     if v.to==city {v.direct_sale=true;}
    }
   }
  }
  let p=self.game.companies[c].posts.get_mut(&city).unwrap();p.basis+=cost;
  match facility {"post"=>p.level+=1,"warehouse"=>p.warehouse+=1,_=>p.handling+=1}
  if facility!="post"{p.monitoring[if facility=="warehouse"{0}else{1}]=Default::default();}
  self.entry(c,"postConstruction",-cost,None,format!("{} {facility}",self.data.cities[city].id));Ok(())
 }
 // Warehouse-bound cargo, including loading/unloading, reserves space. Removed
 // ships in sail() are excluded while unloading, so their own reservation is released.
 pub fn reserved_stock(&self,c:usize,city:usize)->usize {
  self.game.companies[c].ships.iter().filter(|s|s.voyage.as_ref().or(s.handling.as_ref().map(|h|&h.trip)).is_some_and(|v|v.to==city&&!v.direct_sale))
   .map(crate::facility_management::reserved_units).sum()
 }
 pub fn warehouse_room(&self,c:usize,city:usize)->usize{
  self.game.companies[c].posts.get(&city).map_or(0,|p|(p.warehouse as usize*WAREHOUSE_UNITS).saturating_sub(p.quantity()+self.reserved_stock(c,city)))
 }
 pub fn stored_available(&self,c:usize,city:usize,good:usize,to:usize)->usize{
  self.game.companies[c].posts.get(&city).map_or(0,|p|p.stock.iter().filter(|s|s.good==good&&s.from!=Some(to)).map(|s|s.quantity).sum())
 }
 pub fn put_stock(&mut self,c:usize,city:usize,cargo:Cargo,from:Option<usize>){
  let p=self.game.companies[c].posts.get_mut(&city).unwrap();
  if let Some(s)=p.stock.iter_mut().find(|s|s.good==cargo.good&&s.from==from){s.quantity+=cargo.quantity;s.cost+=cargo.cost;}
  else if cargo.quantity>0 {p.stock.push(StoredCargo{good:cargo.good,quantity:cargo.quantity,cost:cargo.cost,from});}
 }
 pub fn take_stock(&mut self,c:usize,city:usize,good:usize,quantity:usize,to:Option<usize>)->Cargo{
  let mut cargo=Cargo{good,quantity:0,cost:0.0};let p=self.game.companies[c].posts.get_mut(&city).unwrap();
  for s in &mut p.stock {if s.good!=good||to.is_some_and(|t|s.from==Some(t)){continue;}
   let q=s.quantity.min(quantity-cargo.quantity);let cost=s.cost*q as f64/s.quantity.max(1) as f64;
   s.quantity-=q;s.cost-=cost;cargo.quantity+=q;cargo.cost+=cost;if cargo.quantity==quantity{break;}
  }p.stock.retain(|s|s.quantity>0);cargo
 }
 pub fn charge_handling(&mut self,c:usize,city:usize,units:f64,route:Option<u32>)->f64 {
  if let Some(p)=self.game.companies[c].posts.get_mut(&city){p.handling_demand+=units;}
  self.facility_immediate(c,city,1);
  let mut external=units;
  if let Some(p)=self.game.companies[c].posts.get_mut(&city){let own=units.min((p.handling as f64*HANDLING_UNITS-p.handled).max(0.0));p.handled+=own;external-=own;}
  let fee=external*HANDLING_FEE;if fee>0.0{self.entry(c,"handlingFee",-fee,route,self.data.cities[city].id.clone());}fee
 }
 pub fn advance_posts(&mut self,c:usize){
  let cities:Vec<_>=self.game.companies[c].posts.keys().copied().collect();
  let base=self.post_base_upkeep(c);
  for &city in &cities {let p=self.game.companies[c].posts.get_mut(&city).unwrap();p.handled=0.0;p.handling_demand=0.0;
   let fees=[("postUpkeep",base+p.level as f64*0.5),("warehouseUpkeep",p.warehouse as f64),("handlingUpkeep",p.handling as f64*4.0)];
   for (kind,fee) in fees {if fee>0.0{self.entry(c,kind,-fee,None,self.data.cities[city].id.clone());}}
   if self.game.companies[c].bankrupt{return;}
  }
  for city in cities {if !self.warehouse(c,city){continue;}
   for good in 0..self.data.goods.len(){let rule=self.game.companies[c].posts[&city].rules[good].clone();
    if rule.sell {let available=self.game.companies[c].posts[&city].stock.iter().filter(|s|s.good==good).map(|s|s.quantity).sum();
     let stock=self.game.markets[city*self.data.goods.len()+good].stock;
     let q=price_quantity(available,|q|ratio(stock+q as f64)>=1.0+rule.sell_above/100.0);
     if q>0{let _=self.take_stock(c,city,good,q,None);self.trade(c,city,good,q,false,None);}
    }
    if rule.buy {let stock=self.game.markets[city*self.data.goods.len()+good].stock;let cash=(self.game.companies[c].cash-self.game.companies[c].automation.reserve).max(0.0);
     let q=price_quantity(self.warehouse_room(c,city).min(stock.floor() as usize),|q|ratio(stock-q as f64)<=1.0-rule.buy_below/100.0&&integrated(self.data.goods[good].base,stock-q as f64,stock)*(1.0+self.post_tax(c,city))<=cash);
     if q>0{let(quantity,cost)=self.trade(c,city,good,q,true,None);self.put_stock(c,city,Cargo{good,quantity,cost},None);}
    }
   }
   self.facility_immediate(c,city,0);
  }
 }
 pub fn posts_view(&self,c:usize)->Value{
  json!(self.game.companies[c].posts.iter().map(|(&city,p)|json!({"city":city,"post":p,"capacity":p.warehouse as usize*WAREHOUSE_UNITS,"used":p.quantity(),"reserved":self.reserved_stock(c,city),"fixed":self.post_base_upkeep(c)+p.fixed(),"baseUpkeep":self.post_base_upkeep(c),"scaleUpkeep":p.fixed(),"tax":self.post_tax(c,city)*100.0,"handlingCapacity":p.handling as f64*HANDLING_UNITS,"postCost":POST_COST*p.level as f64})).collect::<Vec<_>>())
 }
 pub fn posts_summary(&self,c:usize)->Value{
  json!(self.game.companies[c].posts.iter().map(|(&city,p)|json!({"city":city,"capacity":p.warehouse as usize*WAREHOUSE_UNITS,"used":p.quantity(),"reserved":self.reserved_stock(c,city)})).collect::<Vec<_>>())
 }
 pub fn validate_posts(&self,g:&Game)->Result<()> {
  ensure(g.post_version<=1,"Unsupported trading post version")?;
  for co in &g.companies {
   ensure(co.facility_policy.valid(),"Invalid facility settings")?;
   ensure(g.post_version>0||co.posts.is_empty(),"Legacy save contains trading posts")?;
   for (&city,p) in &co.posts {ensure(city<self.data.cities.len()&&co.licenses.contains(&self.data.cities[city].nation)
    &&p.level>0&&p.level<=10000&&p.warehouse<=10000&&p.handling<=10000&&amount(p.basis)&&amount(p.handled)&&p.handled<=(p.handling as f64*HANDLING_UNITS).max(p.handling_demand)+1e-6
    &&amount(p.handling_demand)&&p.monitoring.iter().all(|m|m.valid(g.day))
    &&p.rules.len()==self.data.goods.len()&&p.rules.iter().all(PriceRule::valid)&&amount(p.size_budget)
    &&p.production_budget.len()==self.data.goods.len()&&p.production_budget.iter().all(|&v|amount(v))
    &&p.stock.len()<=self.data.goods.len()*(self.data.cities.len()+1)&&p.stock.iter().all(|s|s.good<self.data.goods.len()&&s.quantity>0&&s.quantity<=1000000&&amount(s.cost)&&s.from.is_none_or(|i|i<self.data.cities.len())),"Invalid trading post")?;
    let reserved:usize=co.ships.iter().filter(|s|s.voyage.as_ref().or(s.handling.as_ref().map(|h|&h.trip)).is_some_and(|v|v.to==city&&!v.direct_sale)).map(crate::facility_management::reserved_units).sum();
    ensure(p.warehouse==0&&p.stock.is_empty()||p.quantity()+reserved<=p.warehouse as usize*WAREHOUSE_UNITS,"Warehouse capacity exceeded")?;
   }
   if g.post_version>0 {ensure(co.routes.iter().all(|r|r.stops.iter().any(|i|co.posts.contains_key(i))),"Route requires a trading post")?;}
   ensure(co.routes.iter().all(|r|thresholds(r.buy_below,r.sell_above)),"Invalid route price thresholds")?;
  }Ok(())
 }
}
pub fn price_quantity(max:usize,allowed:impl Fn(usize)->bool)->usize{let mut low=0;let mut high=max;while low<high{let mid=(low+high).div_ceil(2);if allowed(mid){low=mid;}else{high=mid-1;}}low}
