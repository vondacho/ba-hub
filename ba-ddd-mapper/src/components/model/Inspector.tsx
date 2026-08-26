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
 * A class selected on the canvas opens a **second, much smaller panel**: its
 * name, what kind of thing it is, and what deleting it would take with it. A
 * class box already shows its stereotype, its identity and its attributes, so
 * repeating them here would be a second way to say the same thing and a second
 * place for it to be wrong. What the box cannot offer is a place to *type* the
 * name — which is the whole reason this branch exists, since a class added from
 * the canvas arrives called "New entity".
 *
 * **It writes the two fields that have no box: the intent and the invariants.**
 * The text is the source of truth here as everywhere in this component, so
 * writing means splicing a span and re-parsing — `ddm/edit.ts`. The rest of the
 * panel is still read-only and the way to change any of it is the line number
 * at the bottom, which puts the cursor on it.
 *
 * That division is the argument, not a half-finished panel. A class box already
 * shows what a class is, so a field here that let you retype its name would be
 * a second way to say the same thing and a second place for it to be wrong.
 * What the canvas cannot draw is why the boundary is there and what it keeps
 * true — and those are exactly what this panel asks for. Asking and then
 * sending the reader to a line number would be making the point and refusing
 * the fix.
 */

import { useState } from 'react';
import type { AggregateNode, DomainModel, Member } from '../../lib/ddm/model';
import { linkLabel, memberLabel, multiplicityMark } from '../../lib/ddm/model';
import { FIELD_CLASS, useDraft } from '../ui/fields';

interface Props {
	document: DomainModel;
	selected: string | null;
	onReveal: (line: number) => void;
	onClose: () => void;
	/** Write the aggregate's `intent`. An empty string removes the line. */
	setIntent: (aggregate: AggregateNode, text: string) => void;
	/**
	 * Write one invariant. An index past the last one adds; an empty string
	 * removes. See `setInvariant` — the three gestures are one splice each.
	 */
	setInvariant: (aggregate: AggregateNode, index: number, text: string) => void;
	/** Rename a boundary or a class, and every link that names it. */
	rename: (what: AggregateNode | Member, to: string) => void;
	/** Delete it, and everything that would dangle after it. */
	remove: (what: AggregateNode | Member) => void;
	/** True for a declaration created a moment ago, whose name is a placeholder. */
	focusName: boolean;
}

export default function Inspector({
	document,
	selected,
	onReveal,
	onClose,
	setIntent,
	setInvariant,
	rename,
	remove,
	focusName,
}: Props) {
	if (!selected) return null;

	const aggregate = document.aggregates.find((candidate) => candidate.id === selected);
	if (!aggregate) {
		const member = document.members.find((candidate) => candidate.id === selected);
		// A link is selected by drawing one and is described by its own line in
		// the class that holds it. Nothing to open.
		if (!member) return null;
		return (
			<MemberPanel
				document={document}
				member={member}
				onReveal={onReveal}
				onClose={onClose}
				rename={rename}
				remove={remove}
				focusName={focusName}
			/>
		);
	}

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
					<NameField
						value={aggregate.name}
						label="aggregate name"
						title="Rename — every `references` that names it moves too, and the root keeps its own name"
						focus={focusName}
						onRename={(to) => rename(aggregate, to)}
					/>
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
				{/*
				 * The question the panel opens with, asked in the box that answers
				 * it. It used to be a sentence saying the intent was missing, which
				 * is the same words and one fewer thing you can do about them.
				 */}
				<Field label="Intent">
					<Sentence
						value={aggregate.intent ? flatten(aggregate.intent) : ''}
						label="Intent"
						placeholder="what is this boundary for?"
						onCommit={(next) => setIntent(aggregate, next)}
					/>
				</Field>

				{/*
				 * Under the intent, and the field the panel is really for. An
				 * aggregate exists to keep something true across a transaction; the
				 * list of what is the most useful thing in the file to a reader who
				 * did not write it, and the order here is the order the file takes
				 * them in — the case for the boundary, then what it buys.
				 */}
				<Field label={`Invariants (${aggregate.invariants.length})`}>
					<Invariants
						invariants={aggregate.invariants}
						onSet={(index, text) => setInvariant(aggregate, index, text)}
					/>
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
					The text is the model. An edit here is a splice into it.
				</p>

				<Removal
					what={`the aggregate “${aggregate.name}”`}
					note={`Takes ${count(members.length, 'class', 'classes')} with it${
						into.length > 0 ? `, and ${count(into.length, 'reference', 'references')} to it` : ''
					}.`}
					onRemove={() => remove(aggregate)}
				/>
			</div>
		</aside>
	);
}

