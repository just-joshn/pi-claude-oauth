# Changelog

## [0.1.0] - 2026-11-24

### Added

- Native `claude` provider for Claude Pro, Max, and Ultra subscription OAuth tokens.
- Login methods: browser PKCE with a loopback callback and manual paste fallback, headless copy-code, and
  `claude setup-token`.
- Ambient `CLAUDE_CODE_OAUTH_TOKEN` support when no credential is stored.
- Locked token refresh through Anthropic's OAuth token endpoint.
- `/claude status` and `/claude usage` cards rendered from durable session entries.
- Claude model catalog derived from Pi's Anthropic catalog.
