/**
 * The problems panel.
 *
 * Errors first, then warnings, each in source order. Clicking one selects its
 * line in the editor — which is the only reason `Span` carries a line and
 * column as well as byte offsets.
 *
 * The distinction the panel exists to make: **an error stops the graph from
 * updating; a warning never does.** Warnings here are ba-portal's curation
 * checks made continuous rather than quarterly — an unowned boundary, a generic
 * subdomain somebody has started modelling, a relationship with no rationale —
 * and a map that had to be perfect before it drew is a map nobody would start.
 */

import type { Problem } from '../../lib/ddd/problems';

interface Props {
	problems: readonly Problem[];
	onReveal: (line: number) => void;
	collapsed: boolean;
	onToggle: () => void;
}

export default function ProblemList({ problems, onReveal, collapsed, onToggle }: Props) {
	const errors = problems.filter((problem) => problem.severity === 'error');
	const warnings = problems.filter((problem) => problem.severity === 'warning');
	const ordered = [...errors, ...warnings];

	return (
		<div className="border-t border-slate-200 dark:border-slate-800">
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={!collapsed}
				className="flex w-full items-center gap-3 px-3 py-2 text-left text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-900"
			>
				<span aria-hidden="true" className="text-slate-400">
					{collapsed ? '▸' : '▾'}
				</span>
				{errors.length > 0 && (
					<span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
						{errors.length} error{errors.length === 1 ? '' : 's'}
					</span>
				)}
				{warnings.length > 0 && (
					<span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-900 dark:bg-amber-950 dark:text-amber-300">
						{warnings.length} warning{warnings.length === 1 ? '' : 's'}
					</span>
				)}
				{problems.length === 0 && (
					<span className="text-emerald-700 dark:text-emerald-400">No problems</span>
				)}
			</button>

			{!collapsed && ordered.length > 0 && (
				<ul className="max-h-52 overflow-y-auto border-t border-slate-200 text-xs dark:border-slate-800">
					{ordered.map((problem, index) => (
						<li key={`${problem.line}:${problem.column}:${index}`}>
							<button
								type="button"
								onClick={() => onReveal(problem.line)}
								className="flex w-full gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-900"
							>
								<span
									className={`shrink-0 font-mono ${
										problem.severity === 'error'
											? 'text-rose-600 dark:text-rose-400'
											: 'text-amber-600 dark:text-amber-400'
									}`}
								>
									{problem.line}:{problem.column}
								</span>
								<span className="text-ink-muted dark:text-slate-400">{problem.message}</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
