use crate::model::*;
use crate::posts::TradingPost;

pub const RIVAL_LIMIT: usize = 20;
pub const ENTRY_CHANCE: f64 = 0.005;
pub const REENTRY_DELAY: u32 = 30;

// Compare the active companies immediately before entry, including the player.
// Equal values share the same band; the absolute cap takes precedence.
fn entry_value(mut values: Vec<f64>, fraction: f64, draw: f64) -> f64 {
    values.sort_by(|a,b| b.total_cmp(a));
    let cap=(values.first().copied().unwrap_or(0.0).max(0.0)*fraction).min(1e14);
    if values.len()>=6 {
        let low=values[values.len()-2].max(0.0);
        let high=values[4].min(cap);
        if low<=high {return low+(high-low)*draw;}
    }
    cap*draw
}

impl Engine {
    pub(crate) fn rival_home(&self,c:usize)->Option<usize> {
        let co=&self.game.companies[c];
        co.home_nation.or_else(||self.data.starts.iter().find(|s|s.id==co.id).and_then(|s|s.licenses.first().copied()))
    }

    fn entry_candidates(&self)->Vec<usize> {
        self.data.starts.iter().enumerate().filter(|(_,start)| {
            self.game.companies.iter().find(|c|c.id==start.id).is_none_or(|c| {
                (c.bankrupt||c.acquired) && (!c.bankrupt || c.bankrupt_since.is_some_and(|day|self.game.day.saturating_sub(day)>=REENTRY_DELAY))
            })
        }).map(|(i,_)|i).collect()
    }

    pub(crate) fn maybe_enter_rival(&mut self) {
        if self.game.companies[0].bankrupt || self.game.companies.iter().skip(1).filter(|c|!c.bankrupt&&!c.acquired).count()>=RIVAL_LIMIT {return;}
        let candidates=self.entry_candidates();
        if candidates.is_empty() || self.random()>=ENTRY_CHANCE {return;}
        let template=candidates[(self.random()*candidates.len() as f64) as usize];
        self.enter_rival(template);
    }

