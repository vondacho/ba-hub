/**
 * The catalog, defined once.
 *
 * Four kinds of thing, and the distinction between them is the whole point:
 *
 *   domain      — the business as a whole. There is one.
 *   subdomain   — a *problem*: a part of the business with its own reason to
 *                 exist, classified core / supporting / generic. Subdomains are
 *                 discovered, not designed; you do not get to choose them.
 *   context     — a *solution*: a boundary inside which one model holds and one
 *                 language means one thing. Contexts are designed, and the
 *                 mapping to subdomains is deliberately not forced to be 1:1 —
 *                 where it is not, that is a finding worth reading.
 *   realisation — a running system, and what it actually does to a context.
 *                 This is the half nobody keeps: a catalogue of intent that is
 *                 never checked against the estate is a diagram, not a model.
 *
 * The contents below are the **seed example** — an insurance carrier, because
 * it is the canonical domain in the literature and its core/supporting/generic
 * split is unusually crisp. Replace it with your own; the shapes are what this
 * file is for.
 */

/**
 * Why the business is in this part of the business.
 *
 *   core       — the reason it exists and the reason it wins. Modelled deeply,
 *                built in house, staffed with the people you cannot replace.
 *   supporting — necessary, specific to you, and not a differentiator. Build it
 *                simply, or buy and adapt.
 *   generic    — a solved problem someone else sells. Buy it, wrap it, and
 *                spend the modelling effort somewhere it changes an outcome.
 */
export type SubdomainType = 'core' | 'supporting' | 'generic';

/** How far the model has actually been taken, not how important it is. */
export type ModelStatus =
	/** Aggregates, invariants and language agreed and written down. */
	| 'modelled'
	/** A boundary and a name, and a first pass at the language. */
	| 'drafted'
	/** Named because something has to be, and nothing more. */
	| 'unmodelled';

/**
 * What the estate says about the model, from the landscape evidence.
 *
 *   aligned  — the running systems respect the boundary
 *   drifting — they mostly do, with named exceptions
 *   breached — a boundary that exists on paper only
 *   unknown  — nothing is observing it yet
 */
export type Conformance = 'aligned' | 'drifting' | 'breached' | 'unknown';

/** What a running system does to a bounded context. */
export interface Realisation {
	system: string;
	role:
		| 'implements'
		| 'partially implements'
		| 'shares a database with'
		| 'reaches into'
		| 'is bought for';
	/** The specific thing observed, not a category. Keep it falsifiable. */
	note: string;
}

export interface BoundedContext {
	slug: string;
	name: string;
	/** The subdomain this context serves. */
	subdomain: string;
	/** What one model means inside this boundary and nowhere else. */
	summary: string;
	/** The terms that mean something different here than next door. */
	language: readonly string[];
	/** The consistency boundaries inside it. Empty for a context bought whole. */
	aggregates: readonly string[];
	/** A person or team who answers for the language, never "the architects". */
	owner: string;
	status: ModelStatus;
	conformance: Conformance;
	realisations: readonly Realisation[];
}

export interface Subdomain {
	slug: string;
	name: string;
	type: SubdomainType;
	summary: string;
}

export interface Domain {
	name: string;
	summary: string;
}

export const domain: Domain = {
	name: 'Personal and commercial insurance',
	summary:
		'Underwrite risk, price it, collect premium for it, and pay what is owed when it materialises. Everything else in the estate exists to make one of those four things possible.',
};

export const subdomains: readonly Subdomain[] = [
	{
		slug: 'underwriting',
		name: 'Underwriting',
		type: 'core',
		summary:
			'Deciding which risks to accept and on what terms. The judgement here is the business — an underwriter who is right more often than the market is the entire competitive position.',
	},
	{
		slug: 'pricing',
		name: 'Pricing and rating',
		type: 'core',
		summary:
			'Turning an accepted risk into a number. Distinct from underwriting because the appetite question and the price question have different owners, different data and different regulators.',
	},
	{
		slug: 'claims',
		name: 'Claims handling',
		type: 'core',
		summary:
			'Establishing what is owed and paying it. The only part of the business the customer experiences at the moment it matters, and the only place a mispriced book becomes visible.',
	},
	{
		slug: 'policy-admin',
		name: 'Policy administration',
		type: 'supporting',
		summary:
			'Keeping a policy correct through its life: endorsements, renewals, cancellations, reinstatements. Specific to us, necessary, and not a reason anyone buys from us.',
	},
	{
		slug: 'distribution',
		name: 'Distribution and party management',
		type: 'supporting',
		summary:
			'Who we deal with and through whom — brokers, agents, policyholders, beneficiaries — and the commission that follows. Necessary, and unusually good at hiding a modelling problem behind the word "customer".',
	},
	{
		slug: 'product',
		name: 'Product definition',
		type: 'supporting',
		summary:
			'What a product is: covers, limits, exclusions, wordings, and the rules for combining them. Built in house because the products change faster than any vendor release cycle.',
	},
	{
		slug: 'billing',
		name: 'Billing and collections',
		type: 'generic',
		summary:
			'Invoicing, instalments, dunning, reconciliation. Nobody has ever chosen an insurer for its direct debit handling.',
	},
	{
		slug: 'documents',
		name: 'Document generation',
		type: 'generic',
		summary:
			'Producing the schedule, the certificate and the letter, in the format the regulator expects. A solved problem with a mature market.',
	},
	{
		slug: 'notifications',
		name: 'Notifications',
		type: 'generic',
		summary:
			'Email, SMS and postal dispatch with delivery evidence. Bought, wrapped, and deliberately not modelled.',
	},
];

