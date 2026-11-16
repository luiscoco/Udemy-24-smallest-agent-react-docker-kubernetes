import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {parse} from '../backend/node_modules/dotenv/lib/main.js';
const file=new URL('../backend/.env',import.meta.url);
const key=process.env.ANTHROPIC_API_KEY??parse(readFileSync(file)).ANTHROPIC_API_KEY;
if(!key?.trim()||key.trim()==='sk-ant-replace-with-your-key')throw Error('Set your own ANTHROPIC_API_KEY in backend/.env before creating the Kubernetes Secret.');
// Send only this value through stdin: no key in process arguments or console output.
const secret={apiVersion:'v1',kind:'Secret',metadata:{name:'claude-api',namespace:'smallest-agent-24'},type:'Opaque',stringData:{ANTHROPIC_API_KEY:key.trim()}};
const result=spawnSync('kubectl',['apply','-f','-'],{input:JSON.stringify(secret),stdio:['pipe','pipe','pipe'],encoding:'utf8'});
if(result.error)throw Error('kubectl could not start. Check installation and context.');
if(result.status!==0){console.error('Secret apply failed. Check the current Kubernetes context, namespace and RBAC permissions. Provider key and raw kubectl diagnostics were suppressed.');process.exit(1);}
console.log('Applied claude-api Secret in smallest-agent-24. Restart the deployment after key rotation.');
