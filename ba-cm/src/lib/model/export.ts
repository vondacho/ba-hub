/**
 * Where a domain model can go, and what it becomes on the way.
 *
 * `mapper/export.ts` one zoom level down, and the same three promises: one
 * place knows the destinations, `produce` has no side effect, and a destination
 * may be more than one file. The dialog draws whatever this list holds.
 *
 * ## Why the model page needed this at all
 *
 * It had two export buttons in two places and neither could say what it wrote.
 * The pair of text files was on the document toolbar; the picture was on the
 * canvas's own bar, because the picture is a copy of the live tree rather than
 * a second renderer — a true fact about where the code lives and a useless one
 * to somebody looking for a file. That is exactly the arrangement the map had
 * before its dialog, and the argument against it is the map's: a row in a list
 * can carry a sentence, a 28px square cannot, and "SVG" is not the question
 * anybody has.
 *
 * ## No archive here, and it is not an omission
 *
 * The map page's first row is the `.zip` holding a map and every model this
 * browser has for the contexts it names. There is no model-shaped version of
 * that, because the archive's shape *is* the relationship: a folder per context
 * inside the map's folder. A model does not know which map names it — the two
 * documents are matched by name, deliberately, so that neither holds a pointer
 * into the other — so an archive built from here would be one document in a
 * folder guessing at its parent. The row that carries this model is on the map
 * page, and the model's own row says so.
 */

import type { Destination, ExportFile, Section } from '../destinations';
import type { DomainModel } from '../ddm/model';
import { outline } from '../ddm/outline';
import { svgToPng, sizeOf } from '../graph/raster';
import { plantuml } from '../ddm/puml';
import { mermaid } from '../ddm/mermaid';
import { DOCTRINE_STEM, doctrineDocument, NOTATION_STEM, notationDocument } from '../mapper/instructions';
import { modelAlone } from '../bundle';
import { slug, svgFilenameFor } from '../files';

export type DestinationId =
	| 'model'
	| 'svg'
	| 'png'
	| 'puml'
	| 'mermaid'
	| 'outline'
	| 'notation'
	| 'doctrine';

/**
 * Which half of the dialog a destination belongs in.
 *
 * `model` is this model or something derived from it; `reference` is a document
 * about the practice, identical whatever is open — and identical to the map
 * page's, because the practice does not change with the zoom level.
 */
export type Group = 'model' | 'reference';

/**
 * The eight, in the order the dialog offers them.
 *
 * The text pair first, because it is the only one that can be opened back into
 * a model. Then the two pictures, vector before raster since the raster is a
 * photograph of it; then the two diagram sources, which are a picture that
 * arrives as instructions for drawing one; then the outline, which is read
 * rather than looked at; then the two reference documents.
 *
 * The two diagram rows carry more here than they do on the map page, and it is
 * worth saying why the model page wanted them first. A class diagram is where
 * an invariant goes to be left out — `ddm/outline.ts` makes that argument — so
 * both of these put what each aggregate protects on the picture, as a note. A
 * `.ddm` rendered without them would be the drawing of the database this format
 * exists to refuse.
 */
export const DESTINATIONS: readonly Destination<DestinationId, Group>[] = [
	{
		id: 'model',
		label: 'The model and its arrangement',
		extension: '.ddm + .ddmview',
		icon: 'export',
		what: 'The document and the positions you have dragged it into, loose. The `.ddm` is what goes in a pull request; the `.ddmview` beside it is what stops the next person seeing the computed layout instead of yours. To carry this model together with the map that names its context, export the archive from the map page.',
		writes: 2,
		needsCanvas: false,
		group: 'model',
	},
	{
		id: 'svg',
		label: 'Picture, as vector',
		extension: '.svg',
		icon: 'vector',
		what: 'The model exactly as the canvas has it, arrangement and all. Scales without going soft — for print, or for editing in a drawing tool.',
		writes: 1,
		needsCanvas: true,
		group: 'model',
	},
	{
		id: 'png',
		label: 'Picture, as image',
		extension: '.png',
		icon: 'picture',
		what: 'The same drawing, rastered at 2×. What you paste into a slide, a ticket or a chat.',
		writes: 1,
		needsCanvas: true,
		group: 'model',
	},
	{
		id: 'puml',
		label: 'Diagram, as PlantUML',
		extension: '.puml',
		icon: 'diagram',
		what: 'Every aggregate as a class diagram a renderer somewhere else draws, with what each one protects as a note beside its root. Text, so it diffs like the `.ddm` does; the layout is the renderer’s.',
		writes: 1,
		needsCanvas: false,
		group: 'model',
	},
	{
		id: 'mermaid',
		label: 'Diagram, as Mermaid',
		extension: '.mmd',
		icon: 'diagram',
		what: 'The same class diagram in the language GitHub, GitLab and most wikis already render on the page. Paste it into a pull request and the model appears in the review.',
		writes: 1,
		needsCanvas: false,
		group: 'model',
	},
	{
		id: 'outline',
		label: 'Outline',
		extension: '.md',
		icon: 'notes',
		what: 'Every aggregate, what it protects, what it holds, and what crosses between them — as Markdown, with the invariants in full. Searchable, diffable, readable in a pull request.',
		writes: 1,
		needsCanvas: false,
		group: 'model',
	},
	{
		id: 'notation',
		label: 'Notation reference',
		extension: '.md',
		icon: 'notation',
		what: 'Both grammars — `.ddd` and `.ddm` — plus the sidecars and the rules for editing somebody else’s model. Hand it to an agent working on a model outside this tab.',
		writes: 1,
		needsCanvas: false,
		group: 'reference',
	},
	{
		id: 'doctrine',
		label: 'Doctrine',
		extension: '.md',
		icon: 'doctrine',
		what: 'What a good context map and a good domain model do — including why an aggregate with no invariant is the first thing to question.',
		writes: 1,
		needsCanvas: false,
		group: 'reference',
	},
];

