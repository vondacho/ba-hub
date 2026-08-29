import type { APIRoute } from 'astro';

// Probe target for the Helm chart's startup/liveness/readiness checks.
// Deliberately renders no page: it answers whether the Node server is serving,
// not whether any particular route is healthy. The chart's helm test is what
// covers the routes — see helm/ba-ddd-mapper/templates/tests/.
export const GET: APIRoute = () =>
  new Response(JSON.stringify({ status: 'UP' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
