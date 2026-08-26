/**
 * The relay: browser to Claude and back, holding nothing.
 *
 * The key belongs to the visitor and lives in their browser — see the settings
 * panel — so it travels on the request, is used once, and is never written
 * down. This route stores nothing, logs nothing, and has no state between
 * calls, which is what keeps the footer's claim about the server true.
 *
 * It exists at all because the browser is the wrong place to *call* from: the
 * SDK is written to run on a server, calling Anthropic from a page needs a
 * header whose name is `dangerous-direct-browser-access` for good reasons, and
 * streaming through the Node adapter is simply better than reassembling SSE by
 * hand in a fetch.
 *
 * **Never put the key in an error.** The messages below are written from the
 * SDK's typed exception classes and say what happened, never what was sent.
 */

import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
import { guideFor } from '../../lib/agent/guide';
import { EFFORTS, type AgentEvent, type AgentRequest, type Effort } from '../../lib/agent/protocol';

/** Streaming, so there is room for a document to come back whole. */
const MAX_TOKENS = 64000;

const DEFAULT_MODEL = 'claude-opus-5';

export const POST: APIRoute = async ({ request }) => {
	const key = request.headers.get('x-model-key')?.trim();
	if (!key) {
		return problem(
			400,
			'No API key. Open the settings panel and paste one — it stays in this browser and is sent with each request rather than kept on the server.',
		);
	}

	let body: AgentRequest;
	try {
		body = (await request.json()) as AgentRequest;
	} catch {
		return problem(400, 'The request body was not JSON.');
	}

	if (typeof body.prompt !== 'string' || body.prompt.trim() === '') {
		return problem(400, 'Nothing was asked.');
	}
	if (body.language !== 'ddd' && body.language !== 'ddm') {
		return problem(400, 'Unknown document language.');
	}

	const effort: Effort = EFFORTS.includes(body.effort) ? body.effort : 'high';
	const model = typeof body.model === 'string' && body.model.trim() !== '' ? body.model : DEFAULT_MODEL;
	const guide = guideFor(body.language, typeof body.guidance === 'string' ? body.guidance : '');

	const client = new Anthropic({ apiKey: key });

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (event: AgentEvent) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
			};

			try {
				/*
				 * `display: "summarized"` is not decoration. The default omits the
				 * thinking text entirely, and on a reasoning model that reads as a
				 * long silent hang before the first word of the answer — the panel
				 * shows the summary so the wait has something in it.
				 *
				 * `fallbacks: "default"` re-runs a declined request on Anthropic's
				 * recommended substitute rather than handing back a refusal. It costs
				 * nothing when nothing is declined.
				 */
				const answer = client.beta.messages.stream({
					model,
					max_tokens: MAX_TOKENS,
					betas: ['server-side-fallback-2026-07-01'],
					fallbacks: 'default',
					thinking: { type: 'adaptive', display: 'summarized' },
					output_config: { effort },
					// The guide is identical for every request from a page and sits
					// well over the minimum cacheable prefix, so it is worth a
					// breakpoint: the document and the demand come after it.
					system: [{ type: 'text', text: guide, cache_control: { type: 'ephemeral' } }],
					messages: [
						{
							role: 'user',
							content: `Here is the document as it stands.\n\n<document>\n${body.source}\n</document>\n\n${body.prompt.trim()}`,
						},
					],
				});

				for await (const event of answer) {
					if (event.type !== 'content_block_delta') continue;
					if (event.delta.type === 'thinking_delta') send({ type: 'thinking', text: event.delta.thinking });
					else if (event.delta.type === 'text_delta') send({ type: 'text', text: event.delta.text });
				}

				const final = await answer.finalMessage();

				// A refusal that survived the fallback chain is not an empty answer,
				// and saying nothing would look like one.
				if (final.stop_reason === 'refusal') {
					send({
						type: 'error',
						message: `The request was declined${final.stop_details?.explanation ? `: ${final.stop_details.explanation}` : '.'}`,
					});
				} else if (final.stop_reason === 'max_tokens') {
					send({
						type: 'error',
						message: `The answer hit the ${MAX_TOKENS.toLocaleString()}-token ceiling and stopped mid-sentence. Ask for less at once, or ask about one aggregate at a time.`,
					});
				}

				send({
					type: 'usage',
					input: final.usage.input_tokens,
					output: final.usage.output_tokens,
					cached: final.usage.cache_read_input_tokens ?? 0,
				});
			} catch (error) {
				send({ type: 'error', message: describe(error) });
			} finally {
				controller.close();
			}
		},
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream; charset=utf-8',
			'cache-control': 'no-cache, no-transform',
			connection: 'keep-alive',
		},
	});
};

/**
 * What went wrong, in a sentence somebody can act on.
 *
 * Most specific first, which is the SDK's own advice: "your key is wrong" and
 * "you are being rate limited" are different problems with different answers,
 * and one broad catch loses the difference. None of these repeat anything that
 * was sent.
 */
function describe(error: unknown): string {
	if (error instanceof Anthropic.AuthenticationError) {
		return 'That API key was rejected. Check it in the settings panel — a key from console.anthropic.com, starting `sk-ant-`.';
	}
	if (error instanceof Anthropic.PermissionDeniedError) {
		return 'That key is not allowed to use this model. Try another model in the settings panel, or a key with wider access.';
	}
	if (error instanceof Anthropic.NotFoundError) {
		return 'That model name is not one the API knows. Check it in the settings panel.';
	}
	if (error instanceof Anthropic.RateLimitError) {
		return 'Rate limited. Wait a moment and ask again.';
	}
	if (error instanceof Anthropic.BadRequestError) {
		return `The request was refused as malformed: ${error.message}`;
	}
	if (error instanceof Anthropic.APIConnectionError) {
		return 'Could not reach the API from the server. It may be offline, or this deployment may have no outbound network.';
	}
	if (error instanceof Anthropic.APIError) {
		return `The API returned ${error.status}: ${error.message}`;
	}
	return 'Something went wrong before the request was sent.';
}

/** A refusal before the stream opens. Plain JSON, because there is no stream. */
function problem(status: number, message: string): Response {
	return new Response(JSON.stringify({ message }), {
		status,
		headers: { 'content-type': 'application/json' },
	});
}
