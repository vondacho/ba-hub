/**
 * Where a map can go, and what it becomes on the way.
 *
 * One place that knows the five destinations, so nothing else has to. The
 * dialog reads this list to draw its rows; the mapper hands it a request and
 * gets files back. Neither of them knows what a zip is, and neither of them
 * composes a filename.
 *
 * ## Scope is a choice again, and the dialog is what changed
 *
 * There used to be an export that wrote the `.ddd` and its sidecar alone, and
 * another that wrote the arrangement by itself. Both were folded into the
 * archive, and the reason was good: a *toolbar* with three exports on it makes
 * somebody choose between them every time, having first worked out that the
 * difference is scope — and a 28px square has nowhere to explain that.
 *
 * The objection was never that two scopes are two scopes. It was that nothing
 * could say which was which. A row can: "the map alone, without the models" is
 * six words, and it sits under the archive where anybody comparing them reads
 * both sentences before ticking either.
 *
 * So the map on its own is a row again. The archive stays first and stays the
 * default, because it is the one that cannot lose anything; the narrower row
 * sits under it and says in its own sentence what it leaves behind. Beside
 * those two, the dialog offers a second axis entirely — a picture, a document,
 * the practice — which is a choice about *what kind of artefact* rather than
 * about how much of one.
 *
 * It also fixes something the old arrangement had wrong. The picture lived on
 * the canvas's own toolbar because it is a copy of the live tree rather than a
 * second renderer, which is a true fact about where the *code* lives and a
 * confusing one for anybody looking for a file. The picture is still produced
 * by the canvas — see `raster.ts` — and it is now offered where every other
 * file is.
 *
 * ## No canvas, no picture
 *
 * With the panes set to source only the graph is unmounted, so there is nothing
 * to serialise. The mapper says so and both picture rows go quiet with the
 * reason on them; see `unavailable` in the dialog.
 *
 * ## What "produce" promises
 *
 * A list of named blobs, and no side effect. Nothing here downloads anything:
 * the caller decides what to do with them, which is what makes a run of several
 * destinations one loop rather than six special cases.
 *
 * A *list* because one destination is two files: the map on its own comes out
 * as a `.ddd` and the `.dddview` beside it, loose rather than zipped, because
 * the `.ddd` is the file that goes in a pull request and a `.ddd` inside an
 * archive is one somebody has to unpack before they can review it. Every other
 * destination returns a list of one, which is a cheaper uniformity than a
 * return type that is sometimes an array.
 */

import type { IconName } from '../../components/mapper/Icon';
import type { DddDocument } from '../ddd/model';
import { outline } from '../ddd/outline';
import { svgToPng, sizeOf } from '../graph/raster';
import { DOCTRINE_STEM, doctrineDocument, NOTATION_STEM, notationDocument } from './instructions';
import { mapAlone, outgoing } from '../bundle';
import { zip } from '../zip';
import { slug, svgFilenameFor } from '../files';

export type DestinationId = 'bundle' | 'map' | 'svg' | 'png' | 'outline' | 'notation' | 'doctrine';

/**
 * Which half of the dialog a destination belongs in.
 *
 * `map` is this map or something derived from it; `reference` is a document
 * about the practice, identical whatever is open.
 */
export type Group = 'map' | 'reference';

/** One file, named. A destination produces at least one. */
export interface ExportFile {
	readonly filename: string;
	readonly blob: Blob;
}

