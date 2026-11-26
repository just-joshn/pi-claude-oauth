import { connect, createServer } from "node:net";
import { networkInterfaces } from "node:os";

import { describe, expect, it } from "vitest";

import { startLoopbackServer } from "../src/callback-server.ts";

const STATE = "state-123";

describe("startLoopbackServer", () => {
  it("resolves the code from a matching redirect", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const waiting = server.waitForCode();

    const response = await fetch(`${server.redirectUri}?code=abc&state=${STATE}`);
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Authorization received");
    expect(body).toContain("Return to Pi to finish signing in");
    expect(body).not.toContain("Signed in");
    expect(await waiting).toBe("abc");
  });

  it("serves the redirect on localhost so proxies and forwarded ports work", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    expect(server.redirectUri).toMatch(/^http:\/\/localhost:\d+\/callback$/);
    server.close();
  });

  it.each(["code=abc&state=other", "code=abc", "error=access_denied&state=other"])(
    "keeps waiting for the real redirect after a stray request (%s)",
    async (query) => {
      const server = await startLoopbackServer({ state: STATE, ports: [0] });
      const waiting = server.waitForCode();

      const stray = await fetch(`${server.redirectUri}?${query}`);
      expect(stray.status).toBe(400);

      const genuine = await fetch(`${server.redirectUri}?code=real&state=${STATE}`);
      expect(genuine.status).toBe(200);
      expect(await waiting).toBe("real");
    },
  );

  it.each(["//", "http://"])(
    "answers 400 to the unparseable request target %s and keeps waiting",
    async (target) => {
      const server = await startLoopbackServer({ state: STATE, ports: [0] });
      const waiting = server.waitForCode();
      const port = Number(new URL(server.redirectUri).port);

      const statusLine = await new Promise<string>((resolve, reject) => {
        const socket = connect(port, "127.0.0.1", () => {
          socket.write(`GET ${target} HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n`);
        });
        let received = "";
        socket.on("data", (chunk) => (received += chunk));
        socket.on("close", () => resolve(received.split("\r\n")[0] ?? ""));
        socket.on("error", reject);
      });
      expect(statusLine).toBe("HTTP/1.1 400 Bad Request");

      const genuine = await fetch(`${server.redirectUri}?code=real&state=${STATE}`);
      expect(genuine.status).toBe(200);
      expect(await waiting).toBe("real");
    },
  );

  it("rejects a declined authorization", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const declined = expect(server.waitForCode()).rejects.toThrow(/declined: nope/);

    const response = await fetch(
      `${server.redirectUri}?error=access_denied&error_description=nope&state=${STATE}`,
    );
    expect(response.status).toBe(400);
    await declined;
  });

  it("keeps waiting when a request has no code", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const waiting = server.waitForCode();

    const empty = await fetch(`${server.redirectUri}?state=${STATE}`);
    expect(empty.status).toBe(400);

    await fetch(`${server.redirectUri}?code=real&state=${STATE}`);
    expect(await waiting).toBe("real");
  });

  it("ignores requests outside the callback path", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const response = await fetch(new URL("/elsewhere", server.redirectUri));
    expect(response.status).toBe(404);
    server.close();
  });

  it("ignores non-GET requests", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const response = await fetch(server.redirectUri, { method: "POST" });
    expect(response.status).toBe(404);
    server.close();
  });

  it("stops listening when closed", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    server.close();
    await expect(fetch(`${server.redirectUri}?code=abc&state=${STATE}`)).rejects.toThrow();
  });

  it("rejects when the login is aborted", async () => {
    const controller = new AbortController();
    const server = await startLoopbackServer({
      state: STATE,
      ports: [0],
      signal: controller.signal,
    });
    const waiting = server.waitForCode();
    controller.abort();
    await expect(waiting).rejects.toThrow(/cancelled/);
  });

  it("releases the port if the login is aborted while binding", async () => {
    const first = await startLoopbackServer({ state: STATE, ports: [0] });
    const port = Number(new URL(first.redirectUri).port);
    first.close();
    const controller = new AbortController();
    const binding = startLoopbackServer({ state: STATE, ports: [port], signal: controller.signal });
    controller.abort();
    await expect(binding.then((server) => server.close())).rejects.toThrow(/cancelled/);
    const next = await startLoopbackServer({ state: STATE, ports: [port] });
    next.close();
  });

  it.skipIf(
    !Object.values(networkInterfaces())
      .flat()
      .some((addr) => addr?.address === "::1"),
  )("accepts the localhost redirect over IPv6 loopback", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    try {
      const url = new URL(server.redirectUri);
      url.hostname = "[::1]";
      url.search = new URLSearchParams({ code: "abc", state: STATE }).toString();
      expect((await fetch(url)).status).toBe(200);
      expect(await server.waitForCode()).toBe("abc");
    } finally {
      server.close();
    }
  });

  it("refuses to start when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      startLoopbackServer({ state: STATE, ports: [0], signal: controller.signal }),
    ).rejects.toThrow(/cancelled/);
  });

  it("falls back to a free port when the preferred one is taken", async () => {
    const first = await startLoopbackServer({ state: "first", ports: [0] });
    const takenPort = Number(new URL(first.redirectUri).port);

    const second = await startLoopbackServer({ state: "second", ports: [takenPort, 0] });
    const secondPort = Number(new URL(second.redirectUri).port);
    expect(secondPort).not.toBe(takenPort);
    expect(secondPort).toBeGreaterThan(0);

    first.close();
    second.close();
  });

  it("rejects when no port can be bound", async () => {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    try {
      const address = blocker.address();
      if (!address || typeof address === "string") throw new Error("Expected a TCP listener");
      await expect(startLoopbackServer({ state: "again", ports: [address.port] })).rejects.toThrow(
        /Could not start/,
      );
    } finally {
      blocker.close();
    }
  });

  it("times out without a browser", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0], timeoutMs: 10 });
    await expect(server.waitForCode()).rejects.toThrow(/timed out/);
  });
});
