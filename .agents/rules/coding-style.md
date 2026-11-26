# Coding Style Rules

Purpose: coding style rules for immutability, file organization, error handling, and input validation. The file ends with a code quality checklist to run before marking work complete.

## Immutability rule (CRITICAL)

- ALWAYS create new objects instead of changing objects you received or share.
- NEVER mutate function inputs or shared state.
- A local variable that only the current function can see may change while the function builds its result.

```javascript
// WRONG: Mutation
function updateUser(user, name) {
  user.name = name; // MUTATION!
  return user;
}

// CORRECT: Immutability
function updateUser(user, name) {
  return { ...user, name };
}
```

## File organization

MANY SMALL FILES are better than FEW LARGE FILES.

- Keep cohesion high.
- Keep coupling low.
- A typical file is 200-400 lines.
- A file is 800 lines at most.
- When a file or component nears 800 lines, extract utilities from it into their own files.
- Organize by feature/domain, not by type.

## Error handling

- ALWAYS handle every error that can actually occur, such as failed network calls, unreadable files, and invalid external data.
- Do not add handling for errors that cannot occur.
- Report errors by throwing, not by logging.

```typescript
try {
  return await riskyOperation();
} catch (error) {
  throw new Error("User-friendly error message", { cause: error });
}
```

## Input validation

- ALWAYS validate user input and other external data where it enters the program.
- Validate with type guards. The repository has no validation library.

```typescript
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function parseSignUp(input: unknown): { email: string; age: number } {
  if (!isRecord(input)) {
    throw new Error("Expected an object");
  }
  const { email, age } = input;
  if (typeof email !== "string" || !email.includes("@")) {
    throw new Error("Invalid email");
  }
  if (typeof age !== "number" || !Number.isInteger(age) || age < 0 || age > 150) {
    throw new Error("Invalid age");
  }
  return { email, age };
}
```

## Code quality checklist

Before marking work complete, check each item:

- [ ] Code is readable.
- [ ] Code is well-named.
- [ ] Functions are small: under 50 lines.
- [ ] Files are 800 lines at most.
- [ ] No deep nesting: nothing nested more than 4 levels.
- [ ] Every error that can actually occur is handled.
- [ ] No `console` calls.
- [ ] No unnamed hardcoded values: each fixed value is a named constant.
- [ ] No function inputs or shared state are mutated.
