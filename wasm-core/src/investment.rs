use crate::model::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Serialize, Deserialize)]
pub struct InvestmentBudget {
    pub mode: String,
    pub value: f64,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct InvestmentPlan {
    pub reserve: f64,
    pub roads: bool,
    pub road_rivals: bool,
    pub cities: bool,
    pub city_rivals: bool,
    pub route_only: bool,
    // Development, roads, research. Amounts are monthly, never per target.
    pub budgets: Vec<InvestmentBudget>,
    pub min: f64,
    pub max: f64,
    pub weights: BTreeMap<String, f64>,
}
#[derive(Clone, Serialize)]
pub struct InvestmentTarget {
    pub category: usize,
    pub index: usize,
    pub item: usize,
    pub key: String,
    pub group: String,
    pub base: f64,
    pub eligible: bool,
    pub weight: f64,
    pub daily: f64,
}
impl InvestmentPlan {
    pub fn valid(&self, cities: usize, roads: usize, goods: usize) -> bool {
        amount(self.reserve) && amount(self.min) && amount(self.max) && self.min <= self.max
            && self.budgets.len() == 3 && self.budgets.iter().all(|b|
                amount(b.value) && (b.mode == "fixed" || (b.mode == "profit" && b.value <= 100.0)))
            && self.weights.len() <= cities * (goods + 2) + roads * 3 + 8
            && self.weights.iter().all(|(key, &value)| {
                if !value.is_finite() || !(0.0..=1e6).contains(&value) { return false; }
                let parts: Vec<_> = key.split(':').collect();
                if parts.len() < 2 || parts.len() > 3 { return false; }
                let Ok(i) = parts[1].parse::<usize>() else { return false; };
                if parts[1] != i.to_string() { return false; }
                let item = parts.get(2).and_then(|s|s.parse::<usize>().ok());
                match parts[0] {
                    "city" => i < cities && (parts.len()==2 || item.is_some_and(|x|x<=goods && parts[2]==x.to_string())),
                    "road" => i < roads && (parts.len()==2 || item.is_some_and(|x|x<2 && parts[2]==x.to_string())),
                    "tech" => i < 8 && parts.len()==2,
                    _ => false,
                }
            })
    }
    fn weight(&self, key: &str) -> f64 { self.weights.get(key).copied().unwrap_or(1.0) }
}
impl Engine {
    pub fn investment_days(&self) -> u32 {
        let (month, date, _, _) = self.calendar();
        let start = self.game.day + 1 - date;
        (28..=31).find(|n| Self::calendar_at(start + n).0 != month).unwrap()
    }
    pub fn investment_profit(&self) -> f64 {
        let month = self.calendar().0;
        if month == 0 { return 0.0; }
        let Some(p) = self.game.companies[0].accounts.as_ref().and_then(|a|a.months.get(&(month-1))) else { return 0.0; };
        ["purchase","sale","tax","upkeep","licenseDaily","escort","roadToll","roadIncome","developmentIncome","handlingFee","postUpkeep","warehouseUpkeep","handlingUpkeep"]
            .iter().map(|&k|p.income.get(k).copied().unwrap_or(0.0)-p.expense.get(k).copied().unwrap_or(0.0)).sum()
    }
    pub fn investment_plan(&self) -> InvestmentPlan {
        let c=&self.game.companies[0];
        if let Some(p)=&c.investment_plan { return p.clone(); }
        // Old saves continue their existing budgets until the player applies a plan.
        // Seed the editor with equivalent monthly totals and existing allocations.
        let mut p=InvestmentPlan {reserve:c.automation.reserve.max(c.road_auto.reserve),
            roads:c.road_auto.enabled,road_rivals:c.road_auto.rivals,cities:false,city_rivals:false,route_only:true,
            budgets:(0..3).map(|_|InvestmentBudget{mode:"fixed".into(),value:0.0}).collect(),min:0.0,
            max:self.data.cities.iter().flat_map(|c|c.supply.iter().copied()).fold(0.0,f64::max),weights:BTreeMap::new()};
        let mut values=Vec::new();
        for (&i,d) in &c.posts {
            values.push((0,format!("city:{i}:0"),d.size_budget));
            for (g,&v) in d.production_budget.iter().enumerate() { values.push((0,format!("city:{i}:{}",g+1),v)); }
        }
        for (i,r) in self.game.roads.iter().enumerate().filter(|(i,r)|r.owner==c.id&&!self.data.roads[*i].retired) {
            values.push((1,format!("road:{i}:0"),r.road_budget));
            values.push((1,format!("road:{i}:1"),r.security_budget));
        }
        for (i,&v) in c.tech_budget.iter().enumerate() {values.push((2,format!("tech:{i}"),v));}
        for &(k,_,v) in &values {p.budgets[k].value+=v*self.investment_days() as f64;}
        for (k,key,v) in values {if p.budgets[k].value>0.0 {p.weights.insert(key,v / (p.budgets[k].value/self.investment_days() as f64)*100.0);}}
        p
    }
    pub fn investment_targets(&self, p: &InvestmentPlan) -> Vec<InvestmentTarget> {
        let mut rows=Vec::new();
        let mut add=|category,index,item,key:String,group:String,base| {
            let eligible=category!=0 || item==0 || (base>0.0 && base>=p.min && base<=p.max);
            let weight=if eligible {p.weight(&key)*if group.is_empty(){1.0}else{p.weight(&group)}}else{0.0};
            rows.push(InvestmentTarget{category,index,item,key,group,base,eligible,weight,daily:0.0});
        };
        for (&i,d) in &self.game.companies[0].posts {
            let _=d;
            add(0,i,0,format!("city:{i}:0"),format!("city:{i}"),0.0);
            for (g,&base) in self.data.cities[i].supply.iter().enumerate() {
                add(0,i,g+1,format!("city:{i}:{}",g+1),format!("city:{i}"),base);
            }
        }
        for (i,_) in self.game.roads.iter().enumerate().filter(|(i,r)|r.owner=="player"&&!self.data.roads[*i].retired) {
            for item in 0..2 {add(1,i,item,format!("road:{i}:{item}"),format!("road:{i}"),0.0);}
        }
        for i in 0..8 {add(2,i,0,format!("tech:{i}"),String::new(),0.0);}
        for k in 0..3 {
            let total: f64=rows.iter().filter(|r|r.category==k).map(|r|r.weight).sum();
            let budget=self.investment_monthly(p,k)/self.investment_days() as f64;
            if total>0.0 {for r in rows.iter_mut().filter(|r|r.category==k) {r.daily=budget*r.weight/total;}}
        }
        rows
    }
    fn investment_monthly(&self,p:&InvestmentPlan,k:usize)->f64 {
        let b=&p.budgets[k];
        if b.mode=="profit" {self.investment_profit().max(0.0)*(b.value/100.0)}else{b.value}
    }
    pub fn investment_report(&self, v:&Value)->Result<Value> {
        let p=if v.get("plan").is_some() {self.parse_investment_plan(&v["plan"])?}else{self.investment_plan()};
        let rows=self.investment_targets(&p);
        let daily:f64=rows.iter().map(|r|r.daily).sum();
        Ok(json!({"active":self.game.companies[0].investment_plan.is_some(),"plan":p,"days":self.investment_days(),
            "profit":self.investment_profit(),"monthly":(0..3).map(|k|self.investment_monthly(&p,k)).collect::<Vec<_>>(),
            "daily":daily,"fundable":daily.min((self.game.companies[0].cash-p.reserve).max(0.0)),"rows":rows}))
    }
    pub fn parse_investment_plan(&self,v:&Value)->Result<InvestmentPlan> {
        let p:InvestmentPlan=serde_json::from_value(v.clone()).map_err(|_|"対象が不正です。")?;
        ensure(p.valid(self.data.cities.len(),self.data.roads.len(),self.data.goods.len()),"対象が不正です。")?;
        Ok(p)
    }
    pub fn set_investment_plan(&mut self,v:&Value)->Result<()> {
        let p=self.parse_investment_plan(v)?;
        self.game.companies[0].automation.reserve=p.reserve;
        self.game.companies[0].road_auto=RoadAuto{enabled:p.roads,rivals:p.road_rivals,reserve:p.reserve};
        self.game.companies[0].investment_plan=Some(p);
        self.prepare_investment(false);
        Ok(())
    }
    // Called after fleet automation. Re-check cash after every purchase.
    pub fn auto_buy_investment_rights(&mut self) {
        let Some(p)=self.game.companies[0].investment_plan.clone() else {self.auto_buy_roads();return;};
        if p.roads {
            let mut roads=self.road_candidates(p.road_rivals);
            roads.sort_by(|&a,&b|self.road_cost(a).total_cmp(&self.road_cost(b)).then(a.cmp(&b)));
            for i in roads {if self.game.companies[0].cash-self.road_cost(i)>=p.reserve {let _=self.buy_road(0,i);}}
        }
        if p.cities {
            let co=&self.game.companies[0];
            let stops:BTreeSet<_>=co.routes.iter().flat_map(|r|r.stops.iter().copied()).collect();
            let mut cities:Vec<_>=(0..self.data.cities.len()).filter(|i|!co.posts.contains_key(i)&&(!p.route_only||stops.contains(i))&&co.licenses.contains(&self.data.cities[*i].nation)).collect();
            cities.sort_by(|&a,&b|self.development_cost(a).total_cmp(&self.development_cost(b)).then(a.cmp(&b)));
            for i in cities {if self.game.companies[0].cash-self.development_cost(i)>=p.reserve {let _=self.buy_development(0,i);}}
        }
    }
    pub fn prepare_investment(&mut self, limit_cash:bool) {
        let Some(p)=self.game.companies[0].investment_plan.clone() else {return;};
        let rows=self.investment_targets(&p);
        let total:f64=rows.iter().map(|r|r.daily).sum();
        let scale=if limit_cash && total>0.0 {((self.game.companies[0].cash-p.reserve).max(0.0)/total).min(1.0)}else{1.0};
        self.game.companies[0].tech_budget.fill(0.0);
        for d in self.game.companies[0].posts.values_mut() {d.size_budget=0.0;d.production_budget.fill(0.0);}
        for r in self.game.roads.iter_mut().filter(|r|r.owner=="player") {r.road_budget=0.0;r.security_budget=0.0;}
        for r in rows {
            let value=r.daily*scale;
            match (r.category,r.item) {
                (0,0)=>self.game.companies[0].posts.get_mut(&r.index).unwrap().size_budget=value,
                (0,g)=>self.game.companies[0].posts.get_mut(&r.index).unwrap().production_budget[g-1]=value,
                (1,0)=>self.game.roads[r.index].road_budget=value,
                (1,_)=>self.game.roads[r.index].security_budget=value,
                _=>self.game.companies[0].tech_budget[r.index]=value,
            }
        }
    }
}
