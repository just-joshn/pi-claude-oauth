# Security and trust boundaries

Apply to external input, identities, permissions, sensitive data, network access, dependencies, persistence, CI and deployment. Use the current stable OWASP ASVS for applicable web application requirements. These rules are a baseline, not a claim of full ASVS compliance.

## Input and output

- SEC-01 MUST identify trust boundaries and validate untrusted values against explicit contracts before use. Include requests, headers, query parameters, configuration, webhooks, queue messages, external responses and file uploads. Use the established runtime schema library; TypeScript annotations and assertions provide no runtime validation.
- SEC-02 MUST validate size, shape, range, format and allowed values according to the contract. Choose an explicit unknown-property policy. Avoid unsafe coercion and mass assignment; map allowed fields explicitly. Do not repeatedly validate proven internal values without a trust change.
- SEC-03 MUST use parameterized database queries. Allowlist identifiers when a query API cannot parameterize them. Do not concatenate untrusted text into SQL, shell commands, executable code or templates. Avoid `eval`, dynamic code evaluation and shell invocation; pass validated arguments to process APIs when execution is necessary.
- SEC-04 MUST use context-appropriate output encoding and trusted sanitization for permitted rich content. Do not bypass framework escaping without a justified, tested safe path. Use appropriate browser security headers, including CSP when applicable.
- SEC-05 MUST prevent unsafe filesystem paths and uploads. Enforce allowed destinations, path containment including symlink behavior where relevant, content and size restrictions, safe storage and appropriate access control. Treat filenames and content as untrusted.
- SEC-06 MUST restrict user-influenced outbound network requests. Validate allowed schemes, destinations, ports, DNS/IP resolution and redirects; protect private/internal addresses and metadata endpoints as required. Use network egress controls where available.

## Identity, access and sensitive data

- SEC-07 MUST authenticate through established implementations and authorize protected operations server-side. Deny by default; verify resource ownership, roles, permissions and tenant isolation at each relevant access boundary. Authentication, CORS and client-side UI checks are not authorization.
- SEC-08 MUST use appropriate session expiry, rotation and revocation. Verify token signatures and allowed algorithms, issuer, audience, expiration and other required claims. Use secure cookie attributes and CSRF protection for applicable cookie-authenticated operations. Configure explicit CORS origins and credential policy.
- SEC-09 MUST use established cryptographic libraries, secure random generation and approved password hashing (such as Argon2id where appropriate). Do not implement custom cryptography or disable certificate verification. Use TLS for sensitive traffic.
- SEC-10 MUST keep secrets out of source, diffs, logs, test fixtures, prompts, URLs, browser bundles and artifacts. Use the approved secret manager and least-privilege credentials. If a secret is exposed, report it without repeating the value and follow incident procedures, including rotation.
- SEC-11 MUST minimize sensitive data collection and exposure. Apply access controls, appropriate retention, encryption requirements and log redaction. Return safe error messages; do not expose stack traces or internals to untrusted callers.
- SEC-12 MUST bound expensive requests, rate-limit abuse-prone operations, use safe regex and apply resource exhaustion protections. Follow [Performance](performance.md) for resource bounds. Use idempotency and replay protection for relevant operations.

## Supply chain and CI

- SEC-13 MUST review new dependencies and applicable vulnerabilities in direct/transitive packages. Preserve lockfiles and use reproducible installs. Do not run arbitrary remote scripts or auto-apply forced audit upgrades. Use controlled update and vulnerability triage procedures.
- SEC-14 MUST use least-privilege CI permissions, scoped credentials and isolated execution for untrusted pull requests. Do not expose privileged secrets to untrusted code or interpolate untrusted inputs into executable workflow scripts. Prefer short-lived identity federation/OIDC where supported.
- SEC-15 MUST lock GitHub Actions workflow dependencies using supported workflow dependency lockfiles where adopted; otherwise pin third-party actions to verified full commit SHAs. Follow the platform's equivalent immutable dependency policy. Preserve secret scanning, dependency checks, static analysis and deployment approvals.
- SEC-16 MUST NOT bypass security checks, introduce unreviewed broad permissions, fabricate security exceptions or suppress findings to pass CI. Record accepted risks with scope, rationale, owner and remediation/expiry plan according to project policy.

## Security verification

For affected security controls, add negative tests: malformed inputs, unauthenticated requests, unauthorized roles, wrong tenant or resource, invalid/expired credentials, injection attempts, excessive input and failure paths as applicable. Run configured scans and review findings. Report residual risk, untested controls and unavailable tools. Do not claim compliance without a scoped assessment.

## Official references

- [OWASP ASVS](https://asvs.owasp.org/)
- [OWASP Cheat Sheet Series mapped to ASVS](https://cheatsheetseries.owasp.org/IndexASVS.html)
- [Node.js security best practices](https://nodejs.org/learn/getting-started/security-best-practices)
- [Zod documentation](https://zod.dev/)
- [GitHub Actions secure use](https://docs.github.com/en/actions/reference/security/secure-use)
