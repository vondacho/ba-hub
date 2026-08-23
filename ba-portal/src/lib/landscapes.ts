/**
 * The two landscapes, defined once.
 *
 * A **context map** is intent: how the bounded contexts are *supposed* to
 * relate, in the vocabulary of the strategic patterns — who is upstream, who
 * conforms, where the anticorruption layer is, what is published.
 *
 * A **system map** is reality: which running systems actually talk to which,
 * over what, observed rather than asserted.
 *
 * Keeping them as two datasets rather than one is the point of this file. A
 * context map on its own is a wish; a system map on its own is a network
 * diagram. The value is in the third table — the edges that exist in one and
 * not the other, which is what `conformance` below records.
 *
 * The contents are the seed example from src/lib/catalog.ts. Replace both
 * together: an edge naming a context that is not in the catalog is a bug this
 * file cannot catch for you.
 */

import { contexts } from './catalog';

/**
 * The strategic relationship patterns. The names are Evans's, and using them
 * exactly is worth more than it looks: "customer/supplier" and "conformist"
 * describe the same arrow and differ only in whether the downstream team has
 * any negotiating power, which is a political fact that a generic "depends on"
 * arrow hides.
 */
export type RelationshipPattern =
	| 'Partnership'
	| 'Shared kernel'
	| 'Customer/supplier'
	| 'Conformist'
	| 'Anticorruption layer'
	| 'Open host service'
	| 'Published language'
	| 'Separate ways'
	| 'Big ball of mud';

/** An edge on the context map: intended, not observed. */
export interface ContextRelationship {
	/** Context slug the model flows *from*. */
	upstream: string;
	/** Context slug the model flows *to*. */
	downstream: string;
	pattern: RelationshipPattern;
	/** What actually crosses the boundary. */
	exchange: string;
	/** Why this pattern and not the neighbouring one. */
	rationale: string;
}

/** An edge on the system map: observed, with the evidence that observed it. */
export interface SystemIntegration {
	from: string;
	to: string;
	/** How they talk. The mechanism, not the meaning. */
	transport: string;
	/** What the collector saw. Should be checkable by someone else. */
	evidence: string;
	/** The context relationship this is supposed to realise, if any. */
	realises?: { upstream: string; downstream: string };
	/**
	 * Whether it does.
	 *   matches      — the integration realises its relationship as designed
	 *   drifts       — it realises it, badly or partly
	 *   unmapped     — a real integration with no relationship behind it
	 *   missing      — a relationship on the map with nothing implementing it
	 */
	verdict: 'matches' | 'drifts' | 'unmapped' | 'missing';
	/** Only for drifts / unmapped / missing: what to do about it. */
	finding?: string;
}

