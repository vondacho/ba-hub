/**
 * Where the key and the model live, in one panel.
 *
 * `StoreState`'s shape and its manners: a modal that says plainly what this
 * browser is holding on the visitor's behalf, and does not pretend to be more
 * than a browser.
 *
 * **It is honest about the key.** A local-first tool that calls a paid API has
 * exactly one place to keep a credential, and it is not a safe one: anything
 * that can run script on this origin can read `localStorage`. Saying so is the
 * least this can do — and offering *this tab only* as the default is the rest,
 * because the person who has not thought about it should get the smaller
 * exposure rather than the more convenient one.
 */

import { useEffect, useState } from 'react';
import { EFFORTS } from '../../lib/agent/protocol';
import { AGENT_DEFAULTS, loadAgentConfig, loadKey, saveAgentConfig, saveKey, type AgentConfig } from '../../lib/storage';
import { FIELD_CLASS } from '../ui/fields';

/**
 * The models worth offering, and why this list is short.
 *
 * A free-text box would let somebody paste a model name that does not exist and
 * get a 404 four seconds later; a list of everything Anthropic publishes would
 * be a maintenance burden this component has no business carrying. These are
 * the three that make sense for reading a domain model: the default, a cheaper
 * one for quick questions, and the cheapest for when the question is trivial.
 */
const MODELS: readonly { id: string; label: string; note: string }[] = [
	{ id: 'claude-opus-5', label: 'Opus 5', note: 'the default — best at the modelling questions' },
	{ id: 'claude-sonnet-5', label: 'Sonnet 5', note: 'faster and cheaper; good for a quick read' },
	{ id: 'claude-haiku-4-5', label: 'Haiku 4.5', note: 'cheapest; for simple questions only' },
];

export default function Settings({
	onClose,
	onSaved,
}: {
	onClose: () => void;
	onSaved: (config: AgentConfig, key: string) => void;
}) {
	const [config, setConfig] = useState<AgentConfig>(AGENT_DEFAULTS);
	const [key, setKey] = useState('');

	// Read fresh each time it opens, like the store panel: another tab may have
	// changed either since this page loaded.
	useEffect(() => {
		setConfig(loadAgentConfig());
		setKey(loadKey());
	}, []);

	const commit = () => {
		const trimmed = key.trim();
		saveAgentConfig(config);
		saveKey(trimmed, config.remember);
		onSaved(config, trimmed);
		onClose();
	};

	return (
		<div className="absolute inset-0 z-30 flex items-start justify-center bg-slate-900/40 p-6">
			<div className="flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
				<div className="flex items-start justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
					<div>
						<p className="text-[10px] font-semibold tracking-[0.14em] text-ink-muted uppercase dark:text-slate-400">
							assistant
						</p>
						<h2 className="text-base font-semibold">Configuration</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="shrink-0 rounded p-1 text-ink-muted hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
					>
						✕
					</button>
				</div>

				<div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 text-sm">
					<section>
						<label htmlFor="agent-key" className="text-xs font-semibold">
							API key
						</label>
						<input
							id="agent-key"
							type="password"
							value={key}
							autoComplete="off"
							spellCheck={false}
							onChange={(event) => setKey(event.target.value)}
							placeholder="sk-ant-…"
							className={`${FIELD_CLASS} mt-1 font-mono`}
						/>
						<p className="mt-1.5 text-xs text-ink-muted dark:text-slate-400">
							Yours, from console.anthropic.com. It is kept in this browser and sent with each
							request; this server uses it and stores nothing.
						</p>

						{/* The choice, and the sentence that makes it a choice rather than
						    a checkbox somebody clicks past. */}
						<div className="mt-2 flex items-start gap-2">
							<input
								id="agent-remember"
								type="checkbox"
								checked={config.remember}
								onChange={(event) => setConfig({ ...config, remember: event.target.checked })}
								className="mt-0.5"
							/>
							<label htmlFor="agent-remember" className="text-xs">
								Remember it in this browser
								<span className="block text-ink-muted dark:text-slate-400">
									{config.remember
										? 'Kept until you clear it — and readable by anything that can run script on this page.'
										: 'Off: kept for this tab only, and gone when you close it.'}
								</span>
							</label>
						</div>
					</section>

					<section>
						<p className="text-xs font-semibold">Model</p>
						<div className="mt-1 space-y-1">
							{MODELS.map((model) => (
								<label key={model.id} className="flex items-start gap-2 text-xs">
									<input
										type="radio"
										name="agent-model"
										checked={config.model === model.id}
										onChange={() => setConfig({ ...config, model: model.id })}
										className="mt-0.5"
									/>
									<span>
										<strong>{model.label}</strong>
										<span className="text-ink-muted dark:text-slate-400"> — {model.note}</span>
									</span>
								</label>
							))}
						</div>
					</section>

					<section>
						<p className="text-xs font-semibold">Effort</p>
						<div className="mt-1 flex flex-wrap gap-1">
							{EFFORTS.map((effort) => (
								<button
									key={effort}
									type="button"
									onClick={() => setConfig({ ...config, effort })}
									className={`rounded border px-2 py-0.5 text-xs ${
										config.effort === effort
											? 'border-brand bg-brand text-white'
											: 'border-slate-300 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800'
									}`}
								>
									{effort}
								</button>
							))}
						</div>
						<p className="mt-1.5 text-xs text-ink-muted dark:text-slate-400">
							How long it thinks before answering. Higher costs more and is worth it for
							“is this boundary right”; lower is fine for “what does this line mean”.
						</p>
					</section>

					<section>
						<label htmlFor="agent-guidance" className="text-xs font-semibold">
							Standing instructions
						</label>
						<textarea
							id="agent-guidance"
							value={config.guidance}
							rows={4}
							onChange={(event) => setConfig({ ...config, guidance: event.target.value })}
							placeholder="Anything you want said every time: your house terms, a language, conventions this shop keeps."
							className={`${FIELD_CLASS} mt-1 resize-y leading-snug`}
						/>
						<p className="mt-1.5 text-xs text-ink-muted dark:text-slate-400">
							Appended to the guide, and last — so where they conflict, these win.
						</p>
					</section>
				</div>

				<div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
					<button
						type="button"
						onClick={onClose}
						className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={commit}
						className="rounded-md bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-strong"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	);
}
