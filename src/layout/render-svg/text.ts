/**
 * @module layout/render-svg/text
 *
 * Rendering helper module for SVG projection internals.
 *
 * @packageDocumentation
 */

import type { ResolvedTextStyle, ResolvedTextStyles } from '../../style/dsl'
import { concatAll, fromNullable, getOrElseOption, isNone, matchOption, monoidSum } from '@tsfpp/prelude'
import { escapeXml, mergeTextStyle, textAttrs } from './shared'

/**
 * A single rendered text line tagged by semantic role for style resolution.
 */
export type StyledLabelLine = {
  readonly text: string
  readonly kind: 'name' | 'title'
}

type FitFontSizeToBoxInput = {
  readonly lines: readonly string[]
  readonly baseFontSize: number
  readonly boxWidth: number
  readonly boxHeight: number
  readonly minFontSize: number
}

type RenderStyledLabelElementInput = {
  readonly tx: number
  readonly ty: number
  readonly fontFamily: string
  readonly styledLines: readonly StyledLabelLine[]
  readonly textStyles: ResolvedTextStyles
  readonly baseTextStyle: ResolvedTextStyle
  readonly fittedFont: number
  readonly fallbackText: string
}

type CompactableTextStyle = {
  readonly color?: string | undefined
  readonly fontSize?: number | undefined
  readonly fontWeight?: string | undefined
  readonly lineSpacing?: number | undefined
}

const compactTextStyle = (style: CompactableTextStyle): ResolvedTextStyle => {
  const colorOption = fromNullable(style.color)
  const fontSizeOption = fromNullable(style.fontSize)
  const fontWeightOption = fromNullable(style.fontWeight)
  const lineSpacingOption = fromNullable(style.lineSpacing)

  return {
    ...matchOption(() => ({}), (value: string) => ({ color: value }))(colorOption),
    ...matchOption(() => ({}), (value: number) => ({ fontSize: value }))(fontSizeOption),
    ...matchOption(() => ({}), (value: string) => ({ fontWeight: value }))(fontWeightOption),
    ...matchOption(() => ({}), (value: number) => ({ lineSpacing: value }))(lineSpacingOption)
  }
}

/** Converts an optional node style object to a text-only style view. */
export const toTextStyle = (
  style: { readonly color?: string; readonly fontSize?: number; readonly fontWeight?: string; readonly lineSpacing?: number } | undefined
): ResolvedTextStyle => {
  const styleOption = fromNullable(style)
  if (isNone(styleOption)) {
    return {}
  }

  return compactTextStyle({
    color: styleOption.value.color,
    fontSize: styleOption.value.fontSize,
    fontWeight: styleOption.value.fontWeight,
    lineSpacing: styleOption.value.lineSpacing
  })
}

const capTextStyleFontSize = (style: ResolvedTextStyle, maxFontSize: number): ResolvedTextStyle =>
  {
    const fontSizeOption = fromNullable(style.fontSize)
    return compactTextStyle({
      ...style,
      fontSize: matchOption(() => maxFontSize, (value: number) => Math.min(value, maxFontSize))(fontSizeOption)
    })
  }

const splitLongWord = (word: string, maxCharsPerLine: number): readonly string[] => {
  const splitThreshold = Math.ceil(maxCharsPerLine * 1.35)
  if (word.length <= splitThreshold) {
    return [word]
  }

  const chunkCount = Math.ceil(word.length / maxCharsPerLine)
  return Array.from({ length: chunkCount }, (_, index) => {
    const start = index * maxCharsPerLine
    return word.slice(start, start + maxCharsPerLine)
  })
}

const wrapPiecesIntoLines = (
  pieces: readonly string[],
  maxCharsPerLine: number
): readonly string[] => {
  const reduced = pieces.reduce(
    (
      state: { readonly lines: readonly string[]; readonly currentLine: string },
      piece: string
    ): { readonly lines: readonly string[]; readonly currentLine: string } => {
      const candidate = state.currentLine.length === 0 ? piece : `${state.currentLine} ${piece}`
      if (candidate.length <= maxCharsPerLine) {
        return {
          lines: state.lines,
          currentLine: candidate
        }
      }

      return state.currentLine.length > 0
        ? {
            lines: [...state.lines, state.currentLine],
            currentLine: piece
          }
        : {
            lines: state.lines,
            currentLine: piece
          }
    },
    { lines: [], currentLine: '' }
  )

  return reduced.currentLine.length > 0
    ? [...reduced.lines, reduced.currentLine]
    : reduced.lines
}

const wrapSegment = (segment: string, maxCharsPerLine: number): readonly string[] => {
  const words = segment.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return []
  }

  const allPieces = words.flatMap((word) => splitLongWord(word, maxCharsPerLine))
  return wrapPiecesIntoLines(allPieces, maxCharsPerLine)
}

const wrapLabel = (label: string, maxCharsPerLine: number, lineLimit = 3): readonly string[] => {
  const segments = label
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  const wrapped = (segments.length > 0 ? segments : [label])
    .flatMap((segment) => wrapSegment(segment, maxCharsPerLine))
    .filter(Boolean)

  if (wrapped.length === 0) {
    return ['']
  }

  if (wrapped.length <= lineLimit) {
    return wrapped
  }

  const clipped = wrapped.slice(0, lineLimit)
  const remainder = wrapped.slice(lineLimit).join(' ')
  const clippedLast = clipped[lineLimit - 1]
  const last = getOrElseOption<string>(() => '')(fromNullable(clippedLast))
  const room = Math.max(3, maxCharsPerLine - 3)
  const suffix = remainder.length > room ? `${remainder.slice(0, room)}...` : `${remainder}...`
  return clipped.map((line, index) =>
    index === lineLimit - 1
      ? `${last} ${suffix}`.trim()
      : line
  )
}

