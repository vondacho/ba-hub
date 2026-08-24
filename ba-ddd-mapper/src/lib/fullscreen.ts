/**
 * Full screen, for an element that owns a whole editor.
 *
 * Both editors take the *whole* panel — text, problems and picture — rather
 * than the drawing alone. Both panels are the tool: a diagram on a large
 * display with the text it is made of hidden behind it is the wrong half, and
 * the text is the source of truth.
 *
 * The state is read back from the `fullscreenchange` event rather than set
 * optimistically on click, because Escape and the browser's own chrome can
 * leave full screen without going through the button, and a flag that only the
 * button maintains is a flag that lies about half the time.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function useFullscreen<T extends HTMLElement>() {
	const root = useRef<T>(null);
	const [fullscreen, setFullscreen] = useState(false);

	useEffect(() => {
		const onChange = () => setFullscreen(document.fullscreenElement === root.current);
		document.addEventListener('fullscreenchange', onChange);
		return () => document.removeEventListener('fullscreenchange', onChange);
	}, []);

	const toggle = useCallback(() => {
		if (document.fullscreenElement) {
			void document.exitFullscreen?.();
			return;
		}
		// Rejected when the gesture is not trusted, which is not worth reporting:
		// nothing happens, and the button is still there.
		void root.current?.requestFullscreen?.().catch(() => undefined);
	}, []);

	return { root, fullscreen, toggle };
}