    fn enter_rival(&mut self,template:usize) {
        let start=self.data.starts[template].clone();
        let active=self.game.companies.iter().enumerate().filter(|(_,c)|!c.bankrupt&&!c.acquired).map(|(i,_)|i).collect::<Vec<_>>();
        let wealth=active.iter().map(|&i|self.assets(i)).collect();
        let knowledge=active.iter().map(|&i|self.game.companies[i].technology.iter().sum()).collect();
        let cash=entry_value(wealth,1.0/3.0,self.random());
        let technology=entry_value(knowledge,2.0/3.0,self.random());
        let city=start.posts[(self.random()*start.posts.len() as f64) as usize];
        let mut co=Company::new(&start.id,&start.name,&start.kind,cash,self.data.nations.len(),false);
        // Reserve guilds obtain the charter of their chosen headquarters.
        co.licenses=if start.reserve {vec![self.data.cities[city].nation]} else {start.licenses};
        co.home_nation=co.licenses.first().copied();
        if let Some(n)=co.home_nation {co.friendship[n]=100.0;}
        co.entered_day=Some(self.game.day);
        co.posts.insert(city,TradingPost::new(self.data.goods.len()));
        let weights=(0..8).map(|_|0.5+self.random()).collect::<Vec<_>>();
        let total=weights.iter().sum::<f64>();
        let mut remaining=technology;
        for (i,w) in weights.iter().enumerate() {
            let level=if i==7 {remaining} else {(technology*w/total).min(remaining)};
            co.technology[i]=level; remaining=(remaining-level).max(0.0);
        }
        co.history.push([self.game.day as f64,cash,cash]);
        // Reuse an extinct template's slot, keeping company indices and storage bounded.
        if let Some(i)=self.game.companies.iter().position(|c|c.id==co.id) {self.game.companies[i]=co;}
        else {self.game.companies.push(co);}
        self.game.roster_version=7;
        self.event("rivalEntry",start.id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn engine()->Engine {let mut e=Engine::new();e.initialize(1700,false);e}

    #[test]
    fn ranking_band_and_absolute_caps_are_intersected_with_fallbacks() {
        for i in 0..1000 {
            let draw=i as f64/1000.0;
            let assets=entry_value(vec![900.,700.,500.,400.,250.,200.,150.,100.],1.0/3.,draw);
            assert!((150.0..=250.0).contains(&assets));
            let constrained=entry_value(vec![600.,500.,400.,300.,250.,200.,150.,100.],1.0/3.,draw);
            assert!((150.0..=200.0).contains(&constrained));
            let fallback=entry_value(vec![600.,590.,580.,570.,560.,550.],1.0/3.,draw);
            assert!((0.0..=200.0).contains(&fallback));
            assert_eq!(entry_value(vec![0.;15],2.0/3.,draw),0.0);
            assert!(entry_value(vec![300.,100.],1.0/3.,draw)<=100.0);
        }
    }

    #[test]
    fn initial_roster_candidates_and_entry_configuration_follow_templates() {
        let e=engine();assert_eq!(e.game.companies.len(),15);assert_eq!(e.entry_candidates(),(14..26).collect::<Vec<_>>());
        for i in 0..26 {
            let mut e=engine();
            if i<14 {e.game.companies[i+1].bankrupt=true;e.clear_bankrupt_rivals();e.game.day=30;}
            let before=e.game.companies.len();let start=e.data.starts[i].clone();e.enter_rival(i);
            let ci=e.game.companies.iter().position(|c|c.id==start.id).unwrap();let co=&e.game.companies[ci];
            assert_eq!(e.game.companies.len(),before+usize::from(i>=14));
            assert!(co.routes.is_empty()&&co.ships.is_empty());assert_eq!(co.posts.len(),1);
            let city=*co.posts.keys().next().unwrap();assert!(start.posts.contains(&city));assert!(co.licenses.contains(&e.data.cities[city].nation));
            assert_eq!(co.friendship[e.rival_home(ci).unwrap()],100.0);assert_eq!(e.assets(ci),co.cash);
            assert!(co.cash>=0.0&&co.cash<=20000.0);assert_eq!(co.technology.iter().sum::<f64>(),0.0);
            assert!(!e.entry_candidates().contains(&i));e.validate(&e.game,false).unwrap();
        }
    }

    #[test]
    fn cooldown_and_replacement_reset_history_without_restoring_old_assets() {
        let mut e=engine();e.game.day=100;e.game.companies[1].bankrupt=true;e.clear_bankrupt_rivals();
        assert_eq!(e.game.companies[1].bankrupt_since,Some(100));
        e.game.day=129;e.clear_bankrupt_rivals();assert!(!e.entry_candidates().contains(&0));
        e.game.day=130;assert!(e.entry_candidates().contains(&0));
        e.enter_rival(0);let co=&e.game.companies[1];assert_eq!(co.entered_day,Some(130));assert_eq!(co.bankrupt_since,None);
        assert!(!co.bankrupt&&!co.acquired);assert!(co.totals.is_empty()&&co.ledger.is_empty()&&co.designs.is_empty());
        assert_eq!(co.history.len(),1);assert_eq!(e.game.companies.len(),15);
    }

    #[test]
    fn entry_wealth_and_total_research_use_independent_active_company_rankings() {
        let mut e=engine();
        let wealth=[90000.,70000.,50000.,35000.,26000.,24000.,22000.,20000.,18000.,16000.,14000.,12000.,10000.,8000.,6000.];
        for (i,c) in e.game.companies.iter_mut().enumerate() {
            c.cash=wealth[i];c.initial_cash=c.cash;c.technology.fill(wealth[i]/8000.0);
        }
        e.enter_rival(14);let co=e.game.companies.last().unwrap();
        assert!((8000.0..=26000.0).contains(&co.cash));
        let research=co.technology.iter().sum::<f64>();assert!((8.0..=26.0).contains(&research));
        assert!(co.technology.iter().all(|v|*v>0.0));assert!(research<=90.0*2.0/3.0);
        assert_eq!(e.assets(e.game.companies.len()-1),co.initial_cash);
        e.validate(&e.game,false).unwrap();
    }

    #[test]
    fn scandinavian_charter_follows_random_headquarters_and_remains_protected() {
        let mut e=engine();let mut seen=std::collections::BTreeSet::new();
        for seed in 1700..1740 {
            e.initialize(seed,false);e.enter_rival(21);let ci=e.game.companies.len()-1;
            let city=*e.game.companies[ci].posts.keys().next().unwrap();seen.insert(city);
            let home=e.data.cities[city].nation;assert_eq!(e.game.companies[ci].licenses,vec![home]);
            assert_eq!(e.rival_home(ci),Some(home));assert!(e.return_license(ci,home).is_err());
        }
        assert_eq!(seen.len(),3);
    }

    #[test]
    fn daily_probability_is_global_and_twenty_rivals_stop_all_entry() {
        let mut e=engine();let mut hits=0;
        // Each trial restores the eligible pool but advances the same saved RNG.
        let original=e.game.clone();let mut rng=original.rng;
        for _ in 0..10000 {
            e.game=original.clone();e.game.rng=rng;e.maybe_enter_rival();rng=e.game.rng;
            if e.game.companies.len()>15 {hits+=1;assert_eq!(e.game.companies.len(),16);}
        }
        assert!((25..=80).contains(&hits),"unexpected entry count {hits}");
        e.game=original;for i in 14..20 {e.enter_rival(i);}
        let rng=e.game.rng;let count=e.game.companies.len();for _ in 0..100 {e.maybe_enter_rival();}
        assert_eq!(count,21);assert_eq!(e.game.companies.len(),count);assert_eq!(e.game.rng,rng);
        e.game.companies[0].bankrupt=true;e.game.companies[1].bankrupt=true;e.maybe_enter_rival();assert_eq!(e.game.rng,rng);
    }
}
