/**
 * Configuration types: theme, visual settings, and rendering behavior.
 *
 * `LayoutConfig` defines node spacing, sizing, and theme choices.
 * `PlacerStrategy` determines staff placement logic.
 * `Theme` holds color and font settings for rendering.
 */

import type { AstLayoutHintKind } from './ast'

/**
 * Strategy names controlling how staff and child nodes are placed.
 */
export type PlacerStrategy =
  | 'horizontal'
  | 'hanging-left'
  | 'hanging-right'
  | 'hanging-both'
  | 'multirow'
  | 'compact'

/**
 * Canonical layout geometry and page preferences for tree rendering.
 */
export type LayoutConfig = {
  readonly nodeWidth: number
  readonly nodeHeight: number
  readonly levelGap: number
  readonly siblingGap: number
  readonly hangingThreshold: number
  readonly multirowThreshold: number
  readonly targetAspect: number
  readonly staffSide: 'left' | 'right'
  readonly pageSize: 'A4' | 'A3' | 'letter' | 'auto'
}

/**
 * Built-in visual theme names.
 */
export type ThemeName = 'corporate' | 'minimal' | 'colorful' | 'print'

/**
 * Theme palette definition consumed by rendering and style resolution.
 */
export type Theme = {
  readonly name: ThemeName
  readonly palette: Readonly<Record<string, string>>
}

/**
 * Preset zoom levels for compactness and detail of rendered output.
 */
export type ZoomLevel = 'full' | 'compact' | 'structural'

/**
 * Per-node override pairing a resolved handle with a concrete layout hint.
 */
export type HintOverride = {
  readonly nodeHandle: string
  readonly hint: AstLayoutHintKind
}
