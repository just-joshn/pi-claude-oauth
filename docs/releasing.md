# Releasing pi-claude-oauth

This document covers how `pi-claude-oauth` is released: the one-time npm trusted publisher setup, the `CHANGELOG.md` format, the steps to cut a release, and how workflow actions are pinned. Read it before you set up publishing, write a `CHANGELOG.md` entry, cut a release, or change an action in a workflow.

## One-time npm trusted publisher setup

In the npm settings for `pi-claude-oauth`, add a GitHub Actions trusted publisher with the values in this table:

| Setting           | Value             |
| ----------------- | ----------------- |
| GitHub owner      | `just-joshn`      |
| Repository        | `pi-claude-oauth` |
| Workflow filename | `release.yml`     |
| Environment       | `npm`             |

Notes on the trusted publisher setup:

- The Release workflow stages releases with `npm stage publish`.
- Every trusted publisher may run `npm stage publish`.
- Because of that, the trusted publisher does not need direct publication with `npm publish`.
- The GitHub `npm` environment is restricted to the `main` branch.
- No npm token is needed.

## Changelog

### Changelog audience and scope

- `CHANGELOG.md` is for package users, meaning people who install the package.
- Every pull request that changes what package users get adds an entry to `CHANGELOG.md`.
- CI, tests, tooling and other changes that never reach the npm package stay out of `CHANGELOG.md`.
- Their commits and `docs/releasing.md` record those CI, test, tooling and other changes.

### Changelog entry format

`CHANGELOG.md` entries use the format in this example:

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

### Changelog version headings

| Version state                                               | Heading                             |
| ----------------------------------------------------------- | ----------------------------------- |
| Released version                                            | `## MAJOR.MINOR.PATCH (YYYY-MM-DD)` |
| Work toward a version that `package.json` does not have yet | `## MAJOR.MINOR.PATCH (Unreleased)` |

### Changelog sections

- Only five sections exist.
- The five sections appear in this order:
  1. `NEW FEATURES:`
  2. `BREAKING CHANGES:`
  3. `ADDED:`
  4. `CHANGED:`
  5. `REMOVED:`
- A section appears only when it has entries.
- A fix goes under `CHANGED:`, or under `BREAKING CHANGES:` when package users must act.

### Changelog entry rules

- Each entry covers one change.
- Each entry is on one line.
- Each entry is written for package users: what changed and what they now see or do.
- Say what happened before when that helps.
- When an entry says what happened before, compare with the last release, not with unreleased work.

### Changelog checks in CI

- CI fails unless `CHANGELOG.md` has a dated `## <version> (YYYY-MM-DD)` heading for the version in `package.json`.
- Because of that check, a release cannot ship with an `(Unreleased)` heading.
- CI also fails on any section other than `NEW FEATURES:`, `BREAKING CHANGES:`, `ADDED:`, `CHANGED:` and `REMOVED:`.

## Cut a release

1. Open a PR that makes both of these changes:
   - Increase `version` in `package.json` to an unused stable version.
   - Date the `CHANGELOG.md` heading for that version, for example by changing `## 0.2.0 (Unreleased)` to `## 0.2.0 (2026-12-01)`.
2. After **CI** passes and the PR is approved, squash-merge the PR into `main`.
3. The **Release** workflow runs CI on the merged commit.
   - If neither npm nor a tag has the version, the **Release** workflow stages the version on npm from that commit, then creates the matching `vMAJOR.MINOR.PATCH` tag and GitHub release with generated notes.
   - npm does not list a staged version until it is approved.
   - Because npm does not list a staged version before approval, the tag is the record that the version was staged.
   - Merges that leave the version unchanged run CI without releasing.
   - Merges that come before the staged version is approved run CI without releasing.
4. Approve the staged version in one of these ways:
   - Approve it with 2FA on npmjs.com.
   - Run `npm stage list pi-claude-oauth` and `npm stage approve <stage-id>`.

   The version becomes public only after approval.

### Recover from a failed release

If a release fails:

1. Fix the cause.
2. Rerun the failed jobs.

Rules for reruns:

- A rerun stages the version only if neither npm nor a tag has it.
- A rerun never touches an existing tag.
- If staging failed after the tag was created by hand, delete the tag and rerun.

## Workflow actions

- Workflows name actions by tag.
- The lockfile `.github/workflows/actions.lock` pins each tag to a commit.
- The verify-lockfile workflow fails when the workflow tags and the lockfile disagree.

After changing an action in a workflow:

1. Run `gh actions-lock`, which comes from the `github/gh-actions-lock` extension.
2. Commit the updated lockfile.

## External references

See GitHub's [workflow syntax], [reusable workflows], [Trusted Publisher setup], and [release CLI reference].

[workflow syntax]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
[reusable workflows]: https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows
[Trusted Publisher setup]: https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md#publishing-to-npm-with-trusted-publisher-oidc
[release CLI reference]: https://cli.github.com/manual/gh_release_create