export interface Destination {
	readonly id: DestinationId;
	/** The row's heading. What the file is, not what the format is called. */
	readonly label: string;
	/**
	 * What lands, as the chip on the row spells it.
	 *
	 * Usually one extension and occasionally two, because a destination is
	 * allowed to be more than one file — see `produce`. It is display text
	 * rather than a format identifier, and nothing matches on it.
	 */
	readonly extension: string;
	/**
	 * How many files this writes, in the ordinary case.
	 *
	 * Here so the dialog's footer can count *files* rather than ticked rows, and
	 * so the line about the browser asking before it saves several appears when
	 * several is true. Two ticks that write three files is exactly the case a
	 * count of rows gets wrong.
	 *
	 * "Ordinary" is doing one small job: the map on its own says 2, and writes 1
	 * in the single case where this browser has never stored an arrangement for
	 * the title — a board exported inside the first autosave of a document it
	 * did not already hold. The count is then one high, which shows the caution
	 * about several downloads slightly early and misstates nothing anybody acts
	 * on. Deriving it truthfully would mean asking the store what it holds every
	 * time the dialog renders, to correct a number by one, in a case that lasts
	 * four hundred milliseconds.
	 */
	readonly writes: number;
	readonly icon: IconName;
	/** One sentence: what this is for, and when to reach for it. */
	readonly what: string;
	/**
	 * Whether this destination is a copy of the canvas rather than of the model.
	 *
	 * True for the two pictures, and it is the only reason a row can be
	 * unavailable: no canvas, nothing to copy. The dialog does not read this —
	 * the mapper passes it a reason instead — but the catalogue says it out loud
	 * so that a destination added later has somewhere to declare the dependency
	 * rather than discovering it as a null.
	 */
	readonly needsCanvas: boolean;
	readonly group: Group;
}

/**
 * The six, in the order the dialog offers them.
 *
 * The archive first, because it is the one that cannot lose anything, and the
 * map on its own second — the two of them are one question asked at two scopes,
 * so they sit together and the narrower one's sentence says what it leaves out.
 * Then the two pictures, vector before raster since the raster is a photograph
 * of it, then the outline because it is read rather than looked at, and the two
 * reference documents last.
 */
export const DESTINATIONS: readonly Destination[] = [
	{
		id: 'bundle',
		label: 'The map and its models',
		extension: '.zip',
		icon: 'export',
		what: 'The `.ddd`, its arrangement, and a `.ddm` for every context this browser has one for — one archive, one folder per context. The only one of these that can be opened back into a map.',
		writes: 1,
		needsCanvas: false,
		group: 'map',
	},
	{
		id: 'map',
		label: 'The map alone',
		extension: '.ddd + .dddview',
		icon: 'export',
		what: 'The document and its arrangement, loose, without the models. The `.ddd` is what goes in a pull request. The `.dddview` cannot be opened back on its own yet — only inside a full archive — so keep it beside its map.',
		writes: 2,
		needsCanvas: false,
		group: 'map',
	},
	{
		id: 'svg',
		label: 'Picture, as vector',
		extension: '.svg',
		icon: 'vector',
		what: 'The map exactly as the canvas has it, arrangement and all. Scales without going soft — for print, or for editing in a drawing tool.',
		writes: 1,
		needsCanvas: true,
		group: 'map',
	},
	{
		id: 'png',
		label: 'Picture, as image',
		extension: '.png',
		icon: 'picture',
		what: 'The same drawing, rastered at 2×. What you paste into a slide, a ticket or a chat.',
		writes: 1,
		needsCanvas: true,
		group: 'map',
	},
	{
		id: 'outline',
		label: 'Outline',
		extension: '.md',
		icon: 'notes',
		what: 'Every domain, context and relationship as Markdown, with the `intent` and `because` prose in full and led by what the map is telling you. Searchable, diffable, readable in a pull request.',
		writes: 1,
		needsCanvas: false,
		group: 'map',
	},
	{
		id: 'notation',
		label: 'Notation reference',
		extension: '.md',
		icon: 'notation',
		what: 'Both grammars — `.ddd` and `.ddm` — plus the sidecars and the rules for editing somebody else’s map. Hand it to an agent working on a map outside this tab.',
		writes: 1,
		needsCanvas: false,
		group: 'reference',
	},
	{
		id: 'doctrine',
		label: 'Doctrine',
		extension: '.md',
		icon: 'doctrine',
		what: 'What a good context map and a good domain model do — including why a `conformist` is not there to be upgraded.',
		writes: 1,
		needsCanvas: false,
		group: 'reference',
	},
];

