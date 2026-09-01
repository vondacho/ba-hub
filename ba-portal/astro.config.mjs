// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  // Server-rendered, matching dev-portal, api-portal, arch-portal and
  // qa-portal. Nothing here reads a backend yet, but the Landscapes and Tools
  // panels front the neighbouring hubs and the Context mapper, and those addresses
  // are configuration — they have to be resolved per request rather than baked
  // into the image.
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  // Tailwind 4 is a Vite plugin, not an Astro integration. src/styles/global.css
  // is imported only by the portal's own Layout, so Tailwind's preflight never
  // reaches the Starlight pages under /doc/* — the two themes stay separate and
  // no Starlight/Tailwind compatibility shim is needed.
  vite: { plugins: [tailwindcss()] },
  integrations: [
    starlight({
      title: 'Documentation',
      // Documentation is prose: it has no reason to be rendered per request,
      // and Pagefind builds its index from the emitted HTML — Starlight
      // refuses to enable search when prerendering is off. Only the Starlight
      // routes are affected; everything else stays on-demand.
      prerender: true,
      customCss: ['./src/styles/docs.css'],
      // The order is the order of the work. First what a business analyst is
      // being asked to do differently (the approach), then the strategic
      // distinctions that carry the value — domains, subdomains, bounded
      // contexts, language — then the tactical vocabulary the model is written
      // in, then the processes that run across it. Only then the two sections
      // about recording it (the catalog) and checking it against reality (the
      // landscapes), because neither means anything until there is a model to
      // record. Tooling and MCP come last: they are how, not what.
      sidebar: [
        { label: 'Overview', link: '/doc/' },
        { label: 'The approach', link: '/doc/approach/' },
        {
          label: 'Strategic design',
          items: [
            { label: 'Overview', link: '/doc/strategic/' },
            { label: 'Domains and subdomains', link: '/doc/strategic/domains/' },
            { label: 'Core, supporting, generic', link: '/doc/strategic/subdomain-types/' },
            { label: 'Bounded contexts', link: '/doc/strategic/bounded-contexts/' },
            { label: 'Ubiquitous language', link: '/doc/strategic/ubiquitous-language/' },
            { label: 'Context mapping patterns', link: '/doc/strategic/context-mapping/' },
          ],
        },
        {
          label: 'The domain model',
          items: [
            { label: 'Overview', link: '/doc/model/' },
            { label: 'Entities and value objects', link: '/doc/model/entities-and-values/' },
            { label: 'Aggregates and invariants', link: '/doc/model/aggregates/' },
            { label: 'Domain events', link: '/doc/model/domain-events/' },
            { label: 'Services, policies and rules', link: '/doc/model/services-and-policies/' },
            { label: 'Modelling with the analyst', link: '/doc/model/modelling-together/' },
          ],
        },
        {
          label: 'Business processes',
          items: [
            { label: 'Overview', link: '/doc/processes/' },
            { label: 'Event storming', link: '/doc/processes/event-storming/' },
            { label: 'Process modelling', link: '/doc/processes/modelling/' },
            { label: 'Processes across contexts', link: '/doc/processes/across-contexts/' },
          ],
        },
        {
          label: 'The catalog',
          items: [
            { label: 'Overview', link: '/doc/catalog/' },
            { label: 'What an entry holds', link: '/doc/catalog/entries/' },
            { label: 'Curation and ownership', link: '/doc/catalog/curation/' },
          ],
        },
        {
          label: 'Landscapes',
          // The half of the hub that is about reality rather than intent: what
          // the systems actually do, and where that has drifted from the model.
          items: [
            { label: 'Overview', link: '/doc/landscapes/' },
            { label: 'Context mapping', link: '/doc/landscapes/context-mapping/' },
            { label: 'System mapping', link: '/doc/landscapes/system-mapping/' },
            { label: 'Conformance and drift', link: '/doc/landscapes/conformance/' },
          ],
        },
        {
          label: 'Tooling',
          items: [
            { label: 'Overview', link: '/doc/tooling/' },
            // First because it is the only one that exists, and because the
            // workshop it runs comes before everything else in the hub.
            { label: 'Event Stormer', link: '/doc/tooling/event-stormer/' },
            { label: 'Context mapper', link: '/doc/tooling/context-mapper/' },
            { label: 'Modelling and diagramming', link: '/doc/tooling/modelling/' },
            { label: 'Evidence and discovery', link: '/doc/tooling/evidence/' },
            // Last in the group, and deliberately: it is about using the
            // tools above rather than about any one of them, and it only
            // makes sense once a reader knows what the boards are.
            { label: 'Assistant prompts', link: '/doc/tooling/prompts/' },
          ],
        },
        {
          label: 'MCP',
          items: [
            { label: 'Overview', link: '/doc/mcp/' },
            { label: 'Domain distillation', link: '/doc/mcp/domain-distillation/' },
            { label: 'Language extraction', link: '/doc/mcp/language-extraction/' },
            { label: 'Context mapping assistant', link: '/doc/mcp/context-mapping/' },
            { label: 'Drift analysis', link: '/doc/mcp/drift-analysis/' },
          ],
        },
      ],
    }),
  ],
});
