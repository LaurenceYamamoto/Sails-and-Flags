use crate::model::*;
use crate::trade::{integrated,ratio};
use crate::posts::price_quantity;
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
        let(mut result,mut paid,mut value,mut sales)=(vec![],0.0,0.0,0.0);
        for good in goods {
            if room==0{break;}
            let source=self.game.markets[from*self.data.goods.len()+good].stock;
            let target=self.game.markets[to*self.data.goods.len()+good].stock;
            let base=self.data.goods[good].base;
            let available=if stored{self.stored_available(c,from,good,to)}else{source.floor() as usize};
            let cost=|q|integrated(base,source-q as f64,source)*(1.0+self.post_tax(c,from));
            let q=price_quantity(room.min(available),|q|
                (stored||(ratio(source-q as f64)<=1.0-buy_below/100.0&&paid+cost(q)<=budget))
                &&(deposit||ratio(target+q as f64)>=1.0+sell_above/100.0));
            if q==0{continue;}
            if stored {
                let mut left=q;
                for lot in &self.game.companies[c].posts[&from].stock {if lot.good==good&&lot.from!=Some(to){let n=left.min(lot.quantity);value+=cargo_basis(lot.cost,lot.quantity,n);left-=n;if left==0{break;}}}
            }else{let amount=cost(q);paid+=amount;value+=amount;}
            sales+=if deposit{base*q as f64}else{integrated(base,target,target+q as f64)*(1.0-self.post_tax(c,to))};
            result.push((good,q));room-=q;
        }(result,value,sales)
    }
}