/**
 * A class, and deliberately almost empty.
 *
 * Everything a class *is* — its stereotype, its identity, its attributes — is
 * already drawn on the box, at a size somebody can read without opening
 * anything. What is not on the box is a place to type the name, and the name is
 * the identity in this format: every `contains`, `embeds` and `references` that
 * points here moves with it. So the field is the panel, and the rest is what
 * you need before pressing Remove.
 *
 * The attributes are not editable here, and that is not an omission waiting to
 * be filled. They are a table with a type column, and a table belongs in the
 * text where columns line up — the line number at the foot goes there.
 */
function MemberPanel({
	document,
	member,
	onReveal,
	onClose,
	rename,
	remove,
	focusName,
}: {
	document: DomainModel;
	member: Member;
	onReveal: (line: number) => void;
	onClose: () => void;
	rename: (what: Member, to: string) => void;
	remove: (what: Member) => void;
	focusName: boolean;
}) {
	const owner = document.aggregates.find((candidate) => candidate.id === member.aggregate);
	const root = owner?.root === member.id;
	const held = document.links.filter((link) => link.from === member.id);
	const pointing = document.links.filter((link) => link.to === member.id);

	const nameOf = (id: string) =>
		document.members.find((candidate) => candidate.id === id)?.name ??
		document.aggregates.find((candidate) => candidate.id === id)?.name ??
		id;

	return (
		<aside className="absolute top-3 right-3 bottom-14 z-20 flex w-80 flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
			<div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
				<div className="min-w-0">
					<p className="text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
						{memberLabel[member.kind].toLowerCase()}
						{root ? ' · root' : ''}
					</p>
					<NameField
						value={member.name}
						label={`${memberLabel[member.kind].toLowerCase()} name`}
						title="Rename — every link that names it moves too"
						focus={focusName}
						onRename={(to) => rename(member, to)}
					/>
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
				<Field label="Inside">
					{owner ? (
						<p>
							<strong>{owner.name}</strong>
							{root && (
								<span className="text-ink-muted dark:text-slate-400">
									{' '}
									— the way in
								</span>
							)}
						</p>
					) : (
						<>
							<p>
								<em className="text-ink-muted dark:text-slate-400">no boundary — shared</em>
							</p>
							<p className="mt-1 text-xs text-ink-muted dark:text-slate-400">
								Declared at model level, so any aggregate may embed it. That is what a value
								object used in two places looks like; one owned by an aggregate and embedded
								from another is the error the parser refuses.
							</p>
						</>
					)}
				</Field>

				{/*
				 * Both directions, and kept apart for the aggregate panel's reason:
				 * what it holds is its own business, and what holds it is the part
				 * that makes it hard to move.
				 */}
				<Field label={`Holds (${held.length})`}>
					{held.length === 0 ? (
						<em className="text-ink-muted dark:text-slate-400">nothing</em>
					) : (
						<ul className="text-xs">
							{held.map((link) => (
								<li key={link.id}>
									{linkLabel[link.kind]} {nameOf(link.to)} {mark(link.multiplicity)}
								</li>
							))}
						</ul>
					)}
				</Field>

				<Field label={`Held by (${pointing.length})`}>
					{pointing.length === 0 ? (
						<>
							<em className="text-ink-muted dark:text-slate-400">nothing</em>
							{owner && !root && (
								<p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
									Nothing inside “{owner.name}” reaches it. Everything in an aggregate is
									loaded and saved through the root, so a class the root cannot reach is
									either dead or a boundary of its own.
								</p>
							)}
						</>
					) : (
						<ul className="text-xs">
							{pointing.map((link) => (
								<li key={link.id}>
									{nameOf(link.from)} {linkLabel[link.kind]} it
								</li>
							))}
						</ul>
					)}
				</Field>

				<button
					type="button"
					onClick={() => onReveal(member.nameSpan.line)}
					className="mt-4 text-xs font-semibold text-brand hover:underline dark:text-purple-400"
				>
					Show in the source (line {member.nameSpan.line})
				</button>
				<p className="mt-1 text-[11px] text-ink-muted dark:text-slate-500">
					Its attributes are a table, and a table reads better where the columns line up.
				</p>

				<Removal
					what={`the ${memberLabel[member.kind].toLowerCase()} “${member.name}”`}
					note={
						pointing.length === 0
							? 'Nothing points at it.'
							: `Takes ${count(pointing.length, 'link', 'links')} to it with it — a link naming something that is gone does not parse.`
					}
					onRemove={() => remove(member)}
				/>
			</div>
		</aside>
	);
}

