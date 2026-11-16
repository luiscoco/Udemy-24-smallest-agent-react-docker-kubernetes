# Docker and Kubernetes deployment

These commands are supplied for your review and execution. No image push, cluster modification, paid inference or cloud deployment occurs during implementation/setup/test/build.

## Build and inspect locally

Install Docker Desktop with the Linux engine running. Configure your own key in `backend/.env` using README.md. From this edition's root:

```powershell
docker version
docker compose config --quiet
docker build -t smallest-agent:24 .
docker compose up
```

Open http://127.0.0.1:9900. Compose runs non-root, drops capabilities, prevents privilege escalation and mounts bounded writable `/tmp` over a read-only root. Do not add `noexec` to `/tmp` without checking the SDK runtime on your target platform. Linux image installation chooses the matching native runtime rather than copying Windows node_modules. Docker `.env*` exclusions include backup/example variants. Stop Compose before port-forwarding the same host port.

## Select a local Kubernetes cluster

Enable Kubernetes in Docker Desktop or create your own kind cluster. Select the intended context explicitly before creating resources:

```powershell
kubectl config get-contexts
kubectl config current-context
# Docker Desktop example, only when this is your intended cluster:
kubectl config use-context docker-desktop
kubectl get nodes
npm run k8s:validate
```

`k8s:validate` uses bundled kubectl Kustomize rendering without contacting a cluster; it is not server schema/admission validation. Docker Desktop image-store sharing varies by configuration: verify that `smallest-agent:24` is available to its Kubernetes runtime. If not, use a registry reachable by the nodes. For kind, load the locally built image explicitly:

```powershell
kind load docker-image smallest-agent:24 --name YOUR_KIND_CLUSTER
```

The base's `imagePullPolicy: IfNotPresent` permits local images. Remote clusters must use your own reachable registry image; use immutable version tags/digests. Do not leave the teaching local tag as your production release strategy.

## Create configuration and deploy

Only the namespace is needed before the runtime Secret helper:

```powershell
kubectl apply -f k8s/base/namespace.json
npm run k8s:secret
kubectl apply --dry-run=server -k k8s/base
kubectl apply -k k8s/base
kubectl -n smallest-agent-24 rollout status deployment/smallest-agent --timeout=180s
kubectl -n smallest-agent-24 get pods,services,pdb
kubectl -n smallest-agent-24 port-forward service/smallest-agent 9900:80 --address 127.0.0.1
```

Open http://127.0.0.1:9900. The Secret helper requires a configured non-placeholder key, sends only that key through stdin to kubectl, and suppresses raw diagnostics that might contain request material. It neither writes a Secret manifest nor prints the key. Backend `.env` is not mounted into Pods. The ConfigMap contains only non-secret settings; Deployment references `claude-api` with `secretKeyRef`. Kubernetes Secrets are not automatically encrypted at rest: use cluster encryption, restricted RBAC and a reviewed external secret manager as appropriate. Secret values injected as environment variables update only when Pods restart.

For a remote registry image, review/edit the base Deployment's image before applying, or create a Kustomize overlay with an `images` replacement. Supply any required imagePullSecrets separately. Build for the cluster architecture (for example `docker buildx build --platform linux/amd64 ... --push`) and keep frontend/backend/native SDK installed for that platform. Record the resulting digest in the reviewed deployment.

JSON resources in `k8s/base` are standard Kubernetes manifests consumed by Kustomize. The namespace enforces restricted Pod Security. Pods disable service-account token mounting, run as UID/GID1000 with RuntimeDefault seccomp, drop all capabilities and have a read-only root with bounded emptyDir `/tmp`. Requests/limits are starting values; load-test actual native SDK memory, CPU and temporary disk use before sizing production. Two replicas, rolling maxUnavailable0 and minAvailable1 budget permit voluntary replacement but do not protect against node loss or guarantee distributed placement.

## Networking, streaming and external access

The base Service is ClusterIP only. No public ingress, TLS certificate, login provider or Internet exposure is created. In-cluster access is not end-user authentication. Before external use add a controlled HTTPS/auth gateway, authorization, abuse/rate controls and organization-specific network policies. Preserve Host, overwrite forwarded headers, disable SSE response buffering and set upstream/read/idle timeouts beyond the 180-second agent deadline, for example240 seconds. Enable `TRUST_PROXY=1` only behind that reviewed gateway; direct/port-forward access uses0. CORS/origin checks are not authentication.

Optional `k8s/optional/egress-policy.json` allows DNS to standard kube-system `k8s-app=kube-dns` Pods and TCP443 to public IPv4 destinations, blocking RFC1918/link-local targets. It requires a CNI that enforces NetworkPolicy; it is not included in the base because NodeLocalDNS, IPv6, cluster DNS labels and egress proxies vary. Review it for your cluster before applying. It restricts egress, not ingress; it is not an Anthropic-only hostname allowlist. Enforce provider-specific egress through a controlled proxy when required. The SDK child also receives no Kubernetes/AWS/Google credential variables, and no Kubernetes service-account token is mounted.

Startup and liveness use `/livez`; readiness uses `/readyz`. They check no model credentials and spend no credits. A configured but invalid model key can still yield ready Pods. SIGTERM changes readiness and admission before draining. Kubernetes120-second termination grace exceeds the Node110-second drain and final abort cleanup. The SDK deadline is180 seconds, so a rollout may interrupt a long run. Port-forward selects one Pod and may disconnect during replacement; rerun it. Use an actual ingress/service client and observed Pod identity if testing replica load distribution.

## Operations and rotation

```powershell
kubectl -n smallest-agent-24 logs deployment/smallest-agent --all-pods=true --tail=100
kubectl -n smallest-agent-24 describe deployment smallest-agent
# After editing backend/.env or changing ANTHROPIC_API_KEY in your environment:
npm run k8s:secret
kubectl -n smallest-agent-24 rollout restart deployment/smallest-agent
kubectl -n smallest-agent-24 rollout status deployment/smallest-agent --timeout=180s
```

Do not dump Secret values into terminals, logs or support reports. Container logs contain lifecycle messages rather than prompts or provider keys. No durable queue/session recovery is implemented. Per-Pod concurrency is2 by default, so two replicas can create up to four simultaneous runs; autoscaling multiplies provider spend and must be bounded deliberately. Check provider quota and cost controls before enabling it. Stop port-forward with Ctrl+C. Delete only this edition's namespace when deliberately cleaning up its cluster resources; namespace deletion also removes its runtime Secret.
