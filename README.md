# pi-claude-oauth

`pi-claude-oauth` is an extension that lets you use a Claude Pro, Max, or Ultra subscription from [Pi](https://github.com/earendil-works/pi) through Anthropic's OAuth tokens. This README covers installing the extension, signing in, using the `claude` provider, billing, terms, security, and working on the source.

## The claude provider

The extension registers a native Pi provider named `claude`. The `claude` provider:

- Signs in with OAuth and PKCE.
- Alternatively accepts a `claude setup-token` token.
- Refreshes access tokens through Anthropic's token endpoint with Pi's locked, single-flight refresh path.
- Streams through Pi's built-in Anthropic Messages implementation, so message conversion, tool calls, prompt caching, usage accounting, thinking, cancellation, and retries behave exactly like the built-in `anthropic` provider.
- Reads a `sk-ant-oat` setup token from `CLAUDE_CODE_OAUTH_TOKEN` when no credential is stored.

## Requirements

- Pi 1.6.0 or newer. CI loads the packed extension with the minimum and the pinned development version of Pi.
- Node.js on Linux or macOS. Use 22.23.5 or newer in the 22.x series, 24.22.3 or newer in the 24.x series, or 26.13.1 or newer in the 26.x series. CI also runs on Windows.
- A Claude Pro, Max, or Ultra subscription with Claude Code access.

## Install the extension

To install the extension, run:

```bash
pi install npm:pi-claude-oauth
```

To try the extension for one run without saving it to your Pi settings, run:

```bash
pi -e npm:pi-claude-oauth
```

## Sign in

Run the `/login claude` command:

```
/login claude
```

### Sign-in options

Pi first asks how to sign in:

| Option                                 | What it does                                                              |
| -------------------------------------- | ------------------------------------------------------------------------- |
| **Sign in with a Claude subscription** | Offers three methods, listed under "Claude subscription sign-in methods". |
| **Sign in with an API key**            | Asks you to paste a `claude setup-token` token and saves it in Pi.        |

### Claude subscription sign-in methods

| Method                              | What it does                                                                                                                                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser sign-in                     | Authorizes in your browser. Returns through `http://localhost:53692/callback`, or through a free port when 53692 is taken. If the browser runs on another machine, paste the final redirect URL instead. |
| Copy code (headless)                | Uses Anthropic's manual redirect. Asks you to paste the `code#state` value that the manual redirect shows. Runs no local server.                                                                         |
| Import setup token from environment | Saves the `claude setup-token` token from `CLAUDE_CODE_OAUTH_TOKEN`. Pi never asks you to type or paste the token.                                                                                       |

**Sign in with an API key** is Pi's label for this option. For the `claude` provider, it takes a `claude setup-token` token, not an Anthropic API key. To use an Anthropic API key, use Pi's built-in `anthropic` provider.

### Choose a sign-in method

Prefer the **Browser sign-in** method when you sign in interactively.

### Sign-in without a browser

For containers, CI, or any environment without a browser, export a setup token before starting Pi:

```bash
export CLAUDE_CODE_OAUTH_TOKEN="$(claude setup-token)"
```

Pi uses the exported setup token directly. Alternatively, `/login claude` can save the exported setup token.

### Credential precedence and setup token expiry

- When a credential is stored, the stored credential wins over the `CLAUDE_CODE_OAUTH_TOKEN` environment variable.
- A setup token expires after a year and cannot be refreshed.
- When a setup token expires, replace it in either of these ways:
  - Run `/login claude` and paste a new setup token with **Sign in with an API key**.
  - Export a new setup token, restart Pi, and import it with **Sign in with a Claude subscription** → **Import setup token from environment**.

## Use the claude provider

Example commands:

```
/model claude/claude-opus-5-5
/claude status
/claude usage
```

### Claude commands

| Command          | What it does                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| `/claude status` | Renders a card with the sign-in source, the number of registered models, and the active model. |
| `/claude usage`  | Shows the subscription's rolling usage windows with reset times.                               |
| `/claude login`  | Points at the built-in `/login` command.                                                       |
| `/claude logout` | Points at the built-in `/logout` command.                                                      |

### Claude model catalog

- Model entries reuse the Anthropic catalog built into the installed Pi version.
- The reused catalog data includes context windows, output limits, thinking levels, compatibility flags, and per-token costs.
- New Claude models appear when you update Pi.
- Pi's live pi.dev catalog updates reach the built-in `anthropic` provider only, not the `claude` provider.

## Billing and terms

### What the extension does with tokens

- This extension does not bypass anything.
- The extension performs the same OAuth client, scopes, and token refresh that Claude Code uses.
- The extension sends the tokens to Anthropic's API.

### Billing warning

- Pi's built-in billing warning applies only to its `anthropic` provider, not to this extension's `claude` provider.
- The `/login claude` sign-in prompts show an equivalent warning instead. It states that third-party harness usage is billed per token as extra usage, outside your Claude plan limits.
- Manage extra usage at https://claude.ai/settings/usage.

### Account-level use

Treat subscription OAuth as an account-level credential, not as a way to move plan limits into another harness. Review Anthropic's consumer terms and usage settings before relying on it for daily work.

## Security

### Token storage and logging

- Pi stores the credential in `~/.pi/agent/auth.json`.
- The extension never writes tokens anywhere else.
- Access and refresh tokens are never logged.
- Error messages include the HTTP status or Anthropic's OAuth error code.
- Error messages redact the submitted code, state, PKCE verifier, or refresh token and remove terminal control characters from provider diagnostics.
- Token and usage responses are limited to 256 KiB.

### OAuth callback and PKCE

- The loopback callback accepts only requests with the matching `state` nonce.
- The PKCE verifier is published to neither the browser nor the callback URL.
- The PKCE verifier goes directly to the token endpoint.

### Token refresh and Claude Code credentials

- Refresh rotates the refresh token under Pi's credential-store lock, so concurrent requests and concurrent Pi processes refresh once.
- The extension deliberately does not import the refresh token from Claude Code's own credential store. Anthropic rotates refresh tokens, so copying Claude Code's refresh token and refreshing it in this extension would invalidate your Claude Code login.

### OAuth client id

- The OAuth client id is Claude Code's public PKCE client id, so it is not a secret.

## Protocol reference

### OAuth constants

The constants in `src/oauth.ts` mirror Claude Code 2.1.331:

| Item            | Value                                                                              |
| --------------- | ---------------------------------------------------------------------------------- |
| Authorize       | `https://claude.com/cai/oauth/authorize`                                           |
| Token           | `https://platform.claude.com/v1/oauth/token`                                       |
| Manual redirect | `https://platform.claude.com/oauth/code/callback`                                  |
| Client id       | `9d1c250a-e61b-44d9-88ed-5944d1962f5e`                                             |
| Scopes          | `user:profile user:inference user:sessions:claude_code`                            |
| PKCE            | `S256`, independent `state` nonce, `code=true`                                     |
| Grants          | `authorization_code`, `refresh_token` with JSON bodies                             |
| Inference beta  | `oauth-2025-04-20`, added by Pi's Anthropic implementation for `sk-ant-oat` tokens |

### Documentation the protocol reference follows

| Documentation                                                                          | Topics                                                                                                   |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Authentication](https://code.claude.com/docs/en/authentication)                       | Credential storage, precedence, long-lived tokens                                                        |
| [CLI reference](https://code.claude.com/docs/en/cli-reference)                         | `claude setup-token`                                                                                     |
| [Environment variables](https://code.claude.com/docs/en/env-vars)                      | `CLAUDE_CODE_OAUTH_TOKEN`                                                                                |
| [GitHub Actions](https://code.claude.com/docs/en/github-actions)                       | Plans whose subscriptions issue these tokens                                                             |
| Pi extension API: `docs/extensions.md` and `docs/custom-provider.md` in the Pi install | Specifically native `Provider` registration, `OAuthAuth`, `AuthInteraction`, and `registerEntryRenderer` |

## Development

### Development tool versions

- Use npm 11.20.0 and a supported Node.js version.
- Pi loads the TypeScript sources directly, so there is no build step.
- TypeScript checks the extension, tests, and scripts. It skips dependency declaration-file checks because Pi 1.6 uses JSON imports in those files without NodeNext import attributes.

### Development commands

```bash
npm ci --ignore-scripts
npm run check          # check Biome formatting and lint rules, then typecheck
npm test               # run the full test suite
npm run test:watch     # rerun affected tests while editing
npm run test:unit      # run tests for individual modules
npm run test:integration # run tests across extension and host boundaries
npm run test:coverage  # run the test suite with V8 coverage thresholds
npm run bench          # measure offline copy-code sign-in with and without paste retries
npm run audit          # fail on high or critical dependency advisories
npm run pack:check     # list the files that would ship
npm run test:package   # install the tarball in a temporary directory and load it in offline Pi
npm run test:package -- path/to/package.tgz # load a specific tarball instead of packing
npm run dev            # load this checkout in Pi
```

If Pi has no configured model, use `/login` before sending a prompt. `npm run dev` uses your Pi configuration.

### Versioning

Before 1.0, releases can contain breaking changes. Check the `BREAKING CHANGES` section in [CHANGELOG.md](CHANGELOG.md) before upgrading.

### Releasing

See [how to stage and approve npm releases](https://github.com/just-joshn/pi-claude-oauth/blob/main/docs/releasing.md).

### Source layout

```
src/
  index.ts            extension entry: provider, card renderer, /claude command
  provider.ts         native Pi provider with OAuth and ambient token auth
  login.ts            browser, copy-code, and setup-token login methods
  oauth.ts            endpoints, PKCE, authorize URL, token exchange, refresh
  callback-server.ts  loopback redirect handler
  credential.ts       credential shaping and setup-token rules
  models.ts           Claude catalog derived from Pi's Anthropic catalog
  usage.ts            /api/oauth/usage lookup and formatting
  commands.ts         /claude status and usage cards
  ui.ts               durable card renderer
```

## Limitations

- Anthropic does not publish a long-term stability contract for this OAuth flow.
- If Claude Code changes endpoints, scopes, or headers, the constants in `oauth.ts` and `usage.ts` need the same change.
- Usage windows come from Claude's internal usage endpoint.
- When Claude's internal usage endpoint is unavailable, `/claude usage` reports the HTTP status instead of guessing.
