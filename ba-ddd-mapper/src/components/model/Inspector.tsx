/**
 * The aggregate panel.
 *
 * Opened by clicking an aggregate's box, and deliberately **about the boundary
 * rather than about the boxes inside it**. A class box already shows what a
 * class is — its stereotype, its identity, its attributes, all of it on the
 * canvas — so a panel repeating that would be a second rendering of something
 * already legible. What the canvas cannot show is the aggregate's *case for
 * existing*: the invariants it keeps true across a transaction, which member
 * is the way in, and what crosses its boundary in each direction.
 *
 * That is the whole content of this panel, and it is why the empty states are
 * as prominent as the full ones. An aggregate with no invariant is, in
 * `model.ts`'s words, a table with extra ceremony — and an aggregate whose only
 * problem is that nobody wrote its invariants down looks identical on the
 * canvas to one that genuinely has none. Here they do not look identical.
 *
 * **It reads; it does not write.** The text is the source of truth in this tool
 * and every edit is a splice into it — which the map has helpers for and the
 * `.ddm` does not, yet. Rather than offer half a panel of editable fields and
 * half a panel of static ones, everything here is static and the way to change
 * anything is the line number at the bottom, which puts the cursor on it.
 */

import type { DomainModel, Member } from '../../lib/ddm/model';
import { linkLabel, memberLabel, multiplicityMark } from '../../lib/ddm/model';

interface Props {
	document: DomainModel;
	selected: string | null;
	onReveal: (line: number) => void;
	onClose: () => void;
}

