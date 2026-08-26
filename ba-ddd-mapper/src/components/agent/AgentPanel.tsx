/**
 * The prompting area: a demand in, an answer beside the document.
 *
 * One component for both pages, like `CanvasBar` and `Editor` — the language it
 * is looking at arrives as a prop, along with the way to check a document and
 * the way to apply one. Nothing in here knows `.ddd` from `.ddm`.
 *
 * **A proposal is never applied without being read, and never offered without
 * parsing.** The claim this whole tool rests on is that the text is the model;
 * handing over a document that does not parse would break it, and applying one
 * silently would make the visitor's file something they did not write. So the
 * answer streams as prose, the proposal is formatted, parsed, and shown as a
 * diff, and Apply is a button they press.
 *
 * It goes through `applyEdit` upstream, which means ⌘Z takes the whole thing
 * back in one gesture — the same guarantee a pattern change has.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { diffLines, hunks, tally, type Row } from '../../lib/diff';
import { format } from '../../lib/format';
import {
	LANGUAGE_LABEL,
	openFence,
	proposalIn,
	proseIn,
	type AgentEvent,
	type Language,
} from '../../lib/agent/protocol';
import type { Problem } from '../../lib/ddd/problems';
import { loadAgentConfig, loadKey, type AgentConfig } from '../../lib/storage';
import Settings from './Settings';

interface Props {
	language: Language;
	/** The document as it stands. Sent whole; the model needs all of it. */
	source: string;
	/** The parser for this language. Gates whether a proposal may be applied. */
	check: (text: string) => readonly Problem[];
	onApply: (next: string) => void;
	onClose: () => void;
}

interface Answer {
	readonly text: string;
	readonly thinking: string;
	readonly usage: { input: number; output: number; cached: number } | null;
	readonly error: string | null;
}

const EMPTY: Answer = { text: '', thinking: '', usage: null, error: null };

