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

/**
 * ba-portal's prompt page — the canonical set, by role, across every board.
 *
 * The assistant panel carries this notation's prompts inline; this is where the
 * reasoning behind them lives, and the other boards' sets with it.
 */
export function promptsUrl(): string {
  return `${baPortalUrl()}/doc/tooling/prompts/`;
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

/**
 * The model page, for one bounded context.
 *
 * Internal rather than a neighbouring component, and here anyway because this
 * is where the addresses live. The context travels in the query string because
 * it is the *name* — the identity in both formats — and not an id: a link that
 * survives being pasted into a message is worth more than a shorter one.
 */
export function modelHref(context: string): string {
  return `/model?context=${encodeURIComponent(context)}`;
}

/**
 * The map page, for one map.
 *
 * `modelHref`'s twin, and it takes the same liberty: the value may be the
 * document's name or the stem its keys were built from, because slugging a stem
 * yields the stem. The store panel has stems and the map has titles, and this
 * lets neither of them care.
 */
export function mapHref(title: string): string {
  return `/?map=${encodeURIComponent(title)}`;
}