/** The dialog's two headings. See `Section` for why the copy lives out here. */
export const SECTIONS: readonly Section<Group>[] = [
	{ group: 'model', title: 'This model', blurb: null },
	{
		group: 'reference',
		title: 'The practice',
		blurb:
			'Not about this model. Instructions to hand a coding agent working on a .ddd or .ddm file somewhere else — the same text this tool’s own assistant is given.',
	},
];

/** Ticked when nothing else has been said: the one that is not a rendering. */
export const INITIAL: readonly DestinationId[] = ['model'];

/** Everything the eight of them draw on. Assembled once, by the model page. */
export interface ExportRequest {
	readonly document: DomainModel;
	/**
	 * The text in the pane, live.
	 *
	 * Passed rather than read from the store, because the store is four hundred
	 * milliseconds behind the textarea and an export that quietly omitted the
	 * last sentence somebody typed would be the worst kind of bug: invisible
	 * until it matters.
	 */
	readonly source: string;
	/** The arrangement, already serialised. `modelAlone` says why it comes in. */
	readonly view: string;
	/**
	 * The canvas's own serialisation, or `null` when there is no canvas.
	 *
	 * A string rather than a function, because the page has already asked the
	 * diagram for it — see `serialize` on the canvas handle — and asking twice
	 * for the SVG and the PNG would clone the live tree twice to produce two
	 * copies of one picture.
	 */
	readonly svg: string | null;
}

/** The file this destination would produce, ready to be handed to the browser. */
export async function produce(
	id: DestinationId,
	request: ExportRequest,
): Promise<readonly ExportFile[]> {
	const { document: model } = request;

	switch (id) {
		case 'model':
			return modelAlone(model.context, request.source, request.view).map((file) => ({
				filename: file.name,
				blob: new Blob([file.text], { type: 'text/plain;charset=utf-8' }),
			}));

		case 'svg': {
			// Guarded rather than assumed. The dialog will not offer the row
			// without a canvas, but a catalogue that trusted a caller to have
			// checked would be one refactor away from writing an empty picture.
			if (request.svg === null) {
				throw new Error('There is no canvas to copy: the model pane is not showing.');
			}
			return [
				{
					filename: svgFilenameFor(model.context, 'model'),
					blob: new Blob([request.svg], { type: 'image/svg+xml;charset=utf-8' }),
				},
			];
		}

		case 'png': {
			if (request.svg === null) {
				throw new Error('There is no canvas to copy: the model pane is not showing.');
			}
			const size = sizeOf(request.svg);
			if (size === null) throw new Error('The picture has no size to raster at.');
			return [
				{
					filename: `${slug(model.context, 'model')}.png`,
					blob: await svgToPng({ svg: request.svg, ...size }),
				},
			];
		}

		/*
		 * Neither reads the canvas, which is the point of them: with the panes
		 * set to source only both picture rows go quiet, and these two still
		 * write a picture — rendered from the document rather than copied from
		 * the frame it was last drawn in.
		 */
		case 'puml':
			return [
				{
					filename: `${slug(model.context, 'model')}.puml`,
					blob: new Blob([plantuml(model)], { type: 'text/plain;charset=utf-8' }),
				},
			];

		case 'mermaid':
			return [
				{
					filename: `${slug(model.context, 'model')}.mmd`,
					blob: new Blob([mermaid(model)], { type: 'text/plain;charset=utf-8' }),
				},
			];

		case 'outline':
			return [
				{
					filename: `${slug(model.context, 'model')}.md`,
					blob: new Blob([outline(model)], { type: 'text/markdown;charset=utf-8' }),
				},
			];

		// Neither reads the model. They are the practice, and they are the map
		// page's files unchanged — see `mapper/instructions.ts` for why a tool
		// ships its own instructions at all.
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