export default function AgentPanel({ language, source, check, onApply, onClose }: Props) {
	const [prompt, setPrompt] = useState('');
	const [answer, setAnswer] = useState<Answer>(EMPTY);
	const [asking, setAsking] = useState(false);
	const [showSettings, setShowSettings] = useState(false);
	const [config, setConfig] = useState<AgentConfig | null>(null);
	const [key, setKey] = useState('');
	/** What was asked, kept beside the answer so the panel reads as an exchange. */
	const [asked, setAsked] = useState('');
	const abort = useRef<AbortController | null>(null);
	const tail = useRef<HTMLDivElement>(null);

	useEffect(() => {
		setConfig(loadAgentConfig());
		setKey(loadKey());
	}, []);

	// Follow the stream, but only while the reader is already at the bottom —
	// yanking the view back down while somebody is re-reading the first
	// paragraph is the worst thing a streaming panel does.
	useEffect(() => {
		const box = tail.current;
		if (!box) return;
		const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
		if (atBottom) box.scrollTop = box.scrollHeight;
	}, [answer.text, answer.thinking]);

	useEffect(() => () => abort.current?.abort(), []);

	const ask = useCallback(async () => {
		const demand = prompt.trim();
		if (demand === '' || asking) return;
		if (!key) {
			setShowSettings(true);
			return;
		}

		const settings = config ?? loadAgentConfig();
		abort.current?.abort();
		const controller = new AbortController();
		abort.current = controller;

		setAsked(demand);
		setPrompt('');
		setAnswer(EMPTY);
		setAsking(true);

		try {
			const response = await fetch('/api/agent', {
				method: 'POST',
				signal: controller.signal,
				headers: { 'content-type': 'application/json', 'x-model-key': key },
				body: JSON.stringify({
					language,
					source,
					prompt: demand,
					model: settings.model,
					effort: settings.effort,
					guidance: settings.guidance,
				}),
			});

			// A refusal before the stream opens is plain JSON — see the route.
			if (!response.ok || !response.body) {
				const said = await response.json().catch(() => null);
				setAnswer((current) => ({
					...current,
					error: (said as { message?: string } | null)?.message ?? `The request failed (${response.status}).`,
				}));
				return;
			}

			await read(response.body, (event) => {
				setAnswer((current) => {
					if (event.type === 'text') return { ...current, text: current.text + event.text };
					if (event.type === 'thinking') return { ...current, thinking: current.thinking + event.text };
					if (event.type === 'usage') {
						return { ...current, usage: { input: event.input, output: event.output, cached: event.cached } };
					}
					return { ...current, error: event.message };
				});
			});
		} catch (error) {
			// An abort is the visitor pressing Stop, not a failure.
			if ((error as Error)?.name !== 'AbortError') {
				setAnswer((current) => ({ ...current, error: 'Lost the connection to this page’s server.' }));
			}
		} finally {
			setAsking(false);
		}
	}, [asking, config, key, language, prompt, source]);

	/*
	 * The proposal, checked before it is offered.
	 *
	 * Formatted first, so the diff is about meaning and not about where the
	 * model chose to put its spaces — the formatter is a no-op on a
	 * well-written document and fixes the indentation of one that is not.
	 */
	const raw = asking ? null : proposalIn(answer.text, language);
	const proposal = raw === null ? null : (format(raw) ?? raw);
	const problems = proposal === null ? [] : check(proposal).filter((one) => one.severity === 'error');
	const rows: readonly Row[] = proposal === null ? [] : diffLines(source, proposal);
	const counted = tally(rows);
	const prose = proseIn(answer.text, language);

	return (
		<section
			aria-label="Assistant"
			className="flex min-h-0 flex-1 flex-col border-t border-slate-200 bg-white lg:border-t-0 lg:border-l dark:border-slate-800 dark:bg-slate-950"
		>
			<div className="flex items-center gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-800">
				<strong className="text-sm">Assistant</strong>
				<span className="text-xs text-ink-muted dark:text-slate-400">
					reading this {LANGUAGE_LABEL[language]}
				</span>
				<span className="ml-auto flex items-center gap-1">
					<button
						type="button"
						onClick={() => setShowSettings(true)}
						className="rounded px-2 py-0.5 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
					>
						Settings
					</button>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close the assistant"
						className="rounded p-1 text-ink-muted hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
					>
						✕
					</button>
				</span>
			</div>

			<div ref={tail} className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
				{asked === '' && !asking ? (
					<Blank hasKey={key !== ''} onSettings={() => setShowSettings(true)} language={language} />
				) : (
					<>
						<p className="mb-3 rounded-md bg-slate-100 px-2.5 py-1.5 text-xs whitespace-pre-wrap dark:bg-slate-800">
							{asked}
						</p>

						{/* The reasoning, while there is nothing else to show. Not kept:
						    it is the model working, not its answer. */}
						{answer.thinking !== '' && prose === '' && (
							<p className="mb-2 text-xs whitespace-pre-wrap text-ink-muted italic dark:text-slate-500">
								{answer.thinking.slice(-400)}
							</p>
						)}

						{prose !== '' && <div className="prose-answer whitespace-pre-wrap">{prose}</div>}

						{asking && openFence(answer.text, language) && (
							<p className="mt-2 text-xs text-ink-muted dark:text-slate-400">Writing a proposal…</p>
						)}

						{asking && prose === '' && answer.thinking === '' && (
							<p className="text-xs text-ink-muted dark:text-slate-400">Thinking…</p>
						)}

						{answer.error && (
							<p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-900 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
								{answer.error}
							</p>
						)}

						{proposal !== null && (
							<Proposal
								rows={rows}
								counted={counted}
								problems={problems}
								onApply={() => onApply(proposal)}
							/>
						)}

						{answer.usage && (
							<p className="mt-3 text-[11px] text-ink-muted dark:text-slate-500">
								{answer.usage.input.toLocaleString()} in · {answer.usage.output.toLocaleString()} out
								{answer.usage.cached > 0 && ` · ${answer.usage.cached.toLocaleString()} from cache`}
							</p>
						)}
					</>
				)}
			</div>

			<div className="border-t border-slate-200 p-2 dark:border-slate-800">
				<textarea
					value={prompt}
					rows={3}
					onChange={(event) => setPrompt(event.target.value)}
					onKeyDown={(event) => {
						// ⌘/ctrl + Enter sends; Enter is a newline, because a demand is a
						// paragraph and often two.
						if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
							event.preventDefault();
							void ask();
						}
					}}
					placeholder={`Ask about this ${LANGUAGE_LABEL[language]}, or ask for a change. ⌘/ctrl + ⏎`}
					className="w-full resize-y rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm leading-snug placeholder:text-ink-muted focus:border-brand focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:placeholder:text-slate-500"
				/>
				<div className="mt-1 flex items-center gap-2">
					{asking ? (
						<button
							type="button"
							onClick={() => abort.current?.abort()}
							className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
						>
							Stop
						</button>
					) : (
						<button
							type="button"
							onClick={() => void ask()}
							disabled={prompt.trim() === ''}
							className="rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-40"
						>
							Ask
						</button>
					)}
					<span className="text-[11px] text-ink-muted dark:text-slate-500">
						The whole document goes with the question.
					</span>
				</div>
			</div>

			{showSettings && (
				<Settings
					onClose={() => setShowSettings(false)}
					onSaved={(next, savedKey) => {
						setConfig(next);
						setKey(savedKey);
					}}
				/>
			)}
		</section>
	);
}

