/**
 * The `.ddd` lexer.
 *
 * Adapted from doc-es's, with one change that drives the whole component: every
 * token carries the byte offsets it came from, not only a line and column.
 *
 * doc-es needs line/column to report a problem. ba-cm needs `start`/`end`
 * because a gesture in the graph is a *splice into the source text* — see the
 * inversion argument in README.md. A parser that only tracked line numbers
 * could report an error and could not rename a node without rewriting the file.
 */

import type { Span } from './model';

export type TokenType =
	/** A bare word: keyword, classification, pattern, status. */
	| 'word'
	/** A quoted string, already unescaped and line-joined. */
	| 'string'
	| '{'
	| '}'
	| ':'
	| '/'
	/** `->` */
	| 'arrow'
	/** `<->` */
	| 'biarrow'
	| 'eof';

export interface Token {
	readonly type: TokenType;
	/** For `word` and `string`, the value. Empty for punctuation. */
	readonly value: string;
	readonly span: Span;
}

const PUNCT: Record<string, TokenType> = {
	'{': '{',
	'}': '}',
	':': ':',
	'/': '/',
};

/**
 * A lexical error. Thrown rather than collected, because a broken string
 * literal makes every token after it meaningless — there is no useful recovery
 * and pretending otherwise produces a cascade of nonsense in the problems
 * panel.
 */
export class DddLexError extends Error {
	constructor(
		message: string,
		readonly span: Span,
	) {
		super(message);
		this.name = 'DddLexError';
	}
}

export function tokenize(source: string): readonly Token[] {
	const tokens: Token[] = [];
	let index = 0;
	let line = 1;
	let column = 1;

	const at = (offset = 0) => source[index + offset] ?? '';
	const here = (): Omit<Span, 'end'> => ({ start: index, line, column });

	const advance = (count = 1) => {
		for (let n = 0; n < count; n += 1) {
			if (source[index] === '\n') {
				line += 1;
				column = 1;
			} else {
				column += 1;
			}
			index += 1;
		}
	};

	const span = (from: Omit<Span, 'end'>): Span => ({
		start: from.start,
		end: index,
		line: from.line,
		column: from.column,
	});

	while (index < source.length) {
		const ch = at();

		// Whitespace.
		if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
			advance();
			continue;
		}

		// `//` line comment. Not emitted as a token: comments survive because the
		// graph splices the source rather than re-serialising a model, so nothing
		// downstream ever needs to know they were there.
		if (ch === '/' && at(1) === '/') {
			while (index < source.length && at() !== '\n') advance();
			continue;
		}

		const from = here();

		// `<->` before `->` before `/`, longest match first.
		if (ch === '<' && at(1) === '-' && at(2) === '>') {
			advance(3);
			tokens.push({ type: 'biarrow', value: '<->', span: span(from) });
			continue;
		}

		if (ch === '-' && at(1) === '>') {
			advance(2);
			tokens.push({ type: 'arrow', value: '->', span: span(from) });
			continue;
		}

		const punct = PUNCT[ch];
		if (punct) {
			advance();
			tokens.push({ type: punct, value: ch, span: span(from) });
			continue;
		}

		if (ch === '"') {
			tokens.push(readString(from));
			continue;
		}

		if (isWordStart(ch)) {
			while (index < source.length && isWordPart(at())) advance();
			tokens.push({
				type: 'word',
				value: source.slice(from.start, index),
				span: span(from),
			});
			continue;
		}

		advance();
		throw new DddLexError(`Unexpected character ${JSON.stringify(ch)}.`, span(from));
	}

	tokens.push({ type: 'eof', value: '', span: { start: index, end: index, line, column } });
	return tokens;

	/**
	 * A double-quoted literal, which may span lines.
	 *
	 * Continuation lines are joined with a single space after leading whitespace
	 * is stripped, which is what lets `intent` and `because` hold a paragraph
	 * without the file growing 300-column lines. `\"` and `\\` escape; nothing
	 * else does, deliberately — a `because` field is two or three sentences, and
	 * a format that invited more would collect design documents in a field the
	 * graph renders as a tooltip.
	 */
	function readString(from: Omit<Span, 'end'>): Token {
		advance(); // opening quote

		const parts: string[] = [];
		let current = '';
		let sawNewline = false;

		while (true) {
			if (index >= source.length) {
				throw new DddLexError('Unterminated string — no closing quote.', span(from));
			}

			const ch = at();

			if (ch === '\\') {
				const next = at(1);
				if (next === '"' || next === '\\') {
					current += next;
					advance(2);
					continue;
				}
				// A lone backslash is a backslash. Inventing more escapes here
				// would mean a Windows path in a note needed doubling.
				current += ch;
				advance();
				continue;
			}

			if (ch === '"') {
				advance();
				break;
			}

			if (ch === '\n') {
				parts.push(current.trimEnd());
				current = '';
				sawNewline = true;
				advance();
				// Leading whitespace on the continuation line is indentation, not
				// content.
				while (index < source.length && (at() === ' ' || at() === '\t')) advance();
				continue;
			}

			current += ch;
			advance();
		}

		parts.push(current);
		const value = sawNewline ? parts.filter((part) => part.length > 0).join(' ') : parts.join('');

		return { type: 'string', value, span: span(from) };
	}
}

function isWordStart(ch: string): boolean {
	return /[A-Za-z_]/.test(ch);
}

function isWordPart(ch: string): boolean {
	// Hyphens are word characters so `open-host-service` and `big-ball-of-mud`
	// lex as one token rather than three and two subtractions.
	return /[A-Za-z0-9_-]/.test(ch);
}
