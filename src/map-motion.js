// Display geometry only; never used for simulation distances or travel times.
export function compilePath(lines){
 const segments=[];let total=0;
 for(const line of lines)for(let i=1;i<line.length;i++){
  const a=line[i-1],b=line[i],length=Math.hypot(b.x-a.x,b.y-a.y);
  segments.push({a,b,length,start:total,end:total+length});total+=length;
 }
 return {segments,total};
}
export function pathPoint(path,progress,fallback){
 if(!path?.segments.length)return fallback;
 const distance=path.total*Math.max(0,Math.min(1,progress)),s=path.segments;
 let low=0,high=s.length-1;
 while(low<high){const mid=(low+high)>>>1;if(s[mid].end>=distance)high=mid;else low=mid+1;}
 const p=s[low],t=p.length?(distance-p.start)/p.length:0;
 return {x:p.a.x+(p.b.x-p.a.x)*t,y:p.a.y+(p.b.y-p.a.y)*t};
}
export function shipPoint(sample,fraction,extra){
 const v=sample.voyage;
 return v?pathPoint(sample.path,(v.total-v.remaining+fraction+extra)/v.total,sample.fallback):sample.fallback;
}