export default function Inspector({ document, selected, onReveal, onClose }: Props) {
	if (!selected) return null;

	const aggregate = document.aggregates.find((candidate) => candidate.id === selected);
	// A member's box says everything a member panel would. Selecting one still
	// highlights it and still reveals its line; it just does not open this.
	if (!aggregate) return null;

	const byId = new Map(document.members.map((member) => [member.id, member] as const));
	const members = aggregate.members
		.map((id) => byId.get(id))
		.filter((member): member is Member => member !== undefined);
	const root = aggregate.root ? byId.get(aggregate.root) : undefined;
	const inside = new Set(aggregate.members);

	const owns = document.links.filter((link) => link.kind !== 'references' && inside.has(link.from));
	const out = document.links.filter((link) => link.kind === 'references' && inside.has(link.from));
	const into = document.links.filter(
		(link) => link.kind === 'references' && link.to === aggregate.id,
	);

	const nameOf = (id: string) =>
		byId.get(id)?.name ??
		document.aggregates.find((candidate) => candidate.id === id)?.name ??
		id;

	return (
		<aside className="absolute top-3 right-3 bottom-14 z-20 flex w-80 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
			<div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
				<div className="min-w-0">
					<p className="text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
						aggregate
					</p>
					<h2 className="truncate text-base font-semibold">{aggregate.name}</h2>
				</div>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close inspector"
					className="shrink-0 rounded p-1 text-ink-muted hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
				>
					✕
				</button>
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm">
				<Field label="Intent">
					{aggregate.intent ? (
						<p className="whitespace-pre-line">{flatten(aggregate.intent)}</p>
					) : (
						<em className="text-ink-muted dark:text-slate-400">
							none — what is this boundary for?
						</em>
					)}
				</Field>

				{/*
				 * First among the fields, and the one the panel is really for. An
				 * aggregate exists to keep something true across a transaction; the
				 * list of what is the most useful thing in the file to a reader who
				 * did not write it.
				 */}
				<Field label={`Invariants (${aggregate.invariants.length})`}>
					{aggregate.invariants.length === 0 ? (
						<p className="text-amber-700 dark:text-amber-400">
							None. An aggregate with nothing to protect is a table with extra ceremony —
							either the rule is missing or the boundary is.
						</p>
					) : (
						<ul className="space-y-1.5">
							{aggregate.invariants.map((invariant) => (
								<li key={invariant} className="flex gap-2">
									<span aria-hidden="true" className="text-violet-500 dark:text-violet-400">
										▪
									</span>
									<span>{flatten(invariant)}</span>
								</li>
							))}
						</ul>
					)}
				</Field>

				<Field label="Root">
					{root ? (
						<>
							<p>
								<strong>{root.name}</strong>
								{root.kind === 'entity' && root.identity ? (
									<span className="text-ink-muted dark:text-slate-400"> · id: {root.identity}</span>
								) : null}
							</p>
							<p className="mt-1 text-xs text-ink-muted dark:text-slate-400">
								The way in. Everything outside this boundary names the aggregate by holding
								this one's identity, and nothing else inside it.
							</p>
							{root.kind === 'entity' && !root.identity && (
								<p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
									No identity declared — an entity without one is a value object.
								</p>
							)}
						</>
					) : (
						<p className="text-amber-700 dark:text-amber-400">
							None. Exactly one entity in an aggregate is its root; without one there is
							nothing the outside is allowed to name.
						</p>
					)}
				</Field>

				<Field label={`Members (${members.length})`}>
					{members.length === 0 ? (
						<em className="text-ink-muted dark:text-slate-400">none declared</em>
					) : (
						<ul className="space-y-1">
							{members.map((member) => (
								<li key={member.id} className="flex items-baseline justify-between gap-2">
									<button
										type="button"
										onClick={() => onReveal(member.nameSpan.line)}
										className="truncate text-left hover:underline"
									>
										{member.name}
										{member.id === aggregate.root && (
											<span className="ml-1 text-[10px] text-violet-600 dark:text-violet-300">
												root
											</span>
										)}
									</button>
									<span className="shrink-0 text-xs text-ink-muted dark:text-slate-400">
										{memberLabel[member.kind].toLowerCase()}
									</span>
								</li>
							))}
						</ul>
					)}
				</Field>

				{/*
				 * The boundary, in both directions and kept apart.
				 *
				 * What it owns lives and dies with it; what it references it holds by
				 * identity and loads separately; what references it is the part that
				 * makes it hard to move. Three different facts, and running them
				 * together as "links" would lose the only distinction that matters.
				 */}
				<Field label="Across the boundary">
					<Crossing
						title="Owns"
						empty="nothing — the root is the whole of it"
						rows={owns.map((link) => `${linkLabel[link.kind]} ${nameOf(link.to)} ${mark(link.multiplicity)}`)}
					/>
					<Crossing
						title="References"
						empty="nothing — it needs no other aggregate to be correct"
						rows={out.map((link) => `${nameOf(link.to)} ${mark(link.multiplicity)}, by identity`)}
					/>
					<Crossing
						title="Referenced by"
						empty="nothing yet"
						rows={into.map((link) => `${nameOf(link.from)}`)}
					/>
				</Field>

				<button
					type="button"
					onClick={() => onReveal(aggregate.nameSpan.line)}
					className="mt-4 text-xs font-semibold text-brand hover:underline dark:text-purple-400"
				>
					Show in the source (line {aggregate.nameSpan.line})
				</button>
				<p className="mt-1 text-[11px] text-ink-muted dark:text-slate-500">
					The text is the model. This panel reads it.
				</p>
			</div>
		</aside>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<section className="mb-4">
			<h3 className="text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
				{label}
			</h3>
			<div className="mt-1">{children}</div>
		</section>
	);
}

function Crossing({
	title,
	empty,
	rows,
}: {
	title: string;
	empty: string;
	rows: readonly string[];
}) {
	return (
		<div className="mb-2 last:mb-0">
			<p className="text-xs font-semibold">{title}</p>
			{rows.length === 0 ? (
				<p className="text-xs text-ink-muted dark:text-slate-400">{empty}</p>
			) : (
				<ul className="text-xs">
					{rows.map((row) => (
						<li key={row}>{row}</li>
					))}
				</ul>
			)}
		</div>
	);
}

/** `1` is the default and says nothing worth the space. */
function mark(multiplicity: keyof typeof multiplicityMark): string {
	const value = multiplicityMark[multiplicity];
	return value === '1' ? '' : `(${value})`;
}

/**
 * Prose from the source, on one line.
 *
 * The `.ddm` wraps long strings with the indentation of the file, and carrying
 * that indentation into a panel three hundred pixels wide would show one
 * document's line breaks inside another's.
 */
function flatten(text: string): string {
	return text.replace(/\s+/g, ' ').trim();
}
