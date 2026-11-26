# Changelog

## 0.1.6 (Unreleased)

CHANGED:

- CI runs on every pull request, including stacked ones, as two jobs: Lint (formatting, oxlint, types, the version and changelog check, and the package contents) and Test, which runs the tests with the coverage gate and a smoke test on real Pi on Node 22.19.0, 24 and 26. The check named `Verify` is gone.
- Releases run in a separate Release workflow that calls CI on the pushed commit, stages the version on npm only when npm does not have it, and creates the tag and GitHub release at the released commit. Rerunning a release no longer needs the previous run's tarball.
- The changelog uses `## X.Y.Z (YYYY-MM-DD)` headings, or `(Unreleased)` for a version not yet in `package.json`, with `BREAKING CHANGES:`, `NEW FEATURES:`, `ADDED:`, `CHANGED:`, `REMOVED:` and `FIXED:` sections. CI requires a dated entry for the version in `package.json`.

ADDED:

- `scripts/smoke.ts` starts real Pi in RPC mode with the extension and checks `/claude`, the `claude` models and the environment-token status card, without network calls.
- An action lockfile, `.github/workflows/actions.lock`, and a workflow that verifies it. Workflows name actions by tag, and the lockfile pins each tag to its commit.
- Dependabot waits a week before proposing a new release of an action.

## 0.1.5 (2026-11-26)

FIXED:

- A pasted sign-in result that is wrong (the sign-in link or any piece of it, a result from another request, or one without a code) now explains why and asks again instead of ending sign-in and closing the browser callback.
- Browser sign-in keeps listening until sign-in ends; the 10-minute limit that silently refused late redirects is gone.
- Pastes wrapped in `<>`, quotes or backticks, broken across lines, or holding only the query part are read correctly.
- Only `access_denied` is reported as a decline; other authorization errors say sign-in failed. A denial with an empty description names the error, and a stale denial from another sign-in asks again.
- `CLAUDE_CODE_OAUTH_TOKEN` and imported setup tokens must be single-line `sk-ant-oat` tokens. Other values are no longer sent as API keys, a malformed saved setup token is no longer sent, and the import message says whether the variable is unset or invalid.
- `/login claude` → **Sign in with an API key** now asks for a setup token, saves it, and shows the billing warning.
- Pi starts `claude` on the same default model as its `anthropic` provider instead of the first model in the catalog.
- `/claude usage` shows model-scoped weekly limits, dates reset times, states each error cause once, and gives renewal advice that works when a credential is saved.
- `/claude status` labels every Pi credential source.
- CI compares a pull request's version against its base, so force-pushed pull requests no longer fail the check.
- README: the catalog follows the installed Pi version, the callback port can fall back, and the renewal steps are correct.

## 0.1.4 (2026-11-26)

FIXED:

- Pressing Enter on an empty paste prompt no longer ends sign-in or closes the local callback; Pi asks again.
- Pasting the sign-in link itself is rejected with a clear message instead of sending `true` as the code.
- Pasted redirects without a scheme, or as a path and query, are accepted, and a pasted denial reports its reason.
- A rejected authorization code during login no longer claims the saved sign-in was rejected.
- The browser callback page says the authorization was received instead of claiming Claude is connected before the token exchange finishes.

## 0.1.3 (2026-11-24)

FIXED:

- Releases are staged on npm through trusted publishing and published after maintainer approval. Direct publishing was rejected, so 0.1.1 and 0.1.2 never reached npm; 0.1.3 contains their changes.

## 0.1.2 (2026-11-24)

CHANGED:

- Simplified the network error handling in `src/oauth.ts` without changing the errors users see, made the `TokenPayload` type private, and trimmed source comments to the constraints the code cannot express.

## 0.1.1 (2026-11-24)

CHANGED:

- The extension ships from `src/` instead of `extensions/claude-oauth/`. Pi finds it through the package's `pi.extensions` entry, so installs need no change.
- The package declares Node.js 22.19 or later in `engines`.
- Tests run on Vitest with 80% per-file coverage thresholds, and the extension type-checks under TypeScript 6 with stricter compiler and lint settings.
- Added tests for the provider's saved credential `env`, cancellation and login delegation.

## 0.1.0 (2026-11-24)

NEW FEATURES:

- Native `claude` provider for Claude Pro, Max, and Ultra subscription OAuth tokens.
- Login methods: browser PKCE with a loopback callback and manual paste fallback, headless copy-code, and `claude setup-token`.
- Ambient `CLAUDE_CODE_OAUTH_TOKEN` support when no credential is stored.
- Locked token refresh through Anthropic's OAuth token endpoint.
- `/claude status` and `/claude usage` cards rendered from durable session entries.
- Claude model catalog derived from Pi's Anthropic catalog.
