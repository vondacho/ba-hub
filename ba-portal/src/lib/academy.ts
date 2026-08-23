/**
 * The Academy curriculum, defined once.
 *
 * Modelled on the sibling hubs' academies so the platform teaches in the same
 * shape: a small set of learning paths, each with a level, a handful of lessons,
 * and a pointer to the documentation that already covers its ground. Publishing
 * the curriculum before the lessons exist is deliberate — the *shape* of a
 * curriculum is a commitment worth reviewing, and it gives a reader something
 * better than "coming soon".
 *
 * The order is the order of the argument this hub makes: you cannot draw a
 * boundary before you can hear one in the language, you cannot model inside a
 * boundary you have not drawn, you cannot describe a process without both, and
 * you cannot claim any of it is true until you have checked it against what the
 * systems actually do. Drift comes last because it is the only path with a
 * prerequisite list rather than a technique.
 *
 * Lessons marked `video` ship as a short narrative: a team with a problem, the
 * decision they took, what it bought and what it cost.
 */

export interface Lesson {
	title: string;
	/** A lesson that will ship with a storytelling video. */
	video?: boolean;
}

export interface LearningPath {
	/** Foundation, Core, Applied, Advanced — the order to take them in. */
	level: string;
	title: string;
	summary: string;
	lessons: readonly Lesson[];
	/** Documentation that covers this ground today, so the card is never a dead end. */
	readToday: { label: string; href: string };
}

export const paths: readonly LearningPath[] = [
	{
		level: 'Foundation',
		title: 'Listening for the domain',
		summary:
			'Before any modelling: how to hear what the business is actually saying. Where the words differ between two rooms, where one word is doing four jobs, and why the exceptions people apologise for are usually the model.',
		lessons: [
			{ title: 'The word that meant three things and cost a release', video: true },
			{ title: 'Ubiquitous language: not jargon, not glossary, not a data dictionary' },
			{ title: 'Interviewing for the model rather than for the requirement' },
			{ title: 'The exception is not an exception — it is the rule you have not found yet', video: true },
			{ title: 'Writing a term down so that two teams recognise it' },
		],
		readToday: { label: 'Ubiquitous language', href: '/doc/strategic/ubiquitous-language/' },
	},
	{
		level: 'Foundation',
		title: 'Domains, subdomains and where the value is',
		summary:
			'The distinction that decides where the effort goes. Core, supporting and generic are not a taxonomy exercise: they are a budget, and getting one wrong is how a company builds its own invoicing and buys its own competitive advantage.',
		lessons: [
			{ title: 'Problem space and solution space, and why conflating them hurts', video: true },
			{ title: 'Finding subdomains: follow the money, the org chart and the arguments' },
			{ title: 'Core, supporting, generic — and what each one deserves' },
			{ title: 'The company that outsourced its core domain', video: true },
			{ title: 'When a supporting subdomain quietly becomes core' },
		],
		readToday: { label: 'Domains and subdomains', href: '/doc/strategic/domains/' },
	},
	{
		level: 'Core',
		title: 'Drawing bounded contexts',
		summary:
			'A boundary inside which one model holds and one word means one thing. This path is about where to put the line, how to know you put it wrong, and how to resist the urge to have one canonical model of everything.',
		lessons: [
			{ title: 'What a bounded context actually bounds', video: true },
			{ title: 'The canonical data model, and why it never survives contact' },
			{ title: 'Signals that a boundary is in the wrong place' },
			{ title: 'Contexts are not microservices, teams or databases — but they interact with all three' },
			{ title: 'Splitting a context that grew two languages', video: true },
		],
		readToday: { label: 'Bounded contexts', href: '/doc/strategic/bounded-contexts/' },
	},
	{
		level: 'Core',
		title: 'The domain model, for analysts',
		summary:
			'Entities, value objects, aggregates and events, explained as business concepts rather than as class stereotypes. An analyst who can say where the invariant lives can hold a design conversation that a use-case document never opens.',
		lessons: [
			{ title: 'Identity versus value, and the question that separates them' },
			{ title: 'An aggregate is a rule with a boundary drawn around it', video: true },
			{ title: 'Invariants: the sentences the business will not let be false' },
			{ title: 'Domain events as the business’s own record of what happened' },
			{ title: 'When the model disagrees with the form on the screen', video: true },
			{ title: 'Modelling in the room with the developers, not before them' },
		],
		readToday: { label: 'The domain model', href: '/doc/model/' },
	},
	{
		level: 'Applied',
		title: 'Business processes across contexts',
		summary:
			'Event storming from first sticky note to an agreed model, and what happens to a process that crosses three boundaries: no shared transaction, no single owner, and consistency that has to be negotiated rather than assumed.',
		lessons: [
			{ title: 'Running your first event storming session', video: true },
			{ title: 'From orange stickies to a process everyone recognises' },
			{ title: 'Commands, policies, read models — the four-part sentence' },
			{ title: 'Orchestration or choreography, and who gets to decide' },
			{ title: 'Eventual consistency explained to someone who signs off on it', video: true },
			{ title: 'The compensating action nobody designed', video: true },
		],
		readToday: { label: 'Business processes', href: '/doc/processes/' },
	},
	{
		level: 'Applied',
		title: 'Cataloguing and context mapping',
		summary:
			'Turning what you found into something a second person can use: catalog entries that stay true, and a context map whose arrows carry the political fact — who is upstream, who conforms, and who has an anticorruption layer because they had no choice.',
		lessons: [
			{ title: 'What belongs in a catalog entry and what rots in one', video: true },
			{ title: 'Ownership: a context without a named owner is unowned' },
			{ title: 'The nine relationship patterns and what each one admits to' },
			{ title: 'Reading a context map for organisational risk rather than technical risk', video: true },
			{ title: 'Keeping the catalog alive after the consultants leave' },
		],
		readToday: { label: 'Context mapping patterns', href: '/doc/strategic/context-mapping/' },
	},
	{
		level: 'Advanced',
		title: 'System mapping and drift',
		summary:
			'The half most modelling efforts skip. Observing what the estate actually does, comparing it against the map you drew, and turning the difference into a finding with an owner instead of a slide with a red box on it.',
		lessons: [
			{ title: 'Evidence over assertion: what a system map may contain', video: true },
			{ title: 'Collecting it — traffic, schemas, topics, and their blind spots' },
			{ title: 'The four verdicts: matches, drifts, unmapped, missing' },
			{ title: 'A breached boundary, traced from a claim payment back to a shared table', video: true },
			{ title: 'Prioritising drift by what it costs, not by how ugly it is' },
			{ title: 'Making conformance a standing number rather than an audit', video: true },
		],
		readToday: { label: 'Conformance and drift', href: '/doc/landscapes/conformance/' },
	},
] as const;

/** Lessons that will ship with a storytelling video, across every path. */
export const videoLessonCount = paths.reduce(
	(total, path) => total + path.lessons.filter((lesson) => lesson.video).length,
	0,
);

export const lessonCount = paths.reduce((total, path) => total + path.lessons.length, 0);
