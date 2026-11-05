import{NETWORKS,canonical,hash,safeImage,groupPosts,coverageFor}from'./core.mjs';
import{audienceReport,metricKey}from'./audience.mjs';
import{missingLinkGroups}from'./link-recovery.mjs';
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
 if(p.network==='youtube'&&p.source==='feed'&&p.authorVerified===true)out.authorVerified=true;
 out.id=typeof p.id==='string'?p.id:hash(p.url);out.thumbnail=safeImage(p.thumbnail);return out;
}
const samples=values=>(values||[]).filter(s=>date(s.at)&&count(s.value)).map(s=>pick(s,['at','value',...(['views','plays'].includes(s.metric)?['metric']:[])]));
export function sanitizeState(input){
 const result={posts:(input.posts||[]).map(publicPost).filter(Boolean),sources:{},statuses:{},lastCheck:date(input.lastCheck),history:{}};
 for(const n of networkNames)result.statuses[n]=safeStatus(input.statuses?.[n]);
 if(input.linkRecovery){const recovery=input.linkRecovery;result.linkRecovery={networks:{},discovery:{},rejectedCandidates:[]};for(const n of networkNames){const r=recovery.networks?.[n];if(r)result.linkRecovery.networks[n]={state:r.state==='paused'?'paused':'ok',lastCheckAt:date(r.lastCheckAt),nextCheckAt:date(r.nextCheckAt)};const d=recovery.discovery?.[n];if(d){const seenPending=(Array.isArray(d.seenPending)?d.seenPending:[]).filter(key=>{try{const[a,title,kind,network]=JSON.parse(key);return typeof title==='string'&&title.length<=500&&['video','image'].includes(kind)&&network===n&&networkNames.some(net=>{try{return canonical(a,net)===a;}catch{return false;}});}catch{return false;}}).slice(0,30);result.linkRecovery.discovery[n]={state:['unavailable','paused','matched','checked'].includes(d.state)?d.state:'checked',checkedAt:date(d.checkedAt),nextCheckAt:date(d.nextCheckAt),unchangedChecks:count(d.unchangedChecks)?d.unchangedChecks:0,seenPending};}}result.linkRecovery.rejectedCandidates=(Array.isArray(recovery.rejectedCandidates)?recovery.rejectedCandidates:[]).filter(p=>{try{return p.network==='tiktok'&&p.kind==='image'&&date(p.observedAt)&&canonical(p.url,p.network)===p.url;}catch{return false;}}).slice(-100).map(p=>pick(p,['network','url','kind','observedAt']));const a=recovery.automatic;if(a&&date(a.checkedAt))result.linkRecovery.automatic={enabled:a.enabled===true,checkedAt:date(a.checkedAt),checked:count(a.checked)&&a.checked<=4?a.checked:0,matched:count(a.matched)&&a.matched<=4?a.matched:0,sourcePages:count(a.sourcePages)&&a.sourcePages<=4?a.sourcePages:0,networks:(Array.isArray(a.networks)?a.networks:[]).filter(n=>networkNames.includes(n)).slice(0,4)};}
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
 const safe=sanitizeState(state),{audience,history,linkRecovery,...rest}=safe;
 const posts=safe.posts.map(p=>{const m=audience?.videos?.[metricKey(p.network,p.url)],metrics=p.kind==='video'&&m&&count(m.value)&&['views','plays'].includes(m.metric)&&date(m.observedAt)?pick(m,['value','metric','observedAt']):null;return{...p,metrics};});
 const publicState={...rest,posts,annualSearch:history.annual||null,coverage:coverageFor(safe),groups:groupPosts(posts),networks:NETWORKS,serverTime:new Date(now).toISOString(),publicView:true,cloudSnapshot:true};
 const reports=[];for(const at of[now,now+86400000])for(const preset of PERIOD_PRESETS){const range=presetRange(preset.id,new Date(at));if(!reports.some(r=>r.from===range.from&&r.to===range.to))reports.push({...audienceReport(safe,range,now),preset:preset.id});}
 const meaningful={automaticRecovery:linkRecovery?.automatic?.enabled===true,groups:publicState.groups.map(g=>[g.id,g.posts.map(p=>p.url)]),posts:safe.posts,postMetrics:posts.map(p=>[p.network,p.url,p.metrics?.value??null,p.metrics?.metric??null]),statuses:Object.fromEntries(networkNames.map(n=>[n,pick(safe.statuses[n],['state','method','discoveryMethod','count','confirmed','pending','missingFromFeed','missingFromSource'])])),reports:reports.map(r=>[r.from,r.to,r.followers,r.observedDelta,r.comparedPosts,r.networks.map(n=>[n.network,n.followers?.value,n.followers?.approximate,n.followers?.stale,n.observedDelta,n.comparedPosts])])};
 const signature=createHash('sha256').update(JSON.stringify(meaningful)).digest('hex');publicState.publicationVersion=signature;
 const missingLinks={schemaVersion:1,generatedAt:new Date(now).toISOString(),lastCollectionAt:safe.lastCheck,publicationVersion:signature,windowHours:72,groups:missingLinkGroups(safe.posts,now).slice(0,30).map(({id,title,kind,anchorUrl,latestAt,missing,canAutoMatch,posts})=>({id,title,kind,anchorUrl,latestAt,missing,canAutoMatch,posts:posts.map(p=>pick(p,['network','url','title','publishedAt']))})),networks:linkRecovery?.networks||{},sources:safe.statuses};
 missingLinks.automatic=linkRecovery?.automatic||{enabled:false};missingLinks.discovery=Object.fromEntries(Object.entries(linkRecovery?.discovery||{}).map(([n,d])=>[n,pick(d,['state','checkedAt','nextCheckAt','unchangedChecks'])]));
 return{signature,publicState,missingLinks,reports:{schemaVersion:1,publicationVersion:signature,generatedAt:new Date(now).toISOString(),reports}};
}
export function shouldPublish(previous,signature,now=Date.now()){return!previous||previous.signature!==signature||now-Date.parse(previous.at)>=3600000;}
