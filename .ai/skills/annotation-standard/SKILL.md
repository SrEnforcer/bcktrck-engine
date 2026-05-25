# TSF++ annotation standard

Full standard: `node_modules/@tsfpp/standard/spec/ANNOTATION_CODING_STANDARD.md`

---

## The single deciding question

> Does this tell the reader something they cannot confidently derive from the code and its types?

If no — do not add the comment. If yes — write it.

---

## What only a comment can tell you

| Category | Example |
|---|---|
| **Why this approach** over the natural alternative | Why linear scan instead of `Map` lookup |
| **Rejected alternatives** | What was considered and why it was ruled out |
| **Non-obvious invariants** | Preconditions the type cannot express |
| **Domain knowledge** | Business rules that live in the problem space |
| **External contracts** | Field names / values dictated by a third party |
| **Accepted imprecision** | Known limitations that are intentional |
| **Performance trade-offs** | Why a non-obvious implementation was chosen |
| **Temporal context** | Why a workaround exists, when to revisit it |

---

## JSDoc body: the why, not the what

The first sentence is the purpose. Everything after is the reasoning.

```ts
/**
 * Constructs a validated `UserId` from a raw string.
 *
 * Returns `None` if the input is empty. The empty case is excluded rather
 * than mapped to an error because an empty ID indicates a caller bug, not
 * a domain error — the type system prevents this at compile time in
 * internal code; this guard exists for boundary inputs only.
 *
 * @param raw - The raw string to validate. Must be non-empty.
 * @returns `Some(UserId)` if valid; `None` if empty.
 *
 * @example
 * mkUserId('usr-00123') // => some(UserId('usr-00123'))
 * mkUserId('')          // => none
 */
```

`@param` describes the domain constraint, not the type. `@returns` describes the meaning, not the type. Both are already in the signature.

---

## Module header

Required on every file with public exports:

```ts
/**
 * @module user-account
 *
 * Domain model for user accounts. Provides the `UserAccount` sum type,
 * its smart constructors, and the combinators for working with account
 * state and identity.
 *
 * All functions are pure and total. Error cases are modelled via
 * `Option<A>` (absent value) or `Result<T, E>` (fallible computation).
 *
 * @packageDocumentation
 */
```

First sentence: what the module provides. Second paragraph: key design constraints a consumer needs to know. Never describe the implementation.

---

## Inline comment patterns

### Rejected alternative

```ts
// NOTE(rob, 2026-05-18): Linear scan rather than `ReadonlyMap` lookup.
// The active session list is always ≤10 items per user; the allocation
// overhead of a map outweighs the O(1) lookup benefit at this scale.
const found = sessions.find(s => s.id === id)
```

### Non-obvious invariant

```ts
// Invariant: `handlers` must be registered before this is called.
// The runtime guarantees registration order; do not call from a module
// initialiser that may run before the framework bootstraps.
```

### External contract

```ts
// IMPORTANT: The field name `client_id` is specified by OAuth2 RFC 6749
// and must not be renamed despite the camelCase convention.
// DEVIATION(1.8): Field name required by external protocol.
```

### Accepted imprecision

```ts
// NOTE(rob, 2026-05-18): Timestamp comparison has ≤1 s imprecision due
// to clock drift between service instances. Acceptable for audit logs;
// not acceptable for financial ordering.
```

---

## Code markers

Required format — no exceptions:

```ts
// MARKER(author, YYYY-MM-DD[, TICKET]): description
```

| Marker | Use when | Blocks merge? |
|---|---|---|
| `TODO` | Work required before next release | Soft — needs ticket |
| `FIXME` | Known bug the author is aware of | Yes |
| `HACK` | Temporary workaround with a deferred correct solution | Yes — needs ticket + revisit condition |
| `NOTE` | Context a reader needs to understand the code | No |
| `OPTIMIZE` | Correct but with a known performance concern at scale | No — needs scale threshold |
| `BUG` | Confirmed bug not yet in a ticket | Yes — convert to FIXME + ticket |
| `XXX` | Fragile or load-bearing — must not be casually changed | No — use sparingly |

```ts
// TODO(rjansen, 2026-05-18, ARCH-44): Replace with Result-based validation
//   once the boundary refactor lands in v2.0.
// HACK(rjansen, 2026-05-18, INFRA-12): Forced cast — third-party type
//   definition is wrong. Fixed upstream in v4.x — remove after upgrade.
// NOTE(rjansen, 2026-05-18): Rate-limit window resets at midnight UTC,
//   not relative to first request. Contractual requirement — do not change.
// XXX(rjansen, 2026-05-18): Initialisation order is load-bearing. The
//   store must be hydrated before any handler is registered.
```

Author = GitHub handle or initials. Never an AI. If unknown, use `unknown`.

---

## DEVIATION format

```ts
// DEVIATION(N.M): <reason the violation could not be avoided>
```

The justification explains why no alternative was feasible — not what the violation is.

Every `eslint-disable` must be paired:

```ts
// DEVIATION(1.5): Legacy adapter — raw type narrowed to unknown immediately below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const payload: any = deserialise(raw)
```

The `as` in a smart constructor body:

```ts
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- DEVIATION(1.6): smart-constructor body
return some(raw as UserId)
```

---

## Never annotate

| Forbidden | Example |
|---|---|
| Paraphrasing the code | `// Check if user is admin` above `if (user.role === 'admin')` |
| Restating the type | `// Returns a string` on `: string` |
| Commented-out code | `// const old = legacyParse(raw)` |
| Section dividers | `// ─────────────` with nothing meaningful |
| Stale comments | Any comment that no longer matches the code |
| AI attribution | `// Generated by Claude` |
| `@throws` on Result functions | Error is in the return type, not thrown |
| Apologetic comments | `// This is a bit hacky but...` — use `HACK` properly |