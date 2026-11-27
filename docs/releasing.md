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

## Recover a release

If the current `main` version has not been staged, open **Actions → Stage npm → Run workflow** and select `main`. This includes versions merged before the workflow existed. The workflow takes no inputs. It stages the version in the `main` revision selected by GitHub for that run.

Check **Staged Packages** before retrying a failed submission. If the package is already staged, use the existing stage. If the version is already published, no action is needed. npm rejects duplicate submissions rather than replacing a staged or published version.

See the official docs for [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [staged publishing](https://docs.npmjs.com/staged-publishing/), and [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
