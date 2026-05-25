# TSF++ new module

Scaffold a new TSF++-compliant module from scratch.

The canonical standard is at `node_modules/@tsfpp/standard/spec/CODING_STANDARD.md`.
The prelude API is at `node_modules/@tsfpp/prelude/README.md`.

---

## Required inputs

If any of the following are missing, ask for them before proceeding:

- **Module name** — e.g. `track`, `artist`, `audio-asset`
- **Layer** — `core` · `api` · `dal` · `react`
- **Domain description** — one sentence: what does this module represent or do?

---

## What to generate

### 1. Source file — `src/<layer>/<module-name>.ts`

```ts
/**
 * @module <module-name>
 *
 * <Domain description>.
 *
 * @packageDocumentation
 */

import { type Option, type Result, some, none, ok, err } from '@tsfpp/prelude'

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * <What this branded type represents in the domain.>
 */
export type <ModuleName>Id = Brand<string, '<ModuleName>Id'>

/**
 * <What this sum type represents. List variants.>
 */
export type <ModuleName> = {
  readonly id:        <ModuleName>Id
  readonly <field>:   <Type>
  // … additional fields
}

// ─── Errors ───────────────────────────────────────────────────────────────────

/**
 * Errors that can occur when working with <ModuleName> values.
 */
export type <ModuleName>Error =
  | { readonly kind: 'invalid_id';    readonly raw: string }
  | { readonly kind: 'not_found';     readonly id:  <ModuleName>Id }

// ─── Smart constructors ───────────────────────────────────────────────────────

/**
 * Constructs a validated {@link <ModuleName>Id} from a raw string.
 *
 * @param raw - The raw string to validate.
 * @returns `some` with a branded id when valid; `none` when the format is invalid.
 *
 * @example
 * const id = mk<ModuleName>Id('abc-123')
 * // => some(<ModuleName>Id)
 */
export const mk<ModuleName>Id = (raw: string): Option<<ModuleName>Id> =>
  raw.length > 0 ? some(raw as <ModuleName>Id) : none

/**
 * Constructs a {@link <ModuleName>} from validated inputs.
 *
 * @param params - Validated field values.
 * @returns `ok` with the constructed value; `err` with a typed error on validation failure.
 */
export const mk<ModuleName> = (params: {
  readonly id:      <ModuleName>Id
  readonly <field>: <Type>
}): Result<<ModuleName>, <ModuleName>Error> => {
  // validate invariants here
  return ok(params)
}
```

### 2. Test file — `src/<layer>/<module-name>.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { isSome, isNone, isOk, isErr } from '@tsfpp/prelude'
import { mk<ModuleName>Id, mk<ModuleName> } from './<module-name>'

describe('mk<ModuleName>Id', () => {
  it('returns some for a valid id', () => {
    expect(isSome(mk<ModuleName>Id('abc-123'))).toBe(true)
  })

  it('returns none for an empty string', () => {
    expect(isNone(mk<ModuleName>Id(''))).toBe(true)
  })
})

describe('mk<ModuleName>', () => {
  it('returns ok for valid inputs', () => {
    // arrange
    // act
    // assert
  })

  it('returns err for invalid inputs', () => {
    // arrange
    // act
    // assert
  })
})
```

---

## Rules

- Never use placeholder comments like `// TODO: implement` in the source file — either implement it or use a properly formatted `// TODO(unknown, <date>): <reason>` marker.
- The error union must cover every failure mode the smart constructors can produce.
- Every exported symbol must have a JSDoc block before the file is considered complete.
- Test file must have at least one passing case and one failing case per smart constructor.
- Follow layer-specific constraints from `tsfpp-guarded-coding` for the specified layer.

---

## Completion

Report:
1. Files created and their paths
2. Exported symbols and their types
3. Any invariants that still need implementing (listed as `TODO` markers in the source)