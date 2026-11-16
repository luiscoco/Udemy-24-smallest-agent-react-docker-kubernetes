import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const manifests=readdirSync(new URL('../k8s/base/',import.meta.url)).filter(n=>n.endsWith('.json')).map(n=>JSON.parse(read('k8s/base/'+n)));
const find=kind=>manifests.find(m=>m.kind===kind);
const deployment=find('Deployment'),pod=deployment.spec.template.spec,app=pod.containers[0];
test('Service, rollout and disruption budget select the intended ready application Pods',()=>{
 const labels=deployment.spec.template.metadata.labels;
 assert.deepEqual(find('Service').spec.selector,labels);
 assert.deepEqual(deployment.spec.selector.matchLabels,labels);
 assert.deepEqual(find('PodDisruptionBudget').spec.selector.matchLabels,labels);
 assert.equal(find('Service').spec.type,'ClusterIP');
 assert.equal(find('Service').spec.ports[0].targetPort,app.ports[0].name);
 assert.equal(app.ports[0].containerPort,Number(find('ConfigMap').data.API_PORT));
 assert.equal(deployment.spec.replicas,2);assert.equal(deployment.spec.strategy.rollingUpdate.maxUnavailable,0);
 assert.equal(find('PodDisruptionBudget').spec.minAvailable,1);
});
test('runtime Secret is referenced but never embedded or included in the base',()=>{
 assert.equal(manifests.some(m=>m.kind==='Secret'||m.kind==='Ingress'),false);
 assert.ok(!Object.hasOwn(find('ConfigMap').data,'ANTHROPIC_API_KEY'));
 assert.deepEqual(app.env,[{name:'ANTHROPIC_API_KEY',valueFrom:{secretKeyRef:{name:'claude-api',key:'ANTHROPIC_API_KEY'}}}]);
 assert.equal(app.envFrom[0].configMapRef.name,find('ConfigMap').metadata.name);
 assert.equal(find('ConfigMap').data.TRUST_PROXY,'0');
 for(const m of manifests)if(m.kind!=='Namespace')assert.equal(m.metadata.namespace,find('Namespace').metadata.name);
});
test('native SDK has writable bounded temp space with a restricted non-root container',()=>{
 assert.equal(pod.securityContext.runAsUser,1000);assert.equal(pod.securityContext.runAsNonRoot,true);
 assert.equal(pod.automountServiceAccountToken,false);assert.equal(find('ServiceAccount').automountServiceAccountToken,false);
 assert.equal(app.securityContext.readOnlyRootFilesystem,true);assert.equal(app.securityContext.allowPrivilegeEscalation,false);
 assert.deepEqual(app.securityContext.capabilities.drop,['ALL']);assert.equal(pod.securityContext.seccompProfile.type,'RuntimeDefault');
 assert.equal(app.volumeMounts[0].mountPath,'/tmp');assert.equal(app.volumeMounts[0].name,pod.volumes[0].name);
 assert.ok(pod.volumes[0].emptyDir.sizeLimit);assert.equal(find('ConfigMap').data.TMPDIR,'/tmp');
 assert.ok(app.resources.requests.memory&&app.resources.limits.memory&&app.resources.limits.cpu);
 assert.ok(pod.terminationGracePeriodSeconds>=120);
});
test('probes use independent process and draining endpoints without inference',()=>{
 assert.equal(app.startupProbe.httpGet.path,'/livez');assert.equal(app.livenessProbe.httpGet.path,'/livez');
 assert.equal(app.readinessProbe.httpGet.path,'/readyz');
 for(const name of ['startupProbe','livenessProbe','readinessProbe'])assert.equal(app[name].httpGet.port,'http');
});
test('image build excludes private env variants and installs target-platform SDK dependencies',()=>{
 const docker=read('Dockerfile');assert.match(read('.dockerignore'),/\*\*\/\.env\*/);
 assert.doesNotMatch(docker,/\b(?:ARG|ENV)\s+ANTHROPIC_API_KEY/);
 assert.match(docker,/npm --prefix backend ci/);assert.match(docker,/prune --omit=dev/);assert.match(docker,/USER node/);
 assert.match(docker,/bash git ca-certificates/);assert.match(docker,/EXPOSE 9900/);
 assert.match(read('compose.yaml'),/127\.0\.0\.1:9900:9900/);assert.match(read('compose.yaml'),/read_only: true/);
});
test('all sixteen workflow excerpts correspond to real source lines',()=>{
 const steps=JSON.parse(read('frontend/src/lesson/workflow.json'));assert.equal(steps.length,16);
 for(const step of steps){const lines=read(step.source).split(/\r?\n/);assert.equal(lines[step.line-1].trim(),step.code.split('\n')[0].trim(),step.source);}
 const svg=read('frontend/public/workflow.svg');assert.equal((svg.match(/<text[^>]*>\d+\./g)||[]).length,16);
 assert.match(svg,/Kubernetes Service/);assert.match(svg,/Node \/ Pod/);assert.match(svg,/fill="none" stroke=/);
});
