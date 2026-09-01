/**
 * Value re-exports for the `/dsl` page.
 *
 * `model.ts` exports types and values together, and an `.astro` frontmatter
 * importing from it pulls the type-only names in too — which is fine at runtime
 * and noisy to read. This names exactly what the format page renders, so the
 * page cannot accidentally depend on the parser and the pattern table cannot
 * drift from the one the parser enforces.
 */

export { PATTERNS, patternAdmits, patternLabel, symmetric } from './ddd/model';
