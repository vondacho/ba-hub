# Helm charts

Deployment charts for the ba-hub components. Following the same
monorepo-of-standalone-modules convention as dev-hub, api-hub, doc-hub and
arch-hub, **each component gets its own independent chart** — there is no
umbrella chart.

| Chart | Component | Status |
|-------|-----------|--------|
| `ba-portal/` | `ba-portal` Astro + Starlight frontend | present |
| `ba-ddd-mapper/` | `ba-ddd-mapper` context map and domain model boards | present |

`ba-ddd-monitor/` and `ba-ddd-registry/` are directories with nothing in them
yet, so neither has a chart. The day one does, it is this pair copied.

Both charts are **built from this repo**: `values-local.yaml` pins `tag: dev`
with `pullPolicy: Never`, so the image has to be built into the node's image
store first — there is nothing to pull. Neither chart ships a
`values-ghcr.yaml`, because nothing in ba-hub publishes an image yet; the
sibling repos' copies are the template for the day something does.

The ingress is enabled **by default** on both. A browser frontend nobody can
open is not a useful default, and `*.localhost` costs nothing on a local
cluster.

**There is no install order, and no dependency between the two releases.**
Neither owns a database, a volume or a Secret, and neither calls the other from
its server: every address in either ConfigMap is a link the *visitor's browser*
follows. Install either first, or only one, and nothing breaks — an address
whose release is missing is a dead link, one click at a time.

That is a stronger claim than doc-hub can make about its portal, and it is worth
saying why: `doc-portal` reads its catalog from `doc-registry` at request time
and answers 503 when it cannot. `ba-portal`'s catalog is compiled into the
image, so the portal starts, serves every page and passes its probes with the
whole rest of the family down.

**Nothing here holds state.** A context map is the `.ddd` file the visitor
exports and a domain model its `.ddm`; the mapper keeps a copy of both in the
browser's local storage and this side of it keeps neither. The one server route
in either component — `ba-ddd-mapper`'s `/api/agent` — relays to Anthropic with
the key the visitor pasted into their own browser, holds nothing between calls,
and is why neither chart has a Secret. A pod can be deleted at any moment
without losing anybody's work.

## Prerequisites

- A local Kubernetes cluster. This machine's kubeconfig has `rancher-desktop`
  as the current context.
- `helm` v3+ and `kubectl` — Rancher Desktop ships both at `~/.rd/bin/`.
- A container build tool (`docker`, or `nerdctl` when Rancher Desktop runs
  containerd — see *Build engine gotcha*).

## Deploy

```bash
./helm/ba-portal/deploy.sh
./helm/ba-ddd-mapper/deploy.sh
```

Either order. Both scripts are the same script: each builds its image with
whichever engine Rancher Desktop is configured for, installs the release into
the `ba-hub` namespace (creating it), restarts the pods onto the rebuilt image,
waits for the rollout, prints the running pods with their image IDs, and runs
`helm test`.

| Flag | Effect |
|------|--------|
| `--no-build` | Skip the image build — chart-only changes |
| `--no-test` | Skip `helm test` |

| Variable | Default |
|----------|---------|
| `NAMESPACE` | `ba-hub` |
| `RELEASE` | the chart name — `ba-portal` or `ba-ddd-mapper` |
| `IMAGE_TAG` | `dev` (must match `image.tag` in `values-local.yaml`) |

By hand, the same three steps:

```bash
# 1. build into the store the kubelet reads
cd ba-portal && docker build -t ba-portal:dev .

# 2. reconcile the release
helm upgrade --install ba-portal helm/ba-portal \
  --namespace ba-hub --create-namespace \
  -f helm/ba-portal/values-local.yaml

# 3. force the pods onto the new image
kubectl rollout restart deployment/ba-portal -n ba-hub
kubectl rollout status  deployment/ba-portal -n ba-hub --timeout=300s
```

**Why step 3 is not optional.** `values-local.yaml` pins `tag: dev` with
`pullPolicy: Never`. Rebuilding produces a new image under the *same* tag, so
the rendered Deployment is byte-identical to the one already applied —
Kubernetes sees no change and leaves the old pods running, while `helm upgrade`
still reports `STATUS: deployed` and bumps the revision. The `checksum/config`
annotation covers *ConfigMap* changes only; it does nothing for an image
rebuilt under a fixed tag.

Confirm the pod actually picked the image up rather than trusting the rollout,
and print the `DELETING` column instead of filtering on `status.phase` — a
terminating pod still reports `Running`, so for a few seconds it can still be
`items[0]` and report the *old* digest:

