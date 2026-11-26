# Coding Style Rules

Purpose: coding style rules for immutability, file organization, error handling, and input validation. The file ends with a code quality checklist to run before marking work complete.

## Immutability rule

This rule is critical.

- Always create new objects.
- Never mutate.

```javascript
// WRONG: Mutation
function updateUser(user, name) {
  user.name = name  // MUTATION!
  return user
}

// CORRECT: Immutability
function updateUser(user, name) {
  return { ...user, name }
}
```

## File organization

Many small files are better than few large files.

- Keep cohesion high.
- Keep coupling low.
- A typical file is 200-400 lines.
- A file is 800 lines at most.
- Extract utilities from large components.
- Organize by feature/domain, not by type.

## Error handling

Always handle errors comprehensively.

```typescript
try {
  const result = await riskyOperation()
  return result
} catch (error) {
  console.error('Operation failed:', error)
  throw new Error('User-friendly error message')
}
```

## Input validation

Always validate user input.

```typescript
import { z } from 'zod'

const schema = z.object({
  email: z.string().email(),
  age: z.number().int().min(0).max(150)
})

const validated = schema.parse(input)
```

## Code quality checklist

Before marking work complete, check each item:

- [ ] Code is readable.
- [ ] Code is well-named.
- [ ] Functions are small: under 50 lines.
- [ ] Files are focused: under 800 lines.
- [ ] No deep nesting: nothing nested more than 4 levels.
- [ ] Error handling is proper.
- [ ] No `console.log` statements.
- [ ] No hardcoded values.
- [ ] Immutable patterns are used.
