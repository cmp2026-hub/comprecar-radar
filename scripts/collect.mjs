import{readFile,writeFile,mkdir,rename,cp,appendFile,readdir}from'node:fs/promises';
import{fileURLToPath}from'node:url';
import{dirname,resolve}from'node:path';
import{createApp}from'../src/core.mjs';
import{sanitizeState,applyGroups,snapshot,shouldPublish}from'../src/cloud-state.mjs';
import{recoverCandidates}from'../src/cloud-recovery.mjs';
import{createPublicRunFetcher,recoverMissingAutomatically}from'../src/automatic-recovery.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),offline=process.argv.includes('--offline');
async function load(path){try{const v=JSON.parse(await readFile(resolve(root,path),'utf8'));if(v.schemaVersion!==1||!Array.isArray(v.data?.posts)||!Number.isFinite(Date.parse(v.savedAt)))throw Error('Formato inválido.');return v;}catch(e){if(e.code==='ENOENT')return null;if(path.startsWith('.cache/')){console.warn('Cache indisponível; usando o checkpoint do projeto.');return null;}throw e;}}
async function atomic(path,value){const target=resolve(root,path);await mkdir(dirname(target),{recursive:true});await writeFile(target+'.tmp',JSON.stringify(value));await rename(target+'.tmp',target);}
const checkpoint=await load('data/checkpoint.json'),cache=await load('.cache/state.json');
const previous=[checkpoint,cache].filter(Boolean).sort((a,b)=>Date.parse(b.savedAt)-Date.parse(a.savedAt))[0];if(!previous)throw Error('O checkpoint inicial não foi encontrado.');
const rules=JSON.parse(await readFile(resolve(root,'data/groups.json'),'utf8'));
let state=sanitizeState(previous.data);state=applyGroups(state,rules.filter(r=>r.urls?.every(u=>state.posts.some(p=>p.url===u))));const store={get:async()=>structuredClone(state),put:async(_key,value)=>{state=structuredClone(value);}};
// The scheduler requests a collection every five minutes; counters use a longer interval.
// Rate-limit pauses remain 15 minutes and are never shortened by this setting.
if(!offline){const run=createPublicRunFetcher(fetch),app=createApp(store,run.fetcher,{audienceInterval:600000});const recovery=await recoverCandidates(app,JSON.parse(await readFile(resolve(root,'data/link-candidates.json'),'utf8')),{sources:state.statuses});console.log(JSON.stringify({recovery}));await app.refresh();const automatic=await recoverMissingAutomatically(app,{readState:()=>store.get('state'),writeState:value=>store.put('state',value),fetcher:run.fetcher,responses:run.responses,limit:4-recovery.checked});console.log(JSON.stringify({automatic}));await app.audienceTick();}
state=applyGroups(sanitizeState(state),rules);
const now=Date.now(),built=snapshot(state,now),publish=shouldPublish(previous.publication,built.signature,now);
const envelope={schemaVersion:1,savedAt:new Date(now).toISOString(),data:state,publication:previous.publication||null,pendingBuild:{signature:built.signature,generatedAt:new Date(now).toISOString()}};
await atomic('.cache/state.json',envelope);
const checkpointDue=!offline&&now-Date.parse(checkpoint?.savedAt||0)>=86400000;if(checkpointDue)await atomic('data/checkpoint.json',envelope);
await mkdir(resolve(root,'site/data'),{recursive:true});await cp(resolve(root,'public'),resolve(root,'site'),{recursive:true});
for(const file of await readdir(resolve(root,'public'))){if(!/\.(?:js|mjs)$/.test(file))continue;const js=(await readFile(resolve(root,'public',file),'utf8')).replace(/(from\s*['"]\.\/[^'"]+)\.mjs(['"])/g,'$1.js$2');await writeFile(resolve(root,'site',file.replace(/\.mjs$/,'.js')),js);}
await atomic('site/data/state.json',built.publicState);await atomic('site/data/audience.json',built.reports);await atomic('site/data/missing-links.json',built.missingLinks);await atomic('site/data/health.json',{ok:true,generatedAt:new Date(now).toISOString(),lastCollectionAt:state.lastCheck,posts:state.posts.length});await writeFile(resolve(root,'site/.nojekyll'),'');
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`publish=${publish}\ncheckpoint=${checkpointDue}\n`);
console.log(JSON.stringify({mode:offline?'preview-with-saved-data':'cloud-collection',posts:state.posts.length,groups:built.publicState.groups.length,reports:built.reports.reports.length,publish,checkpoint:checkpointDue,lastCollectionAt:state.lastCheck}));