export function destination(id: DestinationId): Destination {
	const found = DESTINATIONS.find((entry) => entry.id === id);
	if (found === undefined) throw new Error(`No export destination called ${id}.`);
	return found;
}

/** Everything the five of them draw on. Assembled once, by the mapper. */
export interface ExportRequest {
	readonly document: DddDocument;
	/**
	 * The text in the pane, live.
	 *
	 * Passed rather than read from the store, because the store is four hundred
	 * milliseconds behind the textarea and an export that quietly omitted the
	 * last sentence somebody typed would be the worst kind of bug: invisible
	 * until it matters. `outgoing` makes the same argument.
	 */
	readonly source: string;
	/**
	 * The canvas's own serialisation, or `null` when there is no canvas.
	 *
	 * A string rather than a function, because the mapper has already asked the
	 * graph for it — see `serialize` on the graph's handle — and asking twice
	 * for the SVG and the PNG would clone the live tree twice to produce two
	 * copies of one picture.
	 */
	readonly svg: string | null;
}

/** The file this destination would produce, ready to be handed to the browser. */
export async function produce(id: DestinationId, request: ExportRequest): Promise<readonly ExportFile[]> {
	const { document: map } = request;

	switch (id) {
		case 'bundle': {
			const contexts = map.nodes.filter((node) => node.kind === 'context').map((node) => node.name);
			const bundle = outgoing(map.title, request.source, contexts);
			return [{ filename: `${bundle.root}.zip`, blob: await zip(bundle.entries) }];
		}

		/*
		 * Two loose files, under the names the store keeps them under.
		 *
		 * `mapAlone` owns both the pairing and the naming, because filenames
		 * *are* the storage keys in this tool — that is what lets an import need
		 * no manifest — and these two have to be the same names the full archive
		 * writes inside its folder. Two ways to spell them would fail silently:
		 * a re-import landing as a second document beside the one it came from.
		 */
		case 'map':
			return mapAlone(map.title, request.source).map((file) => ({
				filename: file.name,
				blob: new Blob([file.text], { type: 'text/plain;charset=utf-8' }),
			}));

		case 'svg': {
			// Guarded rather than assumed. The dialog will not offer the row
			// without a canvas, but a catalogue that trusted a caller to have
			// checked would be one refactor away from writing an empty picture.
			if (request.svg === null) throw new Error('There is no canvas to copy: the map pane is not showing.');
			return [
				{
					filename: svgFilenameFor(map.title),
					blob: new Blob([request.svg], { type: 'image/svg+xml;charset=utf-8' }),
				},
			];
		}

		case 'png': {
			if (request.svg === null) throw new Error('There is no canvas to copy: the map pane is not showing.');
			const size = sizeOf(request.svg);
			if (size === null) throw new Error('The picture has no size to raster at.');
			return [
				{ filename: `${slug(map.title, 'map')}.png`, blob: await svgToPng({ svg: request.svg, ...size }) },
			];
		}

		case 'outline':
			return [
				{
					filename: `${slug(map.title, 'map')}.md`,
					blob: new Blob([outline(map)], { type: 'text/markdown;charset=utf-8' }),
				},
			];

		// Neither reads the map. They are the practice — see the note at the top
		// of src/lib/mapper/instructions.ts for why a tool ships its own
		// instructions at all.
		case 'notation':
			return [
				{
					filename: `${NOTATION_STEM}.md`,
					blob: new Blob([notationDocument()], { type: 'text/markdown;charset=utf-8' }),
				},
			];

		case 'doctrine':
			return [
				{
					filename: `${DOCTRINE_STEM}.md`,
					blob: new Blob([doctrineDocument()], { type: 'text/markdown;charset=utf-8' }),
				},
			];
	}
}
