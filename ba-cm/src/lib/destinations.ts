/**
 * The vocabulary an export dialog speaks, shared by the two editors.
 *
 * Both pages answer the same question — *what should leave this tab?* — about
 * two different documents, so the panel is one component and the catalogue of
 * answers is one per document: `mapper/export.ts` and `model/export.ts`. This
 * file is what lets those be two lists rather than two dialogs, and it is
 * deliberately types only. A destination knows how to make a file; the panel
 * knows how to draw a row; neither knows what the other's document is.
 *
 * `CanvasBar` is shared on the same terms one level down, and `align.ts` and
 * `useNudge` below that: the two canvases differ in what a box *is* and agree
 * on what a gesture *means*, and every one of these seams sits on that line.
 */

import type { IconName } from '../components/mapper/Icon';

/** One file, named. A destination produces at least one. */
export interface ExportFile {
	readonly filename: string;
	readonly blob: Blob;
}

/**
 * One row in the dialog: what the file is, and when to reach for it.
 *
 * `Id` and `Group` are the catalogue's own unions rather than a shared one.
 * Each page has its own list of destinations and its own headings, and a union
 * of both pages' ids would let a `switch` in one catalogue accept a name only
 * the other one has.
 */
export interface Destination<Id extends string = string, Group extends string = string> {
	readonly id: Id;
	/** The row's heading. What the file is, not what the format is called. */
	readonly label: string;
	/**
	 * What lands, as the chip on the row spells it.
	 *
	 * Usually one extension and occasionally two, because a destination is
	 * allowed to be more than one file. Display text rather than a format
	 * identifier: nothing matches on it.
	 */
	readonly extension: string;
	/**
	 * How many files this writes, in the ordinary case.
	 *
	 * So the dialog's footer can count *files* rather than ticked rows, and the
	 * line about the browser asking before it saves several appears when several
	 * is true. Two ticks that write three files is exactly the case a count of
	 * rows gets wrong.
	 */
	readonly writes: number;
	readonly icon: IconName;
	/** One sentence: what this is for, and when to reach for it. */
	readonly what: string;
	/**
	 * Whether this is a copy of the canvas rather than of the document.
	 *
	 * True for the pictures, and the only reason a row can be temporarily
	 * impossible: no canvas, nothing to copy. The dialog does not read it — the
	 * page passes a reason instead — but the catalogue says the dependency out
	 * loud rather than leaving it to be discovered as a null.
	 */
	readonly needsCanvas: boolean;
	readonly group: Group;
}

/**
 * A heading in the dialog, and the sentence under it.
 *
 * Held beside the catalogue rather than inside it because it is caption copy:
 * the catalogue's job is to know that a destination is reference material, and
 * the page's job is to explain that to somebody reading it for the first time.
 */
export interface Section<Group extends string = string> {
	readonly group: Group;
	readonly title: string;
	readonly blurb: string | null;
}
