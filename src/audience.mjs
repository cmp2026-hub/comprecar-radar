import{walk,extractAssignedJson}from'./collectors.mjs';
const NETWORKS=['youtube','instagram','tiktok','facebook'];
export const AUDIENCE_INTERVAL=900000;
export const AUDIENCE_URLS={youtube:'https://www.youtube.com/@ComprecarTV/about',instagram:'https://www.instagram.com/comprecar/',facebook:'https://www.facebook.com/Comprecar/'};
export const INSTAGRAM_REELS_URL='https://www.instagram.com/comprecar/reels/';
const YT='UC9Pbtn0wi6CXxTHMPbolwPA',IG=['1558975667','17841401910034358'],TT='7215972331608589318';
const htmlText=s=>String(s||'').replace(/&#x([\da-f]+);/gi,(_,s)=>String.fromCodePoint(parseInt(s,16))).replace(/&#(\d+);/g,(_,s)=>String.fromCodePoint(+s)).replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
const numeric=n=>n!==null&&n!==undefined&&/^\d+$/.test(String(n))&&Number.isSafeInteger(Number(n))?Number(n):null;
export function publicCount(raw){
 if(typeof raw==='number')return Number.isSafeInteger(raw)&&raw>=0?{value:raw,approximate:false}:null;
 const s=htmlText(raw).replace(/\u00a0/g,' ').trim().replace(/\s+(?:inscritos?|seguidores?|followers?|subscribers?|visualiza(?:ções|ção)|views?|vídeos?|videos?)$/i,''),m=s.match(/^(\d[\d.,\s]*?)\s*(milh(?:ão|ões)|bilh(?:ão|ões)|million|billion|thousand|mil|mi|[kmb])?$/i);if(!m)return null;
 const unit=(m[2]||'').toLowerCase(),factor=/^(milh|million|mi$|m$)/.test(unit)?1e6:/^(bilh|billion|b$)/.test(unit)?1e9:unit?1000:1;
 const number=Number(unit?m[1].replace(/\s/g,'').replace(',','.'):m[1].replace(/[.,\s]/g,''));
 const value=Math.round(number*factor);return Number.isSafeInteger(value)&&value>=0?{value,approximate:!!unit}:null;
}
function scripts(html){const roots=[];for(const m of html.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi))try{roots.push(JSON.parse(m[1]))}catch{}return roots;}
const meta=(html,name)=>htmlText([...html.matchAll(/<meta\b[^>]*>/gi)].find(m=>new RegExp('(?:property|name)=["\']'+name+'["\']','i').test(m[0]))?.[0].match(/content=["']([^"']*)/i)?.[1]||'');
export function metricKey(network,url){return network==='instagram'?'instagram:'+url.match(/\/(?:p|reel|tv)\/([^/]+)/)?.[1]:network+':'+url;}
export function parseAudiencePage(network,html,observedAt=new Date().toISOString()){
 const result={network,observedAt,profile:null,videos:[]},found=new Map();
 const profile=(count,url)=>{if(count)result.profile={...count,observedAt,sourceUrl:url};};
 const video=(url,count,metric='views')=>{const value=numeric(count);if(value!==null)found.set(metricKey(network,url),{network,url,value,metric,observedAt});};
 if(network==='youtube'){
  if(/<feed\b/.test(html)){
   if(!html.includes('<yt:channelId>'+YT+'</yt:channelId>'))throw Error('O feed não confirmou o canal ComprecarTV.');
   for(const m of html.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)){const id=m[1].match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/)?.[1],views=m[1].match(/<media:statistics\b[^>]*views=["'](\d+)["']/)?.[1];if(id)video('https://www.youtube.com/watch?v='+id,views);}
  }else if(html.includes('var ytInitialPlayerResponse = ')){
   const d=extractAssignedJson(html,'var ytInitialPlayerResponse = ').videoDetails;if(d?.channelId!==YT)throw Error('O vídeo não pertence ao ComprecarTV.');if(/^[\w-]{11}$/.test(d.videoId))video('https://www.youtube.com/watch?v='+d.videoId,d.viewCount);
  }else{
   const data=extractAssignedJson(html,'var ytInitialData = ');let about;
   walk(data,o=>{if(o.aboutChannelViewModel?.channelId===YT)about=o.aboutChannelViewModel;});
   if(!about)throw Error('A página não confirmou as estatísticas do ComprecarTV.');
   profile(publicCount(about.subscriberCountText),AUDIENCE_URLS.youtube);result.channelViews=publicCount(about.viewCountText);
  }
 }else if(network==='instagram'){
  const roots=scripts(html),embedded=html.match(/"contextJSON"\s*:\s*("(?:\\.|[^"\\])*")/);
  if(embedded)try{const data=JSON.parse(JSON.parse(embedded[1]));roots.push(data);if(data.context?.username?.toLowerCase()==='comprecar'&&IG.includes(String(data.context.owner_id)))result.embeddedProfile=true;else result.embeddedMedia=true;}catch{}
  for(const data of roots)walk(data,o=>{
   const ownProfile=o.username?.toLowerCase()==='comprecar'&&IG.includes(String(o.pk||o.id||o.owner_id));
   const followers=numeric(o.follower_count??o.followers_count??o.edge_followed_by?.count);
   if(ownProfile&&o.is_private!==true&&followers!==null)profile(publicCount(followers),AUDIENCE_URLS.instagram);
   const owner=o.user||o.owner,code=o.code||o.shortcode;
   // Public Reels-grid entries identify the author by pk and can omit username.
   const confirmed=owner&&IG.includes(String(owner.pk||owner.id))&&(!owner.username||owner.username.toLowerCase()==='comprecar');
   if(confirmed&&/^[-\w]+$/.test(code||'')&&o.is_video!==false&&o.media_type!==1&&o.like_and_view_counts_disabled!==true){
    if(numeric(o.play_count)!==null)video('https://www.instagram.com/reel/'+code+'/',o.play_count,'plays');
    else video('https://www.instagram.com/reel/'+code+'/',o.video_view_count,'views');
   }
  });
 }else if(network==='tiktok'){
  let item;for(const root of scripts(html)){const i=root.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;if(i?.author?.uniqueId?.toLowerCase()==='comprecartv'&&String(i.author.id)===TT)item=i;}
  if(!item||!/^\d+$/.test(item.id))throw Error('A página não confirmou o vídeo do @comprecartv.');
  profile(publicCount(Number(item.authorStatsV2?.followerCount??item.authorStats?.followerCount)),'https://www.tiktok.com/@comprecartv');
  video('https://www.tiktok.com/@comprecartv/video/'+item.id,item.statsV2?.playCount??item.stats?.playCount);
 }else if(network==='facebook'){
  const canonical=meta(html,'og:url'),description=meta(html,'og:description');
  if(/^https:\/\/(?:www\.)?facebook\.com\/Comprecar\/?$/i.test(canonical)){const count=description.match(/(\d[\d.,\s]*(?:mil|K)?)\s+(?:seguidores|followers)/i)?.[1];profile(publicCount(count),AUDIENCE_URLS.facebook);}
  for(const root of scripts(html))walk(root,o=>{
   const v=o.channel_tab_thumbnail_renderer?.video||(o.savable_title&&o.publish_time?o:null);
   if(v&&String(v.owner?.id)==='100064536408329'&&/^\d+$/.test(v.id))video('https://www.facebook.com/reel/'+v.id+'/',v.play_count,'plays');
   const reel=o.short_form_video_context;if(o.__typename==='Story'&&(reel?.video?.owner?.id==='100064536408329'||o.actors?.some(actor=>actor.id==='100064536408329'))){
    let id=reel?.video?.id;walk(o.attachments,p=>{if(!id&&p.__typename==='Video')id=p.id});if(!/^\d+$/.test(id||''))return;walk(o,feedback=>{if(feedback.associated_video?.id===id)video('https://www.facebook.com/reel/'+id+'/',feedback.play_count??feedback.video_view_count,'plays')});
   }
  });
 }
 result.videos=[...found.values()];return result;
}
const dayFormatter=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'});
function day(at){return dayFormatter.format(new Date(at));}
function compact(samples,now){
 const cutoff=now-366*86400000,days=new Map(),recent=[];
 for(const s of samples){const t=Date.parse(s.at);if(t<cutoff)continue;if(t>now-86400000){recent.push(s);continue;}const key=day(s.at),items=days.get(key)||[];items.push(s);days.set(key,items);}
 return[...[...days.values()].flatMap(a=>a.length===1?a:[a[0],a.at(-1)]),...recent];
}
export function observeAudience(state,result){
 const at=result.observedAt,now=Date.parse(at);if(!Number.isFinite(now))throw Error('Horário de coleta inválido.');
 const audience=state.audience||={startedAt:at,profiles:{},videos:{},statuses:{}};
 const oldProfile=audience.profiles[result.network],keepPrimary=result.network==='instagram'&&oldProfile&&(result.embeddedMedia||(result.embeddedProfile&&audience.statuses.instagram?.method==='public-reels'&&audience.statuses.instagram?.state==='ok'&&now-Date.parse(oldProfile.observedAt)<AUDIENCE_INTERVAL));
 // A cached profile widget must not replace a recent successful Reels reading.
 if(result.profile&&!keepPrimary){const samples=[...(oldProfile?.samples||[]).filter(s=>s.at!==at),{at,value:result.profile.value}];audience.profiles[result.network]={...result.profile,samples:compact(samples,now)};}
 for(const video of result.videos){const key=metricKey(video.network,video.url),old=audience.videos[key];
  // A first reading establishes a baseline; it is never treated as views gained in that period.
  const samples=[...(old?.samples||[]).filter(s=>s.at!==at),{at,value:video.value,metric:video.metric}];audience.videos[key]={...video,samples:compact(samples,now)};
 }
 return audience;
}
export function audienceReport(state,{from,to}={},now=Date.now()){
 const a=state.audience||{profiles:{},videos:{},statuses:{}},start=Date.parse((from||day(new Date(now-6*86400000).toISOString()))+'T00:00:00-03:00'),end=Date.parse((to||day(new Date(now).toISOString()))+'T00:00:00-03:00')+86400000;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)throw Error('Período inválido.');
 const selected=state.posts.filter(p=>p.publishedAt&&Date.parse(p.publishedAt)>=start&&Date.parse(p.publishedAt)<end),networks=[],series=new Map();let followerTotal=0,followersAvailable=0,approximate=false;
 for(const network of NETWORKS){const profile=a.profiles[network],posts=selected.filter(p=>p.network===network),all=state.posts.filter(p=>p.network===network);let views=0,measured=0,delta=0,comparisons=0,lastObserved=null;
  if(profile){followersAvailable++;followerTotal+=profile.value;approximate||=profile.approximate;}
  for(const p of posts){const metric=a.videos[metricKey(network,p.url)];if(metric){views+=metric.value;measured++;lastObserved=lastObserved>metric.observedAt?lastObserved:metric.observedAt;}}
  // Growth counts all tracked posts, regardless of their publication date, and only comparable readings inside the period.
  for(const p of all){const metric=a.videos[metricKey(network,p.url)];if(!metric)continue;const samples=metric.samples.filter(s=>{const at=Date.parse(s.at);return at>=start&&at<end;});let used=false;
   for(let i=1;i<samples.length;i++){if(samples[i].at===samples[i-1].at||samples[i].metric!==samples[i-1].metric)continue;const change=samples[i].value-samples[i-1].value;delta+=change;const key=day(samples[i].at);series.set(key,(series.get(key)||0)+change);used=true;}
   if(used)comparisons++;
  }
  networks.push({network,followers:profile?{value:profile.value,approximate:profile.approximate,observedAt:profile.observedAt,sourceUrl:profile.sourceUrl,stale:now-Date.parse(profile.observedAt)>900000}:null,views:measured?views:null,measuredPosts:measured,selectedPosts:posts.length,trackedPosts:all.length,observedDelta:comparisons?delta:null,comparedPosts:comparisons,lastObserved,status:a.statuses[network]||null});
 }
 const available=networks.filter(n=>n.views!==null),compared=networks.filter(n=>n.observedDelta!==null);
 return{serverTime:new Date(now).toISOString(),from:from||day(new Date(start).toISOString()),to:to||day(new Date(end-1).toISOString()),startedAt:a.startedAt||null,nextCheckAt:a.nextCheckAt||null,lastCheckAt:a.lastCheckAt||null,complete:false,followers:{value:followersAvailable?followerTotal:null,networks:followersAvailable,approximate},views:{value:available.length?available.reduce((s,n)=>s+n.views,0):null,networks:available.length,measuredPosts:available.reduce((s,n)=>s+n.measuredPosts,0),selectedPosts:selected.length},observedDelta:compared.length?compared.reduce((s,n)=>s+n.observedDelta,0):null,comparedPosts:compared.reduce((s,n)=>s+n.comparedPosts,0),series:[...series].sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({date,value})),networks};
}
