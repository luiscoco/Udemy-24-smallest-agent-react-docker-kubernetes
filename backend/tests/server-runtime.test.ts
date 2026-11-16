import {describe,it,expect,vi} from 'vitest';
import {existsSync} from 'node:fs';
import {isolatedQuery,sdkEnvironment} from '../src/sdk-runtime';
import {readConfig} from '../src/config';
import {createHandlers} from '../src/handlers';
import type {QueryFactory} from '../src/agent-service';

const request=(host:string,origin:string,proto?:string)=>new Request('http://localhost/api/agent/query',{
 method:'POST',headers:{Host:host,Origin:origin,'Content-Type':'application/json',...(proto?{'X-Forwarded-Proto':proto}:{})},body:JSON.stringify({prompt:'hello'})});
describe('Node Agent Node execution boundaries',()=>{
 it('trusts TLS scheme only for the explicit trusted proxy configuration',async()=>{
  const agent={runAgent:vi.fn(),streamAgent:vi.fn()};
  const local=createHandlers(readConfig({}),agent);
  expect((await local.query(request('lesson.vercel.app','https://lesson.vercel.app','https'))).status).toBe(403);
  const hosted=createHandlers(readConfig({TRUST_PROXY:'1'}),agent);
  expect((await hosted.query(request('lesson.vercel.app','https://lesson.vercel.app','https'))).status).toBe(503);
  expect((await hosted.query(request('lesson.vercel.app','https://foreign.invalid','https'))).status).toBe(403);
  expect(agent.runAgent).not.toHaveBeenCalled();
 });
 it('requires exact JSON media type',async()=>{
  const handlers=createHandlers(readConfig({}),{runAgent:vi.fn(),streamAgent:vi.fn()});
  const req=new Request('http://localhost/api/agent/query',{method:'POST',headers:{'Content-Type':'application/json-bogus'},body:'{"prompt":"hello"}'});
  expect((await handlers.query(req)).status).toBe(415);
 });
 it('cleans a distinct SDK directory after normal completion and early close',async()=>{
  const paths:string[]=[];
  const fake:QueryFactory=input=>{
   paths.push(String(input.options.cwd));expect(existsSync(paths.at(-1)!)).toBe(true);
   const generator=(async function*(){yield {type:'system',subtype:'init',uuid:'test',session_id:'test'} as never;})();
   return Object.assign(generator,{close:vi.fn()});
  };
  const factory=isolatedQuery(fake);
  for(let i=0;i<2;i++){
   const iterator=factory({prompt:'hi',options:{}});
   if(i===0){for await(const message of iterator)expect(message.type).toBe('system');}
   else{const generator=iterator[Symbol.asyncIterator]();await generator.next();iterator.close?.();await generator.return?.();}
   expect(existsSync(paths[i])).toBe(false);
  }
  expect(paths[0]).not.toBe(paths[1]);
 });
 it('does not forward service or cloud credentials to the CLI',()=>{
  vi.stubEnv('VERCEL_OIDC_TOKEN','not-for-cli');vi.stubEnv('CLAUDE_CODE_OAUTH_TOKEN','not-for-cli');vi.stubEnv('GOOGLE_APPLICATION_CREDENTIALS','not-for-cli');
  vi.stubEnv('AGENT_SERVICE_TOKEN','private-gateway-token');vi.stubEnv('KUBECONFIG','private-cluster-config');vi.stubEnv('KUBERNETES_SERVICE_HOST','private-cluster-host');vi.stubEnv('CLAUDE_CODE_GIT_BASH_PATH','C:/Custom/Git/bin/bash.exe');
  try{const env=sdkEnvironment('private-model-key');expect(env.AGENT_SERVICE_TOKEN).toBeUndefined();expect(env.KUBECONFIG).toBeUndefined();expect(env.KUBERNETES_SERVICE_HOST).toBeUndefined();expect(env.CLAUDE_CODE_GIT_BASH_PATH).toBe('C:/Custom/Git/bin/bash.exe');expect(env.VERCEL_OIDC_TOKEN).toBeUndefined();expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();expect(env.GOOGLE_APPLICATION_CREDENTIALS).toBeUndefined();expect(env.ANTHROPIC_API_KEY).toBe('private-model-key');}finally{vi.unstubAllEnvs();}
 });
 it('enforces the application deadline and emits no done after timeout',async()=>{
  vi.useFakeTimers();let cancelled=false;
  const agent={runAgent:vi.fn(),async *streamAgent(_prompt:string,controller?:AbortController){await new Promise<void>(resolve=>controller!.signal.addEventListener('abort',()=>{cancelled=true;resolve();},{once:true}));}};
  try{
   const response=await createHandlers(readConfig({ANTHROPIC_API_KEY:'test-key'}),agent).stream(request('localhost','http://localhost'));
   const reading=response.text();await vi.advanceTimersByTimeAsync(180001);
   const text=await reading;expect(text).toContain('event: error');expect(text).not.toContain('event: done');expect(cancelled).toBe(true);
  }finally{vi.useRealTimers();}
 });
});
