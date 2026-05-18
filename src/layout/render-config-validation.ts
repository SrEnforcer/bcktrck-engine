/**
 * @module layout/render-config-validation
 *
 * Runtime validation for render configuration values used by SVG projection.
 *
 * The validator accumulates all field errors so callers can present complete
 * feedback instead of failing on the first invalid key.
 *
 * @packageDocumentation
 */

import type { RenderConfig } from './types'
import { fromNullable, isSome } from '@tsfpp/prelude'

/** Validation error for one render-config field. */
export type ConfigValidationError = {
  readonly field: string
  readonly message: string
}

/** Success/failure ADT returned by render-config validation. */
export type ConfigValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: readonly ConfigValidationError[] }

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * CSS color: either a non-empty alphabetic name, or a # followed by
 * exactly 3, 4, 6, or 8 hex digits.
 */
// Intentional: config validation keeps a strict color subset (named colors + hex)
// for deterministic rendering across CLI, tests, and SVG consumers.
const CSS_COLOR_RE = /^(?:[a-zA-Z]+|#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{1}(?:[0-9a-fA-F]{2}(?:[0-9a-fA-F]{2})?)?)?)$/

/** Returns true when value is a positive, finite number. */
const isPositiveFinite = (n: number): boolean =>
  Number.isFinite(n) && n > 0

const checkPositiveFinite = (
  field: string,
  value: number
): ConfigValidationError | undefined =>
  !isPositiveFinite(value)
    ? { field, message: `'${field}' must be a positive finite number (got ${value})` }
    : undefined

const checkFinite = (
  field: string,
  value: number
): ConfigValidationError | undefined =>
  !Number.isFinite(value)
    ? { field, message: `'${field}' must be a finite number (got ${value})` }
    : undefined

const checkBetweenInclusive = (
  input: { readonly field: string; readonly value: number; readonly min: number; readonly max: number }
): ConfigValidationError | undefined =>
  !Number.isFinite(input.value) || input.value < input.min || input.value > input.max
    ? { field: input.field, message: `'${input.field}' must be a finite number in [${input.min}, ${input.max}] (got ${input.value})` }
    : undefined

const checkColor = (
  field: string,
  value: string
): ConfigValidationError | undefined =>
  !CSS_COLOR_RE.test(value)
    ? {
        field,
        message: `'${field}' must be a non-empty CSS color name or a hex color (#rgb/#rrggbb/#rgba/#rrggbbaa), got '${value}'`
      }
    : undefined

const checkBoolean = (
  field: string,
  value: boolean
): ConfigValidationError | undefined =>
  typeof value !== 'boolean'
    ? { field, message: `'${field}' must be a boolean (got ${String(value)})` }
    : undefined

const NUMBER_TOKEN_RE = /^(?:\d+(?:\.\d+)?|\.\d+)$/

const isValidDashArray = (value: string): boolean => {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return false
  }

  const parts = trimmed.split(/[\s,]+/).filter((part) => part.length > 0)
  if (parts.length === 0) {
    return false
  }

  const numbers = parts.map((part) => {
    if (!NUMBER_TOKEN_RE.test(part)) {
      return NaN
    }
    return Number(part)
  })

  if (numbers.some((n) => !Number.isFinite(n) || n < 0)) {
    return false
  }

  return numbers.some((n) => n > 0)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validates a `RenderConfig` value.  Returns `{ ok: true }` when valid,
 * or `{ ok: false, errors }` listing every field that failed, so callers can
 * surface actionable messages without throwing.
 */
export const validateRenderConfig = (cfg: RenderConfig): ConfigValidationResult => {
  const candidates: readonly (ConfigValidationError | undefined)[] = [
    checkPositiveFinite('nodeSize', cfg.nodeSize),
    checkPositiveFinite('staffSize', cfg.staffSize),
    checkPositiveFinite('colWidth', cfg.colWidth),
    checkPositiveFinite('rowHeight', cfg.rowHeight),
    checkPositiveFinite('fontSize', cfg.fontSize),
    checkFinite('shadowOffsetX', cfg.shadowOffsetX),
    checkFinite('shadowOffsetY', cfg.shadowOffsetY),
    checkBetweenInclusive({ field: 'shadowOpacity', value: cfg.shadowOpacity, min: 0, max: 1 }),
    checkPositiveFinite('shadowFontScale', cfg.shadowFontScale),
    checkColor('nodeBorder', cfg.nodeBorder),
    checkColor('employeeFill', cfg.employeeFill),
    checkColor('deptFill', cfg.deptFill),
    checkColor('vacancyFill', cfg.vacancyFill),
    checkColor('edgeStroke', cfg.edgeStroke),
    checkColor('dottedEdgeStroke', cfg.dottedEdgeStroke),
    checkBoolean('showSubordinateCount', cfg.showSubordinateCount),
    checkBoolean('subordinateCountIncludeVacancies', cfg.subordinateCountIncludeVacancies),
    checkColor('subordinateCountBadgeFill', cfg.subordinateCountBadgeFill),
    checkColor('subordinateCountBadgeText', cfg.subordinateCountBadgeText),
    checkPositiveFinite('subordinateCountBadgeFontScale', cfg.subordinateCountBadgeFontScale),
    cfg.fontFamily.trim().length === 0
      ? { field: 'fontFamily', message: "'fontFamily' must be a non-empty string" }
      : undefined,
    !isValidDashArray(cfg.shadowDashArray)
      ? {
          field: 'shadowDashArray',
          message: "'shadowDashArray' must be a list of non-negative numbers separated by spaces/commas, with at least one value > 0"
        }
      : undefined
  ]

  const errors = candidates
    .map(fromNullable)
    .filter(isSome)
    .map((option) => option.value)
  return errors.length === 0 ? { ok: true } : { ok: false, errors }
}
