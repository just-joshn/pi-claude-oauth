# Testing Rules

Purpose: testing rules for minimum test coverage, required test types, the test-driven development workflow, edge cases, and test quality.

## Minimum test coverage

- Minimum test coverage is 80% of statements, branches, functions, and lines in each source file in `src/`.
- `bun run test:coverage` enforces the minimum, and CI runs it.

## Required test types

ALL test types below are required.

| Test type         | Covers                                                | Location                                           |
| ----------------- | ----------------------------------------------------- | -------------------------------------------------- |
| Unit tests        | Individual functions and modules in `src/`            | `test/*.test.ts`, run by `bun run test`            |
| Integration tests | The extension loaded through Pi's extension loader    | `test/index.test.ts`, run by `bun run test`        |
| E2E tests         | Critical user flows in real Pi, with no network calls | `scripts/smoke.ts`, run by `node scripts/smoke.ts` |

## Test-driven development workflow

This workflow is MANDATORY for every change to behavior in `src/`. Changes to documentation, CI, or tooling alone do not change behavior and need no new test.

1. Write the test first. Phase: RED.
2. Run the test. It should FAIL.
3. Write a minimal implementation. Phase: GREEN.
4. Run the test. It should PASS.
5. Refactor the code you just wrote. Phase: IMPROVE.
6. Verify coverage is 80% or higher.

## Edge cases to test

Every function that takes external input must be tested with each case below that its input type allows. External input is data from users, environment variables, files, or network responses.

- [ ] Null/undefined inputs
- [ ] Empty arrays
- [ ] Empty strings
- [ ] Invalid types
- [ ] Boundary values: min and max
- [ ] Error conditions

## Test quality checklist

- [ ] Tests are independent, with no shared state.
- [ ] Test names describe behavior.
- [ ] Mocks are used for external dependencies.
- [ ] Both the happy path and error paths are tested.
- [ ] No flaky tests.
