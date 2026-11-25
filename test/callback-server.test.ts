import { match, notStrictEqual, ok, rejects, strictEqual } from "node:assert/strict";
import { connect, createServer } from "node:net";
import { networkInterfaces } from "node:os";
import { describe, it } from "node:test";

import { startLoopbackServer } from "../src/callback-server.ts";

const STATE = "state-123";

const hasIpv6Loopback = Object.values(networkInterfaces())
  .flat()
  .some((addr) => addr?.address === "::1");

await describe("startLoopbackServer", async () => {
  await it("resolves the code from a matching redirect", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const waiting = server.waitForCode();

    const response = await fetch(`${server.redirectUri}?code=abc&state=${STATE}`);
    strictEqual(response.status, 200);
    ok((await response.text()).includes("Signed in"));
    strictEqual(await waiting, "abc");
  });

  await it("serves the redirect on localhost so proxies and forwarded ports work", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    match(server.redirectUri, /^http:\/\/localhost:\d+\/callback$/);
    server.close();
  });

  for (const query of ["code=abc&state=other", "code=abc", "error=access_denied&state=other"]) {
    // oxlint-disable-next-line no-await-in-loop -- Registering a test inside a suite resolves immediately.
    await it(`keeps waiting for the real redirect after a stray request (${query})`, async () => {
      const server = await startLoopbackServer({ state: STATE, ports: [0] });
      const waiting = server.waitForCode();

      const stray = await fetch(`${server.redirectUri}?${query}`);
      strictEqual(stray.status, 400);

      const genuine = await fetch(`${server.redirectUri}?code=real&state=${STATE}`);
      strictEqual(genuine.status, 200);
      strictEqual(await waiting, "real");
    });
  }

  for (const target of ["//", "http://"]) {
    // oxlint-disable-next-line no-await-in-loop -- Registering a test inside a suite resolves immediately.
    await it(`answers 400 to the unparseable request target ${target} and keeps waiting`, async () => {
      const server = await startLoopbackServer({ state: STATE, ports: [0] });
      const waiting = server.waitForCode();
      const port = Number(new URL(server.redirectUri).port);

      const statusLine = await new Promise<string>((resolve, reject) => {
        const socket = connect(port, "127.0.0.1", () => {
          socket.write(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
        });
        let received = "";
        socket.setEncoding("utf8");
        socket.on("data", (chunk: string) => (received += chunk));
        socket.on("close", () => resolve(received.split("\r\n")[0] ?? ""));
        socket.on("error", reject);
      });
      strictEqual(statusLine, "HTTP/1.1 400 Bad Request");

      const genuine = await fetch(`${server.redirectUri}?code=real&state=${STATE}`);
      strictEqual(genuine.status, 200);
      strictEqual(await waiting, "real");
    });
  }

  await it("rejects a declined authorization", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const waiting = server.waitForCode();

    const response = await fetch(
      `${server.redirectUri}?error=access_denied&error_description=nope&state=${STATE}`,
    );
    strictEqual(response.status, 400);
    await rejects(waiting, /declined: nope/);
  });

  await it("keeps waiting when a request has no code", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const waiting = server.waitForCode();

    const empty = await fetch(`${server.redirectUri}?state=${STATE}`);
    strictEqual(empty.status, 400);

    await fetch(`${server.redirectUri}?code=real&state=${STATE}`);
    strictEqual(await waiting, "real");
  });

  await it("ignores requests outside the callback path", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const response = await fetch(new URL("/elsewhere", server.redirectUri));
    strictEqual(response.status, 404);
    server.close();
  });

  await it("ignores non-GET requests", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const response = await fetch(server.redirectUri, { method: "POST" });
    strictEqual(response.status, 404);
    server.close();
  });

  await it("stops listening when closed", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    server.close();
    await rejects(fetch(`${server.redirectUri}?code=abc&state=${STATE}`));
  });

  await it("rejects when the login is aborted", async () => {
    const controller = new AbortController();
    const server = await startLoopbackServer({
      state: STATE,
      ports: [0],
      signal: controller.signal,
    });
    const waiting = server.waitForCode();
    controller.abort();
    await rejects(waiting, /cancelled/);
  });

  await it("releases the port if the login is aborted while binding", async () => {
    const first = await startLoopbackServer({ state: STATE, ports: [0] });
    const port = Number(new URL(first.redirectUri).port);
    first.close();
    const controller = new AbortController();
    const binding = startLoopbackServer({ state: STATE, ports: [port], signal: controller.signal });
    controller.abort();
    await rejects(
      binding.then((server) => server.close()),
      /cancelled/,
    );
    const next = await startLoopbackServer({ state: STATE, ports: [port] });
    next.close();
  });

  await it(
    "accepts the localhost redirect over IPv6 loopback",
    { skip: !hasIpv6Loopback },
    async () => {
      const server = await startLoopbackServer({ state: STATE, ports: [0] });
      try {
        const url = new URL(server.redirectUri);
        url.hostname = "[::1]";
        url.search = new URLSearchParams({ code: "abc", state: STATE }).toString();
        strictEqual((await fetch(url)).status, 200);
        strictEqual(await server.waitForCode(), "abc");
      } finally {
        server.close();
      }
    },
  );

  await it("refuses to start when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await rejects(
      startLoopbackServer({ state: STATE, ports: [0], signal: controller.signal }),
      /cancelled/,
    );
  });

  await it("falls back to a free port when the preferred one is taken", async () => {
    const first = await startLoopbackServer({ state: "first", ports: [0] });
    const takenPort = Number(new URL(first.redirectUri).port);

    const second = await startLoopbackServer({ state: "second", ports: [takenPort, 0] });
    const secondPort = Number(new URL(second.redirectUri).port);
    notStrictEqual(secondPort, takenPort);
    ok(secondPort > 0);

    first.close();
    second.close();
  });

  await it("rejects when no port can be bound", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    try {
      const address = blocker.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
      await rejects(
        startLoopbackServer({ state: "again", ports: [address.port] }),
        /Could not start/,
      );
    } finally {
      blocker.close();
    }
  });

  await it("times out without a browser", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0], timeoutMs: 10 });
    await rejects(server.waitForCode(), /timed out/);
  });
});
