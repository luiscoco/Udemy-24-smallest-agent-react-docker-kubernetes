# Verification record

Passed locally: 26 Node/backend tests, 20 React tests and six infrastructure checks (52 total), TypeScript checks and the production build. The development runner was updated to tsx4.23.15; the resulting locked backend install and frontend install report zero audit findings.

Production HTTP checks passed compiled React/JS assets, health/probes, input/origin boundaries, missing-key query503 and SSE error without done, docs/schema, UML and hidden/unknown route404. Installed Chrome passed all five sections, retained prompt, missing-key feedback,16 colored source cards, complete SVG, persistent theme and390px layouts without page overflow or JavaScript errors.

The combined development launcher and Vite proxy passed the same Chrome checks. Repeating the documented setup preserved the existing backend environment file byte-for-byte. The reusable root prompt and BUILD-PROMPT.txt are identical. The final build regenerated all16 excerpts and UML assets, and all six infrastructure checks passed again.

Kustomize rendering and Docker Compose syntax checks passed. Docker's Linux engine was unavailable, so image build/execution, server admission/dry-run and Kubernetes cluster execution remain untested. No image push, cloud deployment, paid Claude inference or real provider authentication was performed. Unit/integration tests inject SDK iterators; HTTP/Chrome checks require a placeholder key.

Reproduce: `npm ci`, `npm run setup`, `npm run typecheck`, `npm test`, `npm run build`. Start production with a placeholder key, then run `npm run verify:http` and `npm run verify:browser` with `VERIFY_BASE_URL=http://127.0.0.1:9900`. Browser verification requires installed Chrome and writes ignored screenshots.

Kubernetes checks inspect linked selectors/ports, runtime-secret references, non-root filesystem/temp boundaries, probes, resources, rollout/disruption settings and source-linked lesson excerpts. `npm run k8s:validate` renders Kustomize; it does not prove server admission or cluster execution. Container/cluster execution results will be recorded separately from local checks.
