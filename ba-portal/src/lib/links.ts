/**
 * Addresses of the neighbouring hubs and of the services this portal fronts.
 *
 * Read at call time rather than at module load, matching the sibling portals'
 * copies of this file: a chart injects the value as an env var, so it only
 * exists in the running container, while `import.meta.env` covers the dev
 * server reading a .env file.
 *
 * The defaults are the Traefik ingress hosts each component's
 * `values-local.yaml` enables on a local cluster.
 *
 * These are **browser-facing links, not in-cluster calls**: the visitor's
 * browser resolves them, so an in-cluster address like http://arch-portal:4321
 * would be wrong even though this portal is server-rendered — and doubly wrong,
 * because each hub is a separate release in its own namespace.
 *
 * None of them may be called from a prerendered page — see src/pages/go/.
 */

/** arch-hub's portal: the architecture the bounded contexts are realised in. */
export function archPortalUrl(): string {
  return (
    process.env.ARCH_PORTAL_URL ??
    import.meta.env.ARCH_PORTAL_URL ??
    'http://arch-portal.localhost'
  );
}

/** api-hub's portal: the published contracts a context integration runs over. */
export function apiPortalUrl(): string {
  return (
    process.env.API_PORTAL_URL ??
    import.meta.env.API_PORTAL_URL ??
    'http://api-portal.localhost'
  );
}

/** dev-hub's portal: how a model gets implemented once it has been agreed. */
export function devPortalUrl(): string {
  return (
    process.env.DEV_PORTAL_URL ??
    import.meta.env.DEV_PORTAL_URL ??
    'http://dev-portal.localhost'
  );
}

/** qa-hub's portal: the test strategy the acceptance criteria feed. */
export function qaPortalUrl(): string {
  return (
    process.env.QA_PORTAL_URL ??
    import.meta.env.QA_PORTAL_URL ??
    'http://qa-portal.localhost'
  );
}

/**
 * doc-hub's event storming board: the workshop surface a domain is discovered
 * on, and the one tool in this hub's toolbox that already exists.
 *
 * Unlike the addresses below it, something is deployed here — which is why the
 * Event Stormer panel is `live` while the rest are `planned`.
 */
export function eventStormerUrl(): string {
  return (
    process.env.EVENT_STORMER_URL ??
    import.meta.env.EVENT_STORMER_URL ??
    'http://doc-es.localhost'
  );
}

/**
 * The DDD mapper: the modelling tool that reads the catalog, draws the context
 * map, and reconciles it against what the running systems actually do.
 *
 * Nothing is deployed behind this yet, which is why every panel pointing at it
 * is marked `planned` rather than `live`. The address exists now so that the
 * day one is deployed, it takes a value change and a restart rather than a
 * rebuild.
 */
export function dddMapperUrl(): string {
  return (
    process.env.DDD_MAPPER_URL ??
    import.meta.env.DDD_MAPPER_URL ??
    'http://ddd-mapper.localhost'
  );
}

/**
 * The landscape collector: the service that observes running systems — traffic
 * between services, schema shapes, event topics — and produces the evidence the
 * system map is drawn from.
 *
 * Also not deployed. See the caveat on `dddMapperUrl`.
 */
export function landscapeApiUrl(): string {
  return (
    process.env.LANDSCAPE_API_URL ??
    import.meta.env.LANDSCAPE_API_URL ??
    'http://landscape-api.localhost'
  );
}
