# Architecture and API design

Apply when changing module boundaries, public APIs, state, schemas, persistence, or cross-cutting behavior.

## Boundaries and complexity

- ARCH-01 MUST follow established module boundaries and dependency direction. Do not introduce a new architecture or broad migration to implement a small change.
- ARCH-02 SHOULD organize new modules by domain or feature. Keep domain logic independent of transport, persistence and presentation when the separation reduces coupling.
- ARCH-03 SHOULD expose only the public API required by consumers. Keep helpers private; avoid unnecessary re-exports, circular dependencies and cross-domain reach-through imports.
- ARCH-04 MUST prefer the simplest implementation that satisfies current requirements. Introduce an abstraction only when it removes meaningful duplication, isolates volatility or creates a needed testable boundary. Do not add layers merely for uniformity.
- ARCH-05 SHOULD make dependencies and side effects explicit. Use pure functions where practical; inject clocks, identifiers, external clients or storage at boundaries when needed for correctness or testing.
- ARCH-06 MUST keep authoritative state and business invariants in one appropriate place. Avoid duplicated derived state, competing schemas and uncontrolled shared mutable state. Represent valid states with explicit types.
- ARCH-07 MUST use domain-appropriate units and precision. Specify money rounding and currency; use integer minor units or a suitable decimal representation where required. Define date/time zones, clock assumptions and identifier semantics. Do not silently coerce invalid values.

## Public contracts and persistence

- ARCH-08 MUST preserve public API compatibility unless an intentional breaking change is in scope. Identify downstream consumers, serialization formats, error contracts and runtime targets. Add compatibility tests when needed.
- ARCH-09 MUST keep migrations compatible with the deployment strategy. For rolling deployments, design compatible schema and code transitions, backfills, rollback or forward-recovery procedures. Do not execute against production without explicit authorization.
- ARCH-10 MUST use transactions and constraints for multi-step invariants where the storage system supports them. Evaluate duplicate delivery, lost updates, retries, concurrency, partial failure and idempotency where relevant.
- ARCH-11 MUST distinguish domain errors from infrastructure failures. Return or translate errors at meaningful boundaries, preserve causes internally and expose safe, stable public errors.
- ARCH-12 SHOULD use existing structured logging, metrics and tracing. Include useful operation context without high-cardinality labels, credentials or unnecessary personal data.
- ARCH-13 MUST consider security and performance at module boundaries. Read [Security](security.md) and [Performance](performance.md) when relevant.

## New-project organization (default, not a migration requirement)

For a moderately complex service, consider `src/modules/<domain>/` for domain-specific code, `src/infrastructure/` for adapters, `src/config/` for validated configuration, colocated unit tests, and `tests/integration/` or `tests/e2e/` for cross-module checks. Use smaller structures for small projects. Keep shared code limited to genuinely shared contracts or functionality.

## Review before completion

Verify dependency direction, compatibility, failure behavior, transaction boundaries, rollout assumptions, state ownership and whether each new abstraction is necessary. Update relevant API or migration documentation.

## Official references

- [TypeScript module theory](https://www.typescriptlang.org/docs/handbook/modules/theory.html)
- [Semantic Versioning](https://semver.org/)
- [OWASP ASVS](https://asvs.owasp.org/)
