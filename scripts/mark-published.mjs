import{readFile,writeFile,rename}from'node:fs/promises';
const path=new URL('../.cache/state.json',import.meta.url),envelope=JSON.parse(await readFile(path,'utf8'));
if(!/^[a-f0-9]{64}$/.test(envelope.pendingBuild?.signature||''))throw Error('A publicação não possui assinatura válida.');
envelope.publication={signature:envelope.pendingBuild.signature,at:new Date().toISOString()};await writeFile(new URL('../.cache/state.tmp',import.meta.url),JSON.stringify(envelope));await rename(new URL('../.cache/state.tmp',import.meta.url),path);
