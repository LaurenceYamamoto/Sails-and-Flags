// Reconstruct the national arrays belonging to pre-Asia indexed save fixtures.
export function trimLegacyNations(g,count=39){
 g.pairs=g.pairs.filter(p=>p.b<count);
 for(const c of g.companies){c.friendship.length=count;c.diplomacy_budget.length=count;c.trade.length=count;c.friendship_history=c.friendship_history.filter(h=>h.nation<count);}
 return g;
}
