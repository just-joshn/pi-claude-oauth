import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { authorizationFailure, ClaudeAuthError } from "./oauth.ts";

const PREFERRED_PORT = 53692;
const DEFAULT_PORTS = [PREFERRED_PORT, 0] as const;
const LOOPBACK_HOSTS = ["127.0.0.1", "::1"] as const;
const CALLBACK_PATH = "/callback";
const NOT_THE_REDIRECT = "This local address only accepts the Claude sign-in redirect.";

const redirectUriFor = (port: number): string => `http://localhost:${port}${CALLBACK_PATH}`;

export const DEFAULT_REDIRECT_URI = redirectUriFor(PREFERRED_PORT);

interface LoopbackServerOptions {
  readonly state: string;
  readonly signal?: AbortSignal;
  readonly ports?: readonly number[];
}

export interface LoopbackServer {
  readonly redirectUri: string;
  waitForCode(): Promise<string>;
  close(): void;
}

type Reply = {
  readonly title: string;
  readonly message: string;
} & (
  | { readonly outcome: "ignore"; readonly status: 400 | 404 }
  | { readonly outcome: "failure"; readonly status: 400; readonly failure: string }
  | { readonly outcome: "code"; readonly status: 200; readonly code: string }
);

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(title: string, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family: system-ui, sans-serif; margin: 4rem auto; max-width: 32rem; line-height: 1.5"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`;
}

function replyTo(request: IncomingMessage, state: string): Reply {
  const url = URL.parse(request.url ?? "/", "http://localhost");
  if (!url)
    return { outcome: "ignore", status: 400, title: "Bad request", message: NOT_THE_REDIRECT };
  if (request.method !== "GET" || url.pathname !== CALLBACK_PATH) {
    return { outcome: "ignore", status: 404, title: "Not found", message: NOT_THE_REDIRECT };
  }

  if (url.searchParams.get("state") !== state) {
    return {
      outcome: "ignore",
      status: 400,
      title: "Sign-in mismatch",
      message: "This redirect does not belong to the sign-in that is waiting.",
    };
  }

  const failure = authorizationFailure(url.searchParams);
  if (failure) {
    return {
      outcome: "failure",
      status: 400,
      title: failure.title,
      message: failure.detail,
      failure: failure.message,
    };
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return {
      outcome: "ignore",
      status: 400,
      title: "Missing code",
      message: "Claude did not send an authorization code.",
    };
  }

  return {
    outcome: "code",
    status: 200,
    title: "Authorization received",
    message: "Return to Pi to finish signing in. You can close this tab.",
    code,
  };
}

function listen(host: string, port: number): Promise<Server | undefined> {
  const server = createServer();
  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      if (error.code === "EAFNOSUPPORT" || error.code === "EADDRNOTAVAIL") resolve(undefined);
      else reject(error);
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve(server);
    });
  });
}

const isPortUnavailable = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error.code === "EADDRINUSE" || error.code === "EACCES");

function closeListeners(servers: readonly Server[]): void {
  for (const server of servers) {
    if (server.listening) server.close();
  }
}

async function bindFirstFree(ports: readonly number[]) {
  for (const candidate of ports) {
    const servers: Server[] = [];
    let port = candidate;
    try {
      for (const host of LOOPBACK_HOSTS) {
        // oxlint-disable-next-line no-await-in-loop -- Both families must bind the same port, even when the OS picks it.
        const server = await listen(host, port);
        if (!server) continue;
        servers.push(server);
        const address = server.address();
        if (!address || typeof address === "string") {
          throw new ClaudeAuthError("The local sign-in callback has no TCP address.");
        }
        port = address.port;
      }
      if (servers.length) return { servers, port };
    } catch (error) {
      closeListeners(servers);
      if (!isPortUnavailable(error)) throw error;
    }
  }
  throw new ClaudeAuthError(
    `Could not start the local sign-in callback on localhost (${ports.join(" or ")}). Close the program using that port and try again.`,
  );
}

export async function startLoopbackServer(options: LoopbackServerOptions): Promise<LoopbackServer> {
  if (options.signal?.aborted) throw new ClaudeAuthError("Claude sign-in was cancelled.");

  const { servers, port } = await bindFirstFree(options.ports ?? DEFAULT_PORTS);
  if (options.signal?.aborted) {
    closeListeners(servers);
    throw new ClaudeAuthError("Claude sign-in was cancelled.");
  }
  const { promise, resolve, reject } = Promise.withResolvers<string>();

  const close = () => {
    options.signal?.removeEventListener("abort", onAbort);
    closeListeners(servers);
  };
  const fail = (message: string) => {
    close();
    reject(new ClaudeAuthError(message));
  };
  const onAbort = () => fail("Claude sign-in was cancelled.");
  options.signal?.addEventListener("abort", onAbort, { once: true });

  const handleRequest = (request: IncomingMessage, response: ServerResponse) => {
    const reply = replyTo(request, options.state);
    response.writeHead(reply.status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(page(reply.title, reply.message));

    if (reply.outcome === "ignore") return;
    if (reply.outcome === "failure") {
      fail(reply.failure);
      return;
    }
    close();
    resolve(reply.code);
  };
  for (const server of servers) {
    server.on("request", handleRequest);
    server.on("clientError", (_error, socket) => socket.destroy());
  }

  return {
    redirectUri: redirectUriFor(port),
    waitForCode: () => promise,
    close,
  };
}
