import{NETWORKS,canonical,hash,safeImage,groupPosts,coverageFor}from'./core.mjs';
import{audienceReport,metricKey}from'./audience.mjs';
import{PERIOD_PRESETS,presetRange}from'../public/period.mjs';
import{createHash}from'node:crypto';
const networkNames=Object.keys(NETWORKS),date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:null;
const count=v=>Number.isSafeInteger(v)&&v>=0;
const pick=(o,keys)=>Object.fromEntries(keys.filter(k=>o?.[k]!==undefined).map(k=>[k,o[k]]));
export function safeStatus(s={}){
 const out=pick(s,['state','method','discoveryMethod','count','confirmed','pending','missingFromFeed','missingFromSource','providerCacheSeconds']);
 for(const key of['lastSuccess','nextCheckAt','lastAttempt','lastMetadataCheck','lastCheckedAt','sourceAsOf','latestSourcePostAt','latestFeedPostAt','directNextCheckAt','directLastSuccess'])if(date(s[key]))out[key]=s[key];
 out.message=s.state==='error'?'Fonte pública indisponível nesta consulta; links anteriores preservados.':s.state==='delayed'?'Fonte pública em atraso; links confirmados preservados.':s.state==='partial'?'Cobertura pública parcial.':'Consulta às publicações públicas.';
 if(s.directSnapshot&&date(s.directSnapshot.checkedAt))out.directSnapshot={checkedAt:s.directSnapshot.checkedAt,urls:(s.directSnapshot.urls||[]).filter(u=>{try{return canonical(u,'tiktok')===u;}catch{return false;}}).slice(0,10)};
 return out;
}
function publicPost(p){
 if(!networkNames.includes(p.network))return null;
 try{if(canonical(p.url,p.network)!==p.url)return null;}catch{return null;}
 const out=pick(p,['network','url','title','publishedAt','datePrecision','kind','source','firstSeenAt','groupOverride','metadataPending','caption','originalTitle','linkRecoveredAt']);
 out.id=typeof p.id==='string'?p.id:hash(p.url);out.thumbnail=safeImage(p.thumbnail);return out;
}
const samples=values=>(values||[]).filter(s=>date(s.at)&&count(s.value)).map(s=>pick(s,['at','value',...(['views','plays'].includes(s.metric)?['metric']:[])]));
export function sanitizeState(input){
 const result={posts:(input.posts||[]).map(publicPost).filter(Boolean),sources:{},statuses:{},lastCheck:date(input.lastCheck),history:{}};
 for(const n of networkNames)result.statuses[n]=safeStatus(input.statuses?.[n]);
 for(const n of[...networkNames,'annual'])if(input.history?.[n]){const h=input.history[n];result.history[n]={...pick(h,['state','pages','links','updatedAt','from','to','added','scanned']),message:'Levantamento público parcial.'};if(result.history[n].state==='running')result.history[n].state='paused';}
 if(input.audience){const a=input.audience;result.audience={startedAt:date(a.startedAt),profiles:{},videos:{},statuses:{},lastCheckAt:date(a.lastCheckAt),nextCheckAt:date(a.nextCheckAt)};
  for(const n of networkNames){const p=a.profiles?.[n];if(p&&count(p.value))result.audience.profiles[n]={value:p.value,approximate:!!p.approximate,observedAt:date(p.observedAt),sourceUrl:NETWORKS[n].url,samples:samples(p.samples)};result.audience.statuses[n]=safeStatus(a.statuses?.[n]);}
  for(const v of Object.values(a.videos||{})){if(!networkNames.includes(v.network)||!count(v.value))continue;try{if(canonical(v.url,v.network)!==v.url)continue;}catch{continue;}const entry={network:v.network,url:v.url,value:v.value,metric:v.metric,observedAt:date(v.observedAt),samples:samples(v.samples)};result.audience.videos[metricKey(v.network,v.url)]=entry;}
 }
 return result;
}
export function applyGroups(state,rules=[]){
 const occupied=new Set();
 for(const rule of rules){if(!Array.isArray(rule.urls)||rule.urls.length<2)throw Error('Cada agrupamento precisa de ao menos dois links já coletados.');const found=rule.urls.map(u=>state.posts.find(p=>p.url===u));if(found.some(p=>!p))throw Error('Um link do agrupamento ainda não foi coletado.');if(new Set(found.map(p=>p.network)).size!==found.length||new Set(found.map(p=>p.kind)).size!==1)throw Error('Agrupamento ambíguo: redes ou formatos incompatíveis.');if(found.some(p=>occupied.has(p.url)))throw Error('Um link foi incluído em mais de um agrupamento.');const id='manual-cloud-'+hash([...rule.urls].sort().join('|'));for(const p of found){occupied.add(p.url);p.groupOverride=id;}}
 return state;
}
export function snapshot(state,now=Date.now()){
 const safe=sanitizeState(state),{audience,history,...rest}=safe;
 const publicState={...rest,annualSearch:history.annual||null,coverage:coverageFor(safe),groups:groupPosts(safe.posts),networks:NETWORKS,serverTime:new Date(now).toISOString(),publicView:true,cloudSnapshot:true};
 const reports=[];for(const at of[now,now+86400000])for(const preset of PERIOD_PRESETS){const range=presetRange(preset.id,new Date(at));if(!reports.some(r=>r.from===range.from&&r.to===range.to))reports.push({...audienceReport(safe,range,now),preset:preset.id});}
 const meaningful={posts:safe.posts,statuses:Object.fromEntries(networkNames.map(n=>[n,pick(safe.statuses[n],['state','method','discoveryMethod','count','confirmed','pending','missingFromFeed','missingFromSource'])])),reports:reports.map(r=>[r.from,r.to,r.followers,r.observedDelta,r.comparedPosts,r.networks.map(n=>[n.network,n.followers?.value,n.followers?.approximate,n.followers?.stale,n.observedDelta,n.comparedPosts])])};
 const signature=createHash('sha256').update(JSON.stringify(meaningful)).digest('hex');publicState.publicationVersion=signature;
 return{signature,publicState,reports:{schemaVersion:1,publicationVersion:signature,generatedAt:new Date(now).toISOString(),reports}};
}
export function shouldPublish(previous,signature,now=Date.now()){return!previous||previous.signature!==signature||now-Date.parse(previous.at)>=3600000;}
