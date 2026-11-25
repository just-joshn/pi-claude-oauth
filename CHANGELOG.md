# Changelog

## [0.1.3] - 2026-11-24

### Fixed

- Releases are staged on npm through trusted publishing and published after maintainer approval. Direct publishing
  was rejected, so 0.1.1 and 0.1.2 never reached npm; 0.1.3 contains their changes.

## [0.1.2] - 2026-11-24

### Internal

- Simplified the network error handling in `src/oauth.ts` without changing the errors users see, made the
  `TokenPayload` type private, and trimmed source comments to the constraints the code cannot express.

## [0.1.1] - 2026-11-24

### Changed

- The extension ships from `src/` instead of `extensions/claude-oauth/`. Pi finds it through the package's
  `pi.extensions` entry, so installs need no change.
- The package declares Node.js 22.19 or later in `engines`.

### Internal

- Tests run on Vitest with 80% per-file coverage thresholds, and the extension type-checks under TypeScript 6
  with stricter compiler and lint settings.
- Added tests for the provider's saved credential `env`, cancellation and login delegation.

## [0.1.0] - 2026-11-24

### Added

- Native `claude` provider for Claude Pro, Max, and Ultra subscription OAuth tokens.
- Login methods: browser PKCE with a loopback callback and manual paste fallback, headless copy-code, and
  `claude setup-token`.
- Ambient `CLAUDE_CODE_OAUTH_TOKEN` support when no credential is stored.
- Locked token refresh through Anthropic's OAuth token endpoint.
- `/claude status` and `/claude usage` cards rendered from durable session entries.
- Claude model catalog derived from Pi's Anthropic catalog.
