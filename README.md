# The Smallest Agent — React + Docker + Kubernetes

Edition 24 is the complete teaching application: five working lesson sections, retained prompt/results, Stream/Simple modes, cancellation, partial answers, safe message timeline, metrics, copy/Markdown download, persistent light/dark themes, large text, pastel cards and 16 source-linked UML explanations with syntax-colored code.

React + TypeScript runs in the browser. Node.js 24 runs the real official Claude Agent SDK and its bundled CLI. One Docker image serves compiled React and the API on the same origin. Kubernetes runs that image in two Pods behind a private ClusterIP Service. Docker and Kubernetes are packaging/orchestration layers, not alternative Claude SDKs.

## Run in Windows Terminal / PowerShell

Install Node.js 24. Docker Desktop and kubectl are optional for local Node development.

From **Lesson 0**:

```powershell
cd .\24-smallest-agent-react-docker-kubernetes
npm ci
npm run setup
notepad backend\.env
```

Set your own `ANTHROPIC_API_KEY`, save, then run:

```powershell
npm run dev
```

Wait for Vite and open **http://127.0.0.1:6700**. API reference: **http://127.0.0.1:9900/api/docs**. Setup installs the locked frontend/backend dependencies, creates a placeholder `.env` only if absent and regenerates the lesson. Existing configuration is preserved; keys from other editions are never copied. Ctrl+C stops the launcher's owned child processes. Separate terminals can run `npm run dev:backend` and `npm run dev:frontend` from this edition's root.

## Configure the server

Only `backend/.env` contains private configuration:

```dotenv
ANTHROPIC_API_KEY=sk-ant-replace-with-your-key
CLAUDE_MODEL=
AGENT_SYSTEM_PROMPT=You are a concise teaching assistant.
AGENT_MAX_TURNS=1
AGENT_MAX_CONCURRENT_REQUESTS=2
API_HOST=127.0.0.1
API_PORT=9900
TRUST_PROXY=0
```

Environment variables override the module-relative file. Blank model uses the SDK default; any override must be available to your account. Turns accept 1–10; concurrency accepts 1–8 per process. Restart after edits. Keep `TRUST_PROXY=0` for direct/local/port-forward access. Only enable it behind a controlled HTTPS proxy that preserves Host and overwrites forwarded headers. React defaults to same-origin API calls. Its optional build-time `VITE_API_BASE_URL` is public; never put keys in any `VITE_` variable.

Health reports key presence, not provider authentication, credits or model access. `/livez` and `/readyz` make no provider calls. Submitted prompts may use API credits. The local/private demo has no end-user login.

## Test and production build

```powershell
npm run typecheck
npm test
npm run build
npm start
```

Stop development first. Production serves UI/API together at **http://127.0.0.1:9900**. `npm start` does not rebuild. Tests inject SDK iterators and do not call Claude. With production running using a placeholder key:

```powershell
npm run verify:http
$env:VERIFY_BASE_URL='http://127.0.0.1:9900'
npm run verify:browser
Remove-Item Env:VERIFY_BASE_URL
```

Chrome verification requires installed Google Chrome. Screenshots go to ignored `verification/`.

## Docker

Start Docker Desktop with Linux containers:

```powershell
docker compose up --build
```

Open **http://127.0.0.1:9900**. Compose injects `backend/.env` at runtime. The image runs non-root with a read-only root filesystem and bounded writable `/tmp`. Stop with Ctrl+C, then `docker compose down`. Do not run Node production and Compose on the same port. The multi-stage image installs dependencies inside Linux, including the target-platform native SDK runtime. No key is a build argument or image layer.

## Kubernetes

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete Docker Desktop/kind instructions, image loading, runtime Secret creation and rollout checks. The short path after the image is available in your selected local cluster is:

```powershell
kubectl apply -f k8s/base/namespace.json
npm run k8s:secret
kubectl apply -k k8s/base
kubectl -n smallest-agent-24 rollout status deployment/smallest-agent --timeout=180s
kubectl -n smallest-agent-24 port-forward service/smallest-agent 9900:80 --address 127.0.0.1
```

Open **http://127.0.0.1:9900**. Port-forward selects one Pod; reconnect if it is replaced. It is a development access method, not a public ingress or a load-balancing test. No Kubernetes command runs during npm setup/test/build. The Secret helper sends only your model key through stdin without printing it or putting it in process arguments. It operates on your current kubectl context only when explicitly invoked.

## Architecture and boundaries

React → Kubernetes Service → Node Docker Pod → Claude Agent SDK/CLI → Claude API. Local Vite skips the cluster hop. Each request has bounded turns, a 180-second agent deadline, fresh work/home/config directories and no tools, settings, skills, MCP, plugins or persisted session. Only selected text/lifecycle fields and final metrics reach React; thinking, paths, tool payloads and session IDs are omitted. Unreported cost stays null. SSE has 15-second heartbeats, real flushing/backpressure, disconnect cancellation and error-without-done semantics. Busy Pods reject with429 before launching another agent.

SIGTERM marks readiness false and rejects new work, drains existing requests for up to110 seconds, then aborts stuck work before the120-second container grace ends. A long run can be interrupted by rollout or Pod/node loss; there is no durable job storage or automatic paid-request replay. Two replicas and a disruption budget help availability, not session durability.

Source: `frontend/src/`, `backend/src/`, `k8s/base/` and `scripts/generate-lesson.mjs`. The generator extracts 16 actual source excerpts, file paths and line numbers, then emits explicit-attribute SVG and editable PlantUML. It fails on missing markers. `BUILD-PROMPT.txt` and the separate Lesson 0 prompt are identical reusable instructions. The course artwork is reused from prior local editions; no new license claim is made.

Official references: [Agent SDK TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript), [Kubernetes probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/), [Secrets](https://kubernetes.io/docs/concepts/configuration/secret/), [NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/network-policies/).

See [VERIFICATION.md](VERIFICATION.md) for checks actually run and remaining environment limits.
