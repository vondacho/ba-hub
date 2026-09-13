import type { APIRoute } from 'astro';
import { doctrineDocument } from '../lib/mapper/instructions';

// The doctrine as Markdown at a stable address, for an agent that can fetch a URL
// but has no board to press "export" in. The bytes are the export dialog's
// ba-cm-doctrine.md, produced by the same function, so the download and this
// route cannot disagree.
//
// Rendered per request rather than prerendered: a prerendered endpoint becomes
// an extensionless file under dist/client, and the static handler would guess
// its content type instead of saying text/markdown.
export const GET: APIRoute = () =>
  new Response(doctrineDocument(), {
    status: 200,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': 'inline; filename="ba-cm-doctrine.md"',
    },
  });
