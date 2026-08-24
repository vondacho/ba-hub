/**
 * The inspector: what is selected, and the gestures that change it.
 *
 * This is where the inversion becomes visible. Every control here produces a
 * *new source string* by splicing one span, which the parent re-parses — so a
 * pattern change rewrites the pattern token and leaves the `because` prose two
 * lines below it byte-identical.
 *
 * The pattern picker shows what each pattern **admits to** rather than what it
 * does. That is deliberate and it is the most opinionated thing in the
 * component: the characteristic failure of context maps is aspiration, every
 * arrow labelled customer/supplier because conformist feels like a defeat. A
 * picker that says "Powerlessness, honestly" next to conformist makes the
 * honest choice fractionally easier to click, and a map of aspirational
 * patterns tells you nothing.
 */

import { useRef, useState } from 'react';
import {
	CLASSIFICATIONS,
	PATTERNS,
	patternAdmits,
	patternLabel,
	symmetric,
	type Classification,
	type ContainmentEdge,
	type DddDocument,
	type Node,
	type Pattern,
	type RelationshipEdge,
} from '../../lib/ddd/model';
import { removalOf } from '../../lib/graph/edit';
import { classificationLabel } from '../../lib/graph/style';

interface Props {
	document: DddDocument;
	selected: string | null;
	onSource: (next: string, why: string) => void;
	onReveal: (line: number) => void;
	onClose: () => void;
	setPattern: (edge: RelationshipEdge, pattern: Pattern) => void;
	setClassification: (subdomainId: string, classification: Classification) => void;
	removeRelationship: (edge: RelationshipEdge) => void;
	renameNode: (node: Node, to: string) => void;
	/** True for a node created a moment ago, whose name is a placeholder. */
	focusName: boolean;
	removeNode: (node: Node) => void;
	removeServes: (edge: ContainmentEdge) => void;
}

