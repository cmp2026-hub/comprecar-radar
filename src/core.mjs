import{parseFacebookPublic,parseTikTokFeed,parseTikTokPublic,parseTikTokCreatorLinks,parseYouTubePublic,inventoryPage,instagramPublicLinks,parseInstagramPostPublic,FACEBOOK_PAGE,FACEBOOK_REELS,FACEBOOK_VIDEOS,TIKTOK_FEED,TIKTOK_CREATOR}from'./collectors.mjs';
import{missingLinkGroups,compatibleHeadline,reconcileKnownLinks}from'./link-recovery.mjs';
import{parseAudiencePage,observeAudience,audienceReport,AUDIENCE_URLS,AUDIENCE_INTERVAL,INSTAGRAM_REELS_URL}from'./audience.mjs';
import{configureWhatsApp,scanWhatsApp,prepareWhatsApp,finishWhatsApp,whatsAppReport}from'./whatsapp.mjs';
export const NETWORKS={
 youtube:{name:'YouTube',handle:'@ComprecarTV',url:'https://www.youtube.com/@ComprecarTV',color:'#ec3237'},
 instagram:{name:'Instagram',handle:'@COMPRECAR',url:'https://www.instagram.com/COMPRECAR',color:'#cb4e9e'},
 tiktok:{name:'TikTok',handle:'@comprecartv',url:'https://www.tiktok.com/@comprecartv',color:'#222b32'},
 facebook:{name:'Facebook',handle:'Comprecar',url:'https://www.facebook.com/Comprecar/',color:'#1972e7'}
};
export const CHANNEL='UC9Pbtn0wi6CXxTHMPbolwPA';
export const INSTAGRAM_PUBLIC_URL='https://www.instagram.com/comprecar/embed/';
const HOUR=3600000;
export function decode(t=''){return t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#x([0-9a-f]+);/gi,(_,x)=>String.fromCodePoint(Math.min(1114111,parseInt(x,16)))).replace(/&#(\d+);/g,(_,x)=>String.fromCodePoint(Math.min(1114111,+x))).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
function tag(t,n){return decode(t.match(new RegExp('<'+n+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+n+'>','i'))?.[1]?.trim()||'');}
export function canonical(raw,network){
 let u;try{u=new URL(raw)}catch{throw Error('Insira um link completo da publicação.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error('Use um link HTTPS da publicação.');
 let host=u.hostname.toLowerCase().replace(/^www\./,'');let url;
 if(network==='youtube'&&['youtube.com','m.youtube.com','youtu.be'].includes(host)){
  const id=host==='youtu.be'?u.pathname.split('/')[1]:u.searchParams.get('v')||u.pathname.match(/^\/(?:shorts|live)\/([\w-]+)/)?.[1];
  if(!/^[\w-]{11}$/.test(id||''))throw Error('Use o link de um vídeo, não o do perfil.');url='https://www.youtube.com/watch?v='+id;
 }else if(network==='instagram'&&host==='instagram.com'&&/^\/(?:p|reel|tv)\/[\w-]+\/?$/.test(u.pathname))url='https://www.instagram.com'+u.pathname.replace(/\/$/,'')+'/';
 else if(network==='tiktok'&&host==='tiktok.com'&&/^\/@comprecartv\/video\/\d+\/?$/i.test(u.pathname))url='https://www.tiktok.com'+u.pathname.replace(/\/$/,'');
 else if(network==='facebook'&&['facebook.com','m.facebook.com','fb.watch'].includes(host)&&(/\/(?:posts|videos|reel)\//.test(u.pathname)||u.searchParams.has('story_fbid')||u.searchParams.has('v')||host==='fb.watch')){['fbclid','mibextid','ref','refsrc','utm_source','utm_medium','utm_campaign'].forEach(k=>u.searchParams.delete(k));u.hostname=host==='m.facebook.com'?'www.facebook.com':u.hostname;u.hash='';const videoId=u.pathname.match(/\/(?:videos|reel)\/(\d+)/)?.[1];url=videoId?'https://www.facebook.com/reel/'+videoId+'/':u.href;}
 else throw Error('O link não corresponde a uma publicação desta rede.');
 return url;
}
export function hash(t){let h=2166136261;for(const c of t){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return(h>>>0).toString(36);}
export function validatePost(p,now=Date.now()){
 if(!NETWORKS[p.network])throw Error('Rede inválida.');
 const title=String(p.title||'').trim().replace(/<[^>]*>/g,'').slice(0,500);if(title.length<3)throw Error('Informe um título com pelo menos 3 caracteres.');
 const undated=p.source==='archive'&&p.publishedAt==null;
 const time=Date.parse(p.publishedAt);if(!undated&&(!Number.isFinite(time)||time>now+60000))throw Error('Informe a data real da publicação, sem datas futuras.');
 const url=canonical(String(p.url||''),p.network);
 return{id:hash(url),network:p.network,url,title,publishedAt:undated?null:new Date(time).toISOString(),datePrecision:undated?'unknown':'exact',thumbnail:safeImage(p.thumbnail),kind:p.kind==='image'?'image':'video',source:p.source==='manual'?'manual':p.source==='public'?'public':p.source==='archive'?'archive':'feed',...(p.groupOverride?{groupOverride:String(p.groupOverride).slice(0,100)}:{})};
}
export function safeImage(raw){try{const u=new URL(raw);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^(?:[\w-]+\.)*(?:ytimg\.com|cdninstagram\.com|fbcdn\.net|tiktokcdn\.com|tiktokcdn-us\.com)$/.test(u.hostname)?u.href:'';}catch{return''}}
export function parseFeed(xml,network,now=Date.now()){
 if(!/<(?:feed|rss|rdf:RDF)\b/i.test(xml))throw Error('A fonte não retornou um feed RSS/Atom válido.');
 const items=[...xml.matchAll(/<(entry|item)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)];
 const out=[];for(const[,_,item]of items){
  const url=decode(item.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1]||item.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1]||tag(item,'link'));
  const title=tag(item,'title')||tag(item,'media:title');const publishedAt=tag(item,'published')||tag(item,'pubDate')||tag(item,'dc:date');
  const thumbnail=decode(item.match(/<media:thumbnail\b[^>]*url=["']([^"']+)["']/i)?.[1]||'');
  try{out.push(validatePost({network,url,title,publishedAt,thumbnail,source:'feed'},now))}catch{/* An entry without a valid publication date or direct post URL is not imported. */}
 }
 return out;
}
export function normalized(t){return t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/https?:\/\/\S+/g,'').replace(/#\S+/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
export function parseInstagramPublic(html,now=Date.now()){
 const match=html.match(/"contextJSON"\s*:\s*("(?:\\.|[^"\\])*")/);
 if(!match)throw Error('Instagram não disponibilizou as publicações públicas nesta consulta. Pode haver bloqueio, solicitação de login ou mudança de formato.');
 let context;try{context=JSON.parse(JSON.parse(match[1])).context}catch{throw Error('O formato da página pública do Instagram mudou.');}
 if(context?.username?.toLowerCase()!=='comprecar'||String(context.owner_id)!=='1558975667')throw Error('A fonte não confirmou o perfil @comprecar.');
 if(!Array.isArray(context.graphql_media))throw Error('Instagram não retornou a lista pública de publicações.');
 const posts=[];
 for(const entry of context.graphql_media){
  const p=entry.shortcode_media;if(!p||String(p.owner?.id)!=='1558975667'||p.owner?.username?.toLowerCase()!=='comprecar'||!/^[-\w]+$/.test(p.shortcode||''))continue;
  const caption=p.edge_media_to_caption?.edges?.[0]?.node?.text||'';
  const title=caption.split(/\r?\n/).map(l=>l.trim()).find(Boolean)||'Publicação de @comprecar';
  try{posts.push(validatePost({network:'instagram',url:'https://www.instagram.com/'+(p.is_video?'reel/':'p/')+p.shortcode+'/',title,publishedAt:new Date(p.taken_at_timestamp*1000).toISOString(),thumbnail:p.display_url,kind:p.is_video?'video':'image',source:'public'},now))}catch{/* Entries without an original date or a valid direct link are not imported. */}
 }
 if(!posts.length)throw Error('Instagram não retornou publicações válidas do @comprecar.');
 return posts;
}
export function groupPosts(posts){
 const groups=[],manual=new Map(),buckets=new Map();for(const p of [...posts].sort((a,b)=>(Date.parse(a.publishedAt)||0)-(Date.parse(b.publishedAt)||0))){
  const n=normalized(p.title),words=n.split(' ').length;
  const key=n+'|'+p.kind,list=buckets.get(key)||[];
  let group=p.groupOverride?manual.get(p.groupOverride):p.publishedAt&&words>=5?list.find(g=>!g.posts.some(q=>q.network===p.network)&&Math.abs(Date.parse(p.publishedAt)-Date.parse(g.posts[0].publishedAt))<=72*HOUR&&!g.manual):undefined;
  if(!group){group={id:p.groupOverride||'post-'+p.id,title:p.title,autoTitle:n,kind:p.kind,manual:!!p.groupOverride,posts:[],latestAt:''};groups.push(group);if(p.groupOverride)manual.set(p.groupOverride,group);else{list.push(group);buckets.set(key,list)}}
  group.posts.push(p);if(p.publishedAt&&p.publishedAt>group.latestAt)group.latestAt=p.publishedAt;
 }
 return groups.sort((a,b)=>b.latestAt.localeCompare(a.latestAt));
}
export function postKey(p){return p.network==='instagram'?'instagram:'+p.url.match(/\/(?:p|reel|tv)\/([^/]+)/)?.[1]:p.url;}
export function mergePosts(existing,incoming,seen=new Date().toISOString()){
 const map=new Map();for(const p of [...existing,...incoming]){
  const key=postKey(p),old=map.get(key);
  const preferOld=old&&((p.source==='archive'&&!p.publishedAt)||(old.source==='public'&&p.source==='feed'));
  const next=preferOld?{...p,...old}:{...old,...p};
  if(preferOld&&old.network==='tiktok'&&old.publishedAt&&old.metadataPending!==true)next.metadataPending=false;
  if(old?.id)next.id=old.id;if(old?.groupOverride)next.groupOverride=old.groupOverride;
  next.firstSeenAt=old?.firstSeenAt||p.firstSeenAt||seen;map.set(key,next);
 }return[...map.values()];
}
export function coverageFor(state){return Object.keys(NETWORKS).map(network=>{const posts=state.posts.filter(p=>p.network===network),dated=posts.filter(p=>p.publishedAt).map(p=>p.publishedAt).sort(),job=state.history?.[network];return{network,count:posts.length,dated:dated.length,undated:posts.length-dated.length,oldest:dated[0]||null,newest:dated.at(-1)||null,complete:false,job:job?{state:job.state,pages:job.pages||0,links:job.links||0,error:job.error||null,updatedAt:job.updatedAt,...(job.from?{from:job.from,to:job.to,added:job.added,scanned:job.scanned,message:job.message}:{})}:null,scope:network==='youtube'?'Uploads públicos; vídeos privados, removidos e posts de Comunidade não estão incluídos.':network==='instagram'?'Incorporação e links visíveis no perfil público. Levantamento desde 01/01/2026 parcial; não é o arquivo integral.':network==='tiktok'?'Seleção recente do feed público; legendas, autoria e datas conferidas nas páginas dos vídeos. Metadados indisponíveis permanecem pendentes.':'Página e seleção pública de Reels; não representam o histórico inteiro.'}})}
export function filterArchive(posts,{network,from,to}={}){
 if(network&&!NETWORKS[network])throw Error('Rede inválida.');
 function bound(day){const parsed=new Date(day+'T12:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Number.isFinite(parsed.valueOf())||parsed.toISOString().slice(0,10)!==day)throw Error('Data inválida.');return Date.parse(day+'T00:00:00-03:00');}
 const start=from?bound(from):-Infinity,end=to?bound(to)+24*HOUR:Infinity;if(start>=end)throw Error('Período inválido.');
 return posts.filter(p=>(!network||p.network===network)&&(!(from||to)||(p.publishedAt&&Date.parse(p.publishedAt)>=start&&Date.parse(p.publishedAt)<end)));
}
export function windowPosts(posts,hours=10,now=Date.now()){return posts.filter(p=>Date.parse(p.publishedAt)>=now-hours*HOUR&&Date.parse(p.publishedAt)<=now);}
export function feedUrl(raw){
 const u=new URL(raw);const h=u.hostname.toLowerCase();const allowed=['rss.app','rsshub.app','fetchrss.com','rsshub.rssforever.com','rsshub.feeded.xyz','rsshub.pseudoyu.com','rss-bridge.org'];
 if(u.protocol!=='https:'||u.username||u.password||u.port||!allowed.some(a=>h===a||h.endsWith('.'+a)))throw Error('Use uma fonte HTTPS de rss.app, fetchrss.com ou uma das instâncias RSSHub/RSS-Bridge indicadas. URLs com credenciais não são aceitas.');
 return u.href;
}
export function createApp(store,fetcher=fetch){
 let refreshing=null;
 async function read(){return(await store.get('state'))||{posts:[],sources:{},statuses:{},lastCheck:null};}
 async function save(state){if(state.whatsapp)scanWhatsApp(state,groupPosts(state.posts));await store.put('state',state);}
 async function getFeed(url,publicPage=false){const r=await fetcher(url,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{'accept':publicPage?'text/html':'application/atom+xml,application/rss+xml,application/xml,text/xml','user-agent':'ComprecarRadar/1.2'}});if(!r.ok)throw Error(publicPage?(typeof publicPage==='string'?NETWORKS[publicPage].name:'Instagram')+' respondeu HTTP '+r.status+'; a consulta será tentada novamente após uma pausa.':'Fonte respondeu HTTP '+r.status);const t=await r.text();if(t.length>8000000)throw Error('Resposta da fonte muito grande.');return t;}
 function captureAudience(state,network,text,at=new Date().toISOString()){try{const result=parseAudiencePage(network,text,at);if(result.profile||result.videos.length)observeAudience(state,result);return result;}catch{return null;}}
 async function collectAudience(){
  const state=await read(),now=Date.now();state.audience||={startedAt:new Date(now).toISOString(),profiles:{},videos:{},statuses:{}};const a=state.audience;
  const instagramUpgrade=a.statuses.instagram?.method!=='public-embeds';
  if(Date.parse(a.nextCheckAt||0)>now&&!instagramUpgrade)return;
  await Promise.all(Object.keys(NETWORKS).map(async network=>{
   if(Date.parse(a.statuses[network]?.nextCheckAt||0)>now)return;
   const errors=[];let pages=0,blocked=false;
   async function page(url){if(blocked)return;try{const html=await getFeed(url,network);const parsed=captureAudience(state,network,html);if(!parsed||(!parsed.profile&&!parsed.videos.length))throw Error('A fonte pública não disponibilizou contagens nesta consulta.');pages++;return parsed;}catch(e){errors.push(String(e.message).slice(0,220));if(/HTTP 40[139]|HTTP 429|redirect/i.test(e.message))blocked=true;}}
   if(network==='tiktok'){
    const posts=state.posts.filter(p=>p.network==='tiktok'&&p.publishedAt).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
    const urls=[...new Set([...posts.slice(0,10),...posts.slice(10).filter(p=>!a.videos['tiktok:'+p.url]).slice(0,2)].map(p=>p.url))];
    if(!urls.length)errors.push('Ainda não há links do TikTok para consultar.');
    for(let i=0;i<urls.length&&!blocked;i+=2)await Promise.allSettled(urls.slice(i,i+2).map(page));
   }else if(network==='instagram'){
    // Public embeds expose counts without a signed-in profile or private API.
    // Reuse the profile reading captured while collecting public post links.
    if(Date.parse(a.profiles.instagram?.observedAt||0)>=now-120000)pages++;
    else await page(INSTAGRAM_PUBLIC_URL);
    const posts=state.posts.filter(p=>p.network==='instagram'&&p.kind==='video'&&p.publishedAt).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
    const selected=[...posts.slice(0,8),...posts.slice(8).filter(p=>!a.videos['instagram:'+p.url.match(/\/(?:p|reel|tv)\/([^/]+)/)?.[1]]).slice(0,2)];
    const urls=[...new Set(selected.map(p=>p.url.replace(/\/$/,'')+'/embed/'))];
    for(let i=0;i<urls.length&&!blocked;i+=2)await Promise.allSettled(urls.slice(i,i+2).map(page));
    if(!urls.length&&!blocked)await page(INSTAGRAM_REELS_URL);
   }else{
    await page(AUDIENCE_URLS[network]);
    if(network==='facebook'&&!blocked)await page(FACEBOOK_VIDEOS);
    if(network==='youtube'&&!blocked){await page('https://www.youtube.com/feeds/videos.xml?channel_id='+CHANNEL);}
   }
   a.statuses[network]={state:pages?(errors.length?'partial':'ok'):'error',...(network==='instagram'?{method:'public-embeds'}:{}),message:errors[0]||'Contagens públicas consultadas',lastAttempt:new Date().toISOString(),...(pages?{lastSuccess:new Date().toISOString()}:{}),nextCheckAt:new Date(Date.now()+(blocked?900000:AUDIENCE_INTERVAL)).toISOString()};
  }));
  a.lastCheckAt=new Date().toISOString();a.nextCheckAt=new Date(Date.now()+AUDIENCE_INTERVAL).toISOString();await save(state);
 }
 async function syncTikTok(state){
  const now=new Date().toISOString(),source=state.sources.tiktok||TIKTOK_FEED,previous=state.statuses.tiktok||{},custom=source!==TIKTOK_FEED;
  let posts,feedError=null,discoveryMethod=custom?'rss-custom':'rss-fallback',directError=previous.directError||null,directNextCheckAt=previous.directNextCheckAt||null,directLastSuccess=previous.directLastSuccess||null,directSnapshot=previous.directSnapshot||null;
  const existing=new Map(state.posts.filter(p=>p.network==='tiktok').map(p=>[p.url,p]));
  const snapshotPosts=!custom&&Array.isArray(directSnapshot?.urls)&&directSnapshot.urls.length<=10&&Date.parse(directSnapshot.checkedAt)<=Date.now()&&Date.parse(directSnapshot.checkedAt)>Date.now()-86400000?directSnapshot.urls.map(u=>existing.get(u)).filter(Boolean):[];
  // The public bridge caches its underlying creator page for 24h. Prefer TikTok's
  // own public creator embed; a successful RSS response does not imply freshness.
  if(!custom&&Date.parse(directNextCheckAt||0)<=Date.now()){
   try{posts=parseTikTokCreatorLinks(await getFeed(TIKTOK_CREATOR,'tiktok'));discoveryMethod='public-creator';directError=null;directLastSuccess=now;directSnapshot={checkedAt:now,urls:posts.map(p=>p.url)};directNextCheckAt=new Date(Date.now()+120000).toISOString();}
   catch(e){directError=String(e.message).slice(0,240);directNextCheckAt=new Date(Date.now()+(/HTTP 40[139]|HTTP 429|redirect/i.test(directError)?900000:300000)).toISOString();}
  }
  if(!posts){try{posts=custom?parseFeed(await getFeed(source),'tiktok'):parseTikTokFeed(await getFeed(source));}
   catch(e){feedError=String(e.message).slice(0,240);if(!snapshotPosts.length){state.statuses.tiktok={...previous,directError,directNextCheckAt,directLastSuccess,directSnapshot};throw e;}posts=[];}}
  if(!posts.length&&!snapshotPosts.length)throw Error('TikTok não disponibilizou publicações válidas.');
  const candidates=posts.filter(p=>!existing.get(p.url)?.publishedAt||existing.get(p.url)?.metadataPending).slice(0,10),enriched=[],errors=[];
  for(let i=0;i<candidates.length;i+=2){
   const batch=await Promise.allSettled(candidates.slice(i,i+2).map(async p=>{const html=await getFeed(p.url,'tiktok');captureAudience(state,'tiktok',html);return parseTikTokPublic(html,p.url.match(/\/video\/(\d+)/)[1]);}));
   for(const result of batch)if(result.status==='fulfilled')enriched.push(result.value);else errors.push(String(result.reason.message).slice(0,240));
   if(errors.some(e=>/HTTP 40[139]|HTTP 429|redirect/i.test(e)))break;
  }
  state.posts=mergePosts(state.posts,[...posts,...enriched],now);
  const receivedUrls=new Set(posts.map(p=>p.url)),received=state.posts.filter(p=>p.network==='tiktok'&&receivedUrls.has(p.url));
  const newest=list=>list.reduce((at,p)=>p.publishedAt&&p.publishedAt>at?p.publishedAt:at,'');
  const receivedNewest=newest(received),snapshotNewest=newest(snapshotPosts);
  if(discoveryMethod==='rss-fallback'&&snapshotPosts.length&&(!received.length||snapshotNewest>receivedNewest)){posts=snapshotPosts;discoveryMethod='public-creator-cache';}
  const cached=discoveryMethod==='public-creator-cache',urls=new Set(posts.map(p=>p.url)),current=state.posts.filter(p=>p.network==='tiktok'&&urls.has(p.url)),confirmed=current.filter(p=>p.publishedAt&&!p.metadataPending).length,pending=current.length-confirmed;
  const latestSourcePostAt=current.map(p=>p.publishedAt||'').sort().at(-1)||null,missing=latestSourcePostAt?state.posts.filter(p=>p.network==='tiktok'&&Date.parse(p.publishedAt)>Date.parse(latestSourcePostAt)&&!urls.has(p.url)).length:0;
  const fallback=discoveryMethod==='rss-fallback',partial=fallback||cached||pending>0,staleSnapshot=cached&&Date.parse(directSnapshot.checkedAt)<Date.now()-900000;
  const message=missing?'Fonte em atraso: '+missing+' publicações conferidas são mais recentes que a seleção recebida. Os links foram preservados.':cached?(staleSnapshot?'TikTok sem consulta direta bem-sucedida há mais de 15 minutos. ':'Consulta direta temporariamente indisponível. ')+'Mantida a última seleção pública confirmada; a reserva não trouxe conteúdo mais recente.':fallback?'Feed de reserva em uso; a consulta direta está indisponível e o provedor pode guardar a seleção por 24 horas.':confirmed+' de '+current.length+' vídeos com título e data; '+pending+' pendentes';
  const feedNewest=discoveryMethod==='public-creator'?null:receivedNewest||null,missingFromFeed=feedNewest?state.posts.filter(p=>p.network==='tiktok'&&Date.parse(p.publishedAt)>Date.parse(feedNewest)&&!receivedUrls.has(p.url)).length:null;
  const nextCheck=errors.length?Date.now()+300000:Math.min(Date.now()+120000,custom?Infinity:Math.max(Date.now()+1000,Date.parse(directNextCheckAt)||Infinity));
  state.statuses.tiktok={state:missing||staleSnapshot?'delayed':partial?'partial':'ok',method:confirmed?'public-video':'public-bridge',discoveryMethod,message,count:current.length,confirmed,pending,missingFromFeed,missingFromSource:missing,latestSourcePostAt,...(feedNewest?{latestFeedPostAt:feedNewest}:{}),sourceAsOf:cached?directSnapshot.checkedAt:now,lastSuccess:cached?directSnapshot.checkedAt:now,lastCheckedAt:now,lastMetadataCheck:now,directError:custom?null:directError,directNextCheckAt:custom?null:directNextCheckAt,directLastSuccess,...(!custom&&directSnapshot?{directSnapshot}:{}),...(fallback||cached?{providerCacheSeconds:86400}:{}),...(feedError?{feedError}:{}),...(errors[0]?{metadataError:errors[0]}:{}),nextCheckAt:new Date(nextCheck).toISOString()};
 }
 async function refresh(force=false){
  if(refreshing)return refreshing;
  refreshing=(async()=>{const state=await read();if(!force&&Date.now()-Date.parse(state.lastCheck||0)<300000)return state;
   const now=new Date().toISOString();
   await Promise.all(Object.keys(NETWORKS).map(async network=>{
    if(network==='facebook'||network==='tiktok'){
     if(Date.parse(state.statuses[network]?.nextCheckAt||0)>Date.now())return;
     if(network==='tiktok'){try{await syncTikTok(state)}catch(e){state.statuses.tiktok={...state.statuses.tiktok,state:'error',message:e.message,lastAttempt:now,nextCheckAt:new Date(Date.now()+300000).toISOString()};}return;}
     try{let posts,method;if(network==='facebook'){
       const pages=await Promise.allSettled([getFeed(FACEBOOK_PAGE,'facebook'),getFeed(FACEBOOK_REELS,'facebook'),getFeed(FACEBOOK_VIDEOS,'facebook')]);posts=[];for(const page of pages)if(page.status==='fulfilled'){captureAudience(state,'facebook',page.value);try{posts.push(...parseFacebookPublic(page.value))}catch{}}
       method='public-page';if(!posts.length&&state.sources.facebook){posts=parseFeed(await getFeed(state.sources.facebook),'facebook');method='rss-fallback';}
       if(!posts.length)throw Error('Facebook não disponibilizou posts públicos com autor e data confirmados.');
      }
      posts=mergePosts([],posts,now);state.posts=mergePosts(state.posts,posts,now);state.statuses[network]={state:'ok',method,message:network==='facebook'?(method==='rss-fallback'?'Feed de reserva · página pública indisponível':'Página e Reels públicos · cobertura parcial'):'Feed público · seleção recente · datas podem estar ausentes',lastSuccess:now,count:posts.length,nextCheckAt:new Date(Date.now()+(network==='facebook'?120000:600000)).toISOString()};
     }catch(e){state.statuses[network]={...state.statuses[network],state:'error',message:e.message,lastAttempt:now,nextCheckAt:new Date(Date.now()+300000).toISOString()};}return;
    }
    const publicInstagram=network==='instagram';
    const url=network==='youtube'?'https://www.youtube.com/feeds/videos.xml?channel_id='+CHANNEL:publicInstagram?INSTAGRAM_PUBLIC_URL:state.sources[network];
    if(!url){state.statuses[network]={state:'pending',message:'Sem fonte automática',lastSuccess:null};return;}
    if(publicInstagram&&['public-profile','rss-fallback'].includes(state.statuses.instagram?.method)&&Date.parse(state.statuses.instagram.nextCheckAt||0)>Date.now())return;
    try{let posts,publicError;
     try{const text=await getFeed(url,publicInstagram);captureAudience(state,network,text);posts=publicInstagram?parseInstagramPublic(text):parseFeed(text,network)}catch(e){if(!publicInstagram||!state.sources.instagram)throw e;publicError=String(e.message).slice(0,240);posts=parseFeed(await getFeed(state.sources.instagram),network);}
     if(!posts.length)throw Error('Nenhuma publicação válida foi recebida; confira a fonte.');
     state.posts=mergePosts(state.posts,posts,now);
     state.statuses[network]={state:'ok',message:network==='youtube'?'Feed público · últimas publicações':publicError?'Feed de reserva · coleta pública direta temporariamente indisponível':publicInstagram?'Perfil público · sem login · consulta a cada 2 min':'Feed público configurado',lastSuccess:now,count:posts.length,method:publicError?'rss-fallback':publicInstagram?'public-profile':'rss',...(publicInstagram?{nextCheckAt:new Date(Date.now()+(publicError?300000:120000)).toISOString(),coverage:'Somente as publicações disponibilizadas pela fonte; a cobertura pode ser parcial.',...(publicError?{publicError}:{})}:{})};
    }catch(e){state.statuses[network]={...state.statuses[network],state:'error',message:String(e.message).slice(0,240),lastAttempt:now,...(publicInstagram?{method:'public-profile',nextCheckAt:new Date(Date.now()+300000).toISOString()}:{})};}
   }));
   state.posts=mergePosts(state.posts,[]);const reconciled=reconcileKnownLinks(state.posts);state.posts=reconciled.posts;if(reconciled.matched.length){state.linkRecovery||={};state.linkRecovery.lastMatchedAt=new Date().toISOString();state.linkRecovery.lastMatched=reconciled.matched;}state.lastCheck=now;await save(state);return state;
  })();try{return await refreshing}finally{refreshing=null}
 }
 let mutation=Promise.resolve();
 function serialize(fn){const next=mutation.then(fn);mutation=next.catch(()=>{});return next;}
 function response(body,status=200){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}})}
 async function historyTick(){return serialize(async()=>{const state=await read(),job=state.history?.youtube;if(job?.state!=='running'||Date.parse(job.nextPageAt||0)>Date.now())return;
   try{const page=await inventoryPage(fetcher,job);if(page.continuation&&page.continuation===job.continuation)throw Error('YouTube repetiu o cursor; paginação interrompida para evitar um ciclo.');state.posts=mergePosts(state.posts,page.posts);state.history.youtube={state:page.continuation?'running':'public-list-finished',pages:(job.pages||0)+1,links:(job.links||0)+page.posts.length,continuation:page.continuation,clientVersion:page.clientVersion,updatedAt:new Date().toISOString(),nextPageAt:new Date(Date.now()+15000).toISOString()};}
   catch(e){state.history.youtube={...job,state:'error',error:e.message,updatedAt:new Date().toISOString()};}
   await save(state);
  })}
 return{
  refresh:()=>serialize(()=>refresh(false)),
  historyTick,
  audienceTick:()=>serialize(collectAudience),
  async api(request){const u=new URL(request.url);try{
   if(u.pathname==='/api/groups/missing-links'&&request.method==='GET')return await serialize(async()=>{const s=await read();return response({checkedAt:new Date().toISOString(),windowHours:72,groups:missingLinkGroups(s.posts).slice(0,30).map(({id,title,kind,anchorUrl,latestAt,missing,canAutoMatch,posts})=>({id,title,kind,anchorUrl,latestAt,missing,canAutoMatch,posts:posts.map(({network,url,title,publishedAt})=>({network,url,title,publishedAt}))})),networks:s.linkRecovery?.networks||{}});});
   if(u.pathname==='/api/state'&&request.method==='GET'){const state=await serialize(()=>refresh(false));const{history,audience,whatsapp,...rest}=state;return response({...rest,annualSearch:history?.annual||null,coverage:coverageFor(state),groups:groupPosts(state.posts),networks:NETWORKS,serverTime:new Date().toISOString()});}
   if(u.pathname==='/api/whatsapp'&&request.method==='GET')return await serialize(async()=>{const s=await read(),groups=groupPosts(s.posts);await save(s);return response(whatsAppReport(s,groups));});
   if(['/api/audience','/api/audience/export'].includes(u.pathname)&&request.method==='GET'){const filters=Object.fromEntries(u.searchParams);filterArchive([],filters);const report=audienceReport(await read(),filters);if(u.pathname.endsWith('/export'))return new Response(JSON.stringify(report,null,2),{headers:{'content-type':'application/json; charset=utf-8','content-disposition':'attachment; filename="comprecar-audiencia.json"','cache-control':'no-store'}});return response(report);}
   if(u.pathname==='/api/export'&&request.method==='GET'){const state=await read(),filters=Object.fromEntries(u.searchParams),posts=filterArchive(state.posts,filters);return new Response(JSON.stringify({exportedAt:new Date().toISOString(),requestedRange:{...filters,timezone:'America/Sao_Paulo'},complete:false,annualSearch:state.history?.annual||null,coverage:coverageFor(state).filter(c=>!filters.network||c.network===filters.network),posts},null,2),{headers:{'content-type':'application/json; charset=utf-8','content-disposition':'attachment; filename="comprecar-historico.json"','cache-control':'no-store'}});}
   if(request.method!=='POST')return response({error:'Rota não encontrada.'},404);
   if(request.headers.get('origin')!==u.origin)return response({error:'Origem não autorizada.'},403);
   if(!request.headers.get('content-type')?.startsWith('application/json'))return response({error:'Formato inválido.'},415);
   if(+(request.headers.get('content-length')||0)>20000)return response({error:'Envio muito grande.'},413);
   const text=await request.text();if(text.length>20000)return response({error:'Envio muito grande.'},413);const data=JSON.parse(text);
   return await serialize(async()=>{
    if(u.pathname==='/api/refresh'){await refresh(false);return response({ok:true});}
    if(u.pathname==='/api/audience/refresh'){await collectAudience();return response({ok:true});}
    const s=await read();
    if(u.pathname.startsWith('/api/whatsapp/')){
     const groups=groupPosts(s.posts);
     if(u.pathname==='/api/whatsapp/configure')configureWhatsApp(s,groups,String(data.phone||''));
     else if(!s.whatsapp)throw Error('Configure o destinatário primeiro.');
     else if(u.pathname==='/api/whatsapp/enabled'){if(typeof data.enabled!=='boolean')throw Error('Estado inválido.');s.whatsapp.enabled=data.enabled;}
     else if(u.pathname==='/api/whatsapp/connection'){if(!['pending','connected'].includes(data.connection))throw Error('Conexão inválida.');s.whatsapp.connection=data.connection;}
     else if(u.pathname==='/api/whatsapp/scheduler'){if(!['paused','active'].includes(data.scheduler))throw Error('Agendamento inválido.');s.whatsapp.scheduler=data.scheduler;s.whatsapp.automationId=String(data.automationId||'').slice(0,100);}
     else if(u.pathname==='/api/whatsapp/prepare'){scanWhatsApp(s,groups);const item=prepareWhatsApp(s,data.id);await save(s);return response(item);}
     else if(u.pathname==='/api/whatsapp/reconcile'){const item=s.whatsapp.queue.find(q=>q.id===data.id&&['sending','uncertain'].includes(q.status));if(!item)throw Error('Não há envio a conferir.');return response({...item,phone:s.whatsapp.phone});}
     else if(u.pathname==='/api/whatsapp/finish')finishWhatsApp(s,data);
     else return response({error:'Rota não encontrada.'},404);
     await save(s);return response(whatsAppReport(s,groups));
    }
    if(u.pathname==='/api/groups/reconcile'){
     const result=reconcileKnownLinks(s.posts);if(result.matched.length){s.posts=result.posts;s.linkRecovery||={};s.linkRecovery.lastMatchedAt=new Date().toISOString();s.linkRecovery.lastMatched=result.matched;await save(s);}return response({ok:true,matched:result.matched.length,urls:result.matched});
    }else if(u.pathname==='/api/groups/check-links'){
     if(!NETWORKS[data.network]||!Array.isArray(data.urls)||!data.urls.length||data.urls.length>3)throw Error('Informe uma rede e de 1 a 3 links públicos.');
     const urls=[...new Set(data.urls.map(url=>canonical(String(url),data.network)))],before=new Set(s.posts.map(p=>p.url));
     const current=groupPosts(s.posts).find(g=>g.posts.some(p=>p.url===data.anchorUrl));if(!current)throw Error('O grupo de referência não foi encontrado.');
     if(current.posts.some(p=>p.network===data.network))return response({ok:true,added:0,matched:0,alreadyPresent:true,message:'Esta rede já tem link no grupo.'});
     const group=missingLinkGroups(s.posts).find(g=>g.id===current.id);if(!group)throw Error('O grupo está fora da janela de conferência de 72 horas.');
     if(!group.canAutoMatch)throw Error('Este grupo requer conferência manual antes de incluir links.');
     if(!group.missing.includes(data.network))throw Error('Esta rede não é esperada para o tipo de publicação.');
     s.linkRecovery||={};s.linkRecovery.networks||={};const cooldown=s.linkRecovery.networks[data.network];
     if(Date.parse(cooldown?.nextCheckAt||0)>Date.now())return response({ok:true,added:0,matched:0,paused:true,nextCheckAt:cooldown.nextCheckAt});
     const incoming=[],errors=[],rejected=[];let verified=0;
     for(const url of urls){
      try{
       const old=s.posts.find(p=>p.url===url);if(old?.groupOverride&&old.groupOverride!==group.id){rejected.push({url,reason:'Link já pertence a outro grupo manual.'});continue;}
       const other=groupPosts(s.posts).find(g=>g.posts.some(p=>p.url===url));if(other&&other.id!==group.id&&other.posts.length>1){rejected.push({url,reason:'Link já pertence a outro conteúdo agrupado.'});continue;}
       const html=await getFeed(url,data.network);let post;
       if(data.network==='tiktok')post=parseTikTokPublic(html,url.match(/\/video\/(\d+)/)[1]);
       else if(data.network==='instagram')post=parseInstagramPostPublic(html,url.match(/\/(?:p|reel|tv)\/([^/]+)/)[1]);
       else if(data.network==='youtube')post=parseYouTubePublic(html,new URL(url).searchParams.get('v'));
       else post=parseFacebookPublic(html).find(p=>p.url===url);
       if(!post||post.url!==url)throw Error('A página não confirmou este link e o autor Comprecar.');verified++;
       const headline=compatibleHeadline(post,group);if(!headline){rejected.push({url,reason:'Título, mídia ou data não correspondem ao grupo.'});continue;}
       const otherMatches=missingLinkGroups(s.posts).filter(g=>g.id!==group.id&&g.missing.includes(data.network)&&compatibleHeadline(post,g));if(otherMatches.length){rejected.push({url,reason:'Há mais de um grupo compatível; conferência manual necessária.'});continue;}
       captureAudience(s,data.network,html);incoming.push({...post,title:headline,originalTitle:post.title,linkRecoveredAt:new Date().toISOString(),...(group.manual?{groupOverride:group.id}:{})});break;
      }catch(e){const error=String(e.message).slice(0,240);errors.push(error);if(/HTTP 40[139]|HTTP 429|HTTP 503|redirect/i.test(error))break;}
     }
     const blocked=errors.some(e=>/HTTP 40[139]|HTTP 429|redirect/i.test(e)),failed=!!errors.length;
     s.linkRecovery.networks[data.network]={state:failed?'paused':'ok',lastCheckAt:new Date().toISOString(),nextCheckAt:failed?new Date(Date.now()+(blocked?900000:300000)).toISOString():null,...(failed?{error:errors[0]}:{})};
     s.posts=mergePosts(s.posts,incoming);if(incoming.length){s.linkRecovery.lastMatchedAt=new Date().toISOString();s.linkRecovery.lastMatched=incoming.map(p=>p.url);}await save(s);
     return response({ok:true,verified,matched:incoming.length,added:incoming.filter(p=>!before.has(p.url)).length,errors,rejected,nextCheckAt:s.linkRecovery.networks[data.network].nextCheckAt});
    }else if(u.pathname==='/api/tiktok/check-links'){
     if(!Array.isArray(data.urls)||!data.urls.length||data.urls.length>10)throw Error('Informe de 1 a 10 links do TikTok.');
     const urls=[...new Set(data.urls.map(url=>canonical(String(url),'tiktok')))],incoming=[],errors=[];const before=new Set(s.posts.map(p=>p.url));
     for(let i=0;i<urls.length;i+=2){const batch=await Promise.allSettled(urls.slice(i,i+2).map(async url=>{const html=await getFeed(url,'tiktok'),post=parseTikTokPublic(html,url.match(/\/video\/(\d+)/)[1]);captureAudience(s,'tiktok',html);return post;}));for(const r of batch)if(r.status==='fulfilled')incoming.push(r.value);else errors.push(String(r.reason.message).slice(0,220));if(errors.some(e=>/HTTP 40[139]|HTTP 429|redirect/i.test(e)))break;}
     if(!incoming.length)throw Error(errors[0]||'TikTok não confirmou esses links públicos.');
     s.posts=mergePosts(s.posts,incoming);s.history||={};s.history.tiktok={state:'public-scan-partial',links:s.posts.filter(p=>p.network==='tiktok').length,updatedAt:new Date().toISOString(),message:'Links públicos conferidos nas páginas dos vídeos; a fonte de novidades pode estar atrasada.'};
     const status=s.statuses.tiktok||{},latestSource=status.latestSourcePostAt||status.latestFeedPostAt||null,missing=latestSource?s.posts.filter(p=>p.network==='tiktok'&&Date.parse(p.publishedAt)>Date.parse(latestSource)).length:incoming.filter(p=>!before.has(p.url)).length;
     s.statuses.tiktok={...status,state:missing?'delayed':status.discoveryMethod==='rss-fallback'?'partial':status.state||'partial',method:'public-video',missingFromSource:missing,missingFromFeed:status.discoveryMethod?.startsWith('public-creator')?status.missingFromFeed:missing,message:missing?'Fonte em atraso: links novos recuperados e incluídos no agrupamento.':'Links públicos conferidos; a importação manual não confirma a atualização da fonte automática.',lastPublicCheck:new Date().toISOString()};
     await save(s);return response({ok:true,verified:incoming.length,added:incoming.filter(p=>!before.has(p.url)).length,errors});
    }else if(u.pathname==='/api/tiktok/public-scan'){
     if(Date.parse(s.statuses.tiktok?.lastMetadataCheck||0)>Date.now()-120000)return response({ok:true,message:'A última consulta ocorreu há menos de 2 minutos.'});
     if(Date.parse(s.statuses.tiktok?.nextCheckAt||0)>Date.now())return response({ok:true,message:'A fonte está em pausa até a próxima tentativa exibida no painel.'});
     try{await syncTikTok(s)}catch(e){s.statuses.tiktok={...s.statuses.tiktok,state:'error',message:String(e.message).slice(0,240),lastAttempt:new Date().toISOString(),nextCheckAt:new Date(Date.now()+300000).toISOString()};await save(s);return response({error:s.statuses.tiktok.message},502);}
    }else if(u.pathname==='/api/instagram/public-scan'){
     const from='2026-01-01',to=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
     const links=instagramPublicLinks(await getFeed('https://www.instagram.com/comprecar/','instagram')).slice(0,12);
     const existing=new Set(s.posts.filter(p=>p.network==='instagram').map(p=>postKey(p))),before=existing.size,errors=[];let scanned=0;
     for(const link of links){if(existing.has('instagram:'+link.code))continue;
      try{const post=parseInstagramPostPublic(await getFeed(link.url,'instagram'),link.code);scanned++;if(filterArchive([post],{from,to}).length)s.posts=mergePosts(s.posts,[post]);}
      catch(e){errors.push(String(e.message).slice(0,200));if(/HTTP 40[139]|HTTP 429|redirect|fetch failed/i.test(e.message))break;}
     }
     const count=filterArchive(s.posts,{network:'instagram',from,to}).length;s.history||={};s.history.instagram={state:'public-scan-partial',from,to,pages:1,scanned,links:count,added:s.posts.filter(p=>p.network==='instagram').length-before,complete:false,error:errors[0]||null,message:'Somente links visíveis publicamente foram conferidos. A paginação antiga solicitou login e não foi utilizada.',updatedAt:new Date().toISOString()};
    }else if(u.pathname==='/api/history/start'){s.history||={};const old=s.history.youtube;s.history.youtube=['error','paused'].includes(old?.state)?{...old,state:'running',error:null,nextPageAt:null}:old?.state==='running'?old:{state:'running',pages:0,links:0,continuation:null,updatedAt:new Date().toISOString()};
    }else if(u.pathname==='/api/history/pause'){if(s.history?.youtube)s.history.youtube.state='paused';
    }else if(u.pathname==='/api/posts'){
     const p=validatePost({...data,source:'manual'});const old=s.posts.find(x=>postKey(x)===postKey(p));if(old)return response({error:'Este link já está no painel.'},409);
     if(p.groupOverride){const target=groupPosts(s.posts).find(g=>g.id===p.groupOverride);if(!target)throw Error('O grupo escolhido mudou. Reabra o formulário.');const id='manual-'+crypto.randomUUID(),ids=new Set(target.posts.map(p=>p.id));s.posts=s.posts.map(p=>ids.has(p.id)?{...p,groupOverride:id}:p);p.groupOverride=id;}
     s.posts.push({...p,firstSeenAt:new Date().toISOString()});
    }else if(u.pathname==='/api/group'){
     if(!Array.isArray(data.ids)||data.ids.length<1||data.ids.length>100)throw Error('Selecione as publicações para agrupar.');
     const groupId=data.separate?'separate-'+data.ids[0]:'manual-'+crypto.randomUUID();
     s.posts=s.posts.map(p=>data.ids.includes(p.id)?{...p,groupOverride:groupId}:p);
    }else if(u.pathname==='/api/sources'){
     if(!NETWORKS[data.network]||data.network==='youtube')throw Error('Selecione uma rede configurável.');
     if(data.url)s.sources[data.network]=feedUrl(data.url);else delete s.sources[data.network];s.lastCheck=null;if(s.statuses[data.network])s.statuses[data.network].nextCheckAt=null;
    }else return response({error:'Rota não encontrada.'},404);
    await save(s);return response({ok:true});
   });
  }catch(e){return response({error:e instanceof SyntaxError?'Dados inválidos.':e.message},400)}
  }
 };
}