/** Read the SSE body, one `data:` line at a time. */
async function read(body: ReadableStream<Uint8Array>, onEvent: (event: AgentEvent) => void): Promise<void> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		// A frame ends at a blank line, and a chunk may hold none, one, or six.
		const frames = buffer.split('\n\n');
		buffer = frames.pop() ?? '';
		for (const frame of frames) {
			const line = frame.trim();
			if (!line.startsWith('data:')) continue;
			try {
				onEvent(JSON.parse(line.slice(5).trim()) as AgentEvent);
			} catch {
				// A frame that is not JSON is not worth breaking the stream over.
			}
		}
	}
}

/**
 * What a proposal looks like before it is accepted.
 *
 * The diff first, because that is what has to be read; the button after it,
 * because a button above a diff gets pressed before the diff does.
 */
function Proposal({
	rows,
	counted,
	problems,
	onApply,
}: {
	rows: readonly Row[];
	counted: { added: number; removed: number };
	problems: readonly Problem[];
	onApply: () => void;
}) {
	const shown = hunks(rows);

	if (problems.length > 0) {
		return (
			<div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
				<p className="font-semibold">The proposed document does not parse, so it is not offered.</p>
				<ul className="mt-1 space-y-0.5">
					{problems.slice(0, 4).map((problem) => (
						<li key={`${problem.line}:${problem.message}`}>
							line {problem.line}: {problem.message}
						</li>
					))}
				</ul>
				<p className="mt-1.5">Say what was wrong and ask again — it can usually fix it.</p>
			</div>
		);
	}

	if (counted.added === 0 && counted.removed === 0) {
		return (
			<p className="mt-3 text-xs text-ink-muted dark:text-slate-400">
				The proposed document is identical to the one you have.
			</p>
		);
	}

	return (
		<div className="mt-3 overflow-hidden rounded-md border border-slate-300 dark:border-slate-700">
			<div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900">
				<span className="font-semibold">Proposed</span>
				<span className="text-ink-muted dark:text-slate-400">
					+{counted.added} −{counted.removed}
				</span>
				<button
					type="button"
					onClick={onApply}
					title="Replace the document. ⌘Z takes it back."
					className="ml-auto rounded bg-brand px-2 py-0.5 text-xs font-semibold text-white hover:bg-brand-strong"
				>
					Apply
				</button>
			</div>
			<div className="max-h-72 overflow-auto bg-white font-mono text-[11px] leading-[1.5] dark:bg-slate-950">
				{shown.map((row, index) =>
					row === null ? (
						<div key={`gap:${index}`} className="border-y border-slate-200 bg-slate-50 px-2 py-0.5 text-center text-ink-muted dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
							⋯
						</div>
					) : (
						<div
							key={`${index}:${row.text}`}
							className={`px-2 whitespace-pre ${
								row.kind === 'added'
									? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
									: row.kind === 'removed'
										? 'bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200'
										: 'text-ink-muted dark:text-slate-400'
							}`}
						>
							{row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '} {row.text}
						</div>
					),
				)}
			</div>
		</div>
	);
}

/**
 * The empty state, which is really two: no key yet, and nothing asked yet.
 *
 * The examples are not decoration. Somebody meeting this has no idea what it is
 * for, and "ask me anything" is the least useful thing a panel can say — these
 * are the three questions the notation exists to provoke.
 */
function Blank({
	hasKey,
	language,
	onSettings,
}: {
	hasKey: boolean;
	language: Language;
	onSettings: () => void;
}) {
	if (!hasKey) {
		return (
			<div className="text-xs text-ink-muted dark:text-slate-400">
				<p>
					No API key yet. It stays in this browser and is sent with each request; nothing is kept
					on the server.
				</p>
				<button
					type="button"
					onClick={onSettings}
					className="mt-2 rounded-md bg-brand px-3 py-1 text-xs font-semibold text-white hover:bg-brand-strong"
				>
					Add a key
				</button>
			</div>
		);
	}

	const examples =
		language === 'ddd'
			? [
					'Is any of these relationships more aspirational than honest?',
					'Which subdomain is doing too much to be one subdomain?',
					'Give the arrows that have no `because` a rationale worth arguing with.',
				]
			: [
					'What invariant is each aggregate missing?',
					'Is any of these aggregates really two?',
					'Should anything here be referenced by identity rather than contained?',
				];

	return (
		<div className="text-xs text-ink-muted dark:text-slate-400">
			<p>
				The whole document goes with whatever you ask. Questions come back as prose; ask for a
				change and you get a document to review before it replaces yours.
			</p>
			<ul className="mt-2 space-y-1">
				{examples.map((example) => (
					<li key={example} className="italic">
						“{example}”
					</li>
				))}
			</ul>
		</div>
	);
}
