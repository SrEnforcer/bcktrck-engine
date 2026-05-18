/**
 * @module icons/render
 *
 * Renders a Lucide icon as an inline SVG group.
 *
 * Lucide icons use a 24×24 viewBox with stroke-based thin lines.
 * We scale to the requested pixel size and translate to (x, y).
 *
 * @packageDocumentation
 */

import type { IconNode, IconPos } from './registry'
import { fromNullable, getOrElse, isNone } from '@tsfpp/prelude'
import { getIcon, DEFAULT_ICON_POS, DEFAULT_ICON_SIZE } from './registry'

/** Re-export icon anchor position literals used by style and render contracts. */
export type { IconPos }

/**
 * Declarative icon placement and presentation settings for a node.
 */
export type IconSpec = {
  readonly name: string
  readonly pos: IconPos
  readonly size: number
  readonly opacity?: number
}

/**
 * Axis-aligned rectangle describing node bounds in SVG pixel space.
 */
export type IconBounds = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

type RenderIconParams = {
  readonly name: string
  readonly x: number
  readonly y: number
  readonly size?: number
  readonly color?: string
  readonly opacity?: number
}

type RenderIconSpecParams = {
  readonly spec: IconSpec
  readonly bounds: IconBounds
  readonly color: string
}

const ICON_PADDING = 4

/**
 * Computes the top-left (x, y) pixel position for an icon inside node bounds.
 */
export const iconPosition = (
  pos: IconPos,
  bounds: IconBounds,
  iconSize: number
): { readonly x: number; readonly y: number } => {
  const { x: nodeX, y: nodeY, width: nodeW, height: nodeH } = bounds
  const p = ICON_PADDING
  switch (pos) {
    case 'upper-left':
      return { x: nodeX + p, y: nodeY + p }
    case 'upper-right':
      return { x: nodeX + nodeW - iconSize - p, y: nodeY + p }
    case 'bottom-left':
      return { x: nodeX + p, y: nodeY + nodeH - iconSize - p }
    case 'bottom-right':
      return { x: nodeX + nodeW - iconSize - p, y: nodeY + nodeH - iconSize - p }
  }
}

/**
 * Escapes XML attribute values.
 */
const escapeAttr = (value: string | number): string =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/**
 * Converts a Lucide IconNode entry to SVG element strings.
 */
const iconNodesToSvg = (nodes: IconNode): string =>
  nodes
    .map(([tag, attrs]) => {
      const attrStr = Object.entries(attrs)
        .flatMap(([k, v]) => {
          const valueOption = fromNullable(v)
          if (isNone(valueOption)) {
            return []
          }

          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- DEVIATION(1.6): Lucide IconNode attrs are typed as Record<string, any>; cast narrows to the only valid SVG attribute runtime primitives.
          return [`${k}="${escapeAttr(valueOption.value as string | number)}"`]
        })
        .join(' ')
      return `<${tag} ${attrStr}/>`
    })
    .join('')

/**
 * Renders a named icon to an SVG `<g>` group, positioned and scaled.
 * Returns an empty string if the icon name is not in the registry.
 *
 * @param name     Icon name (e.g. 'user', 'briefcase')
 * @param x        Top-left x pixel coordinate
 * @param y        Top-left y pixel coordinate
 * @param size     Rendered size in pixels (default: DEFAULT_ICON_SIZE)
 * @param color    Stroke color (default: 'currentColor')
 * @param opacity  Icon opacity 0-1 (default: 0.3 for background use)
 */
export const renderIcon = (
  params: RenderIconParams
): string => {
  const size = getOrElse<number>(() => DEFAULT_ICON_SIZE)(fromNullable(params.size))
  const color = getOrElse<string>(() => 'currentColor')(fromNullable(params.color))
  const opacity = getOrElse<number>(() => 0.3)(fromNullable(params.opacity))
  const { name, x, y } = params
  const nodes = getIcon(name)
  const nodesOption = fromNullable(nodes)
  if (isNone(nodesOption)) return ''

  const scale = size / 24
  const escapedColor = escapeAttr(color)

  return (
    `<g transform="translate(${x},${y}) scale(${scale})" ` +
    `fill="none" stroke="${escapedColor}" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round" ` +
    `opacity="${opacity}">` +
    iconNodesToSvg(nodesOption.value) +
    `</g>`
  )
}

/**
 * Convenience: resolve full icon params with defaults and return the SVG string.
 */
export const renderIconSpec = (
  params: RenderIconSpecParams
): string => {
  const { spec, bounds, color } = params
  const size = spec.size
  const pos = spec.pos
  const opacity = getOrElse<number>(() => 0.3)(fromNullable(spec.opacity))
  const { x, y } = iconPosition(pos, bounds, size)
  return renderIcon({ name: spec.name, x, y, size, color, opacity })
}

export { DEFAULT_ICON_POS, DEFAULT_ICON_SIZE }
