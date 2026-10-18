use crate::model::*;
use std::collections::BTreeMap;

pub struct LandConnection { pub roads: Vec<usize>, pub km: f64 }

// Immutable topology, calculated once. Preserve direct services; otherwise use
// the shortest active-road chain, with deterministic ties and symmetric paths.
pub fn connections(data: &Data) -> BTreeMap<(usize, usize), LandConnection> {
    let n=data.cities.len();
    let mut graph=vec![vec![];n];
    for (i,r) in data.roads.iter().enumerate().filter(|(_,r)|!r.retired) {
        graph[r.a].push((r.b,i)); graph[r.b].push((r.a,i));
    }
    let mut result=BTreeMap::new();
    for a in 0..n {
        let mut dist=vec![f64::INFINITY;n]; let mut used=vec![false;n]; let mut prev=vec![None;n];
        dist[a]=0.0;
        for _ in 0..n {
            let Some(u)=(0..n).filter(|&i|!used[i] && dist[i].is_finite())
                .min_by(|&i,&j|dist[i].total_cmp(&dist[j]).then(i.cmp(&j))) else {break;};
            used[u]=true;
            for &(v,road) in &graph[u] {
                let d=dist[u]+data.roads[road].km;
                if d<dist[v] {dist[v]=d;prev[v]=Some((u,road));}
            }
        }
        for b in a+1..n {
            if let Some(&(_,road))=graph[a].iter().find(|&&(v,_)|v==b) {
                result.insert((a,b),LandConnection{roads:vec![road],km:data.roads[road].km});
            } else if dist[b].is_finite() {
                let mut roads=vec![];let mut u=b;
                while u!=a {let (v,r)=prev[u].unwrap();roads.push(r);u=v;}
                roads.reverse();result.insert((a,b),LandConnection{roads,km:dist[b]});
            }
        }
    }
    result
}

impl Engine {
    pub fn land_connection(&self,a:usize,b:usize)->Option<&LandConnection> {
        self.land_connections.get(&(a.min(b),a.max(b)))
    }
    pub fn land_legs(&self,a:usize,b:usize)->Vec<(usize,usize,usize)> {
        let Some(p)=self.land_connection(a,b) else {return vec![];};
        let mut roads=p.roads.clone();if a>b {roads.reverse();}
        let mut from=a;
        roads.into_iter().map(|road|{let r=&self.data.roads[road];let to=if r.a==from {r.b}else{r.a};
            let leg=(from,to,road);from=to;leg}).collect()
    }
    pub fn land_average(&self,a:usize,b:usize,value:impl Fn(usize)->f64)->f64 {
        self.land_connection(a,b).map_or(0.0,|p|p.roads.iter()
            .map(|&i|self.data.roads[i].km*value(i)).sum::<f64>()/p.km)
    }
}
