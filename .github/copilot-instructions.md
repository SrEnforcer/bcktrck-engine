# TSF++ workspace

This repository follows the **TSF++ coding standard**.

## Language

All code, comments, documentation, variable names, type names, JSDoc, commit messages, and PR descriptions are written in **US technical English**. No exceptions. This applies to every file in the repository regardless of file type.

When communicating with the developer in chat, follow their language. When touching any file in the repository, English only.

## Coding standard

The normative source is `node_modules/@tsfpp/standard/spec/CODING_STANDARD.md`.
Profile overlays (extend the base standard):
- API handlers: `node_modules/@tsfpp/standard/spec/API_CODING_STANDARD.md`
- React components: `node_modules/@tsfpp/standard/spec/REACT_CODING_STANDARD.md`
- Security: `node_modules/@tsfpp/standard/spec/SECURITY_CODING_STANDARD.md`

Scoped instruction files inject the relevant rules automatically per file type. When in doubt, read the standard.

## Non-negotiables

- No `any`, `!`, unsafe `as`, `class`, `enum`, `let`, `var`, mutation, or `throw` in core.
- Every exported symbol has a JSDoc block.
- Errors are data: `Result<T, E>`. Never `throw` in core logic.
- All ADT imports come from `@tsfpp/prelude`. Never import from `ramda` directly.
- Rule violations require `// DEVIATION(N.M): <reason>` at the site and a note in the PR.

## Agents

Use the right agent for the task:

| Task | Agent |
|------|-------|
| Write new TSF++-compliant code | `tsfpp-guarded-coding` |
| Audit a file, module, or layer for violations | `tsfpp-audit` |
| Fix violations from an audit report | `tsfpp-refactor-engineer` |
| Add JSDoc, DEVIATION comments, and code markers | `tsfpp-annotate` |

Agents hand off to each other — after coding, audit; after audit, refactor; after refactor, annotate.

## Instruction files

Scoped instructions are injected automatically:

| File | Active for |
|------|-----------|
| `tsfpp-base.instructions.md` | All `.ts` files |
| `tsfpp-prelude.instructions.md` | All `.ts` files |
| `tsfpp-react.instructions.md` | All `.tsx` files |
| `tsfpp-api.instructions.md` | Routes, handlers, API files |