const toNameLine = (text: string): StyledLabelLine => ({ text, kind: 'name' })

const toTitleLine = (text: string): StyledLabelLine => ({ text, kind: 'title' })

const splitLabelParts = (label: string): { readonly name: string; readonly title?: string } => {
  const segments = label
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  const [name = '', ...titleSegments] = segments
  const title = titleSegments.length > 0 ? titleSegments.join(' ') : undefined
  const titleOption = fromNullable(title)
  return { name, ...matchOption(() => ({}), (value: string) => ({ title: value }))(titleOption) }
}

/** Builds style-tagged text lines for name/title rendering in node labels. */
export const buildStyledLabelLines = (
  label: string,
  maxCharsPerLine: number,
  lineLimit = 3
): readonly StyledLabelLine[] => {
  const { name, title } = splitLabelParts(label)
  const safeName = name.length > 0 ? name : label

  const nameLines = wrapLabel(safeName, maxCharsPerLine, lineLimit)
  const titleOption = fromNullable(title)
  if (!isNone(titleOption)) {
    const remaining = Math.max(0, lineLimit - nameLines.length)
    if (remaining === 0) {
      return nameLines.map((text) => toNameLine(text))
    }

    const titleLines = wrapLabel(titleOption.value, maxCharsPerLine, remaining)
    return [
      ...nameLines.map((text) => toNameLine(text)),
      ...titleLines.map((text) => toTitleLine(text))
    ]
  }
  return nameLines.map((text) => toNameLine(text))
}

/** Composes a shadow label from primary node name and optional title override. */
export const composeShadowLabel = (
  primaryLabel: string,
  shadowLabelOverride: string | undefined
): string => {
  const { name, title } = splitLabelParts(primaryLabel)
  const primaryName = name.length > 0 ? name : primaryLabel
  const effectiveTitle = getOrElseOption<string | undefined>(() => title)(fromNullable(shadowLabelOverride))
  const effectiveTitleOption = fromNullable(effectiveTitle)
  return matchOption(() => primaryName, (value: string) => `${primaryName}\n${value}`)(effectiveTitleOption)
}

/** Fits text size into the label rectangle using width/height budgets. */
export const fitFontSizeToBox = (
  input: FitFontSizeToBoxInput
): number => {
  if (input.lines.length === 0) {
    return input.minFontSize
  }

  const maxLineLength = Math.max(...input.lines.map((line) => Math.max(1, line.length)))
  const widthBudget = Math.max(24, input.boxWidth - 10)
  const heightBudget = Math.max(24, input.boxHeight - 10)

  const widthScale = widthBudget / (maxLineLength * input.baseFontSize * 0.52)
  const heightScale = heightBudget / (Math.max(1, input.lines.length) * input.baseFontSize * 1.18)
  const scale = Math.min(1, widthScale, heightScale)
  const nextSize = Math.floor(input.baseFontSize * scale * 10) / 10

  return Math.max(input.minFontSize, nextSize)
}

/** Renders either single-line or multi-line styled label text. */
export const renderStyledLabelElement = (
  input: RenderStyledLabelElementInput
): string => {
  if (input.styledLines.length === 1) {
    const singleLine = input.styledLines[0]
    const firstLine: StyledLabelLine = getOrElseOption<StyledLabelLine>(() => ({ text: input.fallbackText, kind: 'name' }))(fromNullable(singleLine))
    const lineStyle = firstLine.kind === 'title'
      ? mergeTextStyle(input.textStyles.nodeTitle, input.baseTextStyle)
      : mergeTextStyle(input.textStyles.nodeName, input.baseTextStyle)
    const lineAttrs = textAttrs(capTextStyleFontSize(lineStyle, input.fittedFont))
    return `<text x="${input.tx}" y="${input.ty}" text-anchor="middle" dominant-baseline="middle" font-family="${input.fontFamily}" ${lineAttrs}>${escapeXml(firstLine.text)}</text>`
  }

  const linesWithStyle = input.styledLines.map((line) => {
    const merged = line.kind === 'title'
      ? mergeTextStyle(input.textStyles.nodeTitle, input.baseTextStyle)
      : mergeTextStyle(input.textStyles.nodeName, input.baseTextStyle)
    return {
      line,
      style: capTextStyleFontSize(merged, input.fittedFont)
    }
  })
  const gaps = linesWithStyle.slice(1).map((entry) => {
    const lineSpacing = getOrElseOption<number>(() => 1.18)(fromNullable(entry.style.lineSpacing))
    return input.fittedFont * lineSpacing
  })
  const totalHeight = concatAll(monoidSum)(gaps)
  const firstY = input.ty - totalHeight / 2
  const tspans = linesWithStyle
    .map((entry, index) => {
      const y = firstY + concatAll(monoidSum)(gaps.slice(0, index))
      const attrs = textAttrs(entry.style)
      return `<tspan x="${input.tx}" y="${y}" ${attrs}>${escapeXml(entry.line.text)}</tspan>`
    })
    .join('')

  return `<text text-anchor="middle" font-family="${input.fontFamily}">${tspans}</text>`
}
