use crate::model::*;
use serde_json::{Value, json};
use std::collections::BTreeMap;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bounded_ledger_preserves_array_order_and_period_totals_across_wraps() {
        let mut e=Engine::new_planner();
        e.game.companies[0].ledger.clear();
        e.game.companies[0].totals.clear();
        e.game.companies[0].accounts=None;
        e.game.companies[0].cash=1e9;
        let mut rows=Vec::new();
        let mut periods:BTreeMap<(bool,u32,bool),f64>=BTreeMap::new();
        for i in 0..650 {
            e.game.day=350+i;
            let value=if i%2==0 {0.1*(i+1) as f64} else {-0.3*(i+1) as f64};
            e.entry(0,"test",value,None,i.to_string());
            rows.push(json!({"day":350+i,"category":"test","amount":value,"route":null,"detail":i.to_string()}));
            if rows.len()>200 {rows.remove(0);}
            assert_eq!(serde_json::to_value(&e.game.companies[0].ledger).unwrap(),json!(rows));
            let month=Engine::calendar_at(350+i).0;
            for (annual,id) in [(false,month),(true,month/12)] {
                *periods.entry((annual,id,value>=0.0)).or_default()+=value.abs();
            }
        }
        let a=e.game.companies[0].accounts.as_ref().unwrap();
        for ((annual,id,income),expected) in periods {
            let p=if annual {&a.years.as_ref().unwrap()[&id]} else {&a.months[&id]};
            let actual=if income {p.income["test"]} else {p.expense["test"]};
            assert_eq!(actual.to_bits(),expected.to_bits());
        }
        let text=serde_json::to_string(&e.game.companies[0].ledger).unwrap();
        let legacy:Vec<Ledger>=serde_json::from_str(&text).unwrap();
        e.game.companies[0].ledger=serde_json::from_str(&serde_json::to_string(&legacy).unwrap()).unwrap();
        assert_eq!(serde_json::to_string(&e.game.companies[0].ledger).unwrap(),text);
        e.entry(0,"negativeZero",-0.0,None,String::new());
        assert_eq!(e.game.companies[0].totals["negativeZero"].to_bits(),0.0f64.to_bits());
    }
    #[test]
    fn legacy_long_ledger_keeps_the_latest_two_hundred_records() {
        let mut e=Engine::new_planner();
        e.game.companies[0].ledger=(0..600).map(|i|Ledger{day:i,category:"sale".into(),amount:1.0,route:None,detail:String::new()}).collect();
        Engine::normalize_account_history(&mut e.game);
        assert_eq!(e.game.companies[0].ledger.iter().map(|l|l.day).collect::<Vec<_>>(),(400..600).collect::<Vec<_>>());
    }
}

impl Accounts {
    fn new(day: u32) -> Self {
        Self {
            since: day,
            months: BTreeMap::new(),
            years: Some(BTreeMap::new()),
        }
    }
    fn retain_recent(&mut self, month: u32) {
        let first_month = month.saturating_sub(MONTHS_RETAINED - 1);
        let first_year = (month / 12).saturating_sub(YEARS_RETAINED - 1);
        while self
            .months
            .first_key_value()
            .is_some_and(|(&m, _)| m < first_month)
        {
            self.months.pop_first();
        }
        if let Some(years) = &mut self.years {
            while years
                .first_key_value()
                .is_some_and(|(&y, _)| y < first_year)
            {
                years.pop_first();
            }
        }
    }
}

impl Engine {
    pub fn normalize_account_history(g: &mut Game) {
        let month = Self::calendar_at(g.day).0;
        for company in &mut g.companies {
            let excess = company.ledger.len().saturating_sub(LEDGER_RETAINED);
            company.ledger.drain(..excess);
            if let Some(a) = &mut company.accounts {
                if a.years.is_none() {
                    let mut years: BTreeMap<u32, AccountPeriod> = BTreeMap::new();
                    for (&m, p) in &a.months {
                        let year = years.entry(m / 12).or_default();
                        for (key, value) in &p.income {
                            *year.income.entry(key.clone()).or_default() += value;
                        }
                        for (key, value) in &p.expense {
                            *year.expense.entry(key.clone()).or_default() += value;
                        }
                        if p.as_of >= year.as_of {
                            year.assets = p.assets;
                            year.as_of = p.as_of;
                        }
                    }
                    a.years = Some(years);
                }
                a.retain_recent(month);
            }
        }
    }
    pub fn record_account(&mut self, category: &str, value: f64) {
        let month = self.calendar().0;
        let day = self.game.day;
        let a = self.game.companies[0]
            .accounts
            .get_or_insert_with(|| Accounts::new(day));
        for period in [
            a.months.entry(month).or_default(),
            a.years.as_mut().unwrap().entry(month / 12).or_default(),
        ] {
            let bucket = if value >= 0.0 {
                &mut period.income
            } else {
                &mut period.expense
            };
            if let Some(total) = bucket.get_mut(category) {
                *total += value.abs();
            } else {
                bucket.insert(category.into(), 0.0 + value.abs());
            }
            period.as_of = day;
        }
    }
    pub fn capture_accounts(&mut self) {
        let month = self.calendar().0;
        let day = self.game.day;
        let assets = self.assets(0);
        let a = self.game.companies[0]
            .accounts
            .get_or_insert_with(|| Accounts::new(day));
        for p in [
            a.months.entry(month).or_default(),
            a.years.as_mut().unwrap().entry(month / 12).or_default(),
        ] {
            p.assets = assets;
            p.as_of = day;
        }
        a.retain_recent(month);
    }
    pub fn account_report(&self, annual: bool) -> Value {
        let Some(a) = &self.game.companies[0].accounts else {
            return json!({"since":self.game.day,"periods":[]});
        };
        let periods = if annual {
            a.years.as_ref().unwrap()
        } else {
            &a.months
        };
        json!({"since":a.since,"periods":periods.iter().map(|(&id,p)| {
            let income=p.income.values().sum::<f64>().max(0.0);
            let expense=p.expense.values().sum::<f64>().max(0.0);
            json!({"id":id,"year":1700+if annual{id}else{id/12},"month":if annual{None}else{Some(id%12+1)},"income":p.income,"expense":p.expense,"totalIncome":income,"totalExpense":expense,"net":income-expense,"sales":p.income.get("sale").copied().unwrap_or(0.0),"assets":p.assets,"asOf":p.as_of})
        }).collect::<Vec<_>>()})
    }
}