/**
 * The name, edited in place. The map's `NameField`, and its one rule: a
 * declaration without a name is not a declaration, it is a document that no
 * longer parses.
 */
function NameField({
	value,
	label,
	title,
	focus,
	onRename,
}: {
	value: string;
	label: string;
	title: string;
	focus: boolean;
	onRename: (to: string) => void;
}) {
	const draft = useDraft(value, (next) => {
		const trimmed = next.trim();
		// Refusing here puts the old one back, because the draft is already gone.
		if (trimmed !== '' && trimmed !== value) onRename(trimmed);
	});

	return (
		<input
			{...draft}
			/* A box created a second ago is called "New entity" and is asking to be
			   named. Selecting the placeholder means the first keystroke replaces
			   it rather than appending to it. */
			autoFocus={focus}
			onFocus={(event) => {
				if (focus) event.currentTarget.select();
			}}
			aria-label={label}
			title={title}
			className="mt-0.5 w-full rounded-md border border-transparent bg-transparent px-1 py-0.5 text-base font-semibold hover:border-slate-300 focus:border-brand focus:outline-none dark:hover:border-slate-600"
		/>
	);
}

/**
 * Delete, with what it takes said *before* it is clicked.
 *
 * The map's rule and its reasoning: the references are not optional to remove —
 * a link naming a class that no longer exists does not parse — so the delete
 * takes them, and the only honest thing is to say how many first. A number
 * somebody can read beats a confirmation dialog they will learn to dismiss
 * without reading.
 */
function Removal({
	what,
	note,
	onRemove,
}: {
	what: string;
	note: string;
	onRemove: () => void;
}) {
	return (
		<div className="mt-5 border-t border-slate-200 pt-3 dark:border-slate-800">
			<p className="text-xs text-ink-muted dark:text-slate-400">{note}</p>
			<button
				type="button"
				onClick={onRemove}
				title={`Remove ${what}`}
				className="mt-1 text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
			>
				Remove
			</button>
		</div>
	);
}

/** `1 class` and `2 classes`, without the call site branching every time. */
function count(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}

/**
 * The invariants, edited in place.
 *
 * Each one is addressed by its position rather than the list being rewritten
 * whole, which is the difference from the map's `language` chips and is earned
 * by the grammar: `invariant` takes exactly one string, so the *n*th here is
 * the *n*th in the file. Editing the second of three leaves the other two
 * byte-identical, wrapping and all.
 *
 * They are boxes rather than chips because an invariant is a sentence — *a
 * submission that has been withdrawn cannot be referred or declined* — and a
 * chip is for a word. Enter commits rather than making a newline, for the same
 * reason: the file wraps these to its own width when it writes them, so a line
 * break typed here would be a decision about the source that the source is
 * about to overrule.
 *
 * Clearing one removes it, and the warning below comes back. That is the right
 * outcome and the reason there is no `invariant ""` to write: an empty rule is
 * not a rule, and a panel that let you silence the question by answering
 * nothing would be worse than one that could not write at all.
 */
