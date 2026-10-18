use crate::model::*;
use serde_json::{json,Value};
impl Engine {
    pub fn license_return_quote(&self,c:usize,n:usize)->Result<Value> {
        self.playable(c)?;
        ensure(self.game.companies[c].licenses.contains(&n),"A trading license is required.")?;
        let co=&self.game.companies[c];
        let routes=co.routes.iter().filter(|r|self.nations_for(&r.auto_type,&r.stops).contains(&n)).map(|r|r.id).collect::<Vec<_>>();
        let ships=co.ships.iter().filter(|s|s.route.is_some_and(|id|routes.contains(&id))).collect::<Vec<_>>();
        let posts=co.posts.keys().copied().filter(|&i|self.data.cities[i].nation==n).collect::<Vec<_>>();
        let mut stock_sale=0.0;
        for &city in &posts {for good in 0..self.data.goods.len() {
            let quantity=co.posts[&city].stock.iter().filter(|s|s.good==good).map(|s|s.quantity).sum::<usize>();
            let stock=self.game.markets[city*self.data.goods.len()+good].stock;
            stock_sale+=crate::trade::integrated(self.data.goods[good].base,stock,stock+quantity as f64)*(1.0-self.post_tax(c,city));
        }}
        let eligible=c==0||self.rival_home(c)!=Some(n);
        Ok(json!({"eligible":eligible,"routes":routes,"posts":posts,"ships":ships.len(),"cargoRefund":ships.iter().flat_map(|s|&s.cargo).map(|x|x.cost).sum::<f64>(),"stockSale":stock_sale}))
    }
    pub fn return_license(&mut self,c:usize,n:usize)->Result<()> {
        let quote=self.license_return_quote(c,n)?;
        ensure(quote["eligible"]==true,"The home nation license cannot be surrendered.")?;
        let ids=self.game.companies[c].routes.iter().filter(|r|self.nations_for(&r.auto_type,&r.stops).contains(&n)).map(|r|r.id).collect::<Vec<_>>();
        for id in ids {
            let cost=self.game.companies[c].ships.iter().filter(|s|s.route==Some(id)).flat_map(|s|&s.cargo).map(|x|x.cost).sum::<f64>();
            self.remove_route(c,id,true)?;
            if cost>0.0 {self.entry(c,"routeReorganization",cost,None,self.data.nations[n].id.clone());}
        }
        let posts=self.game.companies[c].posts.keys().copied().filter(|&i|self.data.cities[i].nation==n).collect::<Vec<_>>();
        // Sell warehouse stock while the license and trading post tax rate still apply.
        for city in posts {self.lower_post(c,city,"post",0)?;}
        let co=&mut self.game.companies[c];
        co.licenses.retain(|&i|i!=n);co.diplomacy_budget[n]=0.0;
        co.auto_route_cities.retain(|&i|self.data.cities[i].nation!=n);
        let owner=co.id.clone();
        if c>0 {
            let state=co.rival_state.get_or_insert_with(Default::default);
            state.released_licenses.insert(n,self.game.day+180);
            state.routes.retain(|id,_|co.routes.iter().any(|r|r.id==*id));state.posts.retain(|i,_|co.posts.contains_key(i));
        }
        for (i,r) in self.game.roads.iter_mut().enumerate(){if r.owner==owner&&self.data.roads[i].nations.contains(&n){
            r.owner="state".into();r.basis=0.0;r.pool=0.0;r.road_budget=0.0;r.security_budget=0.0;
        }}
        for (i,d) in self.game.development.iter_mut().enumerate(){if d.owner==owner&&self.data.cities[i].nation==n{
            d.owner="state".into();d.basis=0.0;d.pool=0.0;d.size_budget=0.0;d.production_budget.fill(0.0);
        }}
        Ok(())
    }
}
