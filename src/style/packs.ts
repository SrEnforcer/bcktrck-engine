/**
 * @module style/packs
 *
 * PURE CORE — no side-effects; all I/O enters via parameters.
 *
 * Style pack registry and loader. A "pack" is a named collection of variable
 * definitions and style rules bundled as a reusable BTL snippet.
 *
 * Packs let multiple visualizations of the same org share consistent theming
 * without duplicating rules or hunting for scattered style files.
 *
 * @packageDocumentation
 */

// DEVIATION(2.4): Pack registry remains in one file while themed pack extraction is staged.

import { fromNullable, getOrElseOption } from '@tsfpp/prelude'

/**
 * Named style packs. Each pack is a complete BTL `defs` and/or `style` block
 * that can be composed with org sources.
 *
 * Extend this registry with custom domain-specific packs (e.g., `corporate`,
 * `startup`, `nonprofit`) by forking this file or using a runtime loader.
 */
export const stylePacks: Readonly<Record<string, string>> = {
  minimal: `defs
  $text = #333333
  $accent = #0b5fff
  $muted = #e0e0e0
  $dept-bg = #eef4ff
  $dept-border = #3d63dd
  $lead-bg = #eaf1ff

style
  .node
    background-color: white
    border-color: $accent
    border-width: 1
    color: $text
    font-size: 11

  .node-name
    font-weight: bold

  .node-title
    color: $muted
    font-size: 9

  .kind-department
    background-color: $dept-bg
    border-color: $dept-border
    border-width: 2

  .role-manager
    background-color: $lead-bg
    border-color: $accent
    border-width: 2

  .role-teammanager
    background-color: $lead-bg
    border-color: $accent
    border-width: 2

  .role-managementteam
    background-color: $lead-bg
    border-color: $accent
    border-width: 2

  .role-executive
    background-color: $lead-bg
    border-color: $accent
    border-width: 2

  .role-lead
    border-width: 2
    border-color: $accent

  .type-virtual:children
    border-style: dotted
    edge-style: dashed
`,

  corporate: `defs
  $primary = #1f2937
  $accent = #3b82f6
  $muted = #6b7280
  $success = #10b981
  $warning = #f59e0b
  $danger = #ef4444
  $dept-bg = #f7f9fc

style
  .node
    background-color: white
    border-color: $primary
    border-width: 1.5
    color: $primary
    font-size: 12

  .node-name
    font-weight: bold

  .node-title
    color: $muted
    font-size: 10

  .kind-department
    background-color: $dept-bg
    border-color: $primary
    border-width: 2.25

  .role-executive
    background-color: #fef3c7
    border-color: $warning
    border-width: 2

  .role-manager
    border-color: $accent

  .role-teammanager
    border-color: $accent
    border-width: 2

  .role-managementteam
    border-color: $warning
    border-width: 2

  .type-dept:children
    color: #6b7280

  .type-virtual:children
    border-style: dotted
    edge-style: dashed
    edge-width: 1
`,

  simple: `defs
  $text = #1f2937
  $muted = #6b7280
  $border = #334155
  $dept-bg = #f8fafc
  $lead-bg = #eef2ff

style
  .node
    background-color: white
    border-color: $border
    border-width: 1
    color: $text
    font-size: 11

  .node-name
    font-weight: bold

  .node-title
    color: $muted
    font-size: 9

  .kind-department
    background-color: $dept-bg
    border-color: $border
    border-width: 2

  .role-manager
    background-color: $lead-bg
    border-color: #1d4ed8
    border-width: 2

  .role-teammanager
    background-color: $lead-bg
    border-color: #1d4ed8
    border-width: 2

  .role-managementteam
    background-color: $lead-bg
    border-color: #1d4ed8
    border-width: 2

  .role-executive
    background-color: $lead-bg
    border-color: #1d4ed8
    border-width: 2

  .type-virtual
    border-style: dotted

  .type-virtual:children
    border-style: dotted
    edge-style: dashed
`,

  classic: `defs
  $ink = #2f2a25
  $muted = #6a625a
  $card = #fcf8ef
  $border = #7b6a55
  $dept-bg = #f8f1e5
  $lead-bg = #f2e8d8

style
  .node
    background-color: $card
    border-color: $border
    border-width: 1.5
    color: $ink
    font-size: 11

  .node-name
    font-weight: bold

  .node-title
    color: $muted
    font-size: 9

  .kind-department
    background-color: $dept-bg
    border-color: $border
    border-width: 2

  .role-teammanager
    border-width: 2

  .role-managementteam
    background-color: #f6efdd

  .role-manager
    background-color: $lead-bg
    border-color: $border
    border-width: 2

  .role-teammanager
    background-color: $lead-bg
    border-color: $border
    border-width: 2

  .role-executive
    background-color: $lead-bg
    border-color: $border
    border-width: 2

  .type-virtual
    background-color: #faf7f2
    border-style: dotted

  .type-virtual:children
    border-style: dotted
    edge-style: dotted
`,

  elegant: `defs
  $text = #22303f
  $title = #4b5563
  $specialist-bg = #fdf1eb
  $specialist-border = #b15a3a
  $leadership-bg = #ebe0fb
  $leadership-border = #563a78
  $team-bg = #d7e7ff
  $team-border = #244d7d
  $senior-bg = #ddeafb
  $senior-border = #2f547f
  $virtual-bg = #f4f8fc
  $virtual-border = #5f6c7e
  $dept-bg = #f2f5fb
  $dept-border = #7a8aa0

style
  .node
    color: $text
    icon-size: 14
    icon-pos: bottom-right
    icon-opacity: 0.56

  .node-name
    font-weight: 700

  .node-title
    color: $title

  .kind-department
    background-color: $dept-bg
    border-color: $dept-border
    border-width: 2

  .role-specialist
    background-color: $specialist-bg
    border-color: $specialist-border
    icon-color: $specialist-border

  .role-teammanager
    background-color: $leadership-bg
    border-color: $leadership-border
    icon-color: $leadership-border

  .role-managementteam
    background-color: $leadership-bg
    border-color: $leadership-border
    icon-color: $leadership-border

  .role-manager
    background-color: $leadership-bg
    border-color: $leadership-border
    icon-color: $leadership-border

  .role-executive
    background-color: $leadership-bg
    border-color: $leadership-border
    icon-color: $leadership-border

  .role-teamleider
    background-color: $team-bg
    border-color: $team-border
    icon-color: $team-border

  .role-senior
    background-color: $senior-bg
    border-color: $senior-border
    icon-color: $senior-border

  .type-virtual
    background-color: $virtual-bg
    border-color: $virtual-border
    border-style: dotted

  .type-virtual:children
    border-style: dotted
    edge-style: dotted
`,

  contrast: `defs
  $text = #0f172a
  $title = #1e293b
  $ink = #111827
  $accent = #0047ff
  $warn = #b42318
  $virtual-bg = #f8fafc
  $dept-bg = #eef2ff

style
  .node
    background-color: #ffffff
    border-color: $ink
    border-width: 2
    color: $text
    font-size: 12

  .node-name
    font-weight: 800

  .node-title
    color: $title
    font-size: 10

  .kind-department
    background-color: $dept-bg
    border-color: $ink
    border-width: 2.5

  .role-specialist
    border-color: $accent
    icon-color: $accent

  .role-teammanager
    border-color: $warn
    icon-color: $warn

  .role-managementteam
    border-color: $warn
    icon-color: $warn

  .role-executive
    border-color: $warn
    border-width: 2.5

  .role-teammanager
    border-color: $warn
    border-width: 2.5

  .role-teamleider
    border-color: $accent
    icon-color: $accent

  .type-virtual
    background-color: $virtual-bg
    border-style: dotted
    border-color: $ink

  .type-virtual:children
    border-style: dotted
    edge-style: dashed
    edge-width: 2
`,

  colorful: `defs
  $executive = #fbbf24
  $manager = #60a5fa
  $specialist = #34d399
  $support = #a78bfa
  $text = #1f2937
  $dept-bg = #fff7ed
  $dept-border = #fb923c

style
  .node
    background-color: white
    border-width: 1.5
    color: $text
    font-size: 11

  .node-name
    font-weight: bold

  .node-title
    font-size: 9

  .kind-department
    background-color: $dept-bg
    border-color: $dept-border
    border-width: 2.25

  .role-executive
    background-color: $executive
    border-color: #d97706
    border-width: 2

  .role-manager
    background-color: $manager
    border-color: #1e40af

  .role-managementteam
    background-color: $executive
    border-color: #d97706
    border-width: 2.25

  .role-teammanager
    background-color: $executive
    border-color: #d97706
    border-width: 2.25

  .role-specialist
    background-color: $specialist
    border-color: #047857

  .role-support
    background-color: $support
    border-color: #6d28d9

  .type-virtual:children
    border-style: dotted
    edge-style: dashed
`
}

/**
 * Retrieve a named style pack from the registry.
 *
 * @param packName Name of the pack (e.g., 'minimal', 'corporate', 'colorful')
 * @returns The BTL style source, or undefined if the pack is not found.
 */
export const getStylePack = (packName: string): string | undefined =>
  stylePacks[packName.toLowerCase()]

/**
 * Create a custom pack registry that shadows the built-in packs.
 *
 * Use this to extend or override the default packs without modifying the
 * global registry.
 *
 * @param customPacks Additional packs that override defaults.
 * @returns A function that looks up a pack, checking custom packs first.
 */
export const createStylePackLoader = (
  customPacks: Readonly<Record<string, string>> = {}
): ((packName: string) => string | undefined) =>
  (packName: string): string | undefined => {
    const name = packName.toLowerCase()
    return getOrElseOption<string | undefined>(() => stylePacks[name])(fromNullable(customPacks[name]))
  }