function Invariants({
	invariants,
	onSet,
}: {
	invariants: readonly string[];
	onSet: (index: number, text: string) => void;
}) {
	const [adding, setAdding] = useState('');

	return (
		<>
			{invariants.length === 0 ? (
				<p className="text-amber-700 dark:text-amber-400">
					None. An aggregate with nothing to protect is a table with extra ceremony — either
					the rule is missing or the boundary is.
				</p>
			) : (
				<ul className="space-y-1.5">
					{invariants.map((invariant, index) => (
						// Keyed by position, which is what it is addressed by. Keying by
						// the text would remount the box on every commit and take the
						// caret with it.
						<li key={index} className="flex items-start gap-1.5">
							<span
								aria-hidden="true"
								className="mt-1.5 shrink-0 text-violet-500 dark:text-violet-400"
							>
								▪
							</span>
							<Sentence
								value={flatten(invariant)}
								label={`Invariant ${index + 1}`}
								onCommit={(next) => onSet(index, next)}
							/>
							<button
								type="button"
								aria-label={`Remove invariant ${index + 1}`}
								title="Remove — the file loses the line, not the blank one above the group"
								onClick={() => onSet(index, '')}
								className="mt-1 shrink-0 rounded px-0.5 text-ink-muted hover:bg-slate-200 hover:text-rose-600 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-rose-400"
							>
								✕
							</button>
						</li>
					))}
				</ul>
			)}

			{/*
			 * Adding commits on Enter only, never on blur — the map's rule for its
			 * term list, for the map's reason. Blur fires on the way to clicking a
			 * ✕, and half a sentence becoming an invariant because you removed a
			 * different one is how a panel stops being trusted.
			 */}
			<textarea
				value={adding}
				rows={adding === '' ? 1 : 2}
				aria-label="Add an invariant"
				placeholder="add an invariant ⏎"
				onChange={(event) => setAdding(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === 'Escape') {
						setAdding('');
						event.currentTarget.blur();
					}
					if (event.key !== 'Enter') return;
					event.preventDefault();
					const text = adding.trim();
					setAdding('');
					// Past the last one is where `setInvariant` reads "add".
					if (text !== '') onSet(invariants.length, text);
				}}
				className="mt-2 w-full resize-none rounded border border-dashed border-slate-300 bg-transparent px-1.5 py-1 text-xs leading-snug placeholder:text-ink-muted focus:border-brand focus:border-solid focus:outline-none dark:border-slate-600 dark:placeholder:text-slate-500"
			/>
		</>
	);
}

/**
 * One sentence — an intent or an invariant — in a box that grows with it.
 *
 * `useDraft` with Enter committing, and no `multiline`, because neither field
 * has a line break to protect: the lexer joins a wrapped string back into one
 * line, so a newline typed here would be a claim about the source that the
 * source is about to overrule. It scrolls at ten lines, which no invariant that
 * is really one rule should reach; one that does is telling you it is two.
 */
function Sentence({
	value,
	label,
	placeholder,
	onCommit,
}: {
	value: string;
	label: string;
	placeholder?: string;
	onCommit: (next: string) => void;
}) {
	const draft = useDraft(value, onCommit);
	return (
		<textarea
			{...draft}
			rows={Math.min(10, Math.max(1, Math.ceil(draft.value.length / 34)))}
			aria-label={label}
			placeholder={placeholder}
			title="⏎ to save · esc to cancel · empty to remove"
			// `w-full` on a flex item that may not shrink is a box that pushes the
			// ✕ off the panel the moment a sentence gets long.
			className={`${FIELD_CLASS} min-w-0 grow resize-y py-0.5 text-[13px] leading-snug`}
		/>
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
