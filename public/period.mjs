const DAY=86400000;
export const PERIOD_PRESETS=[{id:'12m',label:'12 meses',months:12},{id:'6m',label:'6 meses',months:6},{id:'3m',label:'3 meses',months:3},{id:'1m',label:'1 mês',months:1},{id:'15d',label:'15 dias',days:15},{id:'7d',label:'7 dias',days:7},{id:'day',label:'Diária',days:1}];
export function presetRange(id,now=new Date()){
 const preset=PERIOD_PRESETS.find(p=>p.id===id);if(!preset)throw Error('Período inválido.');
 const to=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),[year,month,day]=to.split('-').map(Number);
 let from;if(preset.months){const first=new Date(Date.UTC(year,month-1-preset.months,1)),lastDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();first.setUTCDate(Math.min(day,lastDay));from=first.toISOString().slice(0,10);}else from=new Date(Date.UTC(year,month-1,day-preset.days+1)).toISOString().slice(0,10);
 return{from,to};
}
export function lastYearRange(now=new Date()){
 const to=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),[y,m,d]=to.split('-').map(Number);
 const day=Math.min(d,new Date(Date.UTC(y-1,m,0)).getUTCDate());return{from:[y-1,String(m).padStart(2,'0'),String(day).padStart(2,'0')].join('-'),to};
}
export function inPeriod(post,from,to){
 if(!from&&!to)return true;const time=Date.parse(post.publishedAt);if(!Number.isFinite(time))return false;
 return(!from||time>=Date.parse(from+'T00:00:00-03:00'))&&(!to||time<Date.parse(to+'T00:00:00-03:00')+DAY);
}
export function monthlyCounts(posts,from,to){
 const months=new Map(),start=new Date(from.slice(0,7)+'-01T12:00:00Z'),end=to.slice(0,7);
 for(let d=start;d.toISOString().slice(0,7)<=end;d.setUTCMonth(d.getUTCMonth()+1)){const key=d.toISOString().slice(0,7);months.set(key,{month:key,youtube:0,instagram:0,tiktok:0,facebook:0,total:0});}
 for(const p of posts){if(!inPeriod(p,from,to))continue;const key=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date(p.publishedAt));const row=months.get(key);if(row&&p.network in row){row[p.network]++;row.total++;}}
 return[...months.values()].reverse();
}
