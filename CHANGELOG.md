# Changelog

This changelog is for people who install the package. It lists, for each version, the changes that reach them, one change per entry. A version with no user-facing changes of its own has no sections; a short note under its heading says so. CI, tests, tooling and other changes that never reach the npm package stay out of it.

## 0.2.2 (2026-11-27)

No changes to the Pi extension.

## 0.2.1 (2026-11-26)

FIXED:

- Claude sign-in ignores pasted input that arrives after cancellation or after the browser callback completes.
- Headless `/claude` reports errors through Pi without writing to JSON output.
- Token and usage lookups cancel responses larger than 256 KiB.
- Provider messages and usage labels no longer pass terminal control characters through to Pi.

## 0.2.0 (2026-11-26)

BREAKING CHANGES:

- The package requires Node.js 22.23.5 or newer in the 22.x series, 24.22.3 or newer in the 24.x series, or 26.13.1 or newer in the 26.x series. Earlier releases accepted every version from 22.19.0 onward.

## 0.1.6 (2026-11-26)

CHANGED:

- `/claude` no longer tries to send notifications or status updates when Pi has no UI. Successful status and usage lookups still save their cards to the session.

## 0.1.5 (2026-11-26)

BREAKING CHANGES:

- `CLAUDE_CODE_OAUTH_TOKEN` must hold a single-line `sk-ant-oat` token from `claude setup-token`. Any other value, such as an `sk-ant-api03` API key, is ignored instead of being sent as an API key. To use an API key, use Pi's built-in `anthropic` provider.

ADDED:

- `/claude usage` shows per-model weekly limits, such as `7-day Fable`.
- **Sign in with an API key** shows the same billing warning as the subscription sign-in.

CHANGED:

- `/login claude` → **Sign in with an API key** accepts a pasted `claude setup-token` token and saves it. Before, it accepted nothing and said `CLAUDE_CODE_OAUTH_TOKEN` was configured outside Pi.
- A wrong paste during sign-in explains what is wrong and asks again. This covers the sign-in link or any piece of it, a result from another sign-in, including a denial, and a result without a code. Before, sign-in ended and the browser callback closed.
- Browser sign-in waits for the browser until sign-in ends. Before, it failed after 10 minutes.
- Pasted results wrapped in `<>`, quotes or backticks, broken across lines, or holding only the query part are read correctly.
- An authorization error other than `access_denied` says sign-in failed, not that it was declined.
- A denial with an empty description shows the error code.
- A saved setup token that is not a single line is no longer sent, and Pi asks you to sign in again.
- **Import setup token from environment** says whether `CLAUDE_CODE_OAUTH_TOKEN` is unset or holds something other than a setup token.
- When `claude` is the only signed-in provider and no default model is saved, Pi starts on `claude-opus-5-5` instead of `claude-fable-5`.
- `/claude usage` reset times include the date, so a reset a week away no longer reads as earlier today.
- `/claude usage` shows each error once instead of repeating its cause.
- `/claude usage` no longer calls a rejected token a saved token, since it may come from `CLAUDE_CODE_OAUTH_TOKEN`.
- `/claude status` names every Pi credential source, such as `models.json key`, instead of Pi's internal id.

## 0.1.4 (2026-11-26)

CHANGED:

- Pressing Enter on an empty paste prompt asks again instead of ending sign-in and closing the browser callback.
- Pasting the sign-in link itself is rejected with a clear message instead of sending `true` as the code.
- Pasted redirects without a scheme, or as a path and query, are accepted.
- A pasted denial shows its reason.
- A rejected authorization code during login no longer says the saved sign-in was rejected.
- The browser callback page says the authorization was received, instead of saying Claude is connected before the token exchange has finished.

## 0.1.3 (2026-11-24)

0.1.1 and 0.1.2 never reached npm, so 0.1.3 is the first release with their changes. 0.1.3 has no other user-facing changes.

## 0.1.2 (2026-11-24)

No user-facing changes.

## 0.1.1 (2026-11-24)

CHANGED:

- The extension ships from `src/` instead of `extensions/claude-oauth/`. Pi finds it through the package's `pi.extensions` entry, so installs need no change.
- The package requires Node.js 22.19 or later.

## 0.1.0 (2026-11-24)

NEW FEATURES:

- Native `claude` provider for Claude Pro, Max, and Ultra subscription OAuth tokens.
- Login methods: browser PKCE with a loopback callback and manual paste fallback, headless copy-code, and `claude setup-token`.
- Ambient `CLAUDE_CODE_OAUTH_TOKEN` support when no credential is stored.
- Locked token refresh through Anthropic's OAuth token endpoint.
- `/claude status` and `/claude usage` cards rendered from durable session entries.
- Claude model catalog derived from Pi's Anthropic catalog.