export const relationships: readonly ContextRelationship[] = [
	{
		upstream: 'product-catalogue',
		downstream: 'rating',
		pattern: 'Open host service',
		exchange: 'Versioned product definitions: covers, limits, exclusions and their compatibility rules.',
		rationale:
			'Product is consumed by five contexts with no two wanting the same shape. One published interface serving all of them is cheaper than five bespoke integrations, and it forces product to keep its language stable.',
	},
	{
		upstream: 'product-catalogue',
		downstream: 'quote',
		pattern: 'Open host service',
		exchange: 'The same versioned product definitions, pinned to the version a quote was made against.',
		rationale:
			'A quote has to remain explicable after the product changes, so the version is part of what crosses the boundary rather than something resolved at read time.',
	},
	{
		upstream: 'risk-appetite',
		downstream: 'quote',
		pattern: 'Customer/supplier',
		exchange: 'An accepted Risk with its terms and any referral conditions attached.',
		rationale:
			'Both teams sit under the same director, so quotation can genuinely ask for a change to the upstream model and get it. That is what makes this customer/supplier rather than conformist.',
	},
	{
		upstream: 'rating',
		downstream: 'quote',
		pattern: 'Published language',
		exchange: 'A technical price with its rating factor breakdown and the rate table version used.',
		rationale:
			'The breakdown is read by quotation, by the regulator, and by the actuarial review. A published schema is the only version of this that survives three audiences.',
	},
	{
		upstream: 'quote',
		downstream: 'policy-lifecycle',
		pattern: 'Customer/supplier',
		exchange: 'An accepted offer, which becomes an inception.',
		rationale:
			'The handover where a commitment becomes an obligation. Policy administration is downstream and says so, but has a real say in the shape of what it receives.',
	},
	{
		upstream: 'policy-lifecycle',
		downstream: 'claims',
		pattern: 'Anticorruption layer',
		exchange:
			'A cover snapshot as at the date of loss — deliberately not the live policy.',
		rationale:
			'Claims must never see a policy change made after the loss. The layer exists to make that impossible rather than to make it unlikely, and it is currently the most-violated rule in the estate.',
	},
	{
		upstream: 'party',
		downstream: 'policy-lifecycle',
		pattern: 'Shared kernel',
		exchange: 'Party identity and the roles a party plays on a policy.',
		rationale:
			'A shared kernel because both contexts write to the same notion of identity and neither can be made downstream of the other without a lie. It is the most expensive pattern on this map and it is chosen knowingly.',
	},
	{
		upstream: 'policy-lifecycle',
		downstream: 'billing',
		pattern: 'Conformist',
		exchange: 'Premium due, instalment plan, and any mid-term adjustment.',
		rationale:
			'The billing package will not change its model for us and we will not fork it, so downstream conforms. Recorded honestly as conformist rather than dressed up as customer/supplier.',
	},
	{
		upstream: 'claims',
		downstream: 'billing',
		pattern: 'Conformist',
		exchange: 'Settlement payments and recoveries.',
		rationale: 'Same package, same trade-off.',
	},
	{
		upstream: 'policy-lifecycle',
		downstream: 'documents',
		pattern: 'Anticorruption layer',
		exchange: 'A render request: template identifier plus a payload in our language.',
		rationale:
			'The vendor template vocabulary is not ours and must not become ours. The adapter is small, boring and owned by us.',
	},
	{
		upstream: 'risk-appetite',
		downstream: 'rating',
		pattern: 'Partnership',
		exchange: 'Appetite signals that change the price, and prices that change the appetite.',
		rationale:
			'The only genuine partnership on the map: neither side can succeed if the other fails, and the two models are changed in the same conversation. Both report to a joint monthly review.',
	},
];

