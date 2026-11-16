import {afterEach,describe,expect,it,vi} from 'vitest';
import {createServer,type Server} from 'node:http';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {AddressInfo} from 'node:net';
import {createAppHandler} from '../src/transport';
import {readConfig} from '../src/config';
import {gracefulShutdown} from '../src/shutdown';

let server:Server|undefined;const owned:string[]=[];
afterEach(async()=>{vi.useRealTimers();server?.closeAllConnections();if(server)await new Promise<void>(r=>server!.close(()=>r()));server=undefined;for(const dir of owned.splice(0))rmSync(dir,{recursive:true,force:true});});
async function start(agent:any,staticRoot?:string){const app=createAppHandler(readConfig({ANTHROPIC_API_KEY:'test-key',AGENT_MAX_CONCURRENT_REQUESTS:'2'}),agent,staticRoot);server=createServer(app.handle);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;}
describe('Kubernetes runtime boundaries',()=>{
 it('marks readiness false during drain while liveness and active SSE remain available',async()=>{
  let release:()=>void=()=>{};
  const agent={runAgent:vi.fn(),async *streamAgent(){
   yield {type:'SystemMessage' as const,summary:'Ready',data:{}};
   await new Promise<void>(resolve=>{release=resolve;});
   yield {type:'ResultMessage' as const,summary:'Done',data:{result:'hello',num_turns:1,duration_ms:1,total_cost_usd:null,is_error:false}};
  }};
  const app=createAppHandler(readConfig({ANTHROPIC_API_KEY:'test-key'}),agent);
  server=createServer(app.handle);await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  expect((await fetch(base+'/readyz')).status).toBe(200);
  const response=await fetch(base+'/api/agent/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"prompt":"hello"}'});
  const reader=response.body!.getReader();let events=new TextDecoder().decode((await reader.read()).value);
  app.beginDrain();
  expect((await fetch(base+'/readyz')).status).toBe(503);
  expect((await fetch(base+'/livez')).status).toBe(200);
  expect((await fetch(base+'/api/agent/query',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"prompt":"hello"}'})).status).toBe(503);
  expect(agent.runAgent).not.toHaveBeenCalled();
  release();while(true){const chunk=await reader.read();if(chunk.done)break;events+=new TextDecoder().decode(chunk.value);}
  expect(events).toContain('ResultMessage');expect(events).toContain('event: done');
 });
 it('rejects overflow capacity before starting another agent and releases cancelled slots',async()=>{
  let cancelled=0;const agent={runAgent:vi.fn(),async *streamAgent(_prompt:string,controller:AbortController){yield {type:'SystemMessage',summary:'Ready',data:{}};await new Promise<void>(r=>controller.signal.addEventListener('abort',()=>{cancelled++;r()},{once:true}));}};
  const base=await start(agent),a=new AbortController(),b=new AbortController();
  try{for(const c of [a,b]){const response=await fetch(base+'/api/agent/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"prompt":"hello"}',signal:c.signal});await response.body!.getReader().read();}
   const busy=await fetch(base+'/api/agent/query',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"prompt":"hello"}'});expect(busy.status).toBe(429);expect(busy.headers.get('Retry-After')).toBe('5');expect(agent.runAgent).not.toHaveBeenCalled();
  }finally{a.abort();b.abort();}await vi.waitFor(()=>expect(cancelled).toBe(2));
  expect((await fetch(base+'/api/health')).status).toBe(200);
 });
 it('serves compiled assets but refuses hidden files, unknown APIs and symlink escape',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'agent22-static-')),outside=mkdtempSync(join(tmpdir(),'agent22-outside-'));owned.push(dir,outside);
  writeFileSync(join(dir,'index.html'),'<main>React</main>');mkdirSync(join(dir,'assets'));writeFileSync(join(dir,'assets','app.js'),'console.log("React")');writeFileSync(join(dir,'.env'),'private');writeFileSync(join(outside,'private.txt'),'outside');
  symlinkSync(outside,join(dir,'escape'),process.platform==='win32'?'junction':'dir');const base=await start({runAgent:vi.fn(),streamAgent:vi.fn()},dir);
  expect(await(await fetch(base+'/')).text()).toBe('<main>React</main>');const js=await fetch(base+'/assets/app.js');expect(js.status).toBe(200);expect(js.headers.get('content-type')).toContain('javascript');
  for(const path of ['/.env','/api/unknown','/missing.js','/escape/private.txt','/assets/%2eenv'])expect((await fetch(base+path)).status).toBe(404);
 });
 it('bounds configured concurrency',()=>{for(const value of ['0','9','1.5','invalid'])expect(()=>readConfig({AGENT_MAX_CONCURRENT_REQUESTS:value})).toThrow();});
 it('drains active requests on shutdown before exiting',()=>{
  vi.useFakeTimers();let close:(()=>void)|undefined;const fake={close:vi.fn((cb:()=>void)=>{close=cb}),closeIdleConnections:vi.fn(),closeAllConnections:vi.fn()} as unknown as Server;const abort=vi.fn(),exit=vi.fn();
  gracefulShutdown(fake,abort,exit);vi.advanceTimersByTime(5000);expect(exit).not.toHaveBeenCalled();expect(abort).not.toHaveBeenCalled();close!();expect(exit).toHaveBeenCalledWith(0);vi.advanceTimersByTime(120000);expect(abort).not.toHaveBeenCalled();
 });
 it('aborts stuck work before the Kubernetes stop limit',()=>{
  vi.useFakeTimers();const fake={close:vi.fn(),closeIdleConnections:vi.fn(),closeAllConnections:vi.fn()} as unknown as Server;const abort=vi.fn(),exit=vi.fn();gracefulShutdown(fake,abort,exit);vi.advanceTimersByTime(110000);expect(abort).toHaveBeenCalledOnce();expect(fake.closeAllConnections).toHaveBeenCalledOnce();vi.advanceTimersByTime(1500);expect(exit).toHaveBeenCalledWith(1);
 });
});
