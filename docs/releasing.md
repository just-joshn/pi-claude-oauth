# Release to npm

Merge a stable version bump in `package.json` and `package-lock.json` with its `CHANGELOG.md` entry. **Stage npm** runs when the push to `main` changes `package.json`. It skips unchanged versions and skips when it cannot read the previous version.

The workflow checks the merged revision, scans Git history, and tests the exact tarball against both supported Pi versions. A separate job verifies the tarball digest and stages the tarball with npm trusted publishing. It does not publish directly or move `latest`.

Wait for **CI** and **Stage npm** to pass. On npmjs.com, open **Staged Packages**, review the version, click **Approve**, and complete 2FA. If several versions are pending, approve in version order. There is no Git tag or terminal step.

## Set up trusted publishing once

1. In GitHub repository settings, create the `npm-staging` environment. Under **Deployment branches and tags**, choose **Selected branches and tags** and add the branch `main`. Do not add required reviewers or npm tokens. Leave the existing `npm` environment alone.
2. On npmjs.com, open the `pi-claude-oauth` package settings. Under **Trusted publishing**, add GitHub Actions with these values:

   | Field | Value |
   | --- | --- |
   | Organization or user | `just-joshn` |
   | Repository | `pi-claude-oauth` |
   | Workflow filename | `stage-npm.yml` |
   | Environment name | `npm-staging` |

   Leave **Allow npm publish** and **Allow npm dist-tag** off. Staging is always allowed for a new trusted publisher.
3. Stage and approve the first release within npm's two-day validation window. For an already merged version such as `0.2.1`, use the recovery steps below.
4. After verifying that the workflow works, set npm publishing access to **Require two-factor authentication and disallow tokens**. Revoke any obsolete automation tokens.

## Sync GitHub releases

After you approve a staged package, **Sync GitHub releases** checks npm once an hour for missing GitHub releases. It starts at `0.2.1` and ignores versions that npm has not published. It verifies provenance from `stage-npm.yml` on `main`, tags the exact source commit, and uses that commit's changelog for the release notes. It does not write to npm, move tags, or publish drafts. Keep [immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) enabled.

To run it now, open **Actions → Sync GitHub releases → Run workflow** and select `main`. Select **Preview** to verify without creating a tag or release. Without it, the run creates missing tags and releases. GitHub can delay scheduled runs or disable them after 60 days of inactivity on a public repository.

If verification fails, inspect the npm signature or provenance error before retrying. If a tag points to a different commit or a draft exists, review the conflict on GitHub. The sync skips versions that already have a published GitHub release. It does not audit or repair those releases.

GitHub can refuse to tag or release an older commit with the workflow token. If the tag already points to the verified SHA shown in the run, reuse it. Otherwise, a maintainer can create a missing tag at that SHA and create the release. Do not substitute the tip of `main` or move a tag. See GitHub's [release creation permissions](https://docs.github.com/en/rest/releases/releases#create-a-release).

## Recover a staged npm release

If the current `main` version has not been staged, open **Actions → Stage npm → Run workflow** and select `main`. This includes versions merged before the workflow existed. The workflow takes no inputs. It stages the version in the `main` revision selected by GitHub for that run.

Check **Staged Packages** before retrying a failed submission. If the package is already staged, use the existing stage. If the version is already published, no action is needed. npm rejects duplicate submissions rather than replacing a staged or published version.

See the official docs for [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [staged publishing](https://docs.npmjs.com/staged-publishing/), and [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
