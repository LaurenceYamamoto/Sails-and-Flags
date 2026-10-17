use crate::model::*;
use std::collections::{BTreeMap, BTreeSet};

impl Engine {
    pub fn ordered_stops(&self, mut stops:Vec<usize>)->Vec<usize> {
        if stops.len()==2 {stops.sort_by_key(|&i|self.data.cities[i].order);}
        stops
    }
    // Validate the old save first. Preserve every in-flight cargo/handling operation.
    pub fn split_routes(&self,g:&mut Game)->Result<Vec<(usize,f64)>> {
        let mut refunds=Vec::new();
        for (ci,co) in g.companies.iter_mut().enumerate() {
            let old=std::mem::take(&mut co.routes);
            let mut original=old.clone();original.sort_by_key(|r|(r.stops.len()!=2,r.started,r.id));
            let mut routes:Vec<Route>=Vec::new();
            let mut indices:BTreeMap<(String,Vec<usize>),usize>=BTreeMap::new();
            let mut mapping=BTreeMap::new();
            for r in original {
                let mut pairs=Vec::new();
                for i in 0..r.stops.len(){let p=self.ordered_stops(vec![r.stops[i],r.stops[(i+1)%r.stops.len()]]);if !pairs.contains(&p){pairs.push(p);}}
                let count=pairs.len();let mut used_id=false;
                for (i,pair) in pairs.into_iter().enumerate(){
                    let mut part=r.clone();part.stops=pair.clone();
                    if count>1 {
                        // Aggregate historical totals remain conserved; no per-leg history existed.
                        let weight=1.0/count as f64;
                        part.profit*=weight;part.revenue*=weight;part.expenses*=weight;
                        part.cargo_loss*=weight;part.ship_loss*=weight;
                        part.deliveries=r.deliveries/count as u32+u32::from(i<(r.deliveries%count as u32) as usize);
                        part.transport.sales*=weight;part.transport.costs*=weight;part.transport.upkeep*=weight;
                        part.transport.deliveries=r.transport.deliveries/count as u32+u32::from(i<(r.transport.deliveries%count as u32) as usize);
                        part.activity=Activity{since:g.day,..Default::default()};
                        part.epoch=g.day as f64;part.cooldown=g.day;part.forecast=0.0;part.actual=None;
                        part.replacements=r.replacements.iter().enumerate().filter(|(j,_)|j%count==i).map(|(_,k)|k.clone()).collect();
                    }
                    let key=(r.mode.clone(),pair.clone());
                    let at=if let Some(&at)=indices.get(&key){
                        let target=&mut routes[at];
                        target.profit+=part.profit;target.revenue+=part.revenue;target.expenses+=part.expenses;
                        target.cargo_loss+=part.cargo_loss;target.ship_loss+=part.ship_loss;target.deliveries+=part.deliveries;
                        target.transport.sales+=part.transport.sales;target.transport.costs+=part.transport.costs;
                        target.transport.upkeep+=part.transport.upkeep;target.transport.deliveries+=part.transport.deliveries;
                        target.replacements.extend(part.replacements);target.active|=part.active;target.auto_manage|=part.auto_manage;
                        target.escorts=target.escorts.max(part.escorts);target.started=target.started.min(part.started);
                        target.allowed.extend(part.allowed);target.allowed.sort();target.allowed.dedup();
                        target.activity=Activity{since:g.day,..Default::default()};target.epoch=g.day as f64;
                        at
                    }else{
                        if used_id {part.id=g.next_id;g.next_id=g.next_id.checked_add(1).ok_or("経路IDが不足しています。")?;}else{used_id=true;}
                        let at=routes.len();indices.insert(key,at);routes.push(part);at
                    };
                    mapping.insert((r.id,pair),at);
                }
            }
            let mut idle_counts=BTreeMap::<u32,usize>::new();
            for s in &mut co.ships {
                let Some(id)=s.route else{continue;};
                let r=old.iter().find(|r|r.id==id).ok_or("船のルートが不正です。")?;
                let current=r.stops[s.next];
                let pair=if let Some(v)=&s.voyage {self.ordered_stops(vec![v.from,v.to])}
                    else if let Some(h)=&s.handling {self.ordered_stops(vec![h.trip.from,h.trip.to])}
                    else if r.stops.len()>2 && s.cargo.is_empty(){
                        let options:Vec<_>=mapping.keys().filter(|(route,_)|*route==id).map(|(_,p)|p.clone()).collect();
                        let n=idle_counts.entry(id).or_default();let p=options[*n%options.len()].clone();*n+=1;p
                    }else{self.ordered_stops(vec![current,r.stops[(s.next+1)%r.stops.len()]])};
                let at=mapping[&(id,pair)];s.route=Some(routes[at].id);
                s.next=routes[at].stops.iter().position(|&c|c==current).unwrap_or(0);
            }
            // The rival cap remains 50. Prefer staffed routes, then older routes.
            // Unstaffed excess routes go first; cargo on any excess staffed route is reimbursed.
            if ci>0 && routes.len()>50 {
                routes.sort_by_key(|r|(std::cmp::Reverse(co.ships.iter().filter(|s|s.route==Some(r.id)).count()),r.started,r.id));
                let removed:BTreeSet<_>=routes.drain(50..).map(|r|r.id).collect();let mut refund=0.0;
                for s in &mut co.ships {if s.route.is_some_and(|id|removed.contains(&id)){
                    refund+=s.cargo.iter().map(|c|c.cost).sum::<f64>();s.cargo.clear();s.route=None;s.voyage=None;s.handling=None;s.next=0;s.ready=g.day;
                }}
                ensure(amount(refund)&&amount(co.cash.max(0.0)+refund),"経路整理の返金額が不正です。")?;
                refunds.push((ci,refund));
            }
            co.routes=routes;
        }
        g.route_pair_version=1;
        Ok(refunds)
    }
}
