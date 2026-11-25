# Releasing pi-claude-oauth

## One-time setup

In the npm settings for `pi-claude-oauth`, add a GitHub Actions trusted publisher
with these values:

| Setting           | Value             |
| ----------------- | ----------------- |
| GitHub owner      | `just-joshn`      |
| Repository        | `pi-claude-oauth` |
| Workflow filename | `ci.yml`          |
| Environment       | `npm`             |

CI stages releases with `npm stage publish`, which every trusted publisher
may run, so the publisher does not need direct publication (`npm publish`).
The GitHub `npm` environment is restricted to the `main` branch. No npm token
is needed.

## Cut a release

1. Open a PR that increases `version` in `package.json` to an unused stable
   version and adds the corresponding entry to `CHANGELOG.md`.
2. After **Verify** passes and the PR is approved, squash-merge it into `main`.
3. The **CI and release** workflow verifies the merged commit, stages the
   tarball on npm, then creates the matching `vMAJOR.MINOR.PATCH` GitHub
   release with generated notes. Merges without a version bump run checks
   without publishing.
4. Approve the staged version with 2FA on npmjs.com, or run
   `npm stage list pi-claude-oauth` and `npm stage approve <stage-id>`. The
   version becomes public only after approval.

If a release fails, fix any configuration issue and rerun the failed jobs from
the same Actions run. If the tarball artifact has expired, rerun all jobs to
rebuild it from the same commit. If npm already has an identical tarball, the
workflow does not publish it again. If the published tarball differs, use a new
version rather than trying to replace it.

See GitHub's [workflow syntax], [Trusted Publisher setup], and [release CLI reference].

[workflow syntax]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
[Trusted Publisher setup]: https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md#publishing-to-npm-with-trusted-publisher-oidc
[release CLI reference]: https://cli.github.com/manual/gh_release_create