```bash
kubectl get pods -n ba-hub -l app.kubernetes.io/name=ba-portal \
  -o custom-columns='NAME:.metadata.name,DELETING:.metadata.deletionTimestamp,IMAGEID:.status.containerStatuses[0].imageID'
docker inspect ba-portal:dev --format '{{.Id}}'
```

## Verify

```bash
helm test ba-portal -n ba-hub
open http://ba-portal.localhost

helm test ba-ddd-mapper -n ba-hub
open http://ba-ddd-mapper.localhost
```

Rancher Desktop runs Traefik as the default IngressClass and `*.localhost`
resolves to 127.0.0.1, so both are reachable from the host with no port-forward.
With `ingress.enabled=false`:

```bash
kubectl -n ba-hub port-forward svc/ba-portal 4321:4321
kubectl -n ba-hub port-forward svc/ba-ddd-mapper 4322:4322
```

`helm test` fetches one URL per thing that can independently fail. The portal's
nine are `/healthz`, `/`, `/catalog`, `/landscapes`, `/tools`, `/academy`,
`/doc/`, one nested docs page and `/go/mapper`: a bare health check passes while
every rendered page is broken, `/landscapes` is what proves `envFrom` is wired,
`/doc/` proves the prerendered Starlight output shipped in the image, and
`/go/mapper` proves the redirect the prerendered pages depend on answers —
`--fail` accepts the 302 without following it, so this asserts nothing about
whether the mapper is installed.

The mapper's four are `/healthz`, `/`, `/model` and `/dsl` — not a thinner test,
a component with less to check. It owns no database and makes no call, so `/`
covers its whole configuration surface. `/dsl` is the one URL of the four that
is prerendered rather than server-rendered, which makes it what proves the build
output shipped and not just that the server is up.

`/api/agent` is deliberately untested. It is a POST that needs the visitor's own
Anthropic key and would spend their money; a test that called it would be
testing Anthropic.

Note what a 200 on `/` does *not* prove in either component: both the map and
the model are `client:only` React islands, so the server sends an empty island
and every node, drag, parse and export happens in the browser. The tests claim
the routes and the assets are served, and nothing more.

## Remove

```bash
./helm/ba-portal/uninstall.sh
./helm/ba-ddd-mapper/uninstall.sh

./helm/ba-portal/uninstall.sh --namespace    # and the namespace, if empty
```

Both releases are stateless, so uninstalling either takes nothing with it —
there is no volume in this repo and no Secret to keep. `--namespace` refuses
while the other release is still installed.

## Build engine gotcha

`nerdctl build` fails with `no buildkit host is available` when Rancher Desktop
is configured for **moby** rather than containerd. `deploy.sh` reads the setting
and picks the right command; to check by hand:

```bash
grep -o '"name":"[a-z]*"' ~/Library/Preferences/rancher-desktop/settings.json
```

`moby` means `docker build`; `containerd` means `nerdctl --namespace k8s.io
build`. This machine currently reports `moby`.

## Ports

`ba-portal` is on **4321**, the port every hub's portal uses. `ba-ddd-mapper`
took **4322**, the same slot `doc-sm` took in doc-hub. Each release has its own
Service, so nothing would collide if they shared a number — the numbering is for
the person reading, and for the port-forwards above.

The number lives in `containerPort` and is injected as `PORT`, so the chart
overrides whatever the Dockerfile's `ENV PORT` says. Both are kept in step
anyway: a Dockerfile whose `EXPOSE` disagrees with the chart is a trap for
whoever runs the image outside Kubernetes.

## Notes on the ba-portal chart

- **Two rendering modes in one image.** `output: 'server'` with `@astrojs/node`
  in standalone mode, *except* the Starlight pages under `/doc/*`, which are
  `prerender: true` — documentation is prose, and Pagefind builds its search
  index from the emitted HTML, which Starlight refuses to do when prerendering
  is off. The build step therefore also runs Pagefind and writes the index into
  `dist/client/pagefind`.
- **That split is the whole reason `/go/*` exists.** A prerendered page calling
  `archPortalUrl()` would resolve it on the *build machine* and bake the answer
  into the image, leaving `ARCH_PORTAL_URL` in this chart silently doing
  nothing. So the docs link to `/go/arch` — server-rendered, resolved per
  request, 302 rather than 301 because these addresses are configuration and a
  browser that cached a permanent redirect would follow the old one long after
  the value changed. The portal's own pages skip the hop.