export default function Inspector({
	document,
	selected,
	onReveal,
	onClose,
	setPattern,
	setClassification,
	removeRelationship,
	renameNode,
	removeNode,
	removeServes,
	focusName,
}: Props) {
	if (!selected) return null;

	const node = document.nodes.find((candidate) => candidate.id === selected);
	const edge = document.edges.find(
		(candidate): candidate is RelationshipEdge =>
			candidate.id === selected && candidate.kind === 'relationship',
	);
	const serves = document.edges.find(
		(candidate): candidate is ContainmentEdge =>
			candidate.id === selected && candidate.kind === 'containment',
	);

	if (!node && !edge && !serves) return null;

	const nameOf = (id: string) =>
		document.nodes.find((candidate) => candidate.id === id)?.name ?? id;

	return (
		<aside className="absolute top-3 right-3 bottom-14 z-20 flex w-80 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
			<div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
				<div className="min-w-0">
					<p className="text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
						{node ? node.kind : serves ? 'serves' : 'relationship'}
					</p>
					{node ? (
						<NameField node={node} onRename={renameNode} focus={focusName} />
					) : (
						<h2 className="mt-0.5 truncate font-semibold">
							{serves
								? `${nameOf(serves.from)} → ${nameOf(serves.to)}`
								: `${nameOf(edge!.from)} → ${nameOf(edge!.to)}`}
						</h2>
					)}
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
				{node && (
					<>
						{node.intent && <p className="text-ink-muted dark:text-slate-400">{node.intent}</p>}

						<Field label="Owner">
							{node.owner ?? (
								<em className="text-amber-700 dark:text-amber-400">
									unowned — a suggestion, and suggestions lose to deadlines
								</em>
							)}
						</Field>

						{node.kind === 'subdomain' && (
							<Field label="Classification">
								<div className="mt-1 flex gap-1.5">
									{CLASSIFICATIONS.map((option) => (
										<button
											key={option}
											type="button"
											onClick={() => setClassification(node.id, option)}
											aria-pressed={node.classification === option}
											className={
												node.classification === option
													? 'rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-white'
													: 'rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800'
											}
										>
											{classificationLabel[option]}
										</button>
									))}
								</div>
								<p className="mt-1.5 text-xs text-ink-muted dark:text-slate-400">
									A budget, not a label: core gets the deep model and the best people, generic
									gets bought.
								</p>
							</Field>
						)}

						{node.kind === 'context' && (
							<>
								<Field label="Serves">
									{node.serves.length === 0 ? (
										<em className="text-amber-700 dark:text-amber-400">
											nothing — it is in the file and in no part of the business
										</em>
									) : (
										node.serves.map(nameOf).join(', ')
									)}
									{node.serves.length > 1 && (
										<p className="mt-1 text-xs text-violet-700 dark:text-violet-300">
											Straddles {node.serves.length} subdomains — usually the most interesting
											entry in a catalog, and the reason containment is drawn as edges rather
											than nested boxes.
										</p>
									)}
								</Field>

								<Field label={`Language (${node.language.length})`}>
									{node.language.length === 0 ? (
										<em className="text-amber-700 dark:text-amber-400">none declared</em>
									) : (
										<span className="flex flex-wrap gap-1">
											{node.language.map((term) => (
												<code
													key={term}
													className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800"
												>
													{term}
												</code>
											))}
										</span>
									)}
								</Field>

								<Field label={`Aggregates (${node.aggregates.length})`}>
									{node.aggregates.length === 0 ? (
										<em className="text-ink-muted dark:text-slate-400">
											none — bought whole and wrapped, or not modelled yet. `status` says which.
										</em>
									) : (
										node.aggregates.join(', ')
									)}
								</Field>

								<Field label="Model status">{node.status}</Field>
							</>
						)}

						<div className="mt-4 flex items-center justify-between gap-3">
							<button
								type="button"
								onClick={() => onReveal(node.nameSpan.line)}
								className="text-xs font-semibold text-brand hover:underline dark:text-purple-400"
							>
								Show in the source (line {node.nameSpan.line})
							</button>
							<button
								type="button"
								onClick={() => removeNode(node)}
								title={removalNote(document, node)}
								className="shrink-0 text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
							>
								Remove
							</button>
						</div>
						<p className="mt-1 text-right text-[11px] text-ink-muted dark:text-slate-500">
							{removalNote(document, node)}
						</p>
					</>
				)}

				{serves && (
					<>
						<Field label="What this says">
							<p>
								{nameOf(serves.from)} also serves {nameOf(serves.to)} — a straddle, written as
								a `serves` line rather than implied by nesting.
							</p>
							<p className="mt-1.5 text-xs text-ink-muted dark:text-slate-400">
								Usually the most interesting entry in a catalog: it is the claim that one
								boundary earns its keep in two parts of the business.
							</p>
						</Field>

						<div className="mt-4 flex items-center justify-between">
							{serves.span && (
								<button
									type="button"
									onClick={() => onReveal(serves.span!.line)}
									className="text-xs font-semibold text-brand hover:underline dark:text-purple-400"
								>
									Show in the source (line {serves.span.line})
								</button>
							)}
							<button
								type="button"
								onClick={() => removeServes(serves)}
								className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
							>
								Remove
							</button>
						</div>
					</>
				)}

				{edge && (
					<>
						<Field label="Direction">
							{edge.directed
								? `${nameOf(edge.from)} is upstream — its model is the one ${nameOf(edge.to)} accommodates.`
								: 'Mutual — neither side is upstream.'}
						</Field>

						{edge.exchange && <Field label="What crosses">{edge.exchange}</Field>}

						<Field label="Why this pattern">
							{edge.because ?? (
								<em className="text-amber-700 dark:text-amber-400">
									not recorded — this is the field that keeps a map honest
								</em>
							)}
						</Field>

						<Field label="Pattern">
							{edge.pattern.length === 2 && (
								<p className="mb-2 text-xs text-ink-muted dark:text-slate-400">
									Two roles: <strong>{patternLabel[edge.pattern[0]]}</strong> upstream,{' '}
									<strong>{patternLabel[edge.pattern[1]!]}</strong> downstream. Choosing below
									replaces both with one.
								</p>
							)}
							<ul className="mt-1 space-y-1">
								{PATTERNS.map((option) => {
									const current = edge.pattern.length === 1 && edge.pattern[0] === option;
									return (
										<li key={option}>
											<button
												type="button"
												onClick={() => setPattern(edge, option)}
												aria-pressed={current}
												className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${
													current
														? 'bg-brand text-white'
														: 'hover:bg-slate-100 dark:hover:bg-slate-800'
												}`}
											>
												<span className="font-semibold">{patternLabel[option]}</span>
												<span
													className={
														current
															? 'ml-1.5 text-[10px] text-white/75'
															: 'ml-1.5 text-[10px] text-ink-muted dark:text-slate-500'
													}
												>
													{symmetric[option] === 'mutual'
														? '↔'
														: symmetric[option] === 'directed'
															? '→'
															: '↔ →'}
												</span>
												<span
													className={`mt-0.5 block ${current ? 'text-white/85' : 'text-ink-muted dark:text-slate-400'}`}
												>
													{patternAdmits[option]}
												</span>
											</button>
										</li>
									);
								})}
							</ul>
						</Field>

						<div className="mt-4 flex items-center justify-between">
							<button
								type="button"
								onClick={() => onReveal(edge.span.line)}
								className="text-xs font-semibold text-brand hover:underline dark:text-purple-400"
							>
								Show in the source (line {edge.span.line})
							</button>
							<button
								type="button"
								onClick={() => removeRelationship(edge)}
								className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
							>
								Remove
							</button>
						</div>
					</>
				)}
			</div>
		</aside>
	);
}

/**
 * The name, edited in place — the same control the map's own title uses, and
 * for the same reasons: a local draft that commits on Enter or blur, because
 * the parse it triggers is debounced and a controlled input would echo the
 * visitor's keystrokes back at them late.
 *
 * The one rule it adds is the one the format demands: **a node without a name
 * is not a node.** The name is the identity here — relationships and `serves`
 * lines refer to it — so an empty box is not an incomplete node, it is a
 * document that no longer parses. Emptying the field puts the old name back.
 */
function NameField({
	node,
	onRename,
	focus,
}: {
	node: Node;
	onRename: (node: Node, to: string) => void;
	focus: boolean;
}) {
	const [draft, setDraft] = useState<string | null>(null);
	const abandoned = useRef(false);

	const commit = () => {
		const pending = draft;
		setDraft(null);
		if (abandoned.current) {
			abandoned.current = false;
			return;
		}
		if (pending === null) return;
		const next = pending.trim();
		if (next === '' || next === node.name) return;
		onRename(node, next);
	};

	return (
		<input
			value={draft ?? node.name}
			/* A box created a second ago is called "New context" and is asking to
			   be named. Selecting the placeholder means the first keystroke
			   replaces it rather than appending to it. */
			autoFocus={focus}
			onFocus={(event) => {
				if (focus) event.currentTarget.select();
			}}
			aria-label={`${node.kind} name`}
			title="Rename — every relationship and `serves` that names it moves too"
			onChange={(event) => setDraft(event.target.value)}
			onBlur={commit}
			onKeyDown={(event) => {
				if (event.key === 'Enter') event.currentTarget.blur();
				if (event.key === 'Escape') {
					abandoned.current = true;
					setDraft(null);
					event.currentTarget.blur();
				}
			}}
			className="mt-0.5 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 font-semibold hover:border-slate-300 focus:border-brand focus:outline-none dark:hover:border-slate-600"
		/>
	);
}

/**
 * What a delete is about to take with it, said before it is clicked.
 *
 * A node's references are not optional to remove — a relationship naming a
 * context that no longer exists does not parse — so the delete takes them, and
 * the only honest thing to do is say how many *first*. The count comes from
 * `removalOf`, the same analysis the delete itself runs, so the sentence and
 * the edit cannot drift apart.
 *
 * A number the visitor can read beats a confirmation dialog they will learn to
 * dismiss without reading.
 */
function removalNote(document: DddDocument, node: Node): string {
	const { nested, references } = removalOf(document, node);
	const parts = [
		nested.length > 0 ? `${nested.length} nested ${nested.length === 1 ? 'node' : 'nodes'}` : null,
		references.length > 0
			? `${references.length} ${references.length === 1 ? 'reference' : 'references'}`
			: null,
	].filter((part): part is string => part !== null);

	return parts.length === 0 ? 'Nothing else refers to it.' : `Takes ${parts.join(' and ')} with it.`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="mt-4">
			<p className="text-[10px] font-semibold tracking-[0.12em] text-ink-muted uppercase dark:text-slate-500">
				{label}
			</p>
			<div className="mt-0.5 text-ink dark:text-slate-200">{children}</div>
		</div>
	);
}