export const integrations: readonly SystemIntegration[] = [
	{
		from: 'product-service',
		to: 'rating-engine',
		transport: 'HTTP, versioned REST resources',
		evidence: 'Continuous request traffic; every call carries an explicit product version.',
		realises: { upstream: 'product-catalogue', downstream: 'rating' },
		verdict: 'matches',
	},
	{
		from: 'product-service',
		to: 'uw-workbench',
		transport: 'HTTP, versioned REST resources',
		evidence: 'Same interface as rating-engine consumes; no bespoke endpoints observed.',
		realises: { upstream: 'product-catalogue', downstream: 'quote' },
		verdict: 'matches',
	},
	{
		from: 'rating-engine',
		to: 'uw-workbench',
		transport: 'HTTP, published JSON schema',
		evidence: 'Schema in the registry matches the payloads on the wire; no undeclared fields.',
		realises: { upstream: 'rating', downstream: 'quote' },
		verdict: 'matches',
	},
	{
		from: 'uw-workbench',
		to: 'policy-service',
		transport: 'Domain events on the broker',
		evidence: 'OfferAccepted consumed within seconds; inception created downstream.',
		realises: { upstream: 'quote', downstream: 'policy-lifecycle' },
		verdict: 'matches',
	},
	{
		from: 'legacy-policy-master',
		to: 'claims-platform',
		transport: 'Shared database schema, direct reads',
		evidence:
			'Claims queries the live policy tables 40,000 times a day. No snapshot table exists and no read is date-qualified.',
		realises: { upstream: 'policy-lifecycle', downstream: 'claims' },
		verdict: 'drifts',
		finding:
			'The anticorruption layer this relationship depends on has never been built. A mid-term endorsement silently changes the cover an open claim is assessed against. Highest-value fix in the estate: materialise a cover snapshot at notification and read only that.',
	},
	{
		from: 'legacy-policy-master',
		to: 'uw-workbench',
		transport: 'Database link, direct reads of the appetite tables',
		evidence:
			'A nightly renewal batch reads appetite rules straight out of the underwriting schema, bypassing the service.',
		verdict: 'unmapped',
		finding:
			'No relationship on the context map corresponds to this. Either the renewal pre-screen belongs to Risk appetite and should be asking for it properly, or the appetite rules belong to Policy lifecycle. Deciding is a modelling question, not an integration one.',
	},
	{
		from: 'crm',
		to: 'legacy-policy-master',
		transport: 'Nightly CSV export',
		evidence:
			'Party records exported and matched on name and postcode. Match rate observed at 87%.',
		realises: { upstream: 'party', downstream: 'policy-lifecycle' },
		verdict: 'drifts',
		finding:
			'A shared kernel implemented as an overnight fuzzy match is not a shared kernel. Either promote party identity to a real shared model with one identifier, or accept separate ways and stop pretending the two sides agree.',
	},
	{
		from: 'policy-service',
		to: 'billing-saas',
		transport: 'HTTP, vendor API behind our adapter',
		evidence: 'All calls pass through the adapter; no vendor vocabulary observed upstream of it.',
		realises: { upstream: 'policy-lifecycle', downstream: 'billing' },
		verdict: 'matches',
	},
	{
		from: 'claims-platform',
		to: 'billing-saas',
		transport: 'HTTP, vendor API, called directly',
		evidence: 'Vendor field names appear in claims-platform source. The adapter is bypassed.',
		realises: { upstream: 'claims', downstream: 'billing' },
		verdict: 'drifts',
		finding:
			'Conformist is the agreed pattern, so conforming is not the problem — bypassing the shared adapter is. The vendor vocabulary is now inside a core context, and a vendor upgrade becomes a core-domain change.',
	},
	{
		from: 'policy-service',
		to: 'doc-gen',
		transport: 'HTTP, adapter owned by us',
		evidence: 'Nothing is collecting from doc-gen; this edge is asserted rather than observed.',
		realises: { upstream: 'policy-lifecycle', downstream: 'documents' },
		verdict: 'missing',
		finding:
			'Not a defect — an observability gap. Until the collector covers doc-gen, this row is somebody’s memory, and the conformance column for Documents stays "unknown".',
	},
	{
		from: 'uw-workbench',
		to: 'rating-engine',
		transport: 'HTTP, synchronous',
		evidence: 'Bidirectional traffic with rating-engine calling back for appetite context.',
		realises: { upstream: 'risk-appetite', downstream: 'rating' },
		verdict: 'matches',
	},
];

/** Context relationships with no integration claiming to realise them. */
export const unrealisedRelationships = relationships.filter(
	(relationship) =>
		!integrations.some(
			(integration) =>
				integration.realises?.upstream === relationship.upstream &&
				integration.realises?.downstream === relationship.downstream,
		),
);

export const landscapeCounts = {
	relationships: relationships.length,
	integrations: integrations.length,
	matches: integrations.filter((i) => i.verdict === 'matches').length,
	findings: integrations.filter((i) => i.verdict !== 'matches').length,
	unmapped: integrations.filter((i) => i.verdict === 'unmapped').length,
	unrealised: unrealisedRelationships.length,
	/** Contexts appearing on the map at all, against the catalog total. */
	mappedContexts: new Set(relationships.flatMap((r) => [r.upstream, r.downstream])).size,
	catalogContexts: contexts.length,
} as const;

/** Display name for a context slug, so tables never print a slug at a reader. */
export function contextName(slug: string): string {
	return contexts.find((context) => context.slug === slug)?.name ?? slug;
}
