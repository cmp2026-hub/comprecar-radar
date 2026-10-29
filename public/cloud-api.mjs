const TTL=5*60*1000;
export function createCloudApi({baseUrl=import.meta.url,fetcher=fetch,now=Date.now}={}){
 const base=new URL('./data/',baseUrl);let reportCache=null,reportRequest=null,version=null;
 async function read(file,options={}){const r=await fetcher(new URL(file,base),{cache:'no-store',...options});if(!r.ok)throw Error('Não foi possível ler os dados publicados.');return{data:await r.json(),response:r};}
 function servedAt(response){const at=Date.parse(response.headers?.get('date')),age=Number(response.headers?.get('age')||0);return new Date(Number.isFinite(at)&&Number.isFinite(age)?at+Math.max(0,age)*1000:now()).toISOString();}
 function abortable(promise,signal){if(!signal)return promise;if(signal.aborted)return Promise.reject(signal.reason||new DOMException('Aborted','AbortError'));return new Promise((resolve,reject)=>{const abort=()=>reject(signal.reason||new DOMException('Aborted','AbortError'));signal.addEventListener('abort',abort,{once:true});promise.then(v=>{signal.removeEventListener('abort',abort);resolve(v);},e=>{signal.removeEventListener('abort',abort);reject(e);});});}
 async function reports(){if(reportCache&&now()-reportCache.at<TTL&&reportCache.data.publicationVersion===version)return reportCache.data;if(!reportRequest){reportRequest=read('audience.json',{signal:AbortSignal.timeout(30000)}).then(({data})=>{reportCache={at:now(),data};return data;}).finally(()=>{reportRequest=null;});}return reportRequest;}
 return async function api(path,body,options={}){
  if(body!==undefined)throw Error('Este painel público permite apenas consultas.');
  const u=new URL(path,'https://radar.invalid');
  if(u.pathname==='/api/state'){const{data,response}=await read('state.json',options);if(data.publicView!==true||!Array.isArray(data.groups))throw Error('Os dados publicados estão incompletos.');if(version!==data.publicationVersion){version=data.publicationVersion;reportCache=null;}return{...data,snapshotGeneratedAt:data.serverTime,serverTime:servedAt(response)};}
  if(u.pathname==='/api/audience'){
   const keys=[...u.searchParams.keys()];if(keys.some(k=>!['from','to'].includes(k))||keys.length!==2)throw Error('Período inválido.');
   let dataset=await abortable(reports(),options.signal);if(version&&dataset.publicationVersion!==version){reportCache=null;dataset=await abortable(reports(),options.signal);if(dataset.publicationVersion!==version)throw Error('Os dados estão sendo publicados. Tente atualizar em instantes.');}
   const found=dataset.reports.find(r=>r.from===u.searchParams.get('from')&&r.to===u.searchParams.get('to'));
   if(!found)throw Error('Esse período aguarda a próxima coleta em nuvem.');
   const report=structuredClone(found);for(const n of report.networks)if(n.followers)n.followers.stale=now()-Date.parse(n.followers.observedAt)>900000;return report;
  }
  throw Error('Consulta indisponível na versão hospedada.');
 };
}
export const api=createCloudApi();
