# TypeScript style and correctness

Apply when writing or reviewing TypeScript or JavaScript. Follow the existing formatter and naming conventions; use the defaults here for new code where no convention exists.

## Type safety

- TS-01 MUST use strict type checking. Preserve existing strict compiler options. For new projects, adopt the compatible baseline in [Toolchain](toolchain.md).
- TS-02 MUST NOT introduce `any` to bypass checking. Use `unknown` for unknown data, then narrow or validate. If an unavoidable compatibility boundary requires an escape hatch, isolate it, document the invariant and test the boundary.
- TS-03 MUST NOT use double assertions, non-null assertions, `@ts-ignore`, `@ts-nocheck` or blanket lint disables to conceal errors. A narrow assertion is allowed only when an independently established invariant justifies it. Use `@ts-expect-error` for intentional negative type tests or a documented, reviewed temporary workaround.
- TS-04 MUST represent missing and nullable values accurately. Account for absent indexed values, optional properties and error outcomes. Use `??` when zero, false or empty strings are valid; do not substitute it for intentional truthiness checks.
- TS-05 SHOULD infer straightforward local types and declare stable public parameter and return contracts. Avoid redundant annotations, unused generic parameters and generic abstractions with no demonstrated need.
- TS-06 SHOULD use discriminated unions for mutually exclusive states and handle cases exhaustively. Prefer literal unions or `as const` objects for finite values when runtime enum behavior is unnecessary. Do not migrate public enums without checking compatibility.
- TS-07 SHOULD use interfaces for extensible object contracts and type aliases for unions, tuples, mapped types and other aliases. Prefer interface extension to complex intersections when equivalent. Use `satisfies` when checking a value against a type without replacing its inferred type.
- TS-08 MUST use `import type` for imports used only in type positions where supported by the project's compiler. Preserve runtime imports and module initialization effects. Match the project's module resolution and extension convention.
- TS-09 SHOULD use `readonly` to express nonmutation contracts. Do not assume `readonly`, `as const` or `Readonly<T>` provides deep runtime immutability.

## Implementation

- TS-10 MUST use `const` unless reassignment is required; use `let` when reassignment is required. Do not introduce `var`. Use strict equality unless an intentional, documented exception is justified.
- TS-11 SHOULD use early returns, cohesive functions and explicit dependencies. Prefer composition and existing simple functions to unnecessary classes, factories, adapters or wrappers.
- TS-12 MUST preserve behavior during refactors, including errors, side effects, ordering, identity, null semantics and concurrency. Avoid incidental public API changes.
- TS-13 MUST propagate, await or explicitly handle promises. Do not use `void` to silence a potentially unhandled rejection. Handle failures at the layer that can recover, translate or report them. Throw `Error` instances or appropriate typed errors rather than strings.
- TS-14 MUST validate external values before relying on their declared types. Do not use an assertion such as `response.json() as User` as a substitute for validation. Follow [Security](security.md).
- TS-15 MUST NOT add unreachable branches, redundant guards for proven invariants, catch-and-rethrow blocks with no effect, unused exports, dead code, placeholder implementations or speculative abstractions.
- TS-16 SHOULD name non-obvious domain constants and document decisions that code cannot explain. Do not comment on obvious syntax or retain obsolete commented-out code.
- TS-17 SHOULD prefer named exports for new modules, unless the framework requires another convention. Use the repository's established import order; avoid barrels that create cycles or unnecessary module evaluation.

## Naming and formatting defaults

| Element | Default |
| --- | --- |
| Variables, functions, methods | `camelCase` |
| Classes, interfaces, type aliases | `PascalCase` |
| Shared module-level constants | `UPPER_SNAKE_CASE` where convention fits |
| Booleans | `isEnabled`, `hasAccess`, `canEdit` |
| Generic types | `T` for simple generics; descriptive names for complex contracts |
| Files and directories | `kebab-case`, except framework conventions |
| Tests | `*.test.ts` or the existing test naming convention |
| Environment variables | `UPPER_SNAKE_CASE` |

Use the configured formatter. New-project defaults: two-space indentation, single quotes, semicolons, trailing commas where supported, `printWidth: 100`, LF line endings. Do not perform unrelated formatting churn.

## Review before completion

Check all new type escapes, nullable paths, promise handling, external inputs, public exports and behavior changes. Remove unnecessary comments, allocations, error handling, abstractions and imports. Run the repository's type checker, formatter check, typed lint and relevant tests.

## Official references

- [TypeScript handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [TypeScript compiler options](https://www.typescriptlang.org/tsconfig/)
- [typescript-eslint shared configurations](https://typescript-eslint.io/users/configs/)
- [Prettier options](https://prettier.io/docs/options)
