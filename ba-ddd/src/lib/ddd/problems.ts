/**
 * Diagnostics.
 *
 * Two severities, and the distinction is the one that decides whether the graph
 * draws.
 *
 *   error   — the document does not parse, or parses into something
 *             self-contradictory. The graph shows the last good render.
 *   warning — it parses fine and is worth saying anyway. These are ba-portal's
 *             curation checks made continuous rather than quarterly: an unowned
 *             boundary, a generic subdomain someone has started modelling, a
 *             relationship with no rationale.
 *
 * Warnings never block a render. A map that has to be perfect before it draws
 * is a map nobody starts.
 */

import type { Span } from './model';

export type Severity = 'error' | 'warning';

export interface Problem {
	readonly severity: Severity;
	readonly message: string;
	readonly line: number;
	readonly column: number;
	/** Present when the problem points at a stretch of source worth selecting. */
	readonly span?: Span;
}

/**
 * A cap, matching doc-es's. One malformed line can cascade, and fifty entries
 * is already more than anybody reads — past that the list stops being a list of
 * problems and becomes a wall of them.
 */
export const MAX_PROBLEMS = 50;

export function isSaturated(problems: readonly Problem[]): boolean {
	return problems.length >= MAX_PROBLEMS;
}

export function report(problems: Problem[], problem: Problem): void {
	if (isSaturated(problems)) return;

	// Deduplicate on position and text. A recovering parser can reach the same
	// bad token by two routes, and reporting it twice makes the panel look
	// broken.
	const seen = problems.some(
		(existing) =>
			existing.line === problem.line &&
			existing.column === problem.column &&
			existing.message === problem.message,
	);
	if (seen) return;

	problems.push(problem);
}

export function errorAt(span: Span, message: string): Problem {
	return { severity: 'error', message, line: span.line, column: span.column, span };
}

export function warningAt(span: Span, message: string): Problem {
	return { severity: 'warning', message, line: span.line, column: span.column, span };
}

export function countBy(problems: readonly Problem[], severity: Severity): number {
	return problems.filter((problem) => problem.severity === severity).length;
}

export function hasErrors(problems: readonly Problem[]): boolean {
	return problems.some((problem) => problem.severity === 'error');
}
