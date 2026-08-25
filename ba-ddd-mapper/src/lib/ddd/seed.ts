/**
 * A fresh map: the smallest thing that is already a map.
 *
 * One domain and nothing else. Not an empty `map { }`, because an empty canvas
 * is what the visitor just pressed a button to leave — and not a scaffold of
 * subdomains and contexts either, because inventing three names on somebody's
 * behalf makes their first act a deletion. One box, which they rename, and the
 * toolbar adds the rest.
 *
 * The warnings it opens with are deliberate, and they are the same argument the
 * sample makes: a domain with no owner and no subdomain is exactly what the
 * problems panel exists to say out loud, and a first map that says nothing
 * teaches nothing.
 */
export function freshMap(): string {
	return `// A new context map.
//
// Rename the domain, then add the subdomains it divides into and the bounded
// contexts that serve them. The panel below says what is still missing.

map "New map" {

  domain "New domain" {
  }
}
`;
}
