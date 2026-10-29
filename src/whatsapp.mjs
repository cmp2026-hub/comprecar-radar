import{createHash,randomUUID}from'node:crypto';
const networks=['youtube','instagram','tiktok','facebook'];
const names={youtube:'YouTube',instagram:'Instagram',tiktok:'TikTok',facebook:'Facebook'};
const digest=t=>createHash('sha256').update(t).digest('hex');
const clean=t=>String(t).replace(/[\r\n\x00-\x1f*]/g,' ').replace(/\s+/g,' ').trim().slice(0,300);
function candidate(g){
 if(g.kind!=='video'||!networks.every(n=>g.posts.some(p=>p.network===n&&p.kind==='video'&&p.publishedAt&&!p.metadataPending)))return null;
 const posts=networks.map(n=>g.posts.filter(p=>p.network===n&&p.kind==='video'&&p.publishedAt&&!p.metadataPending).sort((a,b)=>a.url.localeCompare(b.url))[0]);
 const urls=posts.map(p=>p.url),key=digest(urls.join('\n'));
 return{key,title:clean(g.title),urls,links:posts.map(p=>({network:p.network,url:p.url})),latestAt:posts.map(p=>p.publishedAt).sort().at(-1)};
}
export function messageFor(c){return'Comprecar | Vídeo nas 4 redes\n\n'+c.title+'\n\n'+c.links.map(p=>names[p.network]+': '+p.url).join('\n')+'\n\nRef.: CC-'+c.key.slice(0,12);}
export function configureWhatsApp(state,groups,phone,at=new Date().toISOString()){
 if(!/^55\d{10,11}$/.test(phone))throw Error('Use o número brasileiro com país e DDD.');
 if(state.whatsapp){if(state.whatsapp.phone!==phone)throw Error('O destinatário já foi definido.');return state.whatsapp;}
 const baseline=groups.map(candidate).filter(Boolean);
 return state.whatsapp={phone,enabled:true,armedAt:at,connection:'pending',scheduler:'pending',baselineUrls:[...new Set(baseline.flatMap(c=>c.urls))],queue:[],lastScanAt:at};
}
export function scanWhatsApp(state,groups,at=new Date().toISOString()){
 const w=state.whatsapp;if(!w)return;
 w.lastScanAt=at;
 for(const q of w.queue)if(q.status==='sending'&&Date.parse(at)-Date.parse(q.startedAt)>10*60000){q.status='uncertain';q.note='O envio não foi confirmado. Confira a referência na conversa antes de reenviar.';}
 if(!w.enabled)return;
 const claimed=new Set([...w.baselineUrls,...w.queue.flatMap(q=>q.urls)]);
 for(const c of groups.map(candidate).filter(Boolean).sort((a,b)=>a.latestAt.localeCompare(b.latestAt))){
  // Only publications made after activation qualify; historical backfills never trigger a message.
  if(Date.parse(c.latestAt)<Date.parse(w.armedAt)||c.urls.some(u=>claimed.has(u)))continue;
  const q={...c,id:randomUUID(),status:'pending',queuedAt:at,message:messageFor(c)};
  w.queue.push(q);c.urls.forEach(u=>claimed.add(u));
 }
}
export function prepareWhatsApp(state,id,at=new Date().toISOString()){
 const w=state.whatsapp;if(!w?.enabled||w.connection!=='connected'||w.scheduler!=='active')throw Error('O envio aguarda conexão e agendamento ativos.');
 if(w.queue.some(q=>q.status==='sending'||q.status==='uncertain'))throw Error('Há um envio sem confirmação. Confira a conversa antes de continuar.');
 const q=w.queue.find(q=>q.id===id);if(!q||q.status!=='pending')throw Error('Este aviso não está pendente.');
 q.status='sending';q.startedAt=at;q.token=randomUUID();return{...q,phone:w.phone};
}
export function finishWhatsApp(state,data,at=new Date().toISOString()){
 const w=state.whatsapp,q=w?.queue.find(q=>q.id===data.id);
 if(!q||q.token!==data.token||!['sending','uncertain','sent'].includes(q.status))throw Error('Confirmação de envio inválida.');
 if(q.status==='sent')return;
 if(!['sent','uncertain','not-sent'].includes(data.outcome))throw Error('Resultado inválido.');
 if(data.outcome!=='uncertain'&&(typeof data.evidence!=='string'||data.evidence.trim().length<10))throw Error('Informe a confirmação visível na conversa.');
 q.status=data.outcome==='not-sent'?'pending':data.outcome;q.note=clean(data.evidence||'Envio não confirmado.');
 if(q.status==='sent')q.sentAt=at;
 if(q.status==='pending')delete q.token;
}
export function whatsAppReport(state,groups=[]){
 const w=state.whatsapp;if(!w)return{configured:false};
 const sample=groups.map(candidate).find(Boolean);
 const visible=[...w.queue.filter(q=>q.status!=='sent'),...w.queue.filter(q=>q.status==='sent').slice(-40)].sort((a,b)=>b.queuedAt.localeCompare(a.queuedAt));
 return{configured:true,phone:w.phone,enabled:w.enabled,armedAt:w.armedAt,connection:w.connection,scheduler:w.scheduler,automationId:w.automationId||null,lastScanAt:w.lastScanAt,counts:Object.fromEntries(['pending','sending','uncertain','sent'].map(s=>[s,w.queue.filter(q=>q.status===s).length])),items:visible.map(({token,...q})=>q),preview:sample?messageFor(sample):null};
}
