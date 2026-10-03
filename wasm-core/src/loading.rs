use crate::model::*;
use crate::trade::integrated;
#[derive(Clone, Copy, Default)]
struct Choice {
    qty: usize,
    cost: f64,
    profit: f64,
}
struct Product {
    good: usize,
    values: Vec<Choice>,
}
struct Search {
    options: Vec<Product>,
    bounds: Vec<Vec<f64>>,
    cash: Vec<Vec<(f64, f64)>>,
    budget: f64,
    best: f64,
    cost: f64,
    cargo: Vec<(usize, usize)>,
    nodes: usize,
}
impl Search {
    fn cash_bound(&self, i: usize, budget: f64) -> f64 {
        if i >= self.cash.len() {
            return 0.0;
        }
        let rows = &self.cash[i];
        let j = rows
            .partition_point(|&(cost, _)| cost <= budget)
            .saturating_sub(1);
        let (cost, profit) = rows[j];
        if j + 1 < rows.len() {
            let (next_cost, next_profit) = rows[j + 1];
            profit + (budget - cost) * (next_profit - profit) / (next_cost - cost)
        } else {
            profit
        }
    }
    fn visit(
        &mut self,
        i: usize,
        room: usize,
        cost: f64,
        profit: f64,
        cargo: &mut Vec<(usize, usize)>,
    ) {
        self.nodes += 1;
        if self.nodes > 2000 {
            return;
        }
        if profit + self.bounds[i][room].min(self.cash_bound(i, self.budget - cost))
            <= self.best + 1e-9
        {
            return;
        }
        if i == self.options.len() {
            self.best = profit;
            self.cost = cost;
            self.cargo = cargo.clone();
            return;
        }
        let good = self.options[i].good;
        let mut choices = self.options[i]
            .values
            .iter()
            .filter(|v| v.qty <= room && cost + v.cost <= self.budget)
            .copied()
            .collect::<Vec<_>>();
        choices.sort_by(|a, b| {
            (b.profit + self.bounds[i + 1][room - b.qty])
                .total_cmp(&(a.profit + self.bounds[i + 1][room - a.qty]))
        });
        for v in choices {
            if self.nodes >= 2000 {
                break;
            }
            if v.qty > 0 {
                cargo.push((good, v.qty));
            }
            self.visit(i + 1, room - v.qty, cost + v.cost, profit + v.profit, cargo);
            if v.qty > 0 {
                cargo.pop();
            }
        }
    }
}
impl Engine {
    /// Capacity and fractional-cash bounds preserve the reference search policy,
    /// including its 2,000-node cap. No browser code makes cargo decisions.
    pub fn load_plan(
        &self,
        c: usize,
        from: usize,
        to: usize,
        capacity: usize,
        budget: f64,
        allowed: &[usize],
        margin: f64,
    ) -> (Vec<(usize, usize)>, f64, f64) {
        let buy_tax = 1.0 + self.terms(c, self.data.cities[from].nation, 0).2;
        let sell_tax = 1.0 - self.terms(c, self.data.cities[to].nation, 0).2;
        let mut options = vec![];
        for &good in allowed {
            let source = self.game.markets[from * self.data.goods.len() + good].stock;
            let target = self.game.markets[to * self.data.goods.len() + good].stock;
            let base = self.data.goods[good].base;
            let mut values = vec![Choice::default()];
            for qty in 1..=capacity.min(source.floor() as usize) {
                let cost = integrated(base, source - qty as f64, source) * buy_tax;
                let sales = integrated(base, target, target + qty as f64) * sell_tax;
                let prev = values[qty - 1];
                let dc = cost - prev.cost;
                let ds = sales - prev.profit - prev.cost;
                if ds <= dc || (ds / dc - 1.0) * 100.0 + 1e-9 < margin {
                    break;
                }
                values.push(Choice {
                    qty,
                    cost,
                    profit: sales - cost,
                });
            }
            if values.len() > 1 {
                options.push(Product { good, values });
            }
        }
        if options.is_empty() {
            return (vec![], 0.0, 0.0);
        }
        let mut bounds = vec![vec![0.0; capacity + 1]; options.len() + 1];
        let mut cash = vec![];
        for i in 0..options.len() {
            let mut units = options[i..]
                .iter()
                .flat_map(|o| {
                    o.values
                        .windows(2)
                        .map(|v| (v[1].cost - v[0].cost, v[1].profit - v[0].profit))
                })
                .collect::<Vec<_>>();
            units.sort_by(|a, b| b.1.total_cmp(&a.1));
            for room in 1..=capacity {
                bounds[i][room] =
                    bounds[i][room - 1] + units.get(room - 1).map(|v| v.1).unwrap_or(0.0);
            }
            units.sort_by(|a, b| (b.1 / b.0).total_cmp(&(a.1 / a.0)));
            let mut prefix = vec![(0.0, 0.0)];
            for (cost, profit) in units {
                let prev = prefix.last().unwrap();
                prefix.push((prev.0 + cost, prev.1 + profit));
            }
            cash.push(prefix);
        }
        let mut search = Search {
            options,
            bounds,
            cash,
            budget,
            best: 0.0,
            cost: 0.0,
            cargo: vec![],
            nodes: 0,
        };
        for exponent in [0.0, 0.5, 1.0] {
            let mut counts = vec![0; search.options.len()];
            let mut cost = 0.0;
            let mut profit = 0.0;
            for _ in 0..capacity {
                let mut best = None;
                for (i, o) in search.options.iter().enumerate() {
                    let q = counts[i];
                    if q + 1 >= o.values.len() {
                        continue;
                    }
                    let dc = o.values[q + 1].cost - o.values[q].cost;
                    let dp = o.values[q + 1].profit - o.values[q].profit;
                    let score = dp / dc.powf(exponent);
                    if cost + dc <= budget && best.is_none_or(|(_, s)| score > s) {
                        best = Some((i, score));
                    }
                }
                let Some((i, _)) = best else { break };
                let q = counts[i];
                let values = &search.options[i].values;
                cost += values[q + 1].cost - values[q].cost;
                profit += values[q + 1].profit - values[q].profit;
                counts[i] += 1;
            }
            if profit > search.best {
                search.best = profit;
                search.cost = cost;
                search.cargo = counts
                    .iter()
                    .enumerate()
                    .filter(|(_, q)| **q > 0)
                    .map(|(i, &q)| (search.options[i].good, q))
                    .collect();
            }
        }
        search.visit(0, capacity, 0.0, 0.0, &mut vec![]);
        (search.cargo, search.cost, search.cost + search.best)
    }
}
