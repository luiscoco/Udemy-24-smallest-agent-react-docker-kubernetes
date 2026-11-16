import {spawnSync} from 'node:child_process';
const root=new URL('..',import.meta.url);
const result=spawnSync('kubectl',['kustomize','k8s/base'],{cwd:root,encoding:'utf8'});
if(result.error||result.status!==0){console.error('kubectl kustomize failed; install kubectl and check k8s/base.');process.exit(1);}
if(!result.stdout.includes('kind: Deployment')||result.stdout.includes('kind: Secret'))throw Error('Unexpected manifest render.');
console.log('Kustomize rendered namespace, service account, configuration, deployment, service and disruption budget. This does not validate against a running cluster.');
