// Reconstruct the national arrays belonging to pre-Asia indexed save fixtures.
export function trimLegacyNations(g){
 g.pairs=g.pairs.filter(p=>p.b<39);
 for(const c of g.companies){c.friendship.length=39;c.diplomacy_budget.length=39;c.trade.length=39;c.friendship_history=c.friendship_history.filter(h=>h.nation<39);}
 return g;
}
