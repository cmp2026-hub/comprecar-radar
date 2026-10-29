import{validatePost,decode}from'./core.mjs';
export const FACEBOOK_PAGE='https://www.facebook.com/Comprecar/';
export const FACEBOOK_REELS='https://www.facebook.com/Comprecar/reels/';
export const FACEBOOK_VIDEOS='https://www.facebook.com/Comprecar/videos/';
export const TIKTOK_FEED='https://rss-bridge.org/bridge01/?action=display&bridge=TikTok&context=By%20user&username=%40comprecartv&format=Atom';
export const TIKTOK_CREATOR='https://www.tiktok.com/embed/@comprecartv';
export const YOUTUBE_UPLOADS='https://www.youtube.com/playlist?list=UU9Pbtn0wi6CXxTHMPbolwPA';
export function walk(root,visit){const stack=[root];while(stack.length){const o=stack.pop();if(!o||typeof o!=='object')continue;visit(o);for(const v of Object.values(o))if(v&&typeof v==='object')stack.push(v);}}
function first(root,predicate){let found;walk(root,o=>{if(found===undefined){const value=predicate(o);if(value!==undefined&&value!==null)found=value}});return found;}
function jsonScripts(html){const out=[];for(const m of html.matchAll(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)){try{out.push(JSON.parse(m[1]))}catch{}}return out;}
function instagramOwner(user){return user?.username?.toLowerCase()==='comprecar'&&['1558975667','17841401910034358'].includes(String(user.pk||user.id));}
export function instagramPublicLinks(html){
 const links=new Map();for(const data of jsonScripts(html))walk(data,o=>{if(/^[-\w]+$/.test(o.code||'')&&instagramOwner(o.user)){links.set(o.code,{code:o.code,url:'https://www.instagram.com/'+(o.media_type===2?'reel/':'p/')+o.code+'/'});}});
 if(!links.size)throw Error('O perfil público não retornou links do @comprecar com autoria confirmada.');return[...links.values()];
}
export function parseInstagramPostPublic(html,code,now=Date.now()){
 let post;for(const data of jsonScripts(html))walk(data,o=>{if(!post&&o.code===code&&o.taken_at&&instagramOwner(o.user)){
  const title=o.caption?.text?.split(/\r?\n/).map(t=>t.trim()).find(Boolean)||'Publicação de @comprecar';
  try{post=validatePost({network:'instagram',url:'https://www.instagram.com/'+(o.media_type===2?'reel/':'p/')+o.code+'/',title,publishedAt:new Date(Number(o.taken_at)*1000).toISOString(),thumbnail:o.display_uri||o.image_versions2?.candidates?.[0]?.url,kind:o.media_type===2?'video':'image',source:'public'},now)}catch{}
 }});
 if(!post)throw Error('A página pública não confirmou autor e data original desta publicação.');return post;
}
export function parseFacebookPublic(html,now=Date.now()){
 const nodes=[];for(const data of jsonScripts(html))walk(data,o=>{if(o.__typename==='Story'&&o.creation_time&&o.post_id)nodes.push(o)});
 const posts=new Map();for(const node of nodes){
  const reel=node.short_form_video_context,owned=node.actors?.some(a=>a.id==='100064536408329')||reel?.video?.owner?.id==='100064536408329';
  if(!owned||node.sponsored_data||(node.unpublished_content_type&&node.unpublished_content_type!=='PUBLISHED'))continue;
  const story=node.comet_sections?.content?.story||node;
  const message=node.message?.text||first(story,o=>o.message?.text)||'';
  const title=message.split(/\r?\n/).map(t=>t.trim()).find(Boolean)||'Publicação do Comprecar no Facebook';
  const url=reel?.shareable_url||node.permalink_url||first(story,o=>o.wwwURL)||'https://www.facebook.com/Comprecar/posts/'+node.post_id;
  const thumbnail=reel?.video?.first_frame_thumbnail||first(node.attachments,o=>o.photo_image?.uri)||'';
  const video=!!reel||!!first(node.attachments,o=>o.__typename==='Video'?true:undefined);
  try{const p=validatePost({network:'facebook',title,url,thumbnail,publishedAt:new Date(Number(node.creation_time)*1000).toISOString(),kind:video?'video':'image',source:'public'},now);posts.set(p.url,p)}catch{}
 }
 for(const data of jsonScripts(html))walk(data,o=>{
  const p=o.channel_tab_thumbnail_renderer?.video||(o.savable_title&&o.publish_time?o:null);if(!p||String(p.owner?.id)!=='100064536408329'||!p.publish_time||!/^\d+$/.test(p.id||''))return;
  const title=(p.savable_title?.text||p.creation_story?.message?.text||'').split(/\r?\n/).map(t=>t.trim()).find(Boolean);if(!title)return;
  try{const post=validatePost({network:'facebook',url:'https://www.facebook.com/reel/'+p.id+'/',title,publishedAt:new Date(Number(p.publish_time)*1000).toISOString(),thumbnail:p.image?.uri,kind:'video',source:'public'},now);if(!posts.has(post.url))posts.set(post.url,post)}catch{}
 });
 if(!posts.size)throw Error('Facebook não retornou posts públicos com autor e data confirmados.');
 return[...posts.values()];
}
export function parseTikTokCreatorLinks(html,now=Date.now()){
 // Read public anchor URLs only. Scripts, guessed IDs and photo URLs are not video discovery sources.
 const visibleMarkup=html.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>|<style\b[^>]*>[\s\S]*?<\/style\s*>|<!--[\s\S]*?-->/gi,'');
 const posts=new Map();for(const m of visibleMarkup.matchAll(/<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1/gi)){
  let url;try{url=new URL(decode(m[2]),'https://www.tiktok.com');}catch{continue;}
  if(url.origin!=='https://www.tiktok.com'||!/^\/@comprecartv\/video\/\d+\/?$/.test(url.pathname))continue;
  const id=url.pathname.match(/\/video\/(\d+)/)[1],canonical='https://www.tiktok.com/@comprecartv/video/'+id;
  const post=validatePost({network:'tiktok',url:canonical,title:'Vídeo do TikTok · '+id,publishedAt:null,source:'archive',kind:'video'},now);
  posts.set(canonical,{...post,metadataPending:true});
 }
 if(!posts.size)throw Error('A incorporação pública do TikTok não disponibilizou links de vídeos do @comprecartv.');
 return[...posts.values()].slice(0,10);
}
export function parseTikTokFeed(xml,now=Date.now()){
 if(!/<title[^>]*>\s*@?comprecartv\s*-\s*TikTok\s*<\/title>/i.test(xml))throw Error('A fonte não confirmou o perfil @comprecartv.');
 const posts=[];for(const m of xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/g)){
  const item=m[1],url=decode(item.match(/<link\b[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1]||'');
  const id=url.match(/\/@comprecartv\/video\/(\d+)/i)?.[1];if(!id)continue;
  const rawTitle=decode(item.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]||'').replace(/<[^>]+>/g,'').trim();
  const unavailable=!rawTitle||/^[\d.,KM\s]*views?$/i.test(rawTitle)||rawTitle===url;
  const title=unavailable?'Vídeo do TikTok · '+id:rawTitle;
  // This bridge supplies no original publication timestamps. Do not substitute retrieval time or ID-derived dates.
  try{posts.push({...validatePost({network:'tiktok',url,title,publishedAt:null,source:'archive',kind:'video'},now),metadataPending:unavailable})}catch{}
 }
 if(!posts.length)throw Error('A fonte pública do TikTok não retornou links válidos.');return posts;
}
export function parseTikTokPublic(html,id,now=Date.now()){
 const data=jsonScripts(html).find(data=>data.__DEFAULT_SCOPE__?.['webapp.video-detail']);
 const item=data?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct;
 if(!item||String(item.id)!==String(id)||item.author?.uniqueId?.toLowerCase()!=='comprecartv'||String(item.author.id)!=='7215972331608589318')throw Error('TikTok não confirmou o vídeo e a autoria do @comprecartv na página pública.');
 if(item.imagePost?.images?.length)throw Error('Esta publicação do TikTok é de fotos; não será convertida em link de vídeo.');
 const caption=String(item.desc||'').trim();
 const title=String(item.contents?.[0]?.desc||caption.split(/\r?\n/).find(Boolean)||'').trim();
 if(!title||!item.createTime)throw Error('TikTok não disponibilizou legenda e data original nesta página pública.');
 return{...validatePost({network:'tiktok',url:'https://www.tiktok.com/@comprecartv/video/'+id,title,publishedAt:new Date(Number(item.createTime)*1000).toISOString(),thumbnail:item.video?.cover,kind:'video',source:'public'},now),caption,metadataPending:false};
}
export function extractAssignedJson(html,marker){
 const start=html.indexOf(marker);if(start<0)throw Error('A página pública mudou de formato.');const begin=html.indexOf('{',start+marker.length);let depth=0,inString=false,escape=false;
 for(let i=begin;i<html.length;i++){const c=html[i];if(inString){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')inString=false;continue}if(c==='"')inString=true;else if(c==='{')depth++;else if(c==='}'&&--depth===0)return JSON.parse(html.slice(begin,i+1));}
 throw Error('JSON público incompleto.');
}
export function parseYouTubePublic(html,id,now=Date.now()){
 const player=extractAssignedJson(html,'var ytInitialPlayerResponse = '),video=player.videoDetails,micro=player.microformat?.playerMicroformatRenderer;
 if(video?.videoId!==id||video.channelId!=='UC9Pbtn0wi6CXxTHMPbolwPA'||micro?.externalChannelId!=='UC9Pbtn0wi6CXxTHMPbolwPA')throw Error('YouTube não confirmou o vídeo e o canal ComprecarTV.');
 const published=micro.publishDate;
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(published||''))throw Error('YouTube não informou a data e o horário originais.');
 return validatePost({network:'youtube',url:'https://www.youtube.com/watch?v='+id,title:video.title,publishedAt:published,thumbnail:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',kind:'video',source:'public'},now);
}
export function parseYouTubeInventory(data,now=Date.now()){
 const scope=[data.contents,data.onResponseReceivedActions,data.onResponseReceivedEndpoints,data.continuationContents];
 const posts=new Map();let continuation=null;
 walk(scope,o=>{
  if(typeof o.continuationCommand?.token==='string')continuation=o.continuationCommand.token;
  const model=o.lockupViewModel,legacy=o.playlistVideoRenderer||o.playlistPanelVideoRenderer;
  const id=model?.contentType==='LOCKUP_CONTENT_TYPE_VIDEO'?model.contentId:legacy?.videoId;
  if(!/^[\w-]{11}$/.test(id||''))return;
  const title=model?.metadata?.lockupMetadataViewModel?.title?.content||legacy?.title?.runs?.map(r=>r.text).join('')||legacy?.title?.simpleText;
  if(!title||/private video|deleted video|vídeo privado|vídeo excluído/i.test(title))return;
  const p=validatePost({network:'youtube',url:'https://www.youtube.com/watch?v='+id,title,publishedAt:null,source:'archive',thumbnail:'https://i.ytimg.com/vi/'+id+'/hqdefault.jpg',kind:'video'},now);posts.set(p.url,p);
 });
 if(!posts.size&&data.error)throw Error('YouTube: '+data.error.message);
 return{posts:[...posts.values()],continuation};
}
export async function inventoryPage(fetcher,job){
 const options={signal:AbortSignal.timeout(20000),headers:{'user-agent':'ComprecarRadar/1.2'}};
 let data,version=job.clientVersion;
 if(!job.continuation){
  const r=await fetcher(YOUTUBE_UPLOADS,options);if(!r.ok)throw Error('Lista pública respondeu HTTP '+r.status);const text=await r.text();if(text.length>8000000)throw Error('Lista pública muito grande.');
  data=extractAssignedJson(text,'var ytInitialData = ');if(!data.metadata?.playlistMetadataRenderer?.title?.includes('ComprecarTV'))throw Error('A lista pública não confirmou o canal ComprecarTV.');
  version=text.match(/"INNERTUBE_CONTEXT_CLIENT_VERSION":"([^"]+)"/)?.[1];if(!version)throw Error('YouTube não informou a versão de navegação pública.');
 }else{
  const r=await fetcher('https://www.youtube.com/youtubei/v1/browse?prettyPrint=false',{...options,method:'POST',headers:{...options.headers,'content-type':'application/json'},body:JSON.stringify({context:{client:{clientName:'WEB',clientVersion:version,hl:'pt',gl:'BR'}},continuation:job.continuation})});if(!r.ok)throw Error('Paginação pública respondeu HTTP '+r.status);const text=await r.text();if(text.length>8000000)throw Error('Página pública muito grande.');data=JSON.parse(text);
 }
 const result=parseYouTubeInventory(data);if(!result.posts.length&&result.continuation)throw Error('YouTube devolveu paginação sem vídeos.');return{...result,clientVersion:version};
}
