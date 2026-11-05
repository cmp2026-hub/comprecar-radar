import{NETWORKS,CHANNEL,canonical,postKey}from'./core.mjs';
import{missingLinkGroups,compatibleHeadline}from'./link-recovery.mjs';
import{parseFeed}from'./core.mjs';
import{parseTikTokCreatorLinks,parseTikTokPublic,instagramPublicLinks,parseInstagramPostPublic,parseFacebookPublic,parseYouTubePublic,FACEBOOK_REELS,TIKTOK_CREATOR}from'./collectors.mjs';

export const DISCOVERY_URLS={youtube:'https://www.youtube.com/feeds/videos.xml?channel_id='+CHANNEL,instagram:'https://www.instagram.com/comprecar/',facebook:FACEBOOK_REELS,tiktok:TIKTOK_CREATOR};
const blocked=status=>[401,403,409,429].includes(status);
const apiPost=(app,path,body)=>app.api(new Request('https://radar.invalid'+path,{method:'POST',headers:{origin:'https://radar.invalid','content-type':'application/json'},body:JSON.stringify(body)}));
function cacheable(raw){try{const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||u.port)return false;if(Object.values(DISCOVERY_URLS).includes(u.href)||['https://www.facebook.com/Comprecar/','https://www.facebook.com/Comprecar/videos/','https://www.instagram.com/comprecar/embed/'].includes(u.href))return true;return Object.keys(NETWORKS).some(n=>{try{return canonical(u.href,n)===u.href;}catch{return false;}});}catch{return false;}}
// A cache belongs to one collection execution. Failed responses are also reused:
// a second phase never retries the same blocked address in that execution.
export function createPublicRunFetcher(fetcher=fetch){
 const responses=new Map();
 async function runFetch(raw,options){const url=String(raw);if(!cacheable(url))return fetcher(raw,options);let item=responses.get(url);if(!item){item={requestedAt:new Date().toISOString()};responses.set(url,item);item.promise=Promise.resolve().then(()=>fetcher(raw,options)).then(r=>(item.response=r,r),e=>{item.error=e;throw e;});}return(await item.promise).clone();}
 return{fetcher:runFetch,responses};
}
const pendingKeys=(groups,network)=>groups.filter(g=>g.missing.includes(network)).map(g=>JSON.stringify([g.anchorUrl,g.title,g.kind,network])).sort();
function sourcePause(state,network){const s=state.statuses?.[network]||{},r=state.linkRecovery?.networks?.[network];return Math.max(Date.parse(r?.nextCheckAt||0)||0,s.state==='error'?(Date.parse(s.nextCheckAt||0)||0):0,network==='tiktok'&&s.discoveryMethod!=='public-creator'?(Date.parse(s.directNextCheckAt||0)||0):0);}
async function publicText(fetcher,url,network){const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{'user-agent':'ComprecarRadar/1.2',accept:network==='youtube'&&url===DISCOVERY_URLS.youtube?'application/atom+xml':'text/html'}});if(!r.ok){const error=Error('HTTP '+r.status);error.status=r.status;throw error;}const text=await r.text();if(text.length>8000000)throw Error('Resposta pública excedeu o limite.');return text;}
function observedLinks(network,text,now){if(network==='tiktok')return parseTikTokCreatorLinks(text,now).map(p=>p.url);if(network==='instagram')return instagramPublicLinks(text).map(p=>p.url);if(network==='facebook')return parseFacebookPublic(text,now).map(p=>p.url);return parseFeed(text,'youtube',now).map(p=>p.url);}
function parseCandidate(network,text,url,now){if(network==='tiktok')return parseTikTokPublic(text,url.match(/\/video\/(\d+)/)[1],now);if(network==='instagram')return parseInstagramPostPublic(text,url.match(/\/(?:p|reel|tv)\/([^/]+)/)[1],now);if(network==='facebook')return parseFacebookPublic(text,now).find(p=>p.url===url);return parseYouTubePublic(text,new URL(url).searchParams.get('v'),now);}

