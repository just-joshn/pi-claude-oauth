import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { startLoopbackServer } from "../extensions/claude-oauth/callback-server";

const STATE = "state-123";

describe("startLoopbackServer", () => {
  it("resolves the code from a matching redirect", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const waiting = server.waitForCode();

    const response = await fetch(`${server.redirectUri}?code=abc&state=${STATE}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Signed in");
    await expect(waiting).resolves.toBe("abc");
  });

  it("serves the redirect on localhost so proxies and forwarded ports work", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    expect(server.redirectUri).toMatch(/^http:\/\/localhost:\d+\/callback$/);
    server.close();
  });

  it("rejects a redirect for another state", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const waiting = server.waitForCode();

    const response = await fetch(`${server.redirectUri}?code=abc&state=other`);
    expect(response.status).toBe(400);
    await expect(waiting).rejects.toThrow(/different request/);
  });

  it("rejects a declined authorization", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const waiting = server.waitForCode();

    const response = await fetch(`${server.redirectUri}?error=access_denied&error_description=nope&state=${STATE}`);
    expect(response.status).toBe(400);
    await expect(waiting).rejects.toThrow(/declined: nope/);
  });

  it("keeps waiting when a request has no code", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const waiting = server.waitForCode();

    const response = await fetch(`${server.redirectUri}?state=${STATE}`);
    expect(response.status).toBe(400);
    server.close();
    await expect(waiting).resolves.toBeUndefined();
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

  it("resolves undefined when closed before the browser returns", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0] });
    const waiting = server.waitForCode();
    server.close();
    await expect(waiting).resolves.toBeUndefined();
  });

  it("rejects when the login is aborted", async () => {
    const controller = new AbortController();
    const server = await startLoopbackServer({ state: STATE, ports: [0], signal: controller.signal });
    const waiting = server.waitForCode();
    controller.abort();
    await expect(waiting).rejects.toThrow(/cancelled/);
  });

  it("refuses to start when already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(startLoopbackServer({ state: STATE, ports: [0], signal: controller.signal })).rejects.toThrow(
      /cancelled/,
    );
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
    const takenPort = (blocker.address() as AddressInfo).port;

    await expect(startLoopbackServer({ state: "again", ports: [takenPort] })).rejects.toThrow(/Could not start/);
    blocker.close();
  });

  it("times out without a browser", async () => {
    const server = await startLoopbackServer({ state: STATE, ports: [0], timeoutMs: 10 });
    await expect(server.waitForCode()).rejects.toThrow(/timed out/);
  });
});
