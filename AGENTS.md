# AGENTS.md

This file lists the agent rule files for this repository, when to read each one, and which rule wins when two rules apply to the same change.

## Rule files

| Rule                                     | Purpose                                                              | Read it when                                                             |
| ---------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `./.agents/rules/coding-style.md`        | Code style rules                                                     | Before writing code, and before marking work complete                    |
| `./.agents/rules/testing.md`             | Testing requirements and coverage targets                            | Before changing behavior in `src/`, and before writing or changing tests |
| `./.agents/rules/security.md`            | Security checklist and best practices                                | Before ANY commit, and when you find a security issue                    |
| `./.agents/rules/performance.md`         | Performance guidelines                                               | Before implementing                                                      |
| `./.agents/rules/git-workflow.md`        | Git commit and PR workflow                                           | Before you commit, name a branch, or create a pull request               |
| `./.agents/rules/karpathy-guidelines.md` | Coding discipline: think before coding, simplicity, surgical changes | Before any coding task                                                   |

## Rule precedence

- The rules in `.agents/rules/` are project-specific instructions. Where they are more specific than `karpathy-guidelines.md`, they win, as `karpathy-guidelines.md` itself says to merge them.
- The security response protocol in `security.md` overrides the change-scope rules in `karpathy-guidelines.md`.
- The 800-line file limit in `coding-style.md` overrides "Add no abstractions for single-use code" in `karpathy-guidelines.md`: extract code from a file to keep it within the limit.
- Repository configuration is the source of truth for what it enforces: `bunfig.toml` for formatting, `.oxlintrc.json` for lint, `tsconfig.json` for types, `vitest.config.ts` for coverage, and `.github/workflows/` for CI.
