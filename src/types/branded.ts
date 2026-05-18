/**
 * @module types/branded
 *
 * Branded types: provide compile-time distinctions between similar string-based identifiers.
 *
 * - `NodeId`: identifies an employee or similar entity
 * - `DeptId`: identifies a department
 * - `Handle`: a user-defined reference string (may be explicit or auto-generated)
 *
 * These are opaque at runtime but help catch semantic errors at type-check time.
 *
 * @packageDocumentation
 */

type Brand<T, B extends string> = T & { readonly __brand: B }

/** Opaque identifier for an individual employee or person node. */
export type NodeId = Brand<string, 'NodeId'>
/** Opaque identifier for a department node. */
export type DeptId = Brand<string, 'DeptId'>

// Validation is performed in parser/resolver phases.
// These constructors intentionally brand trusted values only.
/**
 * Brand a pre-validated string as a `NodeId`.
 * @precondition The value must originate from a resolved AST node with kind `employee`, `vacancy`, etc.
 */
export const asNodeId = (value: string): NodeId =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- DEVIATION(1.6): smart-constructor boundary; 'as' is the only way to brand a string without runtime overhead; callers are required to supply only pre-validated values
  value as NodeId
/**
 * Brand a pre-validated string as a `DeptId`.
 * @precondition The value must originate from a resolved AST node with kind `department`.
 */
export const asDeptId = (value: string): DeptId =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- DEVIATION(1.6): smart-constructor boundary; see asNodeId for rationale
  value as DeptId

/** Opaque type for user-defined handle references (e.g. `@manager`). */
export type Handle = Brand<string, 'Handle'>
/**
 * Brand a pre-validated string as a `Handle`.
 * @precondition The value must originate from a resolved `@handle` declaration.
 */
export const asHandle = (value: string): Handle =>
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- DEVIATION(1.6): smart-constructor boundary; see asNodeId for rationale
  value as Handle