export const contexts: readonly BoundedContext[] = [
	{
		slug: 'risk-appetite',
		name: 'Risk appetite',
		subdomain: 'underwriting',
		summary:
			'Where a submission is judged against what the carrier is currently willing to take on. A Risk here is a described exposure under consideration — it is not yet anything anyone is on cover for.',
		language: ['Submission', 'Risk', 'Appetite rule', 'Referral', 'Decline reason'],
		aggregates: ['Submission', 'AppetiteRuleSet', 'Referral'],
		owner: 'Head of underwriting',
		status: 'modelled',
		conformance: 'drifting',
		realisations: [
			{
				system: 'uw-workbench',
				role: 'implements',
				note: 'Owns Submission and Referral end to end; the aggregate boundaries in the code match the model.',
			},
			{
				system: 'legacy-policy-master',
				role: 'reaches into',
				note: 'Reads the appetite tables directly over a database link to pre-screen renewals, so an appetite change takes effect in two places at different times.',
			},
		],
	},
	{
		slug: 'rating',
		name: 'Rating',
		subdomain: 'pricing',
		summary:
			'Where a Risk becomes a premium. The same word "Risk" arrives from Risk appetite meaning a judgement; here it means a vector of rating factors, and the translation between the two is explicit rather than assumed.',
		language: ['Rating factor', 'Rate table', 'Base premium', 'Loading', 'Technical price'],
		aggregates: ['RatingRequest', 'RateTableVersion'],
		owner: 'Chief actuary',
		status: 'modelled',
		conformance: 'aligned',
		realisations: [
			{
				system: 'rating-engine',
				role: 'implements',
				note: 'Stateless service behind a published language; rate table versions are immutable and addressable, so a quote can be re-run years later.',
			},
		],
	},
	{
		slug: 'quote',
		name: 'Quotation',
		subdomain: 'pricing',
		summary:
			'Where a technical price becomes an offer with a validity period and a set of conditions. Deliberately separate from Rating: a price is a calculation, a quote is a commitment with an expiry.',
		language: ['Quote', 'Offer', 'Validity period', 'Condition', 'Lapse'],
		aggregates: ['Quote'],
		owner: 'Head of underwriting',
		status: 'modelled',
		conformance: 'aligned',
		realisations: [
			{
				system: 'uw-workbench',
				role: 'implements',
				note: 'Same deployable as Risk appetite, separate module and separate schema. The boundary is enforced in the build, not by convention.',
			},
		],
	},
	{
		slug: 'claims',
		name: 'Claims',
		subdomain: 'claims',
		summary:
			'From first notification to settlement or repudiation. "Policy" here is a snapshot of cover as it stood on the date of loss, not the live policy — a distinction that has decided more disputes than any other in this catalog.',
		language: ['Notification', 'Claim', 'Reserve', 'Settlement', 'Repudiation', 'Cover snapshot'],
		aggregates: ['Claim', 'Reserve', 'Payment'],
		owner: 'Claims director',
		status: 'modelled',
		conformance: 'breached',
		realisations: [
			{
				system: 'claims-platform',
				role: 'implements',
				note: 'Owns Claim and Reserve.',
			},
			{
				system: 'legacy-policy-master',
				role: 'shares a database with',
				note: 'Claims reads live policy rows rather than a cover snapshot, so a mid-term endorsement retroactively changes what an open claim appears to be covered for. This is the single most expensive finding in the landscape.',
			},
		],
	},
	{
		slug: 'policy-lifecycle',
		name: 'Policy lifecycle',
		subdomain: 'policy-admin',
		summary:
			'The policy as a thing with a history: incepted, endorsed, renewed, cancelled, reinstated. Every change is an event with an effective date, because "what did the cover say on 3 March" is a question that gets asked in court.',
		language: ['Policy', 'Inception', 'Endorsement', 'Effective date', 'Renewal', 'Cancellation'],
		aggregates: ['Policy', 'Endorsement'],
		owner: 'Operations manager, policy services',
		status: 'drafted',
		conformance: 'drifting',
		realisations: [
			{
				system: 'legacy-policy-master',
				role: 'partially implements',
				note: 'Holds the data and enforces roughly half the invariants; the rest live in a batch job that runs overnight, which is why an endorsement can be inconsistent for up to fourteen hours.',
			},
			{
				system: 'policy-service',
				role: 'partially implements',
				note: 'The strangler. Owns renewals today; inception and endorsement are still upstream.',
			},
		],
	},
	{
		slug: 'party',
		name: 'Party and relationships',
		subdomain: 'distribution',
		summary:
			'People and organisations, and the roles they play — policyholder, broker, beneficiary, claimant. The model is deliberately role-based, because the same organisation is a broker on one policy and a policyholder on another and "customer" cannot hold both.',
		language: ['Party', 'Role', 'Relationship', 'Broker', 'Policyholder', 'Claimant'],
		aggregates: ['Party', 'PartyRelationship'],
		owner: 'Head of distribution',
		status: 'drafted',
		conformance: 'breached',
		realisations: [
			{
				system: 'crm',
				role: 'partially implements',
				note: 'Bought package. Its "Account" is not a Party — it merges the organisation and the broker role, which is why commission is occasionally paid to a policyholder.',
			},
			{
				system: 'legacy-policy-master',
				role: 'partially implements',
				note: 'Keeps its own customer table, unreconciled. Two identities for the same organisation is the normal case, not the exception.',
			},
		],
	},
	{
		slug: 'product-catalogue',
		name: 'Product catalogue',
		subdomain: 'product',
		summary:
			'What can be sold and how it may be assembled: covers, limits, exclusions, wordings, and the compatibility rules between them. Upstream of nearly everything, and the reason a product change is a configuration exercise rather than a release.',
		language: ['Product', 'Cover', 'Limit', 'Exclusion', 'Wording', 'Compatibility rule'],
		aggregates: ['Product', 'WordingVersion'],
		owner: 'Product owner, personal lines',
		status: 'modelled',
		conformance: 'aligned',
		realisations: [
			{
				system: 'product-service',
				role: 'implements',
				note: 'Open host service with a published language; every downstream context consumes the same versioned product definition.',
			},
		],
	},
	{
		slug: 'billing',
		name: 'Billing',
		subdomain: 'billing',
		summary:
			'Premium in, refunds out, instalments tracked, arrears chased. Bought whole and wrapped: nothing inside this boundary is our model, and an anticorruption layer keeps its vocabulary from leaking into the ones that are.',
		language: ['Invoice', 'Instalment', 'Dunning', 'Write-off'],
		aggregates: [],
		owner: 'Finance systems manager',
		status: 'unmodelled',
		conformance: 'aligned',
		realisations: [
			{
				system: 'billing-saas',
				role: 'is bought for',
				note: 'Vendor product. Integration is one-way over the published events, through an adapter owned by us.',
			},
		],
	},
	{
		slug: 'documents',
		name: 'Documents',
		subdomain: 'documents',
		summary:
			'Rendering a schedule, certificate or letter from a template and a payload, and keeping the evidence of what was sent. A generic subdomain treated as one.',
		language: ['Template', 'Rendition', 'Dispatch record'],
		aggregates: [],
		owner: 'Operations manager, policy services',
		status: 'unmodelled',
		conformance: 'unknown',
		realisations: [
			{
				system: 'doc-gen',
				role: 'is bought for',
				note: 'Vendor product. Nothing observes it, which is why its conformance is unknown rather than aligned.',
			},
		],
	},
];

/** Contexts belonging to a subdomain, in catalog order. */
export function contextsOf(subdomainSlug: string): readonly BoundedContext[] {
	return contexts.filter((context) => context.subdomain === subdomainSlug);
}

export function subdomainOf(context: BoundedContext): Subdomain | undefined {
	return subdomains.find((subdomain) => subdomain.slug === context.subdomain);
}

/** Every distinct running system named anywhere in the catalog. */
export const systems: readonly string[] = [
	...new Set(contexts.flatMap((context) => context.realisations.map((r) => r.system))),
].sort();

export const counts = {
	subdomains: subdomains.length,
	core: subdomains.filter((s) => s.type === 'core').length,
	supporting: subdomains.filter((s) => s.type === 'supporting').length,
	generic: subdomains.filter((s) => s.type === 'generic').length,
	contexts: contexts.length,
	modelled: contexts.filter((c) => c.status === 'modelled').length,
	systems: systems.length,
	/** Contexts the estate is not respecting. The number that justifies the hub. */
	notAligned: contexts.filter((c) => c.conformance === 'drifting' || c.conformance === 'breached')
		.length,
} as const;
