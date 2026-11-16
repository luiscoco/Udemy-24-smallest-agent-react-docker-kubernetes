import {mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {QueryFactory} from './agent-service.js';

export function sdkEnvironment(apiKey:string): Record<string,string|undefined> {
  const environment:Record<string,string|undefined>={...process.env};
  // Cloud platform credentials are not part of the CLI child environment.
  for(const name of Object.keys(environment)) if(name==='AGENT_SERVICE_TOKEN'||name.startsWith('AWS_')||name.startsWith('ECS_')||name.startsWith('GOOGLE_')||name.startsWith('GCLOUD_')||name.startsWith('CLOUDSDK_')||name.startsWith('ANTHROPIC_')||(name.startsWith('CLAUDE_CODE_')&&name!=='CLAUDE_CODE_GIT_BASH_PATH')||name.startsWith('VERCEL_')||name.startsWith('KUBERNETES_')||name==='KUBECONFIG') environment[name]=undefined;
  return {...environment, ANTHROPIC_API_KEY:apiKey, ANTHROPIC_BASE_URL:'https://api.anthropic.com',ENABLE_CLAUDEAI_MCP_SERVERS:'false',CLAUDE_CODE_DISABLE_AUTO_MEMORY:'1'};
}

// Every query owns a fresh writable directory, including warm agent-service requests.
export function isolatedQuery(query:QueryFactory):QueryFactory {
  return input=>{
    const directory=mkdtempSync(join(tmpdir(),'smallest-agent-24-'));
    const work=join(directory,'work'),config=join(directory,'config'),home=join(directory,'home');
    for(const path of [work,config,home])mkdirSync(path);
    let cleaned=false;
    const cleanup=()=>{if(!cleaned){cleaned=true;rmSync(directory,{recursive:true,force:true});}};
    try {
      const conversation=query({...input,options:{...input.options,cwd:work,env:{...input.options.env,HOME:home,USERPROFILE:home,CLAUDE_CONFIG_DIR:config}}});
      const wrapped=(async function*(){try{yield* conversation;}finally{conversation.close?.();cleanup();}})();
      return Object.assign(wrapped,{close(){conversation.close?.();cleanup();}});
    } catch(error){cleanup();throw error;}
  };
}
