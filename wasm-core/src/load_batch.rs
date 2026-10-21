//! Shared compact loading inputs and the fleet operating-cash estimate.
use crate::model::*;
use crate::loading::LoadInput;
use serde::{Deserialize,Serialize};

#[derive(Clone,Serialize,Deserialize)]
pub(crate) struct LoadRequest {
    pub ship:u32, pub from:usize, pub to:usize,
    pub reserve:f64, pub toll:f64, pub days:f64, pub daily:f64, pub rate:f64,
    pub forward:LoadInput, pub reverse:LoadInput,
}
impl Engine {
    pub(crate) fn mandatory_daily(&self,c:usize)->f64{
        let co=&self.game.companies[c];
        co.ships.iter().map(|s|self.daily(c,&s.kind)).sum::<f64>()
            +co.licenses.iter().map(|&n|self.terms(c,n,0).1).sum::<f64>()
            +co.routes.iter().map(|r|r.escorts as f64*4.0).sum::<f64>()
            +co.diplomacy_budget.iter().sum::<f64>()+co.tech_budget.iter().sum::<f64>()
            +self.post_fixed(c)
            +co.posts.values().map(|p|p.size_budget+p.production_budget.iter().sum::<f64>()).sum::<f64>()
            +self.game.roads.iter().filter(|r|r.owner==co.id).map(|r|r.road_budget+r.security_budget).sum::<f64>()
    }
}
