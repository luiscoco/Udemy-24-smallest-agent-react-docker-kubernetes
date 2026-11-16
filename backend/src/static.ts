import {createReadStream,realpathSync,statSync} from 'node:fs';
import {resolve,sep,extname} from 'node:path';
import {pipeline} from 'node:stream/promises';
import type {ServerResponse} from 'node:http';

export async function serveStatic(raw:string,root:string,res:ServerResponse):Promise<boolean>{
 let path:string;try{path=decodeURIComponent(raw.split('?')[0]||'/');}catch{return false;}
 if(!path.startsWith('/')||path.includes('\\')||path.includes('\0')||path.split('/').some(part=>part.startsWith('.')))return false;
 const candidate=resolve(root,'.'+(path==='/'?'/index.html':path));
 try{
  const base=realpathSync(root),actual=realpathSync(candidate);if(!actual.startsWith(base+sep)||!statSync(actual).isFile())return false;
  const media:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2','.puml':'text/plain; charset=utf-8'};
  res.writeHead(200,{'Content-Type':media[extname(actual)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Cache-Control':path.startsWith('/assets/')?'public, max-age=31536000, immutable':'no-cache'});
  await pipeline(createReadStream(actual),res);return true;
 }catch{if(res.headersSent){res.destroy();return true;}return false;}
}
