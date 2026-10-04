use crate::model::*;
use serde_json::{Value, json};
use std::collections::BTreeMap;

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
            *bucket.entry(category.into()).or_default() += value.abs();
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
