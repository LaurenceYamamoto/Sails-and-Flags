use crate::model::*;
use crate::trade::{integrated,ratio};
use crate::posts::price_quantity;
use serde::{Serialize,Deserialize};

// Compact immutable input: workers need no company, catalog, route graph or
// ledger to propose a purchase. Each lot keeps its acquisition basis.
#[derive(Clone,Serialize,Deserialize)]
pub(crate) struct Offer {
    pub good:usize, pub source:f64, pub target:f64, pub base:f64,
    pub available:usize, pub basis:Vec<(usize,f64)>,
}
#[derive(Clone,Serialize,Deserialize)]
pub(crate) struct LoadInput {
    pub stored:bool, pub deposit:bool, pub room:usize, pub budget:f64,
    pub buy:f64, pub sell:f64, pub source_tax:f64, pub target_tax:f64,
    pub goods:Vec<Offer>,
}
#[derive(Clone,Serialize,Deserialize,PartialEq,Debug)]
pub(crate) struct LoadPlan {
    pub lots:Vec<(usize,usize)>, pub cost:f64, pub sale:f64,
}
impl LoadInput {
    pub fn evaluate(&self)->LoadPlan {
        let(mut room,mut paid,mut value,mut sales)=(self.room,0.0,0.0,0.0);
        let mut result=vec![];
        for g in &self.goods {
            if room==0{break;}
            let cost=|q|integrated(g.base,g.source-q as f64,g.source)*(1.0+self.source_tax);
            let q=price_quantity(room.min(g.available),|q|
                (self.stored||(ratio(g.source-q as f64)<=1.0-self.buy/100.0&&paid+cost(q)<=self.budget))
                &&(self.deposit||ratio(g.target+q as f64)>=1.0+self.sell/100.0));
            if q==0{continue;}
            if self.stored {
                let mut left=q;
                for &(quantity,basis) in &g.basis {
                    let n=left.min(quantity);value+=cargo_basis(basis,quantity,n);left-=n;
                    if left==0{break;}
                }
            }else{let amount=cost(q);paid+=amount;value+=amount;}
            sales+=if self.deposit{g.base*q as f64}else{integrated(g.base,g.target,g.target+q as f64)*(1.0-self.target_tax)};
            result.push((g.good,q));room-=q;
        }
        LoadPlan{lots:result,cost:value,sale:sales}
    }
}
impl Engine {
    pub fn load_plan(&self,c:usize,from:usize,to:usize,capacity:usize,budget:f64,allowed:&[usize],_margin:f64)->(Vec<(usize,usize)>,f64,f64){
        self.price_plan(c,from,to,capacity,budget,allowed,0.0,0.0)
    }
    // Price conditions are evaluated at the marginal price after the entire lot.
    // Priority is the source's discount, not an estimated operating profit.
    pub fn price_plan(&self,c:usize,from:usize,to:usize,capacity:usize,budget:f64,allowed:&[usize],buy_below:f64,sell_above:f64)->(Vec<(usize,usize)>,f64,f64){
        let stored=self.warehouse(c,from);let deposit=self.warehouse(c,to);
        let mut room=capacity.min(if deposit{self.warehouse_room(c,to)}else{usize::MAX});
        let mut goods=allowed.to_vec();goods.sort_by(|&a,&b|{
            let stock=|g:usize|self.game.markets[from*self.data.goods.len()+g].stock;
            ratio(stock(a)).total_cmp(&ratio(stock(b))).then(a.cmp(&b))
        });
        let source_tax=self.post_tax(c,from);let target_tax=self.post_tax(c,to);
        let(mut result,mut paid,mut value,mut sales)=(vec![],0.0,0.0,0.0);
        for good in goods {
            if room==0{break;}
            let source=self.game.markets[from*self.data.goods.len()+good].stock;
            let target=self.game.markets[to*self.data.goods.len()+good].stock;
            let base=self.data.goods[good].base;
            let available=if stored{self.stored_available(c,from,good,to)}else{source.floor() as usize};
            let cost=|q|integrated(base,source-q as f64,source)*(1.0+source_tax);
            let q=price_quantity(room.min(available),|q|
                (stored||(ratio(source-q as f64)<=1.0-buy_below/100.0&&paid+cost(q)<=budget))
                &&(deposit||ratio(target+q as f64)>=1.0+sell_above/100.0));
            if q==0{continue;}
            if stored {
                let mut left=q;
                for lot in &self.game.companies[c].posts[&from].stock {if lot.good==good&&lot.from!=Some(to){let n=left.min(lot.quantity);value+=cargo_basis(lot.cost,lot.quantity,n);left-=n;if left==0{break;}}}
            }else{let amount=cost(q);paid+=amount;value+=amount;}
            sales+=if deposit{base*q as f64}else{integrated(base,target,target+q as f64)*(1.0-target_tax)};
            result.push((good,q));room-=q;
        }(result,value,sales)
    }
    pub(crate) fn load_input(&self,c:usize,from:usize,to:usize,capacity:usize,budget:f64,allowed:&[usize],buy_below:f64,sell_above:f64,room:Option<usize>)->LoadInput{
        let stored=self.warehouse(c,from);let deposit=self.warehouse(c,to);
        let room=capacity.min(if deposit{room.unwrap_or_else(||self.warehouse_room(c,to))}else{usize::MAX});
        let mut goods=allowed.to_vec();goods.sort_by(|&a,&b|{
            let stock=|g:usize|self.game.markets[from*self.data.goods.len()+g].stock;
            ratio(stock(a)).total_cmp(&ratio(stock(b))).then(a.cmp(&b))
        });
        let goods=goods.into_iter().map(|good|{
            let source=self.game.markets[from*self.data.goods.len()+good].stock;
            let target=self.game.markets[to*self.data.goods.len()+good].stock;
            let base=self.data.goods[good].base;
            let available=if stored{self.stored_available(c,from,good,to)}else{source.floor() as usize};
            let basis=if stored{self.game.companies[c].posts[&from].stock.iter()
                .filter(|lot|lot.good==good&&lot.from!=Some(to)).map(|lot|(lot.quantity,lot.cost)).collect()}else{vec![]};
            Offer{good,source,target,base,available,basis}
        }).collect();
        LoadInput{stored,deposit,room,budget,buy:buy_below,sell:sell_above,
            source_tax:self.post_tax(c,from),target_tax:self.post_tax(c,to),goods}
    }
}
