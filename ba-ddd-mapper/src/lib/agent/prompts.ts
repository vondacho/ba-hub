/**
 * The prompts this board is worth spending the assistant on, by role.
 *
 * The panel's empty state used to hard-code three examples. Three is enough to
 * show what a question looks like and far too few to answer "what should *I*
 * ask" — which depends entirely on whether you are planning a release, drawing a
 * boundary or deciding whether a rule can be tested.
 *
 * **They are grouped by role and they are clickable.** Clicking one fills the
 * box rather than sending it: every prompt here is a starting point somebody
 * should edit before asking, and one that sent itself would train the opposite
 * habit.
 *
 * Roles are ordered by how many prompts each has for this board, so the role
 * this board serves most leads the list.
 *
 * ## Where these come from, and the duplication
 *
 * ba-portal's `/doc/tooling/prompts/` is canonical: it carries the argument —
 * each role's scope, their daily challenge, and what the five techniques are
 * worth to them — and covers every board. This file is that page's prompts for
 * *this* board and nothing else.
 *
 * That is a deliberate duplication rather than one nobody noticed. ba-portal and
 * this app are separate deployments, and an import across that seam would couple
 * an editor's build to a documentation site's. Changing a prompt means changing
 * it in both places; the panel links out to the page so a reader can always reach
 * the half that carries the reasoning.
 *
 * Keyed by language, like everything else this editor shares between its two
 * pages: a map and a model are different documents and the questions worth
 * asking about them have almost nothing in common.
 */

export interface PromptGroup {
	/** The role these are written for. */
	readonly role: string;
	readonly prompts: readonly string[];
}

import type { Language } from './protocol';

export const PROMPTS: Record<Language, readonly PromptGroup[]> = {
	ddd: [
		{
			role: "Business analyst",
			prompts: [
				"Which terms appear in the `language` of two contexts? For each, say whether the two mean the same thing \u2014 that is where the boundary really is.",
				"Which contexts have an empty `language`? Propose the three terms that would make each a real boundary.",
				"Read this map as a description of the business rather than of the systems. Which boundary follows an org chart or a database instead of a language?",
				"Which `intent` lines say what a context *does* rather than what it is *for*? Rewrite them as the reason the business would miss it.",
				"Which subdomain classifications would the business disagree with? Say which `core` is really something we buy, and which `generic` is the thing we actually compete on.",
				"For each relationship, say what crosses in business terms \u2014 not payloads, but what one side is asking the other for."
			],
		},
		{
			role: "Solution architect",
			prompts: [
				"Which of these relationships is more aspirational than honest? Rewrite each `because` with the answer somebody would be embarrassed to say out loud.",
				"Which arrows have no `because` at all? Give each a rationale worth arguing with, and say which one you are least confident in.",
				"Count the `core` subdomains. If more than a couple are core, say which are really supporting and what that would change about who staffs them.",
				"Which boundary here has no owner? Say what will happen to it at the next deadline.",
				"For each `anticorruption-layer` on this map, say what evidence would tell us the layer is being bypassed.",
				"Which contexts serve a second subdomain? Say whether that straddle is a real one or a boundary we have not finished drawing."
			],
		},
		{
			role: "Process manager",
			prompts: [
				"Which context would have to change for this process to run faster, and which relationship pattern is holding it in place?"
			],
		},
		{
			role: "Technical architect",
			prompts: [
				"For each relationship, say what the downstream team has to change when the upstream one ships. That is the real coupling."
			],
		},
	],
	ddm: [
		{
			role: "Technical architect",
			prompts: [
				"Which aggregates have no invariant? For each, either name the rule it protects or say why it should not be an aggregate.",
				"Is any of these aggregates really two? Say what would have to become eventually consistent if we split it.",
				"Which `contains` should be a `references`? Name the boundary each part actually belongs to.",
				"Which aggregate here becomes the contention point under load, and what gets loaded and saved along with it?",
				"Which entities should be value objects? Say what identity is doing for each one that a value could not.",
				"Where does something outside need to reach past a root? That is either a wrong boundary or a missing aggregate \u2014 say which."
			],
		},
		{
			role: "Business analyst",
			prompts: [
				"Which aggregates have no invariant? For each, name the business rule it is supposed to keep true, in the words the business would use.",
				"Which invariants here are technical constraints wearing a business rule's clothes? Say which ones nobody in the business would recognise.",
				"Which names in this model are not words the business actually says? Propose the term each should be, and say where you would go to confirm it.",
				"Read the `intent` of each aggregate. Which one could be deleted without the business noticing?",
				"Which two things here are called different names and are the same thing to the business \u2014 or share a name and are not?"
			],
		},
		{
			role: "Solution architect",
			prompts: [
				"Does this model fit inside one bounded context, or is it two contexts that have been merged for convenience?"
			],
		},
	],
};
