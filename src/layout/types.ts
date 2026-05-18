/**
 * @module layout/types
 *
 * Shared layout and rendering contracts exchanged between indexing, placement,
 * routing, and SVG projection modules.
 *
 * @packageDocumentation
 */

/** Distinguishes the semantic role of a node in the layout tree. */
export type LayoutNodeKind = 'employee' | 'department' | 'vacancy'

/**
 * A node in the indexed tree representation, ready for Buchheim placement.
 *
 * Staff node ids appear in `staffLeft`/`staffRight` but are NOT separate
 * IndexedNode entries — they are sidebar references placed by the layout stage.
 */
export type IndexedNode = {
  readonly id: string
  readonly kind: LayoutNodeKind
  readonly label: string
  readonly triangleEffect?: { readonly color: string }
  readonly layoutHint?: 'hanging' | 'hanging-left' | 'hanging-right' | 'hanging-both' | 'multirow' | 'compact' | 'wide' | 'flat' | 'expand'
  readonly hangingSide?: 'left' | 'right'
  readonly depth: number
  readonly parentId: string | null
  /** 0-based position among the parent's regular `children`. */
  readonly childIndex: number
  /** Ordered ids of regular (non-staff) children. */
  readonly children: readonly string[]
  /**
   * Ids of staff (advisor/assistant) nodes on each side.
   * These ids are NOT keys in `IndexedTree.nodes` — staff nodes are sidebar
   * references only. The layout stage retrieves their metadata from the
   * original OrgTree when computing node widths.
   */
  readonly staffLeft: readonly string[]
  readonly staffRight: readonly string[]
}

/**
 * A flat, indexed representation of an OrgTree ready for the layout stage.
 */
export type IndexedTree = {
  readonly rootId: string
  /** Contains only regular tree nodes (employee / department / vacancy). */
  readonly nodes: ReadonlyMap<string, IndexedNode>
  /** Optional lookup for staff node display labels by id. */
  readonly staffLabels?: ReadonlyMap<string, string>
}

// ---------------------------------------------------------------------------
// Buchheim layout output
// ---------------------------------------------------------------------------

/**
 * The final (x, y) grid-unit position of a single node after Buchheim
 * placement. x is the horizontal column (fractional), y is the depth row.
 */
export type LayoutPoint = {
  readonly x: number
  readonly y: number
}

/**
 * A fully placed tree: each node id maps to its (x, y) position.
 * x increases left→right; y increases top→bottom (root at y=0).
 */
export type PlacedTree = {
  readonly rootId: string
  readonly positions: ReadonlyMap<string, LayoutPoint>
}

// ---------------------------------------------------------------------------
// Staff node placement
// ---------------------------------------------------------------------------

/**
 * Position of a single staff (advisor/assistant) node.
 * x is offset horizontally from the parent; y matches the parent's depth.
 */
export type StaffPosition = {
  readonly id: string
  readonly label: string
  readonly x: number
  readonly y: number
  readonly side: 'left' | 'right'
}

/**
 * Collection of placed staff nodes (advisors/assistants).
 * Maps staff id → position including the side (left or right).
 */
export type PlacedStaff = {
  readonly staff: readonly StaffPosition[]
}

// ---------------------------------------------------------------------------
// Edge routing output
// ---------------------------------------------------------------------------

/**
 * A waypoint in a routed edge path, in grid coordinates.
 */
export type EdgeRoutePoint = {
  readonly x: number
  readonly y: number
}

/** Visual stroke style for a parent-to-child edge in the rendered SVG. */
export type EdgeStyleValue = 'straight' | 'dashed' | 'dotted'

/**
 * A single routed parent→child edge as ordered waypoints.
 */
export type EdgeRoute = {
  readonly fromId: string
  readonly toId: string
  readonly edgeStyle?: EdgeStyleValue
  readonly edgeWidth?: number
  readonly points: readonly EdgeRoutePoint[]
}

// ---------------------------------------------------------------------------
// SVG rendering configuration
// ---------------------------------------------------------------------------

/**
 * Visual styling for SVG rendering.
 */
export type RenderConfig = {
  /** Width/height of a regular node box (grid units). Default: 1. */
  readonly nodeSize: number
  /** Width/height of a staff node box (grid units). Default: 0.6. */
  readonly staffSize: number
  /** Spacing between columns when converting grid units to pixels. Default: 80. */
  readonly colWidth: number
  /** Spacing between rows (depth levels) in pixels. Default: 120. */
  readonly rowHeight: number
  /** Stroke color for node borders. Default: '#000'. */
  readonly nodeBorder: string
  /** Fill color for employee nodes. Default: '#e3f2fd'. */
  readonly employeeFill: string
  /** Fill color for department nodes. Default: '#fff3e0'. */
  readonly deptFill: string
  /** Fill color for vacancy nodes. Default: '#f3e5f5'. */
  readonly vacancyFill: string
  /** Stroke color for edges. Default: '#999'. */
  readonly edgeStroke: string
  /** Stroke color for dotted (cross-hierarchy) edges. Default: '#aaa'. */
  readonly dottedEdgeStroke: string
  /** Shadow horizontal offset in column units from primary center. Default: 0.75. */
  readonly shadowOffsetX: number
  /** Shadow vertical offset in row units from primary center. Default: -0.75. */
  readonly shadowOffsetY: number
  /** Opacity of shadow node rectangle in [0,1]. Default: 0.55. */
  readonly shadowOpacity: number
  /** Stroke dash pattern for shadow connector edge. Default: '3 3'. */
  readonly shadowDashArray: string
  /** Font size multiplier for shadow labels. Default: 1. */
  readonly shadowFontScale: number
  /** Font size for node labels (pixels). Default: 12. */
  readonly fontSize: number
  /** Font family. Default: 'Arial'. */
  readonly fontFamily: string
  /** Toggle subordinate-count badges for leadership employees. Default: false. */
  readonly showSubordinateCount: boolean
  /** Include vacancy direct-reports in subordinate-count badges. Default: false. */
  readonly subordinateCountIncludeVacancies: boolean
  /** Badge fill color for subordinate-count labels. Default: '#999'. */
  readonly subordinateCountBadgeFill: string
  /** Badge text color for subordinate-count labels. Default: '#ffffff'. */
  readonly subordinateCountBadgeText: string
  /** Font size multiplier for subordinate-count labels. Default: 0.75. */
  readonly subordinateCountBadgeFontScale: number
}

/**
 * SVG rendered tree with viewBox and content.
 */
export type RenderedSvg = {
  readonly svg: string
  readonly viewBox: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  }
}

/**
 * Render-time error variants emitted by the SVG projection stage.
 */
export type RenderError =
  | {
      readonly kind: 'missing_layout_position'
      readonly nodeId: string
      readonly message: string
    }

/**
 * Render result ADT for exception-free SVG generation.
 */
export type RenderResult =
  | { readonly ok: true; readonly value: RenderedSvg }
  | { readonly ok: false; readonly error: RenderError }
