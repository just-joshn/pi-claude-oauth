# Releasing pi-claude-oauth

## One-time setup

In the npm settings for `pi-claude-oauth`, add a GitHub Actions trusted publisher
with these values:

| Setting           | Value             |
| ----------------- | ----------------- |
| GitHub owner      | `just-joshn`      |
| Repository        | `pi-claude-oauth` |
| Workflow filename | `release.yml`     |
| Environment       | `npm`             |

The Release workflow stages releases with `npm stage publish`, which every
trusted publisher may run, so the publisher does not need direct publication
(`npm publish`). The GitHub `npm` environment is restricted to the `main`
branch. No npm token is needed.

## Changelog

`CHANGELOG.md` is for people who install the package. Every pull request that
changes what they get adds an entry. CI, tests, tooling and other changes that
never reach the npm package stay out of it; their commits and this document
record them. Entries use this format:

```markdown
## 0.2.0 (Unreleased)

NEW FEATURES:

- A capability users did not have before.

BREAKING CHANGES:

- What a user must change, and how.

ADDED:

- Something new that supports an existing capability, such as a command option, a check or a document.

CHANGED:

- What behaves differently now, including fixes: what was wrong, and what happens now.

REMOVED:

- What is gone, and what to use instead.
```

- Headings are `## MAJOR.MINOR.PATCH (YYYY-MM-DD)` for a released version and
  `## MAJOR.MINOR.PATCH (Unreleased)` for work toward a version that
  `package.json` does not have yet.
- Only five sections exist. They appear in this order, and only when they
  have entries: `NEW FEATURES:`, `BREAKING CHANGES:`, `ADDED:`, `CHANGED:`
  and `REMOVED:`. A fix goes under `CHANGED:`, or under
  `BREAKING CHANGES:` when users must act.
- Each entry covers one change, on one line, written for the user: what
  changed and what they now see or do. Say what happened before when that
  helps, comparing with the last release, not with unreleased work.

CI fails unless `CHANGELOG.md` has a dated `## <version> (YYYY-MM-DD)` heading
for the version in `package.json`, so a release cannot ship with an
`(Unreleased)` heading. CI also fails on any section other than the five above.

## Cut a release

1. Open a PR that increases `version` in `package.json` to an unused stable
   version and dates its changelog heading, for example by changing
   `## 0.2.0 (Unreleased)` to `## 0.2.0 (2026-12-01)`.
2. After **CI** passes and the PR is approved, squash-merge it into `main`.
3. The **Release** workflow runs CI on the merged commit. If neither npm nor a
   tag has the version, it stages it on npm from that commit, then creates the
   matching `vMAJOR.MINOR.PATCH` tag and GitHub release with generated notes.
   npm does not list a staged version until it is approved, so the tag is the
   record that it was staged. Merges that leave the version unchanged, or come
   before the staged version is approved, run CI without releasing.
4. Approve the staged version with 2FA on npmjs.com, or run
   `npm stage list pi-claude-oauth` and `npm stage approve <stage-id>`. The
   version becomes public only after approval.

If a release fails, fix the cause and rerun the failed jobs. A rerun stages the
version only if neither npm nor a tag has it, and never touches an existing
tag. If staging failed after the tag was created by hand, delete the tag and
rerun.

## Workflow actions

Workflows name actions by tag. `.github/workflows/actions.lock` pins each tag
to a commit, and the verify-lockfile workflow fails when the two disagree.
After changing an action in a workflow, run `gh actions-lock` (from the
`github/gh-actions-lock` extension) and commit the updated lockfile.

See GitHub's [workflow syntax], [reusable workflows], [Trusted Publisher setup],
and [release CLI reference].

[workflow syntax]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
[reusable workflows]: https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
[Trusted Publisher setup]: https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md#publishing-to-npm-with-trusted-publisher-oidc
[release CLI reference]: https://cli.github.com/manual/gh_release_create
