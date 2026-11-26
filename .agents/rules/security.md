# Security Rules

Purpose: security rules for the mandatory checks before any commit, secret management, and the response protocol when a security issue is found.

## Mandatory security checks

Before ANY commit, check:

- [ ] No hardcoded secrets, such as API keys, passwords, and tokens.
- [ ] All user inputs are validated.
- [ ] SQL injection is prevented with parameterized queries.
- [ ] XSS is prevented with sanitized HTML.
- [ ] CSRF protection is enabled.
- [ ] Authentication is verified.
- [ ] Authorization is verified.
- [ ] Rate limiting is on all endpoints.
- [ ] Error messages do not leak sensitive data.

## Secret management

```typescript
// NEVER: Hardcoded secrets
const apiKey = "sk-proj-xxxxx"

// ALWAYS: Environment variables
const apiKey = process.env.API_KEY
if (!apiKey) throw new Error('API_KEY not configured')
```

## Security response protocol

If a security issue is found:

1. STOP immediately.
2. Use the `security-reviewer` agent.
3. Fix CRITICAL issues before continuing.
4. Rotate any exposed secrets.
5. Review the entire codebase for similar issues.
