import{canonical}from'./core.mjs';
export async function recoverCandidates(app,candidates=[],{sources={}}={}){
 if(!Array.isArray(candidates)||candidates.length>100)throw Error('Fila de candidatos inválida.');
 const post=(path,body)=>app.api(new Request('https://radar.invalid'+path,{method:'POST',headers:{origin:'https://radar.invalid','content-type':'application/json'},body:JSON.stringify(body)}));
 await post('/api/groups/reconcile',{});
 const queue=await(await app.api(new Request('https://radar.invalid/api/groups/missing-links'))).json(),results=[],seen=new Set(),paused=new Set();let checked=0;
 for(const item of candidates){
  if(checked>=4)break;
  if(!item||!['youtube','instagram','facebook','tiktok'].includes(item.network)||typeof item.url!=='string')continue;
  let url;try{url=canonical(item.url,item.network);if(url!==item.url)continue;}catch{continue;}
  const source=sources[item.network]||{},sourcePause=Math.max(Date.parse(source.nextCheckAt||0)||0,item.network==='tiktok'&&source.discoveryMethod!=='public-creator'?(Date.parse(source.directNextCheckAt||0)||0):0);
  if(seen.has(url)||paused.has(item.network)||sourcePause>Date.now())continue;seen.add(url);
  const group=queue.groups.find(g=>g.anchorUrl===item.anchorUrl||g.posts.some(p=>p.url===item.anchorUrl));
  if(!group?.canAutoMatch||!group.missing.includes(item.network)||Date.parse(queue.networks[item.network]?.nextCheckAt||0)>Date.now())continue;
  checked++;const response=await post('/api/groups/check-links',{anchorUrl:item.anchorUrl,network:item.network,urls:[url]}),result=await response.json();
  results.push({network:item.network,url,status:response.status,...result});
  if(result.paused||result.errors?.length||!response.ok)paused.add(item.network);
  if(result.matched)group.missing=group.missing.filter(n=>n!==item.network);
 }
 return{checked,matched:results.reduce((n,r)=>n+(r.matched||0),0),results};
}
