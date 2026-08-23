/**
 * The tools, defined once.
 *
 * One is the point of the section and the rest support it. The **DDD mapper**
 * is the piece of software this hub is arguing for: it reads the catalog, draws
 * the context map, ingests the landscape evidence, and produces the conformance
 * table that says where intent and reality have parted company. Everything else
 * here either feeds it or reads its output.
 *
 * One of them exists. The **Event Stormer** is doc-hub's `doc-es`, deployed and
 * usable today, and it sits first because it carries two of this hub's practices
 * rather than one: event storming *and* process modelling are two of its three
 * declared levels, not two tools. Everything downstream consumes what a room
 * puts on that wall. Everything after it is `planned` or `soon`, and the
 * documentation pages behind those say what would have to be true. That is the
 * honest version, and it is more useful to a reader than a working demo of the
 * easy part.
 *
 * `href` is a function exactly when the address is configuration rather than a
 * route, matching src/lib/links.ts.
 */

import { dddMapperUrl, eventStormerUrl, landscapeApiUrl } from './links';

/*
 * Spelled out rather than imported from SectionPanels.astro: a `.ts` module that
 * imports a type from a `.astro` one type-checks only through Astro's generated
 * shims, and this file has no other reason to know a component exists. The union
 * is structurally identical, so the panels still assign cleanly.
 */
type PanelStatus = 'live' | 'soon' | 'planned';

export interface Tool {
	slug: string;
	title: string;
	/** The one thing it does that a diagram in a wiki cannot. */
	purpose: string;
	description: string;
	/** What it reads. Named, because a tool with no input is a drawing program. */
	input: string;
	/** What it emits, and who consumes it. */
	output: string;
	icon: string;
	href: string | (() => string);
	cta: string;
	status: PanelStatus;
	external?: boolean;
}

export const tools: readonly Tool[] = [
	{
		slug: 'event-stormer',
		title: 'Event Stormer',
		purpose:
			'Run both workshops — event storming and process modelling — on one wall, at whichever of the three levels the room is working at.',
		description:
			'doc-hub’s event storming board, at big picture for discovery, process modelling for commands, policies and read models, or software design for aggregates and screens. The notation is cumulative, so going deeper never invalidates the wall. Written to a plain `.eventstorm` file rather than a photograph.',
		input: 'A room, a facilitator, the people who do the work, and a declared level.',
		output:
			'An `.eventstorm` file: candidate bounded contexts from the big picture, the commands, policies and read models of a process, the aggregates under it, and every hotspot nobody could settle.',
		icon: 'M4 5.5h5.5v5.5H4V5.5Zm6.5 0H16v5.5h-5.5V5.5Zm6.5 0h3v5.5h-3V5.5ZM4 12.5h5.5V18H4v-5.5Zm6.5 0H16V18h-5.5v-5.5Z',
		href: eventStormerUrl,
		cta: 'Open the board',
		status: 'live',
		external: true,
	},
	{
		slug: 'ddd-mapper',
		title: 'DDD mapper',
		purpose:
			'Hold the catalog and the two landscapes in one place, and compute the difference between them.',
		description:
			'Reads the catalog, draws the context map from the declared relationships, ingests observed integrations from the landscape collector, and produces the conformance verdict for every edge: matches, drifts, unmapped, missing.',
		input: 'The catalog, the declared relationships, and the landscape collector’s observations.',
		output:
			'A context map, a system map, and a conformance table with an owner against every finding.',
		icon: 'M4 7.5 9.5 5l5 2.5L20 5v11.5L14.5 19l-5-2.5L4 19V7.5Z M9.5 5v11.5 M14.5 7.5V19',
		href: dddMapperUrl,
		cta: 'Open the mapper',
		status: 'planned',
		external: true,
	},
	{
		slug: 'landscape-collector',
		title: 'Landscape collector',
		purpose: 'Replace assertion with evidence about what the estate actually does.',
		description:
			'Observes running systems — service-to-service traffic, database access, schema shapes, event topics — and emits the integration edges the system map is drawn from, each with the observation that produced it.',
		input: 'Service meshes, database audit logs, broker topic metadata, schema registries.',
		output: 'Observed integrations with evidence, consumed by the DDD mapper.',
		icon: 'M12 3a9 9 0 1 0 9 9 M12 7.5a4.5 4.5 0 1 0 4.5 4.5 M12 12h9 M12 12V3',
		href: landscapeApiUrl,
		cta: 'See what it collects',
		status: 'planned',
		external: true,
	},
	{
		slug: 'language-workbench',
		title: 'Language workbench',
		purpose: 'Keep the ubiquitous language honest across contexts.',
		description:
			'One term per context rather than one term per company, with the collisions made visible: where the same word carries two meanings, where two words carry one, and which documents and schemas still use the old one.',
		input: 'Catalog language sets, requirement documents, API schemas.',
		output: 'A per-context glossary and a collision report.',
		icon: 'M5 4h9l5 5v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm8 0v6h6M8 14h8M8 17.5h5',
		href: '/doc/tooling/modelling/',
		cta: 'Read the design',
		status: 'soon',
	},
	{
		slug: 'storm-reconciler',
		title: 'Storm reconciler',
		purpose:
			'Place a finished wall against the catalog, so its boundary crossings are computed rather than remembered.',
		description:
			'Reads an `.eventstorm` file and reconciles it with the catalog: `context` cards matched against bounded contexts that already exist, each command and event attributed to the context that owns it, and every step where the process leaves one boundary flagged as a crossing with no transaction behind it. The board models the process; this says where the process is.',
		input: 'An `.eventstorm` file, and the catalog to place it against.',
		output:
			'Boundary crossings named with their compensating actions asked for, and new `context` cards raised as catalog candidates.',
		icon: 'M4 6h6v5H4V6Zm10 7h6v5h-6v-5ZM7 11v4.5A1.5 1.5 0 0 0 8.5 17H14',
		href: '/doc/processes/modelling/',
		cta: 'Read the design',
		status: 'soon',
	},
] as const;
