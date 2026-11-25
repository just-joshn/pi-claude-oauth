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

Allow direct publication (`npm publish`) for this publisher if npm prompts you
to select permitted commands. The GitHub `npm` environment is restricted to
the `main` branch. No npm token is needed.

## Cut a release

1. Open a PR that increases `version` in `package.json` to an unused stable
   version and adds the corresponding entry to `CHANGELOG.md`.
2. After **Verify** passes and the PR is approved, squash-merge it into `main`.
3. The **CI and release** workflow verifies the merged commit, publishes the
   tarball to npm, then creates the matching `vMAJOR.MINOR.PATCH` GitHub
   release with generated notes. Merges without a version bump run checks
   without publishing.

If a release fails, fix any configuration issue and rerun the failed jobs from
the same Actions run. If the tarball artifact has expired, rerun all jobs to
rebuild it from the same commit. If npm already has an identical tarball, the
workflow does not publish it again. If the published tarball differs, use a new
version rather than trying to replace it.

See GitHub's [workflow syntax], [Trusted Publisher setup], and [release CLI reference].

[workflow syntax]: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
[Trusted Publisher setup]: https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md#publishing-to-npm-with-trusted-publisher-oidc
[release CLI reference]: https://cli.github.com/manual/gh_release_create
