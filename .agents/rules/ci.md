# Continuous integration and verification

Apply to implementation changes and CI/build/deployment work. Use actual repository commands. Do not invent scripts, assume a package manager or claim results that were not observed.

## Verification sequence

- CI-01 MUST inspect package scripts, workspace tasks and CI workflows before running commands. Prefer local installed executables through the configured package manager. Install dependencies only when needed and permitted, using the lockfile.
- CI-02 MUST run targeted relevant tests during development, then applicable broader quality gates. For documentation-only changes, use documentation/link checks and other affected validation rather than running unrelated suites.
- CI-03 MUST run read-only format checks and lint with no new warnings/errors. Run type checking for all affected projects, including tests; a successful transpile is insufficient. Run the production build when its inputs change.
- CI-04 MUST run relevant unit, integration, end-to-end, contract and type tests. Enforce configured coverage without weakening thresholds. Run the coverage suite instead of duplicating the same unit suite when it covers the same cases.
- CI-05 MUST run configured security scans and performance gates when relevant. Triage findings according to project policy. Do not invent audit exceptions or report skipped scans as clean.
- CI-06 MUST fix failures caused by the change and rerun failed or affected checks. Distinguish independently established pre-existing failures from new failures; report both. If required checks cannot run, report the command and concrete blocker.
- CI-07 MUST inspect the final diff, including untracked files created by the task and generated outputs. Check for unintended files, secrets, accidental configuration changes, weakened checks and out-of-scope modifications.

## Merge quality gates

| Gate | Expected result when applicable |
| --- | --- |
| Locked dependency installation | Successful and reproducible |
| Formatting | No violations |
| Lint | No errors/warnings under project policy |
| Type checking | No errors |
| Unit, integration, E2E, contract and type tests | Pass |
| Coverage | Configured thresholds met |
| Production build and packaging | Successful |
| Secret scanning, dependency scanning, static security analysis | No unresolved blocking findings |
| Performance | Established budgets met; evidence for material changes |
| Review and approvals | Required reviews satisfied |

## New-project script conventions

Suggested script names: `format`, `format:check`, `lint`, `lint:fix`, `typecheck`, `test`, `test:watch`, `test:coverage`, `test:e2e`, `build`. Bind scripts to the actual framework and tools. For example, a compatible pnpm/Vitest project might run `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:coverage` and `pnpm run build`. Only run commands that exist and apply to the project. For npm use its corresponding script commands.

## Pipeline design

- CI-08 SHOULD run independent checks in parallel within CPU, memory and service limits. Share immutable artifacts when valid; use correct cache keys including relevant runtime, platform, lockfile and build inputs. Do not cache secrets or mix untrusted artifacts into privileged jobs.
- CI-09 MUST fail jobs on actual blocking errors. Do not use `continue-on-error`, swallowed exit codes, skipped checks or fake success statuses to bypass a mandatory gate. Preserve branch protection and review requirements.
- CI-10 MUST protect credentials and workflow execution according to [Security](security.md). Keep permissions minimal, pin workflow dependencies using the supported mechanism, and separate privileged deployment from untrusted code execution.
- CI-11 MUST NOT deploy, publish, mutate live data or change remote CI/repository policy without authorization. For authorized release changes, verify artifact identity, target environment, required approvals, migrations, smoke checks and recovery plan.

## Verification report

Record actual commands and outcomes. Use `PASS`, `FAIL`, `NOT RUN` or `NOT APPLICABLE`; explain every failure or required check not run. Include measured performance results where applicable. Label the implementation unverified or partially verified when mandatory checks remain incomplete. Never use a successful local check as proof of a remote CI run or deployment.

Example (illustrative, not a claim of execution):

```text
Changes: validated request schema and added regression tests.
PASS: pnpm run typecheck
PASS: pnpm run test:coverage
NOT RUN: browser tests (browser dependencies unavailable).
Remaining: browser verification required before merge.
```

## Official references

- [GitHub Actions documentation](https://docs.github.com/en/actions)
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [npm ci](https://docs.npmjs.com/cli/commands/npm-ci)
- [pnpm install](https://pnpm.io/cli/install)