- **Seven config knobs, all browser-facing**, rendered into a ConfigMap and
  injected with `envFrom`. `src/lib/links.ts` reads each through `process.env`
  at call time and falls back to the same default the chart ships, so an unset
  value and the default look identical in the page — override one to something
  obviously wrong if you ever need to prove the wiring works.

  | Key | Points at |
  |-----|-----------|
  | `ARCH_PORTAL_URL` | arch-hub's portal — the architecture a context is realised in |
  | `API_PORTAL_URL` | api-hub's portal — the contracts an integration runs over |
  | `DEV_PORTAL_URL` | dev-hub's portal — how an agreed model gets implemented |
  | `QA_PORTAL_URL` | qa-hub's portal — the test strategy the criteria feed |
  | `EVENT_STORMER_URL` | doc-hub's `doc-es` — where a domain is discovered |
  | `DDD_MAPPER_URL` | this repo's `ba-ddd-mapper` release |
  | `LANDSCAPE_API_URL` | the landscape collector — nothing serves this yet |

- **`DDD_MAPPER_URL` is an ingress host even though the mapper is one Service
  name away.** doc-portal's `REGISTRY_API_URL` is an in-cluster address because
  the *portal's own process* fetches it while rendering; this one is a link the
  visitor's browser follows, and a Service name would resolve only inside the
  cluster. `src/lib/links.ts` still defaults to `http://ddd-mapper.localhost`,
  which predates the chart — the chart names the release and is the authority.
- **There is no in-cluster call in this chart at all**, which is why there is no
  second entry for anything the way doc-portal needs two for its CMS.
- Probes hit `/healthz`, served by `ba-portal/src/pages/healthz.ts`.
- `readOnlyRootFilesystem: true` with `emptyDir`s at `/tmp` and
  `/app/node_modules/.astro`. `@astrojs/node` bakes that session path into the
  bundle at build time and creates it lazily. Nothing in the portal uses
  `Astro.session` today, so the mount is insurance: without it, the first page
  that ever does would fail in the cluster and nowhere else.
- The pod runs as **uid/gid 10001**, matching the `app` user in the Dockerfile.
  1000 is deliberately avoided — the `node` base image already uses it.

## Notes on the ba-ddd-mapper chart

`ba-ddd-mapper` is the modelling tool: a context map on `/`, the domain model
behind one bounded context on `/model`, read from and written to `.ddd` and
`.ddm` files.

- **It has no data and no dependency.** No database, no volume, no Secret, and
  no in-cluster call — its ConfigMap is three browser-facing links and nothing
  else. Install it before or after everything else; the only thing a missing
  neighbour costs is a dead link in the footer.
- **The assistant does not change that.** `/api/agent` is a relay: the visitor's
  Anthropic key travels on the request from their own browser, is used once, and
  is never written down. The route stores nothing and has no state between
  calls, which is what keeps the footer's claim about the server true — and is
  why the key is not a chart value. Putting one here would move a personal
  credential into a cluster and bill it to whoever deployed the release.
- **Two hydrated components**, `<DddMapper client:only>` and the model editor.
  The pages around them are server-rendered so their footers can resolve the
  configured addresses per request; `/dsl` and `/404` are prerendered, and say
  so with a `prerender` export rather than a comment.
- **The two `emptyDir`s are pure insurance here.** `readOnlyRootFilesystem:
  true` is on, and `/tmp` plus `/app/node_modules/.astro` are mounted exactly as
  in `ba-portal`, because the Astro node adapter bakes a session path in at
  build time. The mapper uses no sessions and writes nothing at run time; the
  mounts are there so the day it does is not a deployment incident.

## Chart layout

Both charts have the same shape, and it is `doc-hub/helm/doc-sm`'s shape with a
different ConfigMap:

```
ba-portal/                      ba-ddd-mapper/
  Chart.yaml                      Chart.yaml
  values.yaml                     values.yaml                # defaults
  values-local.yaml               values-local.yaml          # local overrides
  deploy.sh                       deploy.sh                  # build + upgrade + test
  uninstall.sh                    uninstall.sh
  templates/                      templates/
    _helpers.tpl                    _helpers.tpl
    configmap.yaml                  configmap.yaml           # app config, injected with envFrom
    deployment.yaml                 deployment.yaml
    service.yaml                    service.yaml
    serviceaccount.yaml             serviceaccount.yaml
    ingress.yaml                    ingress.yaml
    NOTES.txt                       NOTES.txt
    tests/test-connection.yaml      tests/test-connection.yaml
```

No `secret.yaml` and no `statefulset.yaml` in either column, and no
`volumeClaimTemplate` anywhere in this repo. Both releases are stateless, so
`replicaCount` is free to move in both.
