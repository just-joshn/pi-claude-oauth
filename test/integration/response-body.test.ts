import { describe, expect, it } from "vitest";

import { type FetchLike, refreshAccessToken } from "../../src/oauth.ts";
import { fetchUsage } from "../../src/usage.ts";

const pendingBody: FetchLike = async (_url, { signal }) =>
	new Response(
		new ReadableStream({
			start(body) {
				signal?.addEventListener("abort", () => body.error(signal.reason), { once: true });
			},
		}),
	);

describe("after response headers arrive", () => {
	it("reports a token body timeout rather than a malformed token", async () => {
		await expect(
			refreshAccessToken("fixture", {
				signal: new AbortController().signal,
				timeoutMs: 10,
				fetch: pendingBody,
			}),
		).rejects.toThrow(/did not answer/);
	});

	it("reports a usage body timeout rather than malformed JSON", async () => {
		await expect(fetchUsage("fixture", { timeoutMs: 10, fetch: pendingBody })).rejects.toThrow(/did not answer/);
	});

	it("distinguishes caller cancellation from a body timeout", async () => {
		const caller = new AbortController();
		const token = refreshAccessToken("fixture", {
			signal: caller.signal,
			fetch: async (url, init) => {
				const response = await pendingBody(url, init);
				caller.abort();
				return response;
			},
		});
		await expect(token).rejects.toThrow(/cancelled/);
	});

	it("reports a broken body stream as a transport error", async () => {
		const error = new TypeError("connection closed");
		const fetch: FetchLike = async () =>
			new Response(
				new ReadableStream({
					start(body) {
						body.error(error);
					},
				}),
			);
		await expect(fetchUsage("fixture", { fetch })).rejects.toThrow(/Could not reach/);
	});
});
