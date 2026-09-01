/**
 * What the panel sends, what the route sends back, and how a proposal is found.
 *
 * The wire is deliberately small: one request, one stream of events, no session
 * and no state on either side. The route holds nothing between calls — see
 * `src/pages/api/agent.ts` — so everything the model needs to answer travels
 * with the question.
 */

/** The two documents this tool knows. The guide is written for one at a time. */
export type Language = 'ddd' | 'ddm';

export const LANGUAGE_LABEL: Record<Language, string> = {
	ddd: 'context map',
	ddm: 'domain model',
};

/** What Claude is asked to spend on the answer. See the `effort` parameter. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

export interface AgentRequest {
	readonly language: Language;
	/** The document as it stands, verbatim. */
	readonly source: string;
	/** What was typed in the prompt box. */
	readonly prompt: string;
	readonly model: string;
	readonly effort: Effort;
	/** The visitor's own standing instructions, appended to the guide. */
	readonly guidance: string;
}

/**
 * One thing that happened, as it happens.
 *
 * `thinking` is separate from `text` because it is shown differently and
 * discarded rather than kept: it is the model working, not its answer.
 */
export type AgentEvent =
	| { readonly type: 'thinking'; readonly text: string }
	| { readonly type: 'text'; readonly text: string }
	| { readonly type: 'usage'; readonly input: number; readonly output: number; readonly cached: number }
	| { readonly type: 'error'; readonly message: string };

// ---------------------------------------------------------------------------

/**
 * The proposed document in an answer, or null when there is none.
 *
 * A fenced block rather than a structured output, and the reason is the prose:
 * an answer has to *stream*, and JSON does not stream into a reader's eyes —
 * they would watch a string of escaped newlines arrive and then see a paragraph
 * appear at the end. A fence also degrades in the right direction. No fence
 * means advice, which is most answers.
 *
 * **The last fence wins, and only one is honoured.** The guide asks for exactly
 * one; a model that writes a small illustrative snippet before the real answer
 * would otherwise have its illustration applied to somebody's file.
 */
export function proposalIn(answer: string, language: Language): string | null {
	// The opening fence must be at the start of a line and carry the tag, so a
	// language named in a sentence — "wrap it in a ```ddm block" — is prose.
	const fence = new RegExp(`^\`\`\`${language}[ \\t]*\\r?\\n([\\s\\S]*?)^\`\`\`[ \\t]*$`, 'gm');

	let found: string | null = null;
	for (const match of answer.matchAll(fence)) found = match[1] ?? null;

	return found === null || found.trim() === '' ? null : found;
}

/**
 * The answer with its proposal taken out, for rendering the prose alone.
 *
 * The document is shown as a diff underneath, so leaving it in the prose too
 * would print it twice — once unreadably.
 */
export function proseIn(answer: string, language: Language): string {
	const fence = new RegExp(`^\`\`\`${language}[ \\t]*\\r?\\n[\\s\\S]*?^\`\`\`[ \\t]*$`, 'gm');
	return answer.replace(fence, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Whether a fence has been opened and not yet closed.
 *
 * Mid-stream, the tail of the answer is half a document. The panel uses this to
 * say "writing a proposal…" rather than rendering the fragment as prose, which
 * would flash a wall of `.ddm` at somebody who asked a question.
 */
export function openFence(answer: string, language: Language): boolean {
	// The opening fence carries the tag and the closing one does not, so the two
	// counts never overlap and an unclosed block is simply the arithmetic.
	const opens = answer.match(new RegExp(`^\`\`\`${language}[ \\t]*$`, 'gm'))?.length ?? 0;
	const closes = answer.match(/^```[ \t]*$/gm)?.length ?? 0;
	return opens > closes;
}
