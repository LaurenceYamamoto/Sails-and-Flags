// SVG geometry is presentation only; all period totals are supplied by Wasm.
export function accountCharts(periods,{money,tx}){
 if(!periods.length)return '';
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const label=p=>p.month?`${p.year}-${String(p.month).padStart(2,'0')}`:String(p.year);
 function chart(title,series){
  const values=periods.flatMap(p=>series.map(s=>p[s.key]));
  const low=values.reduce((min,v)=>Math.min(min,v),0),high=values.reduce((max,v)=>Math.max(max,v),1),range=high-low;
  const time=p=>p.month?p.year*12+p.month-1:p.year;
  const first=time(periods[0]),span=time(periods.at(-1))-first;
  const x=i=>80+(span?(time(periods[i])-first)/span:.5)*490,y=v=>150-(v-low)/range*125;
  return `<figure class="account-chart"><figcaption>${escape(title)}</figcaption><div class="chart-key">${series.map(s=>`<span><i style="background:${s.color}"></i>${escape(s.name)}</span>`).join('')}</div><svg viewBox="0 0 600 185" role="img" aria-label="${escape(title)}"><title>${escape(title)}</title>${[low,(low+high)/2,high].map(v=>`<line x1="80" x2="570" y1="${y(v)}" y2="${y(v)}" stroke="#ccd7cd"/><text x="75" y="${y(v)+4}" text-anchor="end">${escape(money(v))}</text>`).join('')}${series.map(s=>`<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${periods.map((p,i)=>`${x(i)},${y(p[s.key])}`).join(' ')}"/>${periods.map((p,i)=>`<circle cx="${x(i)}" cy="${y(p[s.key])}" r="2.5" fill="${s.color}"><title>${label(p)} ${escape(s.name)} £${escape(money(p[s.key]))}</title></circle>`).join('')}`).join('')}<text x="80" y="175">${label(periods[0])}</text><text x="570" y="175" text-anchor="end">${label(periods.at(-1))}</text></svg></figure>`;
 }
 return chart(tx('売上・支出の推移','Sales and expenses over time'),[{key:'sales',name:tx('商品売上','Commodity sales'),color:'#216e51'},{key:'totalExpense',name:tx('全支出','All expenses'),color:'#bb4d30'}])+chart(tx('総資産の推移','Total assets over time'),[{key:'assets',name:tx('総資産','Total assets'),color:'#325cac'}]);
}