export async function recoverMissingAutomatically(app,{readState,writeState,fetcher,responses,limit=4,now=Date.now()}){
 if(!Number.isInteger(limit)||limit<0||limit>4)throw Error('Limite de recuperação inválido.');
 const report={enabled:true,checkedAt:new Date(now).toISOString(),checked:0,matched:0,sourcePages:0,networks:[],results:[]};
 await apiPost(app,'/api/groups/reconcile',{});
 const working=await readState(),discovery=structuredClone(working.linkRecovery?.discovery||{}),rejected=[...(working.linkRecovery?.rejectedCandidates||[])];
 const seen=new Set();
 for(const network of Object.keys(NETWORKS)){
  if(report.checked>=limit)break;
  let state=await readState(),pending=missingLinkGroups(state.posts,now).filter(g=>g.canAutoMatch).slice(0,30),keys=pendingKeys(pending,network);if(!keys.length)continue;
  const previous=discovery[network]||{},newPending=keys.some(k=>!previous.seenPending?.includes(k)),sourceUrl=DISCOVERY_URLS[network],cached=responses.get(sourceUrl);
  if(sourcePause(state,network)>now)continue;
  if(!cached&&!newPending&&Date.parse(previous.nextCheckAt||0)>now)continue;
  let urls;
  try{const text=await publicText(fetcher,sourceUrl,network);urls=observedLinks(network,text,now);report.sourcePages++;report.networks.push(network);}
  catch(error){const next=new Date(now+(blocked(error.status)?900000:1800000)).toISOString();discovery[network]={...previous,state:'unavailable',checkedAt:cached?.requestedAt||new Date(now).toISOString(),seenPending:keys,nextCheckAt:next,unchangedChecks:(previous.unchangedChecks||0)+1};if(blocked(error.status)){const latest=await readState();latest.linkRecovery||={};latest.linkRecovery.networks||={};latest.linkRecovery.networks[network]={state:'paused',lastCheckAt:new Date(now).toISOString(),nextCheckAt:next};await writeState(latest);}continue;}
  let recovered=0,failed=false;
  for(const url of urls){
   if(report.checked>=limit)break;if(seen.has(url)||rejected.some(p=>p.url===url))continue;seen.add(url);
   state=await readState();const known=state.posts.find(p=>p.url===url||network==='instagram'&&postKey(p)==='instagram:'+url.match(/\/(?:p|reel|tv)\/([^/]+)/)?.[1]);
   // Complete known posts are reconciled from their existing metadata; only
   // unknown or incomplete public links need an extra metadata request.
   if(known?.publishedAt&&!known.metadataPending)continue;
   if(Date.parse(state.linkRecovery?.networks?.[network]?.nextCheckAt||0)>now)break;
   report.checked++;
   try{
    const html=await publicText(fetcher,url,network),post=parseCandidate(network,html,url,now);if(!post)throw Error('Publicação não confirmada.');
    pending=missingLinkGroups((await readState()).posts,now).filter(g=>g.canAutoMatch&&g.missing.includes(network)&&compatibleHeadline(post,g));
    if(pending.length!==1){report.results.push({network,url,state:'no-unique-match'});continue;}
    const response=await apiPost(app,'/api/groups/check-links',{anchorUrl:pending[0].anchorUrl,network,urls:[url]}),result=await response.json();
    report.results.push({network,url,state:result.matched?'matched':'not-matched'});
    if(result.matched){report.matched+=result.matched;recovered+=result.matched;}
    if(result.paused||result.errors?.length||!response.ok){failed=true;break;}
   }catch(error){
    if(network==='tiktok'&&/é de fotos/.test(error.message)){rejected.push({network,url,kind:'image',observedAt:new Date(now).toISOString()});report.results.push({network,url,state:'photo-not-video'});continue;}
    report.results.push({network,url,state:'unavailable'});failed=true;
    const latest=await readState();latest.linkRecovery||={};latest.linkRecovery.networks||={};latest.linkRecovery.networks[network]={state:'paused',lastCheckAt:new Date(now).toISOString(),nextCheckAt:new Date(now+(blocked(error.status)?900000:300000)).toISOString()};await writeState(latest);break;
   }
  }
  const unchanged=recovered?0:(newPending?1:(previous.unchangedChecks||0)+1),delay=recovered?300000:[1800000,3600000,7200000][Math.min(Math.max(unchanged-1,0),2)];
  const latest=await readState(),pause=Date.parse(latest.linkRecovery?.networks?.[network]?.nextCheckAt||0)||0;
  discovery[network]={state:failed?'paused':recovered?'matched':'checked',checkedAt:responses.get(sourceUrl)?.requestedAt||new Date(now).toISOString(),seenPending:keys,unchangedChecks:unchanged,nextCheckAt:new Date(Math.max(now+delay,pause)).toISOString()};
 }
 const final=await readState();final.linkRecovery||={};final.linkRecovery.discovery=discovery;final.linkRecovery.rejectedCandidates=rejected.slice(-100);final.linkRecovery.automatic={enabled:true,checkedAt:report.checkedAt,checked:report.checked,matched:report.matched,sourcePages:report.sourcePages,networks:report.networks};await writeState(final);
 return report;
}
