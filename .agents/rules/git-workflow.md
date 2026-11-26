# Git Workflow Rules

Purpose: git rules for commit message format, the pull request workflow, the feature implementation workflow, and branch naming.

## Commit message format

```
<type>: <description>

<optional body>
```

Commit types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`.

## Pull request workflow

When creating PRs:

1. Analyze the full commit history, not just the latest commit.
2. Use `git diff [base-branch]...HEAD` to see all changes.
3. Draft a comprehensive PR summary.
4. Include a test plan with TODOs.
5. If the branch is new, push with the `-u` flag.

## Feature implementation workflow

1. Plan first: use the `planner` agent.
2. TDD approach: use the `tdd-guide` agent.
3. Code review: use the `code-reviewer` agent after writing code.
4. Commit: follow the conventional commits format.

## Branch naming

| Prefix      | Use for               |
| ----------- | --------------------- |
| `feature/`  | New features          |
| `fix/`      | Bug fixes             |
| `refactor/` | Code refactoring      |
| `docs/`     | Documentation changes |
