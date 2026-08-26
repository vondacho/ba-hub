/**
 * Editing one field of a document that is really a string.
 *
 * Both panels — the map's inspector and the model's — write by splicing a span
 * and re-parsing on a debounce, and both therefore need the same small piece of
 * discipline about what a text box is showing. It lives here because it is the
 * same piece: a hook and the class that makes a box look like the others.
 */

import { useRef, useState } from 'react';

/**
 * A draft that commits on Enter or blur, and is abandoned on Escape.
 *
 * Every editable field in these panels shares it, and they have to: each commit
 * is a splice that re-parses on a debounce, so a field bound straight to the
 * parsed document would echo the visitor's own keystrokes back at them a
 * quarter-second late and out of order. The draft is what they are typing; the
 * document is what they have said.
 *
 * Escape sets a ref rather than state because the blur that follows it runs
 * with the pre-Escape render's closure and would otherwise commit the very
 * text the visitor just asked to throw away.
 */
export function useDraft(
	current: string,
	commit: (next: string) => void,
	options?: { multiline: boolean },
) {
	const [draft, setDraft] = useState<string | null>(null);
	const abandoned = useRef(false);

	return {
		value: draft ?? current,
		onChange: (event: { target: { value: string } }) => setDraft(event.target.value),
		onBlur: () => {
			const pending = draft;
			setDraft(null);
			if (abandoned.current) {
				abandoned.current = false;
				return;
			}
			if (pending === null || pending.trim() === current.trim()) return;
			commit(pending);
		},
		onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
			// In prose, Enter is a newline and the commit moves to ⌘/ctrl+Enter.
			// A field that submitted on Enter would make a two-paragraph intent
			// impossible to type.
			const submit = !options?.multiline || event.metaKey || event.ctrlKey;
			if (event.key === 'Enter' && submit) {
				event.preventDefault();
				event.currentTarget.blur();
			}
			if (event.key === 'Escape') {
				abandoned.current = true;
				setDraft(null);
				event.currentTarget.blur();
			}
		},
	};
}

export const FIELD_CLASS =
	'w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm placeholder:text-ink-muted focus:border-brand focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:placeholder:text-slate-500';
