# Testing Rules

Purpose: testing rules for minimum test coverage, required test types, the test-driven development workflow, edge cases, and test quality.

## Minimum test coverage

- Minimum test coverage is 80%.
- ALL test types below are required.

| Test type         | Covers                                      |
| ----------------- | ------------------------------------------- |
| Unit tests        | Individual functions, utilities, components |
| Integration tests | API endpoints, database operations          |
| E2E tests         | Critical user flows                         |

## Test-driven development workflow

This workflow is MANDATORY:

1. Write the test first. Phase: RED.
2. Run the test. It should FAIL.
3. Write a minimal implementation. Phase: GREEN.
4. Run the test. It should PASS.
5. Refactor. Phase: IMPROVE.
6. Verify coverage is 80% or higher.

## Edge cases to test

Every function must be tested with:

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
