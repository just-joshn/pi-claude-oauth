import { rejects } from "node:assert/strict";
import { describe, it } from "node:test";

import { type FetchLike, refreshAccessToken } from "../src/oauth.ts";
import { fetchUsage } from "../src/usage.ts";

/** The open socket keeps the process alive until the abort; Node unrefs `AbortSignal.timeout`. */
const pendingBody: FetchLike = async (_url, { signal }) =>
  new Response(
    new ReadableStream({
      start(body) {
        const socket = setTimeout(() => {}, 60_000);
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(socket);
            body.error(signal.reason);
          },
          { once: true },
        );
      },
    }),
  );

await describe("after response headers arrive", async () => {
  await it("reports a token body timeout rather than a malformed token", async () => {
    await rejects(
      refreshAccessToken("fixture", {
        signal: new AbortController().signal,
        timeoutMs: 10,
        fetch: pendingBody,
      }),
      /did not answer/,
    );
  });

  await it("reports a usage body timeout rather than malformed JSON", async () => {
    await rejects(fetchUsage("fixture", { timeoutMs: 10, fetch: pendingBody }), /did not answer/);
  });

  await it("distinguishes caller cancellation from a body timeout", async () => {
    const caller = new AbortController();
    const token = refreshAccessToken("fixture", {
      signal: caller.signal,
      fetch: async (url, init) => {
        const response = await pendingBody(url, init);
        caller.abort();
        return response;
      },
    });
    await rejects(token, /cancelled/);
  });

  await it("reports a broken body stream as a transport error", async () => {
    const error = new TypeError("connection closed");
    const fetch: FetchLike = async () =>
      new Response(
        new ReadableStream({
          start(body) {
            body.error(error);
          },
        }),
      );
    await rejects(fetchUsage("fixture", { fetch }), /Could not reach/);
  });
});
