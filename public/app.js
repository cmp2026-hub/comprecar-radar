import{api}from'./cloud-api.mjs';
import{PERIOD_PRESETS,presetRange,inPeriod}from'./period.mjs';
import{POLL_INTERVAL,cacheFresh,postsSignature,audienceSignature}from'./update-policy.mjs';
const $=s=>document.querySelector(s);
const names={youtube:'YouTube',instagram:'Instagram',tiktok:'TikTok',facebook:'Facebook'},abbr={youtube:'yt',instagram:'ig',tiktok:'tt',facebook:'fb'};
const esc=t=>String(t??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=n=>'<svg aria-hidden="true"><use href="#i-'+n+'"/></svg>';
const state={data:null,period:'day',search:'',limit:30,offset:0,loading:false,visible:[],markup:null,offline:false,audience:null,followersReport:null,audienceLoading:false,audienceQuery:null,audienceRequest:0,audienceController:null,audienceError:false,audienceCache:new Map(),audienceRendered:null,postsSignature:null,lastPollAt:0,rangeKey:null};
const now=()=>Date.now()+state.offset;
const fmt=(d,o)=>d?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',...o}).format(new Date(d)):'Data pendente';
const fullDate=d=>fmt(d,{day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
const normalized=t=>t.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
let toastTimer;
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),4000);}
function shareText(groups){return groups.map(g=>g.title+'\n'+g.posts.map(p=>names[p.network]+': '+p.url).join('\n')).join('\n\n');}
async function copy(text){if(!text?.trim())return;try{await navigator.clipboard.writeText(text);toast('Links copiados. Prontos para compartilhar.')}catch{$('#copy-text').value=text;$('#copy-dialog').showModal();$('#copy-text').focus();$('#copy-text').select();}}
function relative(d){if(!d)return'Data pendente';const minutes=Math.max(0,Math.floor((now()-Date.parse(d))/60000));return minutes<1?'Agora':minutes<60?'Há '+minutes+' min':minutes<1440?'Há '+Math.floor(minutes/60)+' h':fmt(d,{day:'2-digit',month:'short',year:'numeric'});}
const number=n=>n===null||n===undefined?'—':new Intl.NumberFormat('pt-BR').format(n);
const audienceRange=()=>presetRange(state.period,new Date(now()));
const audienceQuery=()=>new URLSearchParams(audienceRange()).toString();
const shortDate=d=>d.split('-').reverse().join('/');
function renderAudience(){
 const range=audienceRange(),report=state.audience,followersReport=state.followersReport||report,selected=report?.from===range.from&&report?.to===range.to?report:null;
 const rendered=JSON.stringify([state.period,range.from,range.to,audienceSignature(report),audienceSignature(followersReport),state.offline,state.audienceError,state.audienceLoading&&!selected]);if(rendered===state.audienceRendered)return;state.audienceRendered=rendered;
 $('#summary-period').textContent=PERIOD_PRESETS.find(p=>p.id===state.period).label;
 $('#summary-period').title=shortDate(range.from)+' a '+shortDate(range.to)+' · horário de Brasília';
 $('#summary-views').setAttribute('aria-busy',String(state.audienceLoading&&!selected));
 for(const metric of['followers','views']){
  const followers=metric==='followers',current=followers?followersReport:selected,total=followers?current?.followers?.value:current?.observedDelta,element=$('#summary-'+metric),approximate=followers&&current?.followers?.approximate;
  element.textContent=(approximate&&total!==null?'≈ ':'')+number(total);
  element.title=followers?'Soma atual dos seguidores e inscritos das redes. Uma pessoa pode acompanhar mais de um perfil.':'Variação das visualizações e reproduções entre leituras públicas de '+shortDate(range.from)+' a '+shortDate(range.to)+', incluindo posts antigos. Correções das redes podem reduzir a contagem.';
  $('#summary-'+metric+'-networks').innerHTML=Object.keys(names).map(network=>{
   const item=current?.networks.find(n=>n.network===network),value=followers?item?.followers?.value:item?.observedDelta,approx=followers&&item?.followers?.approximate,at=followers?item?.followers?.observedAt:null;
   const detail=value===null||value===undefined?(followers?'Contagem pública indisponível.':state.audienceLoading?'Consultando o período selecionado.':'Sem duas leituras comparáveis neste período.'):(followers?(network==='youtube'?'Inscritos':'Seguidores'):'Visualizações medidas de '+shortDate(range.from)+' a '+shortDate(range.to))+(at?' · Leitura de '+fullDate(at):'')+(!followers?' · '+number(item.comparedPosts)+' posts com leituras comparáveis.':'');
   return'<div title="'+esc(names[network]+': '+detail)+'"><dt>'+icon(abbr[network])+'<span>'+names[network]+'</span></dt><dd>'+((approx&&value!==null)?'≈ ':'')+number(value)+'</dd></div>';
  }).join('');
 }
 const note=$('#summary-note'),started=selected?.startedAt?new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(selected.startedAt)):null;
 if(state.offline)note.textContent=selected?'Sem conexão · exibindo a última medição deste período.':'Visualizações deste período temporariamente indisponíveis.';
 else if(state.audienceError)note.textContent=selected?'Falha ao atualizar · exibindo a última medição deste período.':'Visualizações deste período temporariamente indisponíveis.';
 else if(!selected)note.textContent='Consultando as visualizações do período selecionado…';
 else if(selected.observedDelta===null)note.textContent='Aguardando duas leituras no período · contagens públicas parciais.';
 else note.textContent=started&&range.from<started?'Medição parcial · histórico de visualizações disponível desde '+shortDate(started)+'.':'Visualizações medidas no período selecionado · cobertura pública parcial.';
 note.title=selected?number(selected.followers.networks)+' de 4 redes com seguidores atuais; '+selected.networks.filter(n=>n.observedDelta!==null).length+' de 4 redes com visualizações medidas em '+number(selected.comparedPosts)+' posts. A primeira leitura estabelece uma base; o acumulado anterior não é atribuído ao período.':'';
}
async function loadAudience(force=false){
 if(!state.data)return;const query=audienceQuery();if(state.audienceLoading&&state.audienceQuery===query)return;
 const cached=state.audienceCache.get(query);if(!force&&cacheFresh(cached)){++state.audienceRequest;state.audienceController?.abort();state.audienceLoading=false;state.audienceError=false;state.audienceQuery=query;state.audience=cached.report;renderAudience();return;}
 const id=++state.audienceRequest;state.audienceController?.abort();const controller=new AbortController();state.audienceController=controller;state.audienceQuery=query;state.audienceLoading=true;state.audienceError=false;renderAudience();
 try{
  const data=await api('/api/audience?'+query,undefined,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});if(id!==state.audienceRequest||query!==audienceQuery())return;
  if(new URLSearchParams({from:data.from,to:data.to}).toString()!==query)throw Error('A resposta não corresponde ao período selecionado.');state.audience=data;state.followersReport=data;state.audienceCache.set(query,{report:data,at:Date.now()});if(state.audienceCache.size>14)state.audienceCache.delete(state.audienceCache.keys().next().value);
 }catch{if(id===state.audienceRequest)state.audienceError=true;}
 finally{if(id===state.audienceRequest){state.audienceLoading=false;renderAudience();}}
}
function card(g){
 const posts=[...g.posts].sort((a,b)=>(a.publishedAt||'').localeCompare(b.publishedAt||'')),networks=[...new Set(posts.map(p=>p.network))],latest=posts.at(-1),thumb=posts.find(p=>p.thumbnail)?.thumbnail,missing=Object.keys(names).filter(n=>!networks.includes(n));
 const chips=networks.map(n=>'<a class="net-chip '+abbr[n]+'" href="'+esc(posts.find(p=>p.network===n).url)+'" target="_blank" rel="noopener noreferrer" title="Abrir publicação no '+names[n]+'">'+icon(abbr[n])+names[n]+'</a>').join('');
 const links=posts.map(p=>'<div class="post-link-row"><span class="net-symbol '+abbr[p.network]+'" title="'+names[p.network]+'">'+icon(abbr[p.network])+'</span><a href="'+esc(p.url)+'" target="_blank" rel="noopener noreferrer">'+esc(p.url)+'</a><button class="link-copy" data-copy-url="'+esc(p.url)+'" aria-label="Copiar link '+names[p.network]+'" title="Copiar link '+names[p.network]+'">'+icon('copy')+'</button><time class="link-date" datetime="'+esc(p.publishedAt||'')+'" title="'+fullDate(p.publishedAt)+'">'+fmt(p.publishedAt,{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'})+'</time></div>').join('');
 const wa='https://wa.me/?text='+encodeURIComponent(shareText([g]));
 return'<article class="post-card" data-group-id="'+esc(g.id)+'"><div class="post-main">'+(thumb?'<a class="post-thumb" href="'+esc(latest.url)+'" target="_blank" rel="noopener noreferrer" aria-label="Abrir '+esc(g.title)+'"><img src="'+esc(thumb)+'" alt="" loading="lazy" referrerpolicy="no-referrer"></a>':'')+'<div class="post-content"><div class="post-topline"><span>'+posts.length+' links reunidos</span><time datetime="'+esc(g.latestAt)+'" title="'+fullDate(g.latestAt)+'">'+relative(g.latestAt)+'</time></div><h2 class="post-title">'+esc(g.title)+'</h2><div class="network-chips">'+chips+'</div></div></div><div class="post-links">'+links+'</div><div class="post-actions"><span class="group-coverage '+(missing.length?'partial':'complete')+'">'+icon(missing.length?'link':'check')+networks.length+' de 4 redes'+(missing.length?'<span class="coverage-extra"> · Falta '+missing.map(n=>names[n]).join(', ')+'</span>':'<span class="coverage-extra"> · Todos os links disponíveis</span>')+'</span><button class="button copy-button" data-copy-group="'+esc(g.id)+'">'+icon('copy')+'Copiar '+posts.length+' links</button><a class="button whatsapp-send-button" href="'+esc(wa)+'" target="_blank" rel="noopener noreferrer" aria-label="Enviar para WhatsApp: '+esc(g.title)+'">'+icon('whatsapp')+'Enviar para WhatsApp'+icon('arrow')+'</a></div></article>';
}
function render(){
 const range=presetRange(state.period,new Date(now())),short=d=>d.split('-').reverse().join('/');
 renderAudience();
 $('#period-buttons').querySelectorAll('button').forEach(b=>{const active=b.dataset.period===state.period;b.setAttribute('aria-pressed',String(active));b.classList.toggle('active',active);});
 $('#results-range').textContent=state.period==='day'?'Hoje · '+short(range.to):short(range.from)+' a '+short(range.to);
 $('#clear-search').hidden=!state.search;
 if(!state.data)return;
 const query=normalized(state.search),groups=state.data.groups.filter(g=>new Set(g.posts.map(p=>p.network)).size>=2&&g.posts.some(p=>inPeriod(p,range.from,range.to))&&(!query||normalized(g.title+' '+g.posts.map(p=>p.title+' '+p.url).join(' ')).includes(query)));
 state.visible=groups;
 const linkCount=groups.reduce((n,g)=>n+g.posts.length,0);
 $('#group-count').textContent=groups.length;$('#results-count').textContent=groups.length+' '+(groups.length===1?'conteúdo':'conteúdos')+' · '+linkCount+' links';$('#copy-visible').disabled=!groups.length;
 $('#last-update').textContent=state.data.lastCheck?'Última consulta às '+fmt(state.data.lastCheck,{hour:'2-digit',minute:'2-digit'}):'Aguardando a primeira consulta';
 const statuses=Object.entries(state.data.statuses||{}),issues=statuses.filter(([,s])=>['error','delayed','partial'].includes(s.state));
 $('#sync-label').textContent=state.offline?'Sem conexão':'Atualização sob demanda';$('#sync-dot').className='state-dot '+(state.offline?'error':issues.length?'partial':'ok');
 const note=$('#source-note');note.hidden=!state.offline&&!issues.length;note.textContent=state.offline?'O servidor não respondeu. Os links da última consulta foram preservados.':issues.map(([n])=>names[n]).join(', ')+(issues.length===1?' com atraso ou cobertura parcial.':' com atraso ou cobertura parcial.')+' Os links disponíveis continuam abaixo.';
 let markup=groups.length?groups.slice(0,state.limit).map(card).join(''):'<div class="empty-state">'+icon('link')+'<h2>Nenhum grupo neste filtro</h2><p>'+(query?'Tente outro título ou link, ou amplie o período.':'Escolha um período maior para ver os conteúdos já agrupados.')+'</p></div>';
 if(markup!==state.markup){$('#posts').innerHTML=markup;state.markup=markup;}
 $('#load-more').hidden=groups.length<=state.limit;$('#load-more').textContent='Carregar mais conteúdos ('+Math.max(0,groups.length-state.limit)+')';
}
async function load(force=false){if(state.loading)return;state.loading=true;state.lastPollAt=Date.now();try{const data=await api('/api/state'),signature=postsSignature(data),rangeKey=audienceQuery(),changed=force||state.offline||signature!==state.postsSignature||rangeKey!==state.rangeKey;if(state.data?.publicationVersion!==data.publicationVersion)state.audienceCache.clear();state.data=data;state.offset=Date.parse(data.serverTime)-Date.now();state.offline=false;state.postsSignature=signature;state.rangeKey=rangeKey;if(changed)render();else $('#posts').querySelectorAll('.post-topline time[datetime]').forEach(t=>{const next=relative(t.getAttribute('datetime'));if(t.textContent!==next)t.textContent=next;});loadAudience(force);}catch(e){state.offline=true;const note=$('#summary-note');note.textContent=state.audience?'Sem conexão · exibindo as últimas contagens.':'Contagens públicas temporariamente indisponíveis.';if(state.data)render();else{$('#posts').innerHTML='<div class="empty-state">'+icon('radar')+'<h2>Painel temporariamente indisponível</h2><p>'+esc(e.message)+'</p></div>';$('#results-count').textContent='Não foi possível carregar os links';$('#sync-label').textContent='Sem conexão';$('#sync-dot').className='state-dot error';}}finally{state.loading=false;}}
$('#period-buttons').innerHTML=PERIOD_PRESETS.map(p=>'<button type="button" data-period="'+p.id+'" aria-pressed="'+(p.id===state.period)+'" class="period-button'+(p.id===state.period?' active':'')+'">'+p.label+'</button>').join('');
$('#period-buttons').onclick=e=>{const button=e.target.closest('[data-period]');if(!button)return;state.period=button.dataset.period;state.limit=30;render();loadAudience();};
$('#search').oninput=e=>{state.search=e.target.value;state.limit=30;render();};
$('#clear-search').onclick=()=>{state.search='';$('#search').value='';state.limit=30;render();$('#search').focus();};
$('#posts').onclick=e=>{const one=e.target.closest('[data-copy-url]'),group=e.target.closest('[data-copy-group]');if(one)copy(one.dataset.copyUrl);else if(group){const item=state.visible.find(g=>g.id===group.dataset.copyGroup);if(item)copy(shareText([item]));}};
$('#copy-visible').onclick=()=>copy(shareText(state.visible));
$('#load-more').onclick=()=>{state.limit+=30;render();};
$('#copy-close').onclick=()=>$('#copy-dialog').close();
$('#refresh').onclick=async()=>{const button=$('#refresh');button.disabled=true;button.classList.add('spinning');try{await load(true);toast('Links atualizados.')}catch(e){toast(e.message)}finally{button.disabled=false;button.classList.remove('spinning');}};
const normalizeHash=()=>{if(location.hash!=='#groups')history.replaceState(null,'',location.pathname+location.search+'#groups');};
window.addEventListener('hashchange',normalizeHash);normalizeHash();render();load();setInterval(()=>{if(!document.hidden&&Date.now()-state.lastPollAt>=POLL_INTERVAL)load()},POLL_INTERVAL);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(!state.data||Date.now()-state.lastPollAt>=POLL_INTERVAL))load()});
