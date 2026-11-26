# Testing and regression prevention

Apply to all changes that affect behavior, including bug fixes, refactors, configuration and public type contracts.

## Test selection

- TEST-01 MUST test changed behavior and relevant invariants. For a bug fix, reproduce the defect with a failing regression test before the fix when feasible; verify it passes afterward. If reproduction is unavailable, state why and test the relevant behavior.
- TEST-02 SHOULD use the smallest test level that can prove the behavior. Use unit tests for logic, integration tests for real boundaries and persistence, contract tests for cross-service/public contracts, and end-to-end tests for critical user flows. Use compile-time tests for public type guarantees.
- TEST-03 MUST cover relevant success, failure, boundary and empty-input cases. Include nullability, invalid input, authorization, tenant isolation, retries, concurrent operations, cancellation and recovery when applicable. Do not add irrelevant cases just to inflate coverage.
- TEST-04 MUST preserve existing meaningful assertions. Do not skip tests, weaken expectations, broaden tolerances, remove cases or update snapshots just to make CI pass. Change expectations only for an authorized behavior change; review snapshot diffs.
- TEST-05 SHOULD use existing test frameworks. For new projects, consider Vitest or Node's test runner for unit tests, real isolated services or Testcontainers for integration tests, and Playwright for browser end-to-end tests. Use property-based tests for broad invariants and mutation tests where additional evidence is useful.

## Test implementation

- TEST-06 MUST make tests deterministic and independent. Control clocks, randomness, network responses and mutable state when relevant. Use seeded random input for reproducible failures. Clean up resources and isolate storage; never use production data or services for routine tests.
- TEST-07 SHOULD test observable behavior instead of private implementation details. Use Arrange, Act, Assert structure, descriptive test names, small fixtures and parameterized cases. Prefer actual boundary integrations where practical; mock external dependencies or nondeterministic boundaries rather than the code under test.
- TEST-08 MUST await asynchronous operations and assertions. Use condition-based waiting with deadlines, fake timers where appropriate, or framework retryable assertions; avoid arbitrary sleep calls. Do not use retries to conceal flaky tests.
- TEST-09 Playwright tests SHOULD use role, label, text or explicit test-ID locators and retryable assertions. Isolate browser sessions and test data. Do not depend on uncontrolled third-party websites. Keep browser, OS and rendering environment consistent for visual snapshots.
- TEST-10 MUST type-check tests and test helpers. For exported type contracts, use the established type-testing mechanism or compiler-based negative tests with justified `@ts-expect-error` directives. Verify that type tests actually run; ordinary transpiled tests do not establish type correctness.

## Coverage policy

Coverage is a diagnostic and minimum gate, not proof of correctness. Follow configured thresholds and do not lower them or exclude reachable code to pass CI.

| Metric | Proposed minimum for new projects | Preferred target |
| --- | ---: | ---: |
| Lines | 80% | 90% |
| Statements | 80% | 90% |
| Functions | 80% | 90% |
| Branches | 80% | 90% |
| Changed-code coverage, if supported by CI | 90% | 95% |
| Identified critical business/security scenarios | All | All |

The percentages are engineering defaults, not requirements imposed by TypeScript or the test runner. Configure coverage to include relevant source files that tests do not import. Use V8 coverage on compatible runtimes or an existing equivalent. Diff coverage requires a tool that calculates changed-line coverage; overall thresholds alone do not establish it.

## Execution gate

Run targeted tests during implementation and the affected broader suite before completion. For performance-sensitive changes, follow [Performance](performance.md); for security-sensitive changes, follow [Security](security.md). Report actual test results, including failures, skips, coverage and unavailable environments. Do not claim that a test passed if it was not executed.

## Official references

- [Vitest guide](https://vitest.dev/guide/)
- [Vitest coverage](https://vitest.dev/guide/coverage)
- [Vitest coverage configuration](https://vitest.dev/config/coverage)
- [Vitest type testing](https://vitest.dev/guide/testing-types)
- [Node.js test runner](https://nodejs.org/api/test.html)
- [Playwright best practices](https://playwright.dev/docs/best-practices)
- [Testcontainers for Node.js](https://node.testcontainers.org/)
