import type { APIRoute } from 'astro';
import { notationDocument } from '../lib/mapper/instructions';

// The notation as Markdown at a stable address, for an agent that can fetch a URL
// but has no board to press "export" in. The bytes are the export dialog's
// ba-cm-notation.md, produced by the same function, so the download and this
// route cannot disagree.
//
// Rendered per request rather than prerendered: a prerendered endpoint becomes
// an extensionless file under dist/client, and the static handler would guess
// its content type instead of saying text/markdown.
export const GET: APIRoute = () =>
  new Response(notationDocument(), {
    status: 200,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': 'inline; filename="ba-cm-notation.md"',
    },
  });
