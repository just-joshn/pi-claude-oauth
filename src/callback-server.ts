import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { ClaudeAuthError } from "./oauth.ts";

/**
 * Anthropic accepts any loopback port, so the preferred port keeps SSH and
 * container forwarding predictable and the fallback keeps login working when
 * it is taken.
 */
const PREFERRED_PORT = 53692;
const DEFAULT_PORTS = [PREFERRED_PORT, 0] as const;
const LOOPBACK_HOSTS = ["127.0.0.1", "::1"] as const;
const CALLBACK_PATH = "/callback";
const DEFAULT_TIMEOUT_MS = 10 * 60_000;
const NOT_THE_REDIRECT = "This local address only accepts the Claude sign-in redirect.";

const redirectUriFor = (port: number): string => `http://localhost:${port}${CALLBACK_PATH}`;

/** The redirect to register when no callback server is running and the user pastes the result instead. */
export const DEFAULT_REDIRECT_URI = redirectUriFor(PREFERRED_PORT);

interface LoopbackServerOptions {
  readonly state: string;
  readonly signal?: AbortSignal;
  readonly ports?: readonly number[];
  readonly timeoutMs?: number;
}

export interface LoopbackServer {
  readonly redirectUri: string;
  /** Resolves the authorization code. Stays pending once the server is closed. */
  waitForCode(): Promise<string>;
  close(): void;
}

interface Reply {
  readonly status: number;
  readonly title: string;
  readonly message: string;
  readonly code?: string;
  readonly failure?: string;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(title: string, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family: system-ui, sans-serif; margin: 4rem auto; max-width: 32rem; line-height: 1.5"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`;
}

function replyTo(request: IncomingMessage, state: string): Reply {
  const url = URL.parse(request.url ?? "/", "http://localhost");
  if (!url) return { status: 400, title: "Bad request", message: NOT_THE_REDIRECT };
  if (request.method !== "GET" || url.pathname !== CALLBACK_PATH) {
    return { status: 404, title: "Not found", message: NOT_THE_REDIRECT };
  }

  if (url.searchParams.get("state") !== state) {
    return {
      status: 400,
      title: "Sign-in mismatch",
      message: "This redirect does not belong to the sign-in that is waiting.",
    };
  }

  const error = url.searchParams.get("error");
  if (error) {
    const description = url.searchParams.get("error_description") ?? error;
    return {
      status: 400,
      title: "Sign-in declined",
      message: description,
      failure: `Claude sign-in was declined: ${description}`,
    };
  }

  const code = url.searchParams.get("code");
  if (!code)
    return {
      status: 400,
      title: "Missing code",
      message: "Claude did not send an authorization code.",
    };

  return {
    status: 200,
    title: "Signed in",
    message: "Claude is connected. You can close this tab and return to Pi.",
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
        if (!address || typeof address === "string")
          throw new ClaudeAuthError("The local sign-in callback has no TCP address.");
        port = address.port;
      }
      if (servers.length) return { servers, port };
    } catch (error) {
      closeListeners(servers);
      if (!(
        error instanceof Error &&
        "code" in error &&
        (error.code === "EADDRINUSE" || error.code === "EACCES")
      ))
        throw error;
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
  // A sign-in that finishes by pasting never awaits this promise.
  promise.catch(() => {});

  const close = () => {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
    closeListeners(servers);
  };
  const fail = (message: string) => {
    close();
    reject(new ClaudeAuthError(message));
  };
  const onAbort = () => fail("Claude sign-in was cancelled.");
  const timer = setTimeout(
    () => fail("The browser sign-in timed out. Run `/login claude` to try again."),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  timer.unref();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  const handleRequest = (request: IncomingMessage, response: ServerResponse) => {
    const reply = replyTo(request, options.state);
    response.writeHead(reply.status, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    response.end(page(reply.title, reply.message));

    if (reply.failure) fail(reply.failure);
    if (reply.code) {
      close();
      resolve(reply.code);
    }
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
