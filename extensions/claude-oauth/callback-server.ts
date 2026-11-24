import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { ClaudeAuthError } from "./oauth";

/**
 * Loopback redirect target for the browser sign-in. Anthropic accepts any
 * loopback port, so the preferred port keeps SSH and container forwarding
 * predictable and the fallback keeps login working when it is taken.
 */
export const DEFAULT_CALLBACK_PORTS = [53692, 0] as const;
export const CALLBACK_PATH = "/callback";

const DEFAULT_HOST = "127.0.0.1";
const REDIRECT_HOST = "localhost";
const DEFAULT_TIMEOUT_MS = 10 * 60_000;

export interface LoopbackServerOptions {
  readonly state: string;
  readonly signal?: AbortSignal;
  readonly ports?: readonly number[];
  readonly host?: string;
  readonly redirectHost?: string;
  readonly path?: string;
  readonly timeoutMs?: number;
}

export interface LoopbackServer {
  readonly redirectUri: string;
  /** Resolves the authorization code, or `undefined` when closed before the browser returned. */
  waitForCode(): Promise<string | undefined>;
  close(): void;
}

const escapeHtml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function page(title: string, message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body style="font-family: system-ui, sans-serif; margin: 4rem auto; max-width: 32rem; line-height: 1.5"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></body></html>`;
}

function respond(response: ServerResponse, status: number, title: string, message: string): void {
  response.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(page(title, message));
}

function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: LoopbackServerOptions,
  path: string,
  finish: (result: { code: string } | { error: Error }) => void,
): void {
  const url = new URL(request.url ?? "/", `http://${options.host ?? DEFAULT_HOST}`);

  if (request.method !== "GET" || url.pathname !== path) {
    respond(response, 404, "Not found", "This local address only accepts the Claude sign-in redirect.");
    return;
  }

  if (url.searchParams.get("state") !== options.state) {
    respond(response, 400, "Sign-in mismatch", "This redirect does not belong to the sign-in that is waiting.");
    finish({ error: new ClaudeAuthError("Claude returned a sign-in result for a different request. Try again.") });
    return;
  }

  const error = url.searchParams.get("error");
  if (error) {
    const description = url.searchParams.get("error_description") ?? error;
    respond(response, 400, "Sign-in declined", description);
    finish({ error: new ClaudeAuthError(`Claude sign-in was declined: ${description}`) });
    return;
  }

  const code = url.searchParams.get("code");
  if (!code) {
    respond(response, 400, "Missing code", "Claude did not send an authorization code.");
    return;
  }

  respond(response, 200, "Signed in", "Claude is connected. You can close this tab and return to Pi.");
  finish({ code });
}

export async function startLoopbackServer(options: LoopbackServerOptions): Promise<LoopbackServer> {
  if (options.signal?.aborted) throw new ClaudeAuthError("Claude sign-in was cancelled.");

  const host = options.host ?? DEFAULT_HOST;
  const redirectHost = options.redirectHost ?? REDIRECT_HOST;
  const path = options.path ?? CALLBACK_PATH;
  const ports = options.ports ?? DEFAULT_CALLBACK_PORTS;

  let server: Server | undefined;
  for (const port of ports) {
    const attempt = createServer();
    const bound = await listen(attempt, host, port).then(
      () => true,
      () => false,
    );
    if (bound) {
      server = attempt;
      break;
    }
    attempt.close();
  }

  if (!server) {
    throw new ClaudeAuthError(
      `Could not start the local sign-in callback on ${host} (${ports.join(" or ")}). Close the program using that port and try again.`,
    );
  }

  const boundPort = (server.address() as AddressInfo).port;
  let settled = false;
  let resolveCode: (code: string | undefined) => void = () => {};
  let rejectCode: (error: Error) => void = () => {};
  const codePromise = new Promise<string | undefined>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  codePromise.catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (timer !== undefined) clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
    server?.close();
  };

  const finish = (result: { code: string } | { error: Error } | { closed: true }) => {
    if (settled) return;
    settled = true;
    cleanup();
    if ("code" in result) resolveCode(result.code);
    else if ("closed" in result) resolveCode(undefined);
    else rejectCode(result.error);
  };

  const onAbort = () => finish({ error: new ClaudeAuthError("Claude sign-in was cancelled.") });
  timer = setTimeout(
    () =>
      finish({
        error: new ClaudeAuthError("The browser sign-in timed out. Run `/login claude` to try again."),
      }),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (typeof timer === "object") timer.unref();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  server.on("request", (request, response) => handleRequest(request, response, options, path, finish));
  server.on("clientError", (_error, socket) => socket.destroy());

  return {
    redirectUri: `http://${redirectHost}:${boundPort}${path}`,
    waitForCode: () => codePromise,
    close: () => finish({ closed: true }),
  };
}
