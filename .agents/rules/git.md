# Git, review and release workflow

Apply to version-control operations, commits, pull requests, branch policy and releases. Prefer the existing workflow. The new-project default is short-lived branches, a protected deployable `main`, pull requests and squash merging.

## Agent safety

- GIT-01 MUST inspect `git status --short` and relevant diffs before editing or staging. Preserve uncommitted and untracked user changes. Do not assume every changed file belongs to the task.
- GIT-02 MUST NOT discard or overwrite unrelated work. Do not use destructive reset, clean, checkout, restore, blanket staging, automatic stashing or history rewriting to resolve ambiguity. If unrelated edits overlap, preserve them and report a conflict if safe editing is impossible.
- GIT-03 MUST NOT create commits, change branches, push, open/merge pull requests, alter protections, tag, release, publish or deploy unless authorized by the task or established authorized workflow. Prefer read-only inspection otherwise.
- GIT-04 MUST NOT force-push shared or protected branches. For an explicitly authorized history rewrite on a personal branch, verify the destination and expected remote commit; use an explicit `--force-with-lease=<ref>:<expected-oid>` rather than `--force`. Do not treat a lease as authorization.
- GIT-05 MUST NOT bypass hooks, review requirements, signing or CI. Never commit secrets, machine-local configuration, caches or generated files unless repository policy specifically tracks them.

## Normal development workflow

1. When authorized to create a branch, start from the verified current default branch. Use a short-lived branch for a cohesive change; preserve existing user work.
2. Implement and test the change. Keep the diff focused; include relevant documentation and generated artifacts only where required.
3. Review staged and unstaged changes. Stage only intended files or hunks. Run applicable checks in [CI](ci.md).
4. When authorized, commit with the established message convention. Push and open a pull request only when requested or permitted by the workflow.
5. Require passing CI and human review before merging. Use the repository's configured merge strategy; squash merging is a reasonable default. Delete the completed branch only when allowed.

## Naming and commits (new-project defaults)

Branch prefixes: `feat/`, `fix/`, `refactor/`, `perf/`, `test/`, `docs/`, `chore/`, `hotfix/` followed by a short kebab-case description.

Use Conventional Commits: `type(scope): description`. Scope is optional. Use imperative, specific descriptions. Examples:

```text
feat(auth): add session rotation
fix(api): reject expired credentials
perf(database): eliminate redundant queries
refactor(users): simplify repository interface
test(auth): cover token expiration
docs(api): document rate limits
build: update compiler configuration
ci: add dependency scanning
chore: update dependencies
revert: restore prior validation behavior
feat(api)!: change public identifier format
```

Use `!` or a `BREAKING CHANGE:` footer for breaking changes. Apply Semantic Versioning to released public packages with declared public APIs; follow existing release tooling. Do not bump versions or create release artifacts unless in scope.

## Pull requests and branch protection

- GIT-06 MUST describe purpose, behavior changes, tests run, risks, migration/rollback needs and material performance/security implications in a PR. Keep unrelated refactors out of the same change.
- GIT-07 SHOULD configure protected default branches with required PRs, at least one approving review, relevant CODEOWNERS reviews, required CI, resolved conversations, stale-approval handling and blocked force pushes/deletion. Use linear history if appropriate, a merge queue for busy repositories, and signed commits when required. Restrict administrative bypass to controlled break-glass procedures.
- GIT-08 MUST use an auditable revert or documented recovery procedure for merged changes; do not rewrite shared history to remove ordinary mistakes. Coordinate sensitive-history remediation with the authorized security process.

## Official references

- [Git documentation](https://git-scm.com/doc)
- [Git push](https://git-scm.com/docs/git-push)
- [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches)
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [Semantic Versioning 2.0.0](https://semver.org/)
