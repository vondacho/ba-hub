/**
 * Addresses of the neighbouring components.
 *
 * Read at call time rather than at module load, matching every other component
 * in the family: a chart injects the value as an env var, so it only exists in
 * the running container, while `import.meta.env` covers the dev server reading
 * a .env file.
 *
 * All three are **browser-facing links, not in-cluster calls** — the visitor's
 * browser resolves them — and none may be called from a prerendered page. `/`
 * is server-rendered, which is why its footer can resolve them directly; `/dsl`
 * is prerendered and links to `/` instead of out.
 */

/** ba-portal: the practice this tool serves. */
export function baPortalUrl(): string {
  return (
    process.env.BA_PORTAL_URL ??
    import.meta.env.BA_PORTAL_URL ??
    'http://ba-portal.localhost'
  );
}

/** doc-es: the board the contexts on a map were usually found on. */
export function eventStormerUrl(): string {
  return (
    process.env.EVENT_STORMER_URL ??
    import.meta.env.EVENT_STORMER_URL ??
    'http://doc-es.localhost'
  );
}

/** arch-hub's portal: where a bounded context gets realised as components. */
export function archPortalUrl(): string {
  return (
    process.env.ARCH_PORTAL_URL ??
    import.meta.env.ARCH_PORTAL_URL ??
    'http://arch-portal.localhost'
  );
}
