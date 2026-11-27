import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { missingReleases, provenCommit, releaseNotes } from "../../scripts/plan-github-releases.ts";

const name = "pi-claude-oauth";
const predicateType = "https://slsa.dev/provenance/v1";
const source = "git+https://github.com/just-joshn/pi-claude-oauth@refs/heads/main";
const commit = "5eddfc6f1e2ba718f1b7e024dc7f1e2996929762";
const certificate = new X509Certificate(
	readFileSync(new URL("../fixtures/npm-release-certificate.txt", import.meta.url)),
);

function npmAudit(version = "0.2.1", uri = source, gitCommit = commit) {
	const resolvedDependencies = [{ uri, digest: { gitCommit } }];
	const payload = Buffer.from(
		JSON.stringify({
			predicateType,
			predicate: { buildDefinition: { resolvedDependencies } },
		}),
	).toString("base64");
	return {
		invalid: [],
		missing: [],
		verified: [
			{
				name,
				version,
				attestationBundles: [
					{
						predicateType,
						bundle: {
							verificationMaterial: { certificate: { rawBytes: certificate.raw.toString("base64") } },
							dsseEnvelope: { payload },
						},
					},
				],
			},
		],
	};
}

describe("plan GitHub releases from npm", () => {
	it("plans approved stable releases missing from GitHub, oldest first", () => {
		const registry = {
			"dist-tags.latest": "0.10.0",
			versions: ["0.10.0", "0.0.0-stage", "0.1.0", "0.2.2", "1.0.0-beta", "0.2.1", "0.2.2"],
		};
		const releases = [[{ tag_name: "v0.2.1", draft: false }], [{ tag_name: "v0.10.0", draft: true }]];
		expect(missingReleases(registry, releases)).toEqual({ latest: "0.10.0", versions: ["0.2.2", "0.10.0"] });
	});

	it("keeps the next sync a no-op when the release exists", () => {
		expect(
			missingReleases({ "dist-tags.latest": "0.2.1", versions: ["0.1.0", "0.2.1"] }, [
				[{ tag_name: "v0.2.1", draft: false }],
			]).versions,
		).toEqual([]);
	});

	it("accepts valid prerelease and build identifiers without planning them", () => {
		const latest = "0.2.2-0.19.01beta.alpha-beta+001.build";
		const versions = ["0.2.1", "0.2.2+01", latest];
		expect(missingReleases({ "dist-tags.latest": latest, versions }, [[]])).toEqual({
			latest,
			versions: ["0.2.1"],
		});
	});

	it("rejects malformed registry and GitHub release data", () => {
		const registry = { "dist-tags.latest": "0.2.1", versions: ["0.2.1"] };
		for (const versions of [
			["0.2.1", null],
			["0.2.1", "not-a-version"],
			["0.2.1", "01.2.3"],
			["0.2.1", "0.2.2-01"],
			["0.2.1", "0.2.2-beta.00+build"],
			["0.2.1", "0.2.2-beta..1"],
			["0.2.1", "0.2.2+build..1"],
		]) {
			expect(() => missingReleases({ ...registry, versions }, [[]])).toThrow();
		}
		expect(() => missingReleases({ ...registry, "dist-tags.latest": "bad" }, [[]])).toThrow();
		expect(() => missingReleases({ ...registry, "dist-tags.latest": "0.3.0" }, [[]])).toThrow();
		for (const releases of [null, [{}], [[{}]], [[{ tag_name: "v0.2.1" }]], [[{ draft: false }]]]) {
			expect(() => missingReleases(registry, releases)).toThrow();
		}
	});

	it("uses only the commit from the verified version and main workflow", () => {
		expect(provenCommit(npmAudit(), "0.2.1")).toBe(commit);
		expect(() => provenCommit(npmAudit(), "0.2.2")).toThrow();
		expect(() => provenCommit(npmAudit("0.2.1", source.replace("/main", "/feature")), "0.2.1")).toThrow();
		expect(() => provenCommit(npmAudit("0.2.1", source, "--not-a-commit"), "0.2.1")).toThrow();
	});

	it("refuses incomplete or failed signature verification", () => {
		const verified = npmAudit();
		expect(() => provenCommit({ ...verified, invalid: ["bad signature"] }, "0.2.1")).toThrow();
		expect(() => provenCommit({ ...verified, missing: ["missing signature"] }, "0.2.1")).toThrow();
		expect(() =>
			provenCommit({ ...verified, verified: [{ name: "other-package", version: "0.2.1" }] }, "0.2.1"),
		).toThrow();
		expect(() => provenCommit({ ...verified, verified: [{ name, version: "0.2.1" }] }, "0.2.1")).toThrow();
	});

	it("refuses a certificate from another signer", () => {
		const audit = npmAudit();
		const [verified] = audit.verified;
		const [attestation] = verified?.attestationBundles ?? [];
		expect(attestation).toBeDefined();
		if (!attestation) throw new Error("Missing test attestation");
		const der = Buffer.from(certificate.raw);
		const workflow = der.indexOf("stage-npm.yml");
		expect(workflow).toBeGreaterThanOrEqual(0);
		der.write("other-npm.yml", workflow);
		attestation.bundle.verificationMaterial.certificate.rawBytes = der.toString("base64");
		expect(() => provenCommit(audit, "0.2.1")).toThrow("Unexpected npm signer");
	});

	it("takes just the planned version's notes", () => {
		const changelog =
			"# Changelog\n\n## 0.2.10 (Unreleased)\n\nWrong\n\n## 0.2.1 (Unreleased)\n\n### Fixed\n\n- Change\n\n## 0.1.0\n\nOlder\n";
		expect(releaseNotes(changelog, "0.2.1")).toBe(
			"### Fixed\n\n- Change\n\n[View on npm](https://www.npmjs.com/package/pi-claude-oauth/v/0.2.1)",
		);
		expect(() => releaseNotes(changelog, "0.2.2")).toThrow("Missing changelog entry");
	});
});
