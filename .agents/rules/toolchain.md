# Toolchain, compiler and dependencies

Apply to new projects, dependency changes, TypeScript configuration, linting, formatting and build changes.

## Version and dependency policy

- TOOL-01 MUST inspect `package.json`, the package-manager lockfile, runtime/version configuration, workspace configuration and CI before selecting commands or versions. Use the repository's package manager and local executables; do not fetch a CLI implicitly.
- TOOL-02 MUST NOT upgrade runtime, compiler, lint, test or build tools solely because a newer version exists. For new projects or authorized upgrades, choose a stable supported release compatible with the complete toolchain. For Node.js production, prefer an appropriate supported LTS release.
- TOOL-03 MUST verify compatibility through official release notes, supported-version ranges and peer dependencies. Check compiler API compatibility separately from the compiler CLI, especially when using the native TypeScript compiler. Do not hide unsupported-version warnings.
- TOOL-04 MUST retain one package-manager strategy per workspace unless an intentional exception exists. Update manifests and the relevant lockfile together; use frozen/immutable installation in CI. Do not hand-edit generated lockfiles unless the package manager documents that operation.
- TOOL-05 MUST justify new dependencies against existing libraries and runtime APIs. Evaluate maintenance, license, security, bundle/runtime cost and compatibility. Do not add dependencies for trivial code or duplicate existing functionality.
- TOOL-06 MUST use the project's supported runtime targets. Do not assume a TypeScript `target`, a bundler or successful type checking polyfills runtime APIs.

## Strict compiler baseline

For a new compatible project, use the following shared baseline. Check actual option support and runtime needs before applying it. Do not disable checks to resolve ordinary source errors.

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "forceConsistentCasingInFileNames": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true
  }
}
```

- TOOL-07 MUST choose `target`, `lib`, `module`, `moduleResolution` and ambient `types` for the actual runtime and output format. Prefer ESM for new projects when supported. Use `NodeNext` with `NodeNext` resolution for appropriate native Node.js builds; use bundler resolution only for compatible bundler workflows. Follow Node's package type and emitted file extension rules.
- TOOL-08 MUST type-check every relevant source, test and tooling project. A transpiler or type-stripping runtime is not a type checker. Use `noEmit` for type-only checks where compatible; prevent compiler output on type errors when `tsc` owns emission. Verify declaration output and consumer imports for published packages.
- TOOL-09 SHOULD keep build and test configurations separate when their globals or output requirements differ. Limit included files and ambient types. Set source map policy according to debugging and deployment exposure requirements.
- TOOL-10 MUST NOT introduce `skipLibCheck` or other reduced verification solely to hide dependency conflicts. A deliberate build-speed tradeoff requires documented impact, compatibility checks and appropriate separate validation.

## Linting and formatting

- TOOL-11 SHOULD use existing ESLint flat configuration and type-aware TypeScript rules. For a new experienced team, evaluate `strictTypeChecked` and `stylisticTypeChecked`; `recommendedTypeChecked` is an acceptable baseline. Use `projectService` where supported, and ensure relevant source and tests are included in their TypeScript projects.
- TOOL-12 SHOULD enforce unsafe type usage, floating/misused promises, exhaustive switches, explicit module boundaries, type-only imports, strict equality, `prefer-const`, `no-var`, `no-eval` and `no-debugger` with compatible rules. Do not enable redundant or conflicting rules; configure legitimate framework exceptions narrowly.
- TOOL-13 SHOULD use Prettier or the established formatter separately from linting. Avoid duplicate formatting rules and linting generated artifacts. Run formatting checks without rewriting unrelated files.
- TOOL-14 MUST verify configuration changes with the actual installed tools and relevant CI commands. Configuration snippets are starting points, not evidence of successful execution.

## Official references

- [TypeScript TSConfig](https://www.typescriptlang.org/tsconfig/)
- [TypeScript module configuration](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html)
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [typescript-eslint version compatibility](https://typescript-eslint.io/users/dependency-versions/)
- [typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting/)
- [typescript-eslint configurations](https://typescript-eslint.io/users/configs/)
- [Prettier options](https://prettier.io/docs/options)
- [npm ci](https://docs.npmjs.com/cli/commands/npm-ci)
- [pnpm install](https://pnpm.io/cli/install)
