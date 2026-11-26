# Karpathy Coding Guidelines

Purpose: behavioral guidelines to reduce common LLM coding mistakes. Merge these guidelines with project-specific instructions as needed.

## Caution versus speed tradeoff

- These guidelines bias toward caution over speed.
- For trivial tasks, use judgment.

## 1. Think Before Coding

Core rule: Do not assume. Do not hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly.
- If uncertain, ask.
- If multiple interpretations exist, present them. Do not pick silently.
- If a simpler approach exists, say so.
- Push back when warranted.
- If something is unclear, stop, name what is confusing, and ask.

## 2. Simplicity First

Core rule: Minimum code that solves the problem. Nothing speculative.

- Add no features beyond what was asked.
- Add no abstractions for single-use code.
- Add no "flexibility" or "configurability" that was not requested.
- Add no error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.
- Check whether a senior engineer would say the code is overcomplicated. If yes, simplify.

## 3. Surgical Changes

Core rule: Touch only what you must. Clean up only your own mess.

### Surgical changes when editing existing code

- Do not "improve" adjacent code, comments, or formatting.
- Do not refactor things that are not broken.
- Match existing style, even if you would do it differently.
- If you notice unrelated dead code, mention it. Do not delete it.

### Surgical changes when your changes create orphans

- Remove imports, variables, and functions that your own changes made unused.
- Do not remove pre-existing dead code unless asked.

### Test for surgical changes

Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

Core rule: Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

| Task             | Verifiable goal                                       |
| ---------------- | ----------------------------------------------------- |
| "Add validation" | "Write tests for invalid inputs, then make them pass" |
| "Fix the bug"    | "Write a test that reproduces it, then make it pass"  |
| "Refactor X"     | "Ensure tests pass before and after"                  |

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

- Strong success criteria let you loop independently.
- Weak criteria, such as "make it work", require constant clarification.

## Signs these guidelines are working

- Diffs have fewer unnecessary changes.
- There are fewer rewrites due to overcomplication.
- Clarifying questions come before implementation rather than after mistakes.
