import{groupPosts,normalized,NETWORKS}from'./core.mjs';
const WINDOW=72*3600000;
const fold=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
export const expectedNetworks=kind=>kind==='image'?['instagram','facebook']:Object.keys(NETWORKS);
export function missingLinkGroups(posts,now=Date.now()){
 return groupPosts(posts).filter(g=>Date.parse(g.latestAt)>=now-WINDOW&&Date.parse(g.latestAt)<=now+60000&&expectedNetworks(g.kind).some(n=>!g.posts.some(p=>p.network===n))).map(g=>({...g,anchorUrl:g.posts[0].url,missing:expectedNetworks(g.kind).filter(n=>!g.posts.some(p=>p.network===n)),canAutoMatch:(!g.manual||g.posts.length>1)&&g.posts.some(p=>p.publishedAt&&normalized(p.title).split(' ').length>=5&&!p.metadataPending)}));
}
export function compatibleHeadline(post,group){
 if(post.kind!==group.kind||!post.publishedAt||post.metadataPending)return null;
 for(const anchor of group.posts){
  if(!anchor.publishedAt||anchor.metadataPending||Math.abs(Date.parse(anchor.publishedAt)-Date.parse(post.publishedAt))>WINDOW)continue;
  const title=anchor.title.trim();if(normalized(title).split(' ').length<5)continue;
  if(normalized(post.title)===normalized(title))return title;
  for(const text of[post.caption,post.title].filter(Boolean)){
   const firstLine=text.split(/\r?\n/).map(s=>s.trim()).find(Boolean)||'';
   if(normalized(firstLine)===normalized(title))return title;
   // A complete question at the start of a longer caption is a headline.
   // Do not equate two short titles merely because one is a word prefix.
   if(/[?!]$/.test(title)&&text.length>title.length+35&&fold(text).startsWith(fold(title)+' '))return title;
  }
 }
 return null;
}
export function reconcileKnownLinks(posts,now=Date.now()){
 const groups=groupPosts(posts),pending=missingLinkGroups(posts,now).filter(g=>!g.manual&&g.canAutoMatch),singletons=groups.filter(g=>!g.manual&&g.posts.length===1).map(g=>g.posts[0]),changes=new Map();
 for(const post of singletons){
  if(post.source!=='public'||post.groupOverride||post.metadataPending||!post.publishedAt||Date.parse(post.publishedAt)<now-WINDOW)continue;
  const matches=pending.filter(g=>g.missing.includes(post.network)&&!g.posts.some(p=>p.url===post.url)).map(group=>({group,title:compatibleHeadline(post,group)})).filter(m=>m.title);
  if(matches.length!==1)continue;const match=matches[0];
  // Two different links from the same network are ambiguous; keep both separate.
  const key=match.group.id+'|'+post.network;if([...changes.values()].some(c=>c.key===key)){for(const[url,c]of changes)if(c.key===key)changes.delete(url);changes.set('ambiguous:'+key,{key,ambiguous:true});continue;}
  changes.set(post.url,{key,title:match.title});
 }
 const matched=[];const result=posts.map(p=>{const c=changes.get(p.url);if(!c||c.ambiguous)return p;matched.push(p.url);return{...p,title:c.title,originalTitle:p.originalTitle||p.title,linkRecoveredAt:new Date(now).toISOString()};});return{posts:result,matched};
}